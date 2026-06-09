/**
 * Detects technologies used by a website based on response headers, HTML, and body text.
 * 
 * @param {Object} headers - HTTP response headers.
 * @param {string} html - Raw HTML source code.
 * @param {string} bodyText - Plain text representation of page body.
 * @returns {string[]} Array of detected technology names.
 */
function detectTechnologies(headers, html, bodyText) {
  const technologies = new Set();

  // 1. Analyze Server & Headers
  if (headers['server']) {
    const server = headers['server'].toLowerCase();
    if (server.includes('nginx')) technologies.add('Nginx');
    if (server.includes('apache')) technologies.add('Apache');
    if (server.includes('cloudflare')) technologies.add('Cloudflare');
    if (server.includes('litespeed')) technologies.add('LiteSpeed');
    if (server.includes('microsoft-iis')) technologies.add('Microsoft IIS');
  }

  if (headers['x-powered-by']) {
    const poweredBy = headers['x-powered-by'].toLowerCase();
    if (poweredBy.includes('php')) technologies.add('PHP');
    if (poweredBy.includes('asp.net')) technologies.add('ASP.NET');
    if (poweredBy.includes('express')) technologies.add('Express.js');
  }

  // Check Set-Cookie headers
  const setCookie = headers['set-cookie'] ? JSON.stringify(headers['set-cookie']).toLowerCase() : '';
  if (setCookie.includes('laravel_session')) technologies.add('Laravel');
  if (setCookie.includes('wp-settings') || setCookie.includes('wordpress_logged_in')) technologies.add('WordPress');
  if (setCookie.includes('shopify')) technologies.add('Shopify');
  if (setCookie.includes('wix')) technologies.add('Wix');

  // 2. Analyze HTML
  if (html) {
    const htmlLower = html.toLowerCase();

    // Generator Meta Tag
    const generatorMatch = htmlLower.match(/<meta\s+name=["']generator["']\s+content=["']([^"']+)["']/i);
    if (generatorMatch) {
      const generator = generatorMatch[1].toLowerCase();
      if (generator.includes('wordpress')) technologies.add('WordPress');
      if (generator.includes('shopify')) technologies.add('Shopify');
      if (generator.includes('webflow')) technologies.add('Webflow');
      if (generator.includes('wix')) technologies.add('Wix');
      if (generator.includes('squarespace')) technologies.add('Squarespace');
      if (generator.includes('gatsby')) technologies.add('Gatsby');
      if (generator.includes('hugo')) technologies.add('Hugo');
      if (generator.includes('drupal')) technologies.add('Drupal');
      if (generator.includes('joomla')) technologies.add('Joomla');
      if (generator.includes('ghost')) technologies.add('Ghost CMS');
    }

    // CMS/Platform clues in HTML
    if (htmlLower.includes('/wp-content/') || htmlLower.includes('/wp-includes/')) {
      technologies.add('WordPress');
    }
    if (htmlLower.includes('cdn.shopify.com') || htmlLower.includes('shopify.theme')) {
      technologies.add('Shopify');
    }
    if (htmlLower.includes('wix.com') || htmlLower.includes('wixpress.com')) {
      technologies.add('Wix');
    }
    if (htmlLower.includes('static1.squarespace.com')) {
      technologies.add('Squarespace');
    }

    // Frameworks & Libraries
    if (htmlLower.includes('_reactrootcontainer') || htmlLower.includes('react-dom') || htmlLower.includes('react.development.js') || htmlLower.includes('react.production')) {
      technologies.add('React');
    }
    if (htmlLower.includes('__next_data__') || htmlLower.includes('/_next/static')) {
      technologies.add('Next.js');
      technologies.add('React');
    }
    if (htmlLower.includes('vue.js') || htmlLower.includes('vue.runtime') || htmlLower.includes('data-v-')) {
      technologies.add('Vue.js');
    }
    if (htmlLower.includes('__nuxt__') || htmlLower.includes('/_nuxt/')) {
      technologies.add('Nuxt.js');
      technologies.add('Vue.js');
    }
    if (htmlLower.includes('ng-version') || htmlLower.includes('ng-app')) {
      technologies.add('Angular');
    }
    if (htmlLower.includes('jquery.js') || htmlLower.includes('jquery.min.js') || htmlLower.includes('jquery/')) {
      technologies.add('jQuery');
    }

    // Analytics & Tracking
    if (htmlLower.includes('google-analytics.com/analytics.js') || htmlLower.includes('googletagmanager.com/gtag/js') || htmlLower.includes('window.datalayer')) {
      technologies.add('Google Analytics');
    }
    if (htmlLower.includes('googletagmanager.com/gtm.js')) {
      technologies.add('Google Tag Manager');
    }
    if (htmlLower.includes('js.hs-scripts.com') || htmlLower.includes('hs-analytics')) {
      technologies.add('HubSpot');
    }
    if (htmlLower.includes('connect.facebook.net')) {
      technologies.add('Facebook Pixel');
    }

    // Styling
    if (htmlLower.includes('tailwind.css') || htmlLower.includes('tailwindcss') || htmlLower.includes('tailwind.min.css')) {
      technologies.add('Tailwind CSS');
    }
    if (htmlLower.includes('bootstrap.css') || htmlLower.includes('bootstrap.min.css') || htmlLower.includes('bootstrap/')) {
      technologies.add('Bootstrap');
    }
  }

  return Array.from(technologies);
}

module.exports = { detectTechnologies };
