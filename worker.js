const { parentPort, workerData } = require('worker_threads');
const axios = require('axios');
const cheerio = require('cheerio');
const { detectTechnologies } = require('./tech-detector');

// Configure Axios with a 10s timeout and a realistic User Agent
const client = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  },
  validateStatus: () => true, // Don't throw on 4xx/5xx responses so we can still scan them
});

/**
 * Checks if a given URL is likely a blog page or article.
 * 
 * @param {URL} urlObj - The standard parsed URL object.
 * @returns {boolean} True if the URL conforms to blog/article patterns.
 */
function isBlogOrArticle(urlObj) {
  const path = urlObj.pathname.toLowerCase();
  const host = urlObj.hostname.toLowerCase();

  // If host contains blog/news
  if (host.startsWith('blog.') || host.startsWith('news.') || host.startsWith('press.')) {
    return true;
  }

  // Keywords in path segments
  const pathSegments = path.split('/').filter(Boolean);
  const keywords = ['blog', 'article', 'news', 'post', 'story', 'press', 'feed', 'journal'];
  
  if (pathSegments.some(segment => keywords.includes(segment) || keywords.some(kw => segment.includes(kw)))) {
    return true;
  }

  // Check for year/month patterns common in blogs (e.g., /2023/04/my-post)
  // /YYYY/MM/DD/slug or /YYYY/MM/slug
  const yyyymmddPattern = /^\/\d{4}\/\d{2}\/\d{2}\//;
  const yyyymmPattern = /^\/\d{4}\/\d{2}\//;
  if (yyyymmddPattern.test(path) || yyyymmPattern.test(path)) {
    return true;
  }

  // Check for article ID patterns at the end of path, e.g. /p/12345 or /article-12345
  if (path.includes('/p/') || path.includes('/art/') || /\/post-\d+/.test(path) || /\/article-\d+/.test(path)) {
    return true;
  }

  return false;
}

parentPort.on('message', async (task) => {
  const { url, baseDomain } = task;
  const result = {
    url,
    success: false,
    status: null,
    discoveredUrls: [],
    blogArticles: [],
    technologies: [],
    error: null,
  };

  try {
    const response = await client.get(url);
    result.success = true;
    result.status = response.status;

    // Detect technologies
    const html = typeof response.data === 'string' ? response.data : '';
    result.technologies = detectTechnologies(response.headers, html, html);

    // Extract links and subdomains
    if (html) {
      const $ = cheerio.load(html);
      const links = new Set();

      $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (href) {
          links.add(href.trim());
        }
      });

      for (const link of links) {
        try {
          // Resolve relative URLs
          const resolvedUrl = new URL(link, url);
          
          // We only care about http/https protocols
          if (resolvedUrl.protocol !== 'http:' && resolvedUrl.protocol !== 'https:') {
            continue;
          }

          const hostname = resolvedUrl.hostname.toLowerCase();

          // Check if it belongs to the base domain
          if (hostname === baseDomain || hostname.endsWith('.' + baseDomain)) {
            // Found an internal URL
            result.discoveredUrls.push(resolvedUrl.toString());

            // Check if it looks like a blog or article
            if (isBlogOrArticle(resolvedUrl)) {
              // Normalize URL (remove hashes and search queries to avoid duplicates)
              resolvedUrl.hash = '';
              result.blogArticles.push(resolvedUrl.toString());
            }
          }
        } catch (e) {
          // Ignore invalid URL structures
        }
      }
    }
  } catch (error) {
    result.error = error.message;
  }

  parentPort.postMessage(result);
});
