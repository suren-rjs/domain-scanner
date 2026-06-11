#!/usr/bin/env node

const { Worker } = require('worker_threads');
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { generateExcelReport } = require('./excel-generator');

// Helper to sanitize and extract base domain
function getBaseDomain(input) {
  let cleaned = input.trim();
  // Remove protocols
  cleaned = cleaned.replace(/^(https?:\/\/)?(www\.)?/, '');
  // Remove trailing slashes and paths
  cleaned = cleaned.split('/')[0];
  // Remove port numbers
  cleaned = cleaned.split(':')[0];
  return cleaned.toLowerCase();
}

// Helper to extract hostname from input
function getHost(input) {
  let cleaned = input.trim();
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'http://' + cleaned;
  }
  try {
    const urlObj = new URL(cleaned);
    return urlObj.hostname.toLowerCase();
  } catch (err) {
    cleaned = cleaned.replace(/^(https?:\/\/)?/, '');
    cleaned = cleaned.split('/')[0];
    cleaned = cleaned.split(':')[0];
    return cleaned.toLowerCase();
  }
}


// Subdomain discovery via crt.sh
async function discoverSubdomains(domain) {
  console.log(`\x1b[36m[DNS] Querying crt.sh certificate transparency logs for subdomains...\x1b[0m`);
  const subdomains = new Set();
  
  try {
    const url = `https://crt.sh/?q=%.${domain}&output=json`;
    const response = await axios.get(url, { timeout: 15000 });
    
    if (Array.isArray(response.data)) {
      response.data.forEach(item => {
        // crt.sh name_value can contain wildcards and multiple domain lines separated by newlines
        const names = (item.name_value || item.common_name || '')
          .toLowerCase()
          .split(/[\s,]+/)
          .map(name => name.replace(/^\*\./, '').trim())
          .filter(name => name.endsWith(`.${domain}`) && name !== domain && !name.includes('*'));

        names.forEach(name => subdomains.add(name));
      });
    }
    console.log(`\x1b[32m[DNS] Found ${subdomains.size} unique subdomains from certificate logs.\x1b[0m`);
  } catch (err) {
    console.log(`\x1b[33m[DNS] Warning: crt.sh check failed (${err.message}). Falling back to crawl-only subdomain extraction.\x1b[0m`);
  }
  
  return Array.from(subdomains);
}

// Helper to normalize URLs to avoid duplicate crawling & index pages
function normalizeUrl(urlStr) {
  try {
    const urlObj = new URL(urlStr);
    urlObj.hash = '';
    urlObj.search = ''; // Strip search query to avoid infinite parameter loops
    
    let pathname = urlObj.pathname.toLowerCase();
    // Strip index files
    if (pathname.endsWith('/index.html') || pathname.endsWith('/index.htm') || pathname.endsWith('/index.php') || pathname.endsWith('/index')) {
      pathname = pathname.replace(/\/index(\.html|\.htm|\.php)?$/, '');
    }
    // Strip trailing slash if it's not just '/'
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    urlObj.pathname = pathname;
    return urlObj.toString();
  } catch (e) {
    return urlStr.toLowerCase().trim();
  }
}

// Helper to format duration in ms as hh::mm::ss.ms
function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const m = String(milliseconds).padStart(3, '0');

  return `${hh}::${mm}::${ss}.${m}`;
}

// Coordinator class for managing concurrent workers
class ScanCoordinator {
  constructor(baseDomain, startUrl, initialUrls, maxWorkers = 3, maxScanLimit = 50) {
    this.baseDomain = baseDomain;
    this.maxWorkers = maxWorkers;
    this.maxScanLimit = maxScanLimit;
    
    this.dbPath = path.join(process.cwd(), `${baseDomain}_visited.db`);
    this.db = new DatabaseSync(this.dbPath);
    
    // Create high-performance schema with indices
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        url TEXT PRIMARY KEY,
        success INTEGER,
        status INTEGER,
        error TEXT,
        technologies TEXT,
        blogArticles TEXT
      );
      
