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

// Coordinator class for managing concurrent workers
class ScanCoordinator {
  constructor(baseDomain, initialSubdomains, maxWorkers = 3) {
    this.baseDomain = baseDomain;
    this.maxWorkers = maxWorkers;
    
    // Track unique subdomains and their scan results
    this.subdomainsResult = new Map(); // subdomain -> { subdomain, success, status, error }
    
    // Queue of subdomains to scan
    this.scanQueue = [baseDomain, ...initialSubdomains];
    this.queuedSet = new Set(this.scanQueue);
    
    // Results accumulator
    this.blogArticles = []; // Array of { url, source }
    this.technologies = new Map(); // techName -> Set of pages where it was detected
    
    this.activeWorkersCount = 0;
    this.workers = [];
    this.maxScanLimit = 50; // Safety limit to avoid infinite subdomain crawling
  }

  async run() {
    console.log(`\x1b[36m[Scan] Initializing scan for ${this.baseDomain} using ${this.maxWorkers} worker threads...\x1b[0m`);
    
    return new Promise((resolve) => {
      // Create worker threads
      for (let i = 0; i < this.maxWorkers; i++) {
        const worker = new Worker(path.join(__dirname, 'worker.js'));
        this.workers.push(worker);
        
        worker.on('message', (result) => {
          this.handleWorkerResult(worker, result);
        });

        worker.on('error', (err) => {
          console.error(`\x1b[31m[Worker Error] Worker ${i} encountered an error: ${err.message}\x1b[0m`);
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
          this.terminateWorkers();
          resolve();
        }
      }, 500);
    });
  }

  processNext(worker) {
    if (this.scanQueue.length === 0) {
      return; // No work available right now
    }

    const currentSub = this.scanQueue.shift();
    this.activeWorkersCount++;

    // Format target URL
    const url = `https://${currentSub}`;
    console.log(`\x1b[90m[Worker] Scanning: ${url} (Queue left: ${this.scanQueue.length})\x1b[0m`);

    worker.postMessage({
      url,
      baseDomain: this.baseDomain
    });
  }

  handleWorkerResult(worker, result) {
    this.activeWorkersCount--;
    const domainName = new URL(result.url).hostname;
    
    // Save subdomain status
    this.subdomainsResult.set(domainName, {
      subdomain: domainName,
      success: result.success,
      status: result.status,
      error: result.error
    });

    if (result.success) {
      console.log(`\x1b[32m[Success] ${domainName} (Status: ${result.status})\x1b[0m`);
      
      // Accumulate Blog & Article URLs
      result.blogArticles.forEach(url => {
        this.blogArticles.push({ url, source: domainName });
      });

      // Accumulate Technologies
      result.technologies.forEach(tech => {
        if (!this.technologies.has(tech)) {
          this.technologies.set(tech, new Set());
        }
        this.technologies.get(tech).add(domainName);
      });

      // Process newly discovered subdomains from page links
      if (this.queuedSet.size < this.maxScanLimit) {
        result.subdomains.forEach(sub => {
          if (!this.queuedSet.has(sub) && this.queuedSet.size < this.maxScanLimit) {
            this.queuedSet.add(sub);
            this.scanQueue.push(sub);
            console.log(`\x1b[36m[Discovered] Found new subdomain: ${sub}\x1b[0m`);
          }
        });
      }
    } else {
      console.log(`\x1b[31m[Failed] ${domainName} - ${result.error}\x1b[0m`);
    }

    // Assign next task
    this.processNext(worker);
  }

  terminateWorkers() {
    this.workers.forEach(w => w.terminate());
  }

  getCompiledData() {
    // 1. Subdomains list (Without duplicates, sorted)
    const sortedSubdomains = Array.from(this.subdomainsResult.values()).sort((a, b) => a.subdomain.localeCompare(b.subdomain));

    // 2. Blog and Article URLs (Without duplicate URLs)
    const uniqueBlogsMap = new Map();
    this.blogArticles.forEach(item => {
      if (!uniqueBlogsMap.has(item.url)) {
        uniqueBlogsMap.set(item.url, item.source);
      }
    });
    const uniqueBlogs = Array.from(uniqueBlogsMap.entries()).map(([url, source]) => ({ url, source }));

    // 3. Technologies compiled
    const compiledTech = Array.from(this.technologies.entries()).map(([techName, pagesSet]) => {
      return {
        name: techName,
        pages: Array.from(pagesSet)
      };
    }).sort((a, b) => b.pages.length - a.pages.length);

    return {
      subdomains: sortedSubdomains,
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

  const baseDomain = getBaseDomain(targetInput);
  console.log(`\x1b[32mTarget base domain resolved to: ${baseDomain}\x1b[0m`);

  // Step 1: Subdomain Discovery
  const discoveredSubs = await discoverSubdomains(baseDomain);

  // Step 2: Main Scan Phase
  const coordinator = new ScanCoordinator(baseDomain, discoveredSubs, 3);
  await coordinator.run();

  // Step 3: Compiling Report
  console.log(`\x1b[36m[Report] Compiling data to Excel...\x1b[0m`);
  const data = coordinator.getCompiledData();
  
  const outputFilename = `${baseDomain}_scan_report.xlsx`;
  const outputPath = path.join(process.cwd(), outputFilename);

  try {
    await generateExcelReport(
      baseDomain,
      data.subdomains,
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
