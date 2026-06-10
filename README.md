# Domain Scanner CLI

A high-performance, asynchronous Node.js CLI tool designed to scan a domain address, discover its subdomains, extract blog/article links, identify modern web technologies used, and compile the findings into a beautifully styled Excel spreadsheet.

## Features
- **Concurrent Scanning (3 Worker Threads)**: Uses Node's native `worker_threads` module to scan and analyze domains/subdomains concurrently without blocking the event loop.
- **Subdomain Discovery**: Queries crt.sh Certificate Transparency logs to find subdomains, falling back to link crawling if the DNS log check fails or times out.
- **Intelligent Blog & Article Link Identifier**: Automatically recognizes blog posts, news articles, and stories using regex pattern matching and semantic segment checks on internal links.
- **Technology Profile Detection**: Evaluates response headers, cookie signatures, meta tags, and script references to detect popular tools like WordPress, React, Next.js, Vue, Tailwind CSS, Shopify, Google Analytics, and more.
- **Polished Excel Output**: Uses `exceljs` to generate a structured, styled spreadsheet containing:
  - **Tab 1**: Unique Subdomain status (Active/Inactive, status codes, and scan errors).
  - **Tab 2**: Complete list of unique Blog & Article URLs along with total count.
  - **Tab 3**: All unique technologies detected and which specific subdomains they are active on.

## Project Structure
```
├── cli.js             # Main CLI Orchestrator & CLI prompts
├── worker.js          # Multi-threaded URL parser & fetcher (Worker thread script)
├── tech-detector.js   # Technology pattern match rules 
├── excel-generator.js # Styled Excel sheet formatting and generation
├── package.json       # Dependencies & launch scripts
└── README.md          # Setup and usage guide
```

## Setup & Installation

### Option A: Install Globally (Recommended for CLI)
You can install this package globally to run the `domain-scanner` command from anywhere:
```bash
# Install globally from the local source directory:
npm install -g .

# Or install from npm registry (once published):
npm install -g domain-scanner
```

### Option B: Local Setup
1. Ensure [Node.js](https://nodejs.org/) (v16+) is installed.
2. Clone or navigate to the directory and install dependencies:
   ```bash
   npm install
   ```

## Usage

### Direct Command Arguments:
```bash
# General Usage
domain-scanner <url> [scan_limit] [worker_threads]

# Help section
domain-scanner -h
```

### Options:
- **`scan_limit`**: The maximum number of unique pages/subpages to scan. Defaults to `50` to prevent infinite crawl loops on huge websites. Set to `all`, `0`, or `-1` to perform an **unlimited** page scan.
- **`worker_threads`**: Number of concurrent crawler worker threads to use. Defaults to `3`.

### Examples:
```bash
# Basic scan (50 page limit, 3 threads)
domain-scanner nodejs.org

# Scan up to 200 pages with 5 parallel threads
domain-scanner nodejs.org 200 5

# Scan ALL pages (unlimited) with 8 parallel threads
domain-scanner mayerbrown.com all 8
```

### If Running Locally:
```bash
# Show help
npm start -- -h

# Perform scan
npm start -- nodejs.org 200 5
```

Once the scan completes, a report named `<domain>_scan_report.xlsx` will be generated in your current working directory.