      CREATE TABLE IF NOT EXISTS blog_articles (
        url TEXT PRIMARY KEY,
        source TEXT
      );
      
      CREATE TABLE IF NOT EXISTS technologies (
        name TEXT,
        category TEXT,
        page TEXT,
        PRIMARY KEY (name, page)
      );
      
      CREATE INDEX IF NOT EXISTS idx_tech_name ON technologies(name);
    `);
    
    // Prepared statements for maximum query throughput
    this.insertPageStmt = this.db.prepare(`
      INSERT OR REPLACE INTO pages (url, success, status, error, technologies, blogArticles)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    this.insertBlogStmt = this.db.prepare(`
      INSERT OR IGNORE INTO blog_articles (url, source)
      VALUES (?, ?)
    `);
    
    this.insertTechStmt = this.db.prepare(`
      INSERT OR IGNORE INTO technologies (name, category, page)
      VALUES (?, ?, ?)
    `);
    
    this.scanQueue = [];
    this.queuedSet = new Set();
    
    // Rehydrate queuedSet from database history (fast $O(log N)$ indices)
    const pagesQuery = this.db.prepare(`SELECT url FROM pages`);
    const cachedPages = pagesQuery.all();
    
    cachedPages.forEach(row => {
      this.queuedSet.add(normalizeUrl(row.url));
    });
    
    // Load existing database records for blogArticles and technologies maps
    this.blogArticles = new Map();
    this.technologies = new Map();
    
    const blogQuery = this.db.prepare(`SELECT url, source FROM blog_articles`);
    blogQuery.all().forEach(row => {
      this.blogArticles.set(row.url, row.source);
    });
    
    const techQuery = this.db.prepare(`SELECT name, category, page FROM technologies`);
    techQuery.all().forEach(row => {
      if (!this.technologies.has(row.name)) {
        this.technologies.set(row.name, {
          category: row.category,
          pages: new Set()
        });
      }
      this.technologies.get(row.name).pages.add(row.page);
    });

    // Build unique start URL queue
    const uniqueUrls = new Set();
    uniqueUrls.add(normalizeUrl(startUrl));
    uniqueUrls.add(normalizeUrl(`https://${baseDomain}`));
    initialUrls.forEach(url => uniqueUrls.add(normalizeUrl(url)));
    
    uniqueUrls.forEach(url => {
      if (!this.queuedSet.has(url)) {
        this.scanQueue.push(url);
        this.queuedSet.add(url);
      }
    });

    this.activeWorkersCount = 0;
    this.workers = [];
    
