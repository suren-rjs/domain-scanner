#!/usr/bin/env node

const { Worker } = require('worker_threads');
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const fs = require('fs');
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

// Coordinator class for managing concurrent workers
class ScanCoordinator {
  constructor(baseDomain, startUrl, initialUrls, maxWorkers = 3) {
    this.baseDomain = baseDomain;
    this.maxWorkers = maxWorkers;
    
    // Track unique pages/subdomains and their scan results
    this.pagesResult = new Map(); // url -> { url, success, status, error }
    
    // Normalize and build initial scan queue
    const uniqueUrls = new Set();
    uniqueUrls.add(normalizeUrl(startUrl));
    
    // Also add the plain base domain URL
    uniqueUrls.add(normalizeUrl(`https://${baseDomain}`));

    initialUrls.forEach(url => {
      uniqueUrls.add(normalizeUrl(url));
    });

    this.scanQueue = Array.from(uniqueUrls);
    this.queuedSet = new Set(this.scanQueue);
    
    // Results accumulator
    this.blogArticles = new Map(); // Map of url -> source
    this.technologies = new Map(); // techName -> Set of pages where it was detected
    
    this.activeWorkersCount = 0;
    this.workers = [];
    this.maxScanLimit = 50; // Safety limit to avoid infinite crawling
    
    // Dashboard status tracking
    this.workerStatus = Array(maxWorkers).fill('Idle');
    this.startTime = Date.now();
  }

  render() {
    // Reposition cursor to top left & clear down to avoid flashing/scrolling
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);

    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const completedCount = this.pagesResult.size;
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
    console.log(`\x1b[36mElapsed Time:\x1b[0m      ${elapsed}s`);
    console.log(`\x1b[36mProgress:\x1b[0m          [${bar}] ${progressPercent}% (${completedCount}/${totalCount} scanned, limit: ${this.maxScanLimit})`);
    
    // Success / Failure stats
    let successCount = 0;
    let failedCount = 0;
    for (const res of this.pagesResult.values()) {
      if (res.success) successCount++;
      else failedCount++;
    }

    console.log(`\n\x1b[1m\x1b[33m--- STATISTICS ---\x1b[0m`);
    console.log(`\x1b[32m✔ Active/Success Pages:\x1b[0m   ${successCount}`);
    console.log(`\x1b[31m✘ Failed/Error Pages:\x1b[0m     ${failedCount}`);
    console.log(`\x1b[34mℹ Unique Techs Found:\x1b[0m     ${this.technologies.size}`);
    console.log(`\x1b[34mℹ Blog Articles Found:\x1b[0m    ${this.blogArticles.size}`);

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
        this.workers.push(worker);
        
        worker.on('message', (result) => {
          this.handleWorkerResult(worker, result);
        });

        worker.on('error', (err) => {
          this.workerStatus[worker.index] = `Error: ${err.message}`;
          this.activeWorkersCount--;
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
          resolve();
        }
      }, 250);
    });
  }

  processNext(worker) {
    if (this.scanQueue.length === 0) {
      this.workerStatus[worker.index] = 'Idle';
      return; // No work available right now
    }

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
    const pageUrl = result.url;
    
    // Save page status
    this.pagesResult.set(pageUrl, {
      url: pageUrl,
      success: result.success,
      status: result.status,
      error: result.error
    });

    if (result.success) {
      // Accumulate Blog & Article URLs
      result.blogArticles.forEach(url => {
        if (!this.blogArticles.has(url)) {
          this.blogArticles.set(url, pageUrl);
        }
      });

      // Accumulate Technologies
      result.technologies.forEach(tech => {
        if (!this.technologies.has(tech.name)) {
          this.technologies.set(tech.name, {
            category: tech.category,
            pages: new Set()
          });
        }
        this.technologies.get(tech.name).pages.add(pageUrl);
      });

      // Process newly discovered URLs from page links
      if (this.queuedSet.size < this.maxScanLimit) {
        result.discoveredUrls.forEach(url => {
          const norm = normalizeUrl(url);
          if (!this.queuedSet.has(norm) && this.queuedSet.size < this.maxScanLimit) {
            this.queuedSet.add(norm);
            this.scanQueue.push(norm);
          }
        });
      }
    }

    // Assign next task
    this.processNext(worker);
  }

  terminateWorkers() {
    this.workers.forEach(w => w.terminate());
  }

  getCompiledData() {
    // 1. Pages list (Without duplicates, sorted)
    const sortedPages = Array.from(this.pagesResult.values()).sort((a, b) => a.url.localeCompare(b.url));

    // 2. Blog and Article URLs (Without duplicate URLs)
    const uniqueBlogs = Array.from(this.blogArticles.entries()).map(([url, source]) => ({ url, source }));

    // 3. Technologies compiled
    const compiledTech = Array.from(this.technologies.entries()).map(([techName, data]) => {
      return {
        name: techName,
        category: data.category,
        pages: Array.from(data.pages)
      };
    }).sort((a, b) => b.pages.length - a.pages.length);

    return {
      pages: sortedPages,
      blogArticles: uniqueBlogs,
      technologies: compiledTech
    };
  }
}

// CLI Prompt Runner
async function main() {
  let targetInput = process.argv[2];

  if (!targetInput) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    targetInput = await new Promise(resolve => {
      rl.question('\x1b[35mEnter domain address to scan (e.g. example.com): \x1b[0m', answer => {
        rl.close();
        resolve(answer);
      });
    });
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

  // Step 2: Main Scan Phase
  const coordinator = new ScanCoordinator(baseDomain, startUrl, initialUrls, 3);
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
  }
}

main();
