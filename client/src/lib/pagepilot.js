/**
 * PagePilot AHDjs integration (bonus module: tours, tooltips, highlights).
 *
 * The SDK is loaded as a trusted npm package - never injected as raw HTML - and is
 * created exactly once for the whole application. It is imported dynamically so the
 * ~400 kB vendor bundle is only fetched when a PagePilot page has actually rendered.
 * Every SDK call is wrapped, so a PagePilot outage, an empty tenant or a blocked
 * request can never break page rendering.
 */

/** Fixed localStorage key, so the same visitor keeps their tour/highlight progress. */
const VISITOR_ID_KEY = 'pagepilot.visitorId';

const DEFAULT_APP_ID = '6336128a251dcbda38bd8fe1';
const DEFAULT_API_HOST = 'https://pagepilot.fabbuilder.com';

// Both values are public client identifiers (they ship in the browser bundle),
// but they stay configurable through Vite env vars.
const APPLICATION_ID = import.meta.env.VITE_PAGEPILOT_APP_ID || DEFAULT_APP_ID;
const API_HOST = import.meta.env.VITE_PAGEPILOT_API_HOST || DEFAULT_API_HOST;

let instance = null;
let instancePromise = null;
let siteMapPromise = null;

function createVisitorId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Generates a random id once, then reuses the stored value on every visit. */
function getVisitorId() {
  try {
    const stored = window.localStorage.getItem(VISITOR_ID_KEY);
    if (stored) return stored;
    const id = createVisitorId();
    window.localStorage.setItem(VISITOR_ID_KEY, id);
    return id;
  } catch (_) {
    // Storage disabled (private mode / embedded preview): use a per-session id.
    return createVisitorId();
  }
}

/**
 * ahdjs ships as a UMD bundle, so depending on the interop in use the constructor can
 * arrive as the module itself, as `module.default`, or as `module.default.default`.
 * Unwrapping it here keeps `new AHDjs(...)` from failing with "not a constructor".
 */
function resolveSdk(module) {
  if (typeof module === 'function') return module;
  if (typeof module?.default === 'function') return module.default;
  if (typeof module?.default?.default === 'function') return module.default.default;
  console.warn('[PagePilot] AHDjs could not be loaded from the package exports.');
  return null;
}

/** Loads the SDK package + its stylesheet once; retries if the load failed. */
function loadSdk() {
  return Promise.all([import('ahdjs'), import('ahdjs/build/css/index.css')])
    .then(([module]) => resolveSdk(module))
    .catch((err) => {
      console.warn('[PagePilot] AHDjs could not be loaded:', err.message);
      return null;
    });
}

/**
 * Resolves with the single AHDjs instance (lazy singleton), or null when the SDK
 * is unavailable. Concurrent callers (React StrictMode) share the same creation.
 */
export function getPagePilot() {
  if (!instancePromise) {
    instancePromise = loadSdk()
      .then((AHDjs) => {
        if (!AHDjs) return null;
        try {
          instance = new AHDjs(undefined, {
            applicationId: APPLICATION_ID,
            apiHost: API_HOST,
            visitorId: getVisitorId(),
            showProgressbar: false,
          });
        } catch (err) {
          console.warn('[PagePilot] AHDjs could not be initialised:', err.message);
          instance = null;
        }
        return instance;
      })
      .catch((err) => {
        console.warn('[PagePilot] AHDjs could not be initialised:', err.message);
        return null;
      });
  }

  return instancePromise;
}

/** initializeSiteMap() runs once; concurrent callers share the same promise. */
export function initPagePilotSiteMap() {
  if (!siteMapPromise) {
    siteMapPromise = getPagePilot()
      .then((ahd) => (ahd ? ahd.initializeSiteMap(false) : null))
      .catch((err) => {
        console.warn('[PagePilot] Site map could not be loaded:', err.message);
      });
  }

  return siteMapPromise;
}

/**
 * Shows the highlights/tooltips PagePilot has published for `target`.
 * `target` is the PagePilot page slug (the tenant API filters on filter[slug]=<slug>),
 * so it matches the route slug of the page currently rendered.
 */
export function showPagePilotHighlights(target) {
  if (!target) return Promise.resolve(null);

  return initPagePilotSiteMap()
    .then(() => (instance ? instance.showHighlights(target, false) : null))
    .catch((err) => {
      console.warn('[PagePilot] Highlights could not be shown:', err.message);
    });
}

/** Hides any overlay the SDK left behind (route change and unmount). */
export function hidePagePilotHighlights() {
  if (!instance) return;

  try {
    instance.stop();
  } catch (err) {
    console.warn('[PagePilot] Cleanup skipped:', err.message);
  }
}