    // Dashboard status tracking
    this.workerStatus = Array(maxWorkers).fill('Idle');
    this.startTime = Date.now();
  }

  render() {
    // Reposition cursor to top left & clear down to avoid flashing/scrolling
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);

    const elapsedMs = Date.now() - this.startTime;
    const elapsedStr = formatDuration(elapsedMs);
    
    const completedCountStmt = this.db.prepare(`SELECT COUNT(*) as count FROM pages`);
    const completedCount = completedCountStmt.get().count || 0;
    const totalCount = completedCount + this.scanQueue.length;
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    // Draw progress bar
    const barLength = 20;
    const filledLength = Math.round(barLength * (completedCount / totalCount || 0));
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    console.log(`\x1b[1m\x1b[35m====================================================\x1b[0m`);
    console.log(`\x1b[1m\x1b[35m              DOMAIN SCANNER DASHBOARD              \x1b[0m`);
    console.log(`\x1b[1m\x1b[35m====================================================\x1b[0m`);
    console.log(`\x1b[36mTarget Domain:\x1b[0m     ${this.baseDomain}`);
    console.log(`\x1b[36mWorkers:\x1b[0m           ${this.maxWorkers} active threads`);
    console.log(`\x1b[36mElapsed Time:\x1b[0m      ${elapsedStr}`);
    const limitStr = this.maxScanLimit === Infinity ? 'unlimited' : this.maxScanLimit;
    console.log(`\x1b[36mProgress:\x1b[0m          [${bar}] ${progressPercent}% (${completedCount}/${totalCount} scanned, limit: ${limitStr})`);
    
    // Query aggregates from DB
    const statsQuery = this.db.prepare(`
      SELECT 
        SUM(case when success = 1 then 1 else 0 end) as successCount,
        SUM(case when success = 0 then 1 else 0 end) as failedCount
      FROM pages
    `);
    const stats = statsQuery.get();
    const successCount = stats.successCount || 0;
    const failedCount = stats.failedCount || 0;

    const techCountQuery = this.db.prepare(`SELECT COUNT(DISTINCT name) as count FROM technologies`);
    const techCount = techCountQuery.get().count || 0;

    const blogCountQuery = this.db.prepare(`SELECT COUNT(*) as count FROM blog_articles`);
    const blogCount = blogCountQuery.get().count || 0;

    console.log(`\n\x1b[1m\x1b[33m--- STATISTICS ---\x1b[0m`);
    console.log(`\x1b[32m✔ Active/Success Pages:\x1b[0m   ${successCount}`);
    console.log(`\x1b[31m✘ Failed/Error Pages:\x1b[0m     ${failedCount}`);
    console.log(`\x1b[34mℹ Unique Techs Found:\x1b[0m     ${techCount}`);
    console.log(`\x1b[34mℹ Blog Articles Found:\x1b[0m    ${blogCount}`);

    console.log(`\n\x1b[1m\x1b[33m--- ACTIVE WORKERS STATUS ---\x1b[0m`);
    this.workerStatus.forEach((status, i) => {
      console.log(` \x1b[36mWorker #${i + 1}:\x1b[0m ${status}`);
    });

    console.log(`\n\x1b[90mPress Ctrl+C to abort the scan.\x1b[0m`);
  }

  async run() {
    this.startTime = Date.now();
    // Clear terminal screen completely before starting dashboard
    process.stdout.write('\x1b[2J\x1b[0;0H');

    // Run render periodically
    this.renderInterval = setInterval(() => {
      this.render();
    }, 250);
    
    return new Promise((resolve) => {
      // Create worker threads
      for (let i = 0; i < this.maxWorkers; i++) {
        const worker = new Worker(path.join(__dirname, 'worker.js'));
        worker.index = i;
        worker.isIdle = true;
        this.workers.push(worker);
        
        worker.on('message', (result) => {
          this.handleWorkerResult(worker, result);
        });

        worker.on('error', (err) => {
          this.workerStatus[worker.index] = `Error: ${err.message}`;
          this.activeWorkersCount--;
          worker.isIdle = true;
          this.processNext(worker);
        });

        // Start processing the first items
        this.processNext(worker);
      }

      // Keep checking if completed
      this.checkCompletionInterval = setInterval(() => {
        if (this.scanQueue.length === 0 && this.activeWorkersCount === 0) {
          clearInterval(this.checkCompletionInterval);
          clearInterval(this.renderInterval);
          this.terminateWorkers();
          
          // Clear final render and draw one last time
          readline.cursorTo(process.stdout, 0, 0);
          readline.clearScreenDown(process.stdout);
          this.render();
          console.log(`\n\x1b[32mScan phase finished successfully!\x1b[0m\n`);
          
          // Print failures summary if any
          const failuresQuery = this.db.prepare(`SELECT url, error FROM pages WHERE success = 0`);
          const failures = failuresQuery.all();
          if (failures.length > 0) {
            console.log(`\x1b[1m\x1b[31m--- FAILED PAGES REPORT ---\x1b[0m`);
            failures.forEach(f => {
              console.log(`\x1b[31m✘ ${f.url} - ${f.error || 'Unknown Error'}\x1b[0m`);
            });
            console.log();
          }
          
          resolve();
        }
      }, 250);
    });
  }

  processNext(worker) {
    if (this.scanQueue.length === 0) {
      this.workerStatus[worker.index] = 'Idle';
      worker.isIdle = true;
      return; // No work available right now
    }

    worker.isIdle = false;
    const currentUrl = this.scanQueue.shift();
    this.activeWorkersCount++;
    this.workerStatus[worker.index] = `Scanning ${currentUrl}`;

    worker.postMessage({
      url: currentUrl,
      baseDomain: this.baseDomain
    });
  }

  handleWorkerResult(worker, result) {
    this.activeWorkersCount--;
    worker.isIdle = true;
    this.workerStatus[worker.index] = 'Idle';
    const pageUrl = result.url;
    
    // Save page status straight to database sync (eliminates memory leak risk on massive runs)
    this.insertPageStmt.run(
      pageUrl,
      result.success ? 1 : 0,
      result.status || null,
      result.error || null,
      JSON.stringify(result.success ? result.technologies : []),
      JSON.stringify(result.success ? result.blogArticles : [])
    );

    if (result.success) {
      // Accumulate Blog & Article URLs in DB
      result.blogArticles.forEach(url => {
        this.insertBlogStmt.run(url, pageUrl);
      });

      // Accumulate Technologies in DB
      result.technologies.forEach(tech => {
        this.insertTechStmt.run(tech.name, tech.category, pageUrl);
      });

      // Process newly discovered URLs from page links
      let addedNew = false;
      if (this.queuedSet.size < this.maxScanLimit) {
        result.discoveredUrls.forEach(url => {
          const norm = normalizeUrl(url);
          if (!this.queuedSet.has(norm) && this.queuedSet.size < this.maxScanLimit) {
            this.queuedSet.add(norm);
            this.scanQueue.push(norm);
            addedNew = true;
          }
        });
      }

      // If we added new links, wake up other idle workers
      if (addedNew) {
        this.workers.forEach(w => {
          if (w.isIdle) {
            this.processNext(w);
          }
        });
      }
    }

    // Assign next task to this worker if it's still idle
    if (worker.isIdle) {
      this.processNext(worker);
    }
  }

  terminateWorkers() {
    this.workers.forEach(w => w.terminate());
  }

  getCompiledData() {
    // 1. Pages list (Without duplicates, sorted by URL)
    const pagesQuery = this.db.prepare(`SELECT url, success, status, error FROM pages ORDER BY url ASC`);
    const sortedPages = pagesQuery.all().map(row => ({
      url: row.url,
      success: row.success === 1,
      status: row.status,
      error: row.error
    }));

    // 2. Blog and Article URLs (Without duplicate URLs)
    const blogsQuery = this.db.prepare(`SELECT url, source FROM blog_articles ORDER BY url ASC`);
    const uniqueBlogs = blogsQuery.all();

    // 3. Technologies compiled
    const techQuery = this.db.prepare(`SELECT name, category, page FROM technologies`);
    const techRows = techQuery.all();

    const techMap = new Map();
    techRows.forEach(row => {
      if (!techMap.has(row.name)) {
        techMap.set(row.name, {
          name: row.name,
          category: row.category,
          pages: []
        });
      }
      techMap.get(row.name).pages.push(row.page);
    });

    const compiledTech = Array.from(techMap.values()).sort((a, b) => b.pages.length - a.pages.length);

    return {
      pages: sortedPages,
      blogArticles: uniqueBlogs,
      technologies: compiledTech
    };
  }
}

