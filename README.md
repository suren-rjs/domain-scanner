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

### If Installed Globally:
Run the command directly from any directory:
```bash
domain-scanner nodejs.org
```

### If Set up Locally:
```bash
# Prompt input format:
npm start

# Direct argument format:
npm start nodejs.org
```

Once the scan completes, a report named `<domain>_scan_report.xlsx` will be generated in your current working directory.
