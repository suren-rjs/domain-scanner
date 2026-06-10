/**
 * Detects technologies used by a website based on response headers, HTML, and body text.
 * 
 * @param {Object} headers - HTTP response headers.
 * @param {string} html - Raw HTML source code.
 * @param {string} bodyText - Plain text representation of page body.
 * @returns {Array<{name: string, category: string}>} Array of detected technology objects.
 */
function detectTechnologies(headers, html, bodyText) {
  const detected = new Map(); // name -> category

  const add = (name, category) => {
    detected.set(name, category);
  };

  // Normalize headers
  const normalizedHeaders = {};
  for (const key in headers) {
    normalizedHeaders[key.toLowerCase()] = headers[key];
  }

  // 1. Analyze Server & Headers
  if (normalizedHeaders['server']) {
    const server = normalizedHeaders['server'].toLowerCase();
    if (server.includes('nginx')) add('Nginx', 'Webserver type');
    if (server.includes('apache')) add('Apache', 'Webserver type');
    if (server.includes('cloudflare')) add('Cloudflare', 'Security & CDN');
    if (server.includes('litespeed')) add('LiteSpeed', 'Webserver type');
    if (server.includes('microsoft-iis')) add('Microsoft IIS', 'Webserver type');
    if (server.includes('caddy')) add('Caddy', 'Webserver type');
    if (server.includes('cloudfront')) add('Amazon CloudFront', 'Security & CDN');
    if (server.includes('fastly')) add('Fastly', 'Security & CDN');
    if (server.includes('vercel')) add('Vercel', 'Webserver type');
    if (server.includes('netlify')) add('Netlify', 'Webserver type');
  }

  if (normalizedHeaders['via']) {
    const via = normalizedHeaders['via'].toLowerCase();
    if (via.includes('cloudfront')) add('Amazon CloudFront', 'Security & CDN');
  }

  if (normalizedHeaders['cf-ray'] || normalizedHeaders['cf-cache-status']) {
    add('Cloudflare', 'Security & CDN');
  }

  if (normalizedHeaders['x-powered-by']) {
    const poweredBy = normalizedHeaders['x-powered-by'].toLowerCase();
    if (poweredBy.includes('php')) add('PHP', 'Coding Language');
    if (poweredBy.includes('asp.net')) {
      add('ASP.NET', 'Used framework');
      add('C#', 'Coding Language');
    }
    if (poweredBy.includes('express')) add('Express.js', 'Used framework');
    if (poweredBy.includes('next.js') || poweredBy.includes('nextjs')) {
      add('Next.js', 'Used framework');
      add('React', 'Used framework');
    }
  }

  if (normalizedHeaders['x-aspnet-version']) {
    add('ASP.NET', 'Used framework');
    add('C#', 'Coding Language');
  }

  // Check Set-Cookie headers
  const setCookie = normalizedHeaders['set-cookie'] 
    ? (Array.isArray(normalizedHeaders['set-cookie']) 
        ? normalizedHeaders['set-cookie'].join(' ') 
        : String(normalizedHeaders['set-cookie'])).toLowerCase() 
    : '';

  if (setCookie.includes('laravel_session')) {
    add('Laravel', 'Used framework');
    add('PHP', 'Coding Language');
  }
  if (setCookie.includes('wp-settings') || setCookie.includes('wordpress_logged_in')) {
    add('WordPress', 'CMS');
    add('PHP', 'Coding Language');
  }
  if (setCookie.includes('shopify')) add('Shopify', 'CMS');
  if (setCookie.includes('wix')) add('Wix', 'CMS');
  if (setCookie.includes('squarespace')) add('Squarespace', 'CMS');
  if (setCookie.includes('phpsessid') || setCookie.includes('php_session')) {
    add('PHP', 'Coding Language');
  }
  if (setCookie.includes('jsessionid')) {
    add('Java / JSP', 'Coding Language');
  }
  if (setCookie.includes('csrftoken')) {
    add('Django / Python', 'Used framework');
  }
  if (setCookie.includes('_rails_session')) {
    add('Ruby on Rails', 'Used framework');
    add('Ruby', 'Coding Language');
  }

  // 2. Analyze HTML
  if (html) {
    const htmlLower = html.toLowerCase();

    // Generator Meta Tag
    const generatorMatch = htmlLower.match(/<meta\s+name=["']generator["']\s+content=["']([^"']+)["']/i);
    if (generatorMatch) {
      const generator = generatorMatch[1].toLowerCase();
      if (generator.includes('wordpress')) {
        add('WordPress', 'CMS');
        add('PHP', 'Coding Language');
      }
      if (generator.includes('shopify')) add('Shopify', 'CMS');
      if (generator.includes('webflow')) add('Webflow', 'CMS');
      if (generator.includes('wix')) add('Wix', 'CMS');
      if (generator.includes('squarespace')) add('Squarespace', 'CMS');
      if (generator.includes('gatsby')) {
        add('Gatsby', 'Used framework');
        add('React', 'Used framework');
      }
      if (generator.includes('hugo')) add('Hugo', 'Used framework');
      if (generator.includes('drupal')) {
        add('Drupal', 'CMS');
        add('PHP', 'Coding Language');
      }
      if (generator.includes('joomla')) {
        add('Joomla', 'CMS');
        add('PHP', 'Coding Language');
      }
      if (generator.includes('ghost')) add('Ghost CMS', 'CMS');
      if (generator.includes('next.js')) {
        add('Next.js', 'Used framework');
        add('React', 'Used framework');
      }
    }

    // CMS/Platform clues in HTML
    if (htmlLower.includes('/wp-content/') || htmlLower.includes('/wp-includes/')) {
      add('WordPress', 'CMS');
      add('PHP', 'Coding Language');
    }
    if (htmlLower.includes('cdn.shopify.com') || htmlLower.includes('shopify.theme')) {
      add('Shopify', 'CMS');
    }
    if (htmlLower.includes('wix.com') || htmlLower.includes('wixpress.com')) {
      add('Wix', 'CMS');
    }
    if (htmlLower.includes('static1.squarespace.com')) {
      add('Squarespace', 'CMS');
    }
    if (htmlLower.includes('/sites/default/files/') || htmlLower.includes('drupal.org')) {
      add('Drupal', 'CMS');
      add('PHP', 'Coding Language');
    }
    if (htmlLower.includes('aem-clientlibs') || htmlLower.includes('/etc/clientlibs/')) {
      add('Adobe Experience Manager', 'CMS');
    }
    if (htmlLower.includes('demandware.net') || htmlLower.includes('demandware.store')) {
      add('Salesforce Commerce Cloud', 'CMS');
    }

    // Frameworks & Libraries
    if (htmlLower.includes('_reactrootcontainer') || htmlLower.includes('react-dom') || htmlLower.includes('react.development.js') || htmlLower.includes('react.production')) {
      add('React', 'Used framework');
    }
    if (htmlLower.includes('__next_data__') || htmlLower.includes('/_next/static')) {
      add('Next.js', 'Used framework');
      add('React', 'Used framework');
    }
    if (htmlLower.includes('vue.js') || htmlLower.includes('vue.runtime') || htmlLower.includes('data-v-')) {
      add('Vue.js', 'Used framework');
    }
    if (htmlLower.includes('__nuxt__') || htmlLower.includes('/_nuxt/')) {
      add('Nuxt.js', 'Used framework');
      add('Vue.js', 'Used framework');
    }
    if (htmlLower.includes('ng-version') || htmlLower.includes('ng-app')) {
      add('Angular', 'Used framework');
    }
    if (htmlLower.includes('jquery.js') || htmlLower.includes('jquery.min.js') || htmlLower.includes('jquery/')) {
      add('jQuery', 'Used framework');
    }
    if (htmlLower.includes('svelte-') || htmlLower.includes('svelte.js')) {
      add('Svelte', 'Used framework');
    }

    // Build Tools & Bundlers
    if (htmlLower.includes('/@vite/client') || htmlLower.includes('src="/vite.svg"') || htmlLower.includes('/vite/')) {
      add('Vite', 'Build tool');
    }
    if (htmlLower.includes('webpackjsonp') || htmlLower.includes('webpack-runtime') || htmlLower.includes('webpack-')) {
      add('Webpack', 'Build tool');
    }
    if (htmlLower.includes('/parcel.') || htmlLower.includes('parcelrequire')) {
      add('Parcel', 'Build tool');
    }

    // Analytics & Tracking
    if (htmlLower.includes('google-analytics.com/analytics.js') || htmlLower.includes('googletagmanager.com/gtag/js') || htmlLower.includes('window.datalayer')) {
      add('Google Analytics', 'Analytics & Tracking');
    }
    if (htmlLower.includes('googletagmanager.com/gtm.js')) {
      add('Google Tag Manager', 'Analytics & Tracking');
    }
    if (htmlLower.includes('js.hs-scripts.com') || htmlLower.includes('hs-analytics') || htmlLower.includes('hubspot.com')) {
      add('HubSpot', 'Analytics & Tracking');
    }
    if (htmlLower.includes('connect.facebook.net')) {
      add('Facebook Pixel', 'Analytics & Tracking');
    }
    if (htmlLower.includes('static.hotjar.com') || htmlLower.includes('hotjar.js')) {
      add('Hotjar', 'Analytics & Tracking');
    }
    if (htmlLower.includes('mixpanel.js') || htmlLower.includes('mixpanel-js') || htmlLower.includes('mixpanel.init')) {
      add('Mixpanel', 'Analytics & Tracking');
    }
    if (htmlLower.includes('klaviyo.js') || htmlLower.includes('klaviyo.com')) {
      add('Klaviyo', 'Analytics & Tracking');
    }
    if (htmlLower.includes('chimpstatic.com') || htmlLower.includes('mailchimp.com')) {
      add('Mailchimp', 'Analytics & Tracking');
    }

    // Styling
    if (htmlLower.includes('tailwind.css') || htmlLower.includes('tailwindcss') || htmlLower.includes('tailwind.min.css')) {
      add('Tailwind CSS', 'Styling/CSS');
    }
    if (htmlLower.includes('bootstrap.css') || htmlLower.includes('bootstrap.min.css') || htmlLower.includes('bootstrap/')) {
      add('Bootstrap', 'Styling/CSS');
    }
    if (htmlLower.includes('font-awesome') || htmlLower.includes('fontawesome') || htmlLower.includes('fa-')) {
      add('Font Awesome', 'Styling/CSS');
    }
  }

  return Array.from(detected.entries()).map(([name, category]) => ({ name, category }));
}

module.exports = { detectTechnologies };