// Helper to print tool usage/help instructions
function showHelp() {
  console.log(`
\x1b[1m\x1b[35mDomain Scanner CLI\x1b[0m
A high-performance asynchronous crawler to scan domains, map pages, identify blog articles, detect technologies, and generate styled Excel reports.

\x1b[1mUsage:\x1b[0m
  domain-scanner <url> [scan_limit] [worker_threads]
  npm start -- <url> [scan_limit] [worker_threads]

\x1b[1mOptions:\x1b[0m
  -h, --help        Show this help section.
  scan_limit        Maximum unique pages/subpages to scan. Set to 'all', '0', or '-1' for unlimited scanning (default: 50).
  worker_threads    Number of concurrent crawler threads (default: 3).

\x1b[1mExamples:\x1b[0m
  domain-scanner https://www.williamslea.com/
  domain-scanner nodejs.org 200 5
  domain-scanner mayerbrown.com all 8
  `);
  process.exit(0);
}

// CLI Prompt Runner
async function main() {
  // Check for help flags
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    showHelp();
  }

  let targetInput = process.argv[2];

  if (!targetInput) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    targetInput = await new Promise(resolve => {
      rl.question('\x1b[35mEnter domain address to scan (e.g. example.com) or -h for help: \x1b[0m', answer => {
        rl.close();
        resolve(answer);
      });
    });

    if (targetInput.trim() === '-h' || targetInput.trim() === '--help') {
      showHelp();
    }
  }

  if (!targetInput) {
    console.error('\x1b[31mError: No domain address provided.\x1b[0m');
    process.exit(1);
  }

  const targetHost = getHost(targetInput);
  const baseDomain = getBaseDomain(targetInput);
  console.log(`\x1b[32mTarget base domain resolved to: ${baseDomain}\x1b[0m`);

  // Step 1: Subdomain Discovery
  const discoveredSubs = await discoverSubdomains(baseDomain);

  // Convert discovered subdomains to full URLs
  const initialUrls = discoveredSubs.map(sub => `https://${sub}`);

  // Format the startUrl correctly
  let startUrl = targetInput.trim();
  if (!/^https?:\/\//i.test(startUrl)) {
    startUrl = 'https://' + startUrl;
  }

  // Ensure target host itself is scanned
  if (targetHost && targetHost !== baseDomain) {
    const targetHostUrl = `https://${targetHost}`;
    if (!initialUrls.includes(targetHostUrl)) {
      initialUrls.push(targetHostUrl);
    }
  }

  // Parse limit and workers CLI arguments
  let limitInput = process.argv[3];
  let workersInput = process.argv[4];

  let maxLimit = 50;
  if (limitInput) {
    const lim = limitInput.toLowerCase();
    if (lim === 'all' || lim === '0' || lim === '-1') {
      maxLimit = Infinity;
    } else if (!isNaN(lim)) {
      maxLimit = parseInt(lim, 10);
    }
  }

  let maxWorkers = 3;
  if (workersInput && !isNaN(workersInput)) {
    maxWorkers = parseInt(workersInput, 10);
  }

  // Step 2: Main Scan Phase
  const coordinator = new ScanCoordinator(baseDomain, startUrl, initialUrls, maxWorkers, maxLimit);
  await coordinator.run();

  // Step 3: Compiling Report
  console.log(`\x1b[36m[Report] Compiling data to Excel...\x1b[0m`);
  const data = coordinator.getCompiledData();
  
  const outputFilename = `${baseDomain}_scan_report.xlsx`;
  const outputPath = path.join(process.cwd(), outputFilename);

  try {
    await generateExcelReport(
      baseDomain,
      data.pages,
      data.blogArticles,
      data.technologies,
      outputPath
    );
    console.log(`\x1b[32m\x1b[1m\nScan Complete!\x1b[0m`);
    console.log(`Excel report saved to: \x1b[36m${outputPath}\x1b[0m`);
  } catch (error) {
    console.error(`\x1b[31mError generating Excel file: ${error.message}\x1b[0m`);
  } finally {
    // Ensure database connection is closed
    if (coordinator && coordinator.db) {
      try {
        coordinator.db.close();
      } catch (err) {}
    }
    
    // Clean up temporary database files and legacy cache files to keep workspace tidy
    try {
      if (coordinator && coordinator.dbPath && fs.existsSync(coordinator.dbPath)) {
        fs.unlinkSync(coordinator.dbPath);
      }
      const oldJsonCache = path.join(process.cwd(), `${baseDomain}_visited.json`);
      if (fs.existsSync(oldJsonCache)) {
        fs.unlinkSync(oldJsonCache);
      }
    } catch (err) {}
  }
}

main();
