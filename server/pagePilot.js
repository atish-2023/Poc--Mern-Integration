/**
 * PagePilot Integration Service (Server-Side Only).
 * 
 * Fetches published pages from PagePilot edge/API using credentials or tokens.
 * Caches auth token in memory so re-login only occurs when expired.
 * Strips script tags and inline event handlers before returning normalized content.
 */

const DEFAULT_APP_ID = '6336128a251dcbda38bd8fe1';
const REQUEST_TIMEOUT_MS = 10000;

export const PAGEPILOT_APP_ID = process.env.PAGEPILOT_APP_ID || DEFAULT_APP_ID;
export const PAGEPILOT_API_HOST = process.env.PAGEPILOT_API_HOST || process.env.PAGEPILOT_BASE_URL || 'https://pagepilot.fabbuilder.com';
const PAGEPILOT_TENANT_BASE = `https://${PAGEPILOT_APP_ID}.emtrendz.com`;

// In-memory PagePilot token cache
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Retrieves a valid PagePilot authentication token, logging in only when expired.
 */
async function getPagePilotToken() {
  const email = process.env.PAGEPILOT_EMAIL;
  const password = process.env.PAGEPILOT_PASSWORD;
  const baseUrl = PAGEPILOT_API_HOST;

  if (!email || !password || email === 'user@example.com' || email.includes('example.com')) {
    return null;
  }

  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      const data = await res.json();
      cachedToken = data.token || data.accessToken || data.jwt || null;
      const ttlMs = data.expiresIn ? data.expiresIn * 1000 : 50 * 60 * 1000;
      tokenExpiresAt = Date.now() + ttlMs;
      return cachedToken;
    }
  } catch (err) {
    console.warn('[PagePilot Auth] Token login attempt failed:', err.message);
  }

  return null;
}

/**
 * Validates route slugs (letters, numbers, hyphens, underscores, max 100 chars).
 */
export function isValidSlug(slug) {
  if (typeof slug !== 'string') return false;
  const clean = slug.replace(/^\/+/, '');
  return /^[a-zA-Z0-9_-]{1,100}$/.test(clean);
}

/**
 * Sanitizes HTML by stripping script tags and unsafe on* event handlers.
 */
function sanitizeServerHtml(rawHtml) {
  if (!rawHtml) return '';
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*["']\s*javascript:[^"']*["']/gi, '$1="#"');
}

/**
 * Parses PagePilot HTML response to extract title, main layout, and stylesheets.
 */
function parsePagePilotHtml(html, slug) {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  let title = titleMatch ? titleMatch[1].trim() : slug;
  title = title.replace(/\s*\|\s*PagePilot.*$/i, '');

  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  let rawContent = mainMatch ? mainMatch[0] : '';

  if (!rawContent) {
    const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    rawContent = bodyMatch ? bodyMatch[1] : html;
  }

  const linkMatches = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
  const stylesheets = [];

  for (const linkTag of linkMatches) {
    const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);
    if (hrefMatch) {
      let href = hrefMatch[1].replace(/&amp;/g, '&'); // Fix unescaped HTML entities in URLs
      if (href.startsWith('/')) {
        href = `${PAGEPILOT_TENANT_BASE}${href}`;
      }
      stylesheets.push(href);
    }
  }

  const coreStyles = `${PAGEPILOT_API_HOST}/pagePilotStyles.css`;
  if (!stylesheets.includes(coreStyles)) {
    stylesheets.push(coreStyles);
  }

  return {
    title,
    html: sanitizeServerHtml(rawContent),
    stylesheets,
  };
}

/**
 * Fetches a published page from PagePilot by slug.
 * Returns null if the page does not exist (HTTP 404).
 */
export async function fetchPagePilotPage(slug) {
  const cleanSlug = slug.replace(/^\/+/, '');
  const url = `${PAGEPILOT_TENANT_BASE}/${cleanSlug}`;

  const token = await getPagePilotToken();
  const headers = {
    'User-Agent': 'PagePilot-MERN-POC/1.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeout);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`PagePilot responded with HTTP ${response.status}`);
    }

    const html = await response.text();
    const parsed = parsePagePilotHtml(html, cleanSlug);

    return {
      slug: cleanSlug,
      title: parsed.title,
      content: {
        html: parsed.html,
        stylesheets: parsed.stylesheets,
        originalUrl: url,
      },
      fetchedAt: new Date(),
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}
