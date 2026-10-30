# PagePilot MERN Integration POC

A small MERN app that shows PagePilot pages inside my own React app, using the same slug in the URL (for example `/poc-about`).

## What I built

- Every page I publish in PagePilot opens in my app at `http://localhost:3000/<slug>`.
- The Express backend fetches the page from PagePilot, saves a copy in MongoDB Atlas, and sends it to React as JSON.
- React shows the page with clean HTML. I have friendly screens for loading, "Page not found", and errors.
- If PagePilot is down but the page is already in MongoDB, my app serves the saved copy.

## Tech stack

- React 19 + React Router 7 (frontend)
- Node.js + Express 4 (backend)
- MongoDB Atlas with Mongoose 9 (page cache, database `pagepilot_poc`)
- Vite 8 (build + dev server), TypeScript only for `tsc --noEmit` linting
- DOMPurify (HTML cleaning), Helmet (security headers), CORS, express-rate-limit
- ahdjs (PagePilot browser SDK, used for the bonus module)

## How it works

```text
Browser: /poc-about
   -> React Router /:slug -> DynamicPage (PageRenderer)
      -> GET /api/pages/poc-about  (same origin, no secrets in the browser)
         -> Express: validate slug -> fetch PagePilot -> save copy in MongoDB
            -> PagePilot tenant edge: https://<app-id>.emtrendz.com/poc-about
         <- { success, message, data }
      <- React cleans HTML with DOMPurify and renders it
```

- The frontend only calls my own API. It never talks to PagePilot directly.
- The backend asks PagePilot for the live page on every request, so new content shows up at once.
- The result is upserted into the `pages` collection with a fresh `fetchedAt`.
- If PagePilot fails, the backend returns the MongoDB copy (with `source: "mongodb-cache"`). If there is no copy, it returns 502.
- A PagePilot 404 returns 404 JSON. React then tries `/api/pages/poc-not-found` and shows that PagePilot page, or its own "Page not found" box.
- If MongoDB is unreachable, the server logs it once and retries every 10 seconds. The site keeps working from PagePilot in the meantime.

## Folder structure

```text
pagepilot-mern-poc/
├── package.json              # npm scripts and dependencies
├── .env.example              # env variable names with placeholders (copy to .env)
├── .gitignore                # ignores .env, node_modules, dist, *.zip
├── tsconfig.json             # used by "npm run lint"
├── metadata.json             # Google AI Studio project info (not used at runtime)
├── index.html                # old template entry, no npm script uses it
├── vite.config.ts            # old template config, builds use client/vite.config.js
├── data/                     # leftover local MongoDB files, not used by the app
├── client/                   # React frontend (this is the Vite root)
│   ├── index.html            # real frontend entry, loads /src/main.jsx
│   ├── vite.config.js        # active Vite config (envDir = project root)
│   ├── package.json          # used by "npm run client"
│   └── src/
│       ├── main.jsx          # mounts React
│       ├── App.jsx           # routes, DynamicPage, DOMPurify, loading/404/error screens
│       ├── index.css         # plain CSS
│       ├── components/Header.jsx   # navbar + NAV_LINKS (single source for slugs)
│       └── lib/pagepilot.js  # AHDjs loader for the bonus module
├── server/
│   ├── server.js             # entry: dotenv, Helmet, CORS, rate limit, SPA serving
│   ├── pagePilot.js          # PagePilot service: token cache, fetch by slug, clean HTML
│   ├── config/db.js          # Mongo connect, pagepilot_poc, 10s retry
│   ├── models/Page.js        # schema: slug, title, content, fetchedAt
│   ├── routes/pageRoutes.js  # GET /api/health, GET /api/pages/:slug
│   └── package.json          # standalone server package
└── test/api.test.js          # node:test suite (slug rules, live fetches, schema)
```

## How to run

You need Node.js 20 (I used 20.19.6) and a MongoDB Atlas cluster.

```bash
npm install
cp .env.example .env     # then fill the real values in .env
npm run dev              # opens http://localhost:3000
```

Other scripts that exist in `package.json`: `npm start` (build + run), `npm run build`, `npm run lint`, `npm test`, `npm run server`, `npm run client`.

Environment variables (names only):

| Name | Meaning |
|---|---|
| `PORT` | Express port. Defaults to 3000 (server also listens on 5000) |
| `NODE_ENV` | Standard Node environment name |
| `MONGODB_URI` | Atlas connection string. Server exits if this is missing |
| `PAGEPILOT_EMAIL` | PagePilot account email (server side only) |
| `PAGEPILOT_PASSWORD` | PagePilot account password (server side only) |
| `PAGEPILOT_BASE_URL` | PagePilot builder host (default `https://pagepilot.fabbuilder.com`) |
| `PAGEPILOT_APP_ID` | Tenant application id used to build the page URL |
| `CLIENT_URL` | Frontend origin for the CORS allowlist |
| `VITE_PAGEPILOT_APP_ID` | Optional public app id for the browser SDK |
| `VITE_PAGEPILOT_API_HOST` | Optional public API host for the browser SDK |

- Atlas Network Access must allow your IP, or the DB connection keeps failing (the site still works from PagePilot).
- URL-encode special characters in the Atlas password: `@` becomes `%40`.
- The database name is forced to `pagepilot_poc` if your URI points somewhere else.

## Pages I tested

| URL | Result |
|---|---|
| `/poc-about` | Works. Company intro content plus a 3-slide carousel |
| `/poc-pricing` | Works. Three pricing plans |
| `/poc-contact` | Works. Contact details |
| `/home` | Works. This is the published home page |
| `/poc-home` | PagePilot returns 404 for this slug, so my app shows the PagePilot "page not found" page |
| `/totally-fake-slug` | Shows "Page not found" (the API returns 404, then the `/poc-not-found` fallback loads) |
| `/` | My own React home page with buttons to the pages above |

## Security (what I did and why)

- **PagePilot login stays on the server.** `PAGEPILOT_EMAIL` and `PAGEPILOT_PASSWORD` are only read in `server/pagePilot.js`. The browser never sees them, and the frontend uses relative `/api` URLs.
- **Token cached in memory.** `getPagePilotToken()` keeps the token plus an expiry time and only logs in again after it expires. The token value is never printed in logs.
- **Secrets live in `.env`.** `.gitignore` blocks `.env`. `.env.example` has placeholders only, and the zip for submission must not contain `.env`.
- **Slug validation.** Only `a-z`, `0-9`, `-`, `_`, max 100 characters. Anything else returns 400 before any DB query or network call.
- **HTML cleaned twice.** The server strips `<script>`, `on*` handlers and `javascript:` links. React then runs DOMPurify and forbids `script`, `iframe`, `object`, `embed` before `dangerouslySetInnerHTML`.
- **Helmet CSP.** Scripts, styles and `fetch` are limited to my own origin plus the PagePilot hosts. Published page content also loads icon styles from `cdn.jsdelivr.net`, which I allow explicitly in `style-src` and `font-src`.
- **CORS allowlist + rate limit.** Only configured origins can call the API, and `/api` is limited to 100 requests per 15 minutes per IP.
- **No stack traces in errors.** The global error handler returns only a message. The server binds to `127.0.0.1` for local runs.

## What I learned about PagePilot

I explored the dashboard (Pages, Tooltips, Tours, Webinars, Highlights) and the integration options: Script Tag, React.js (`ahdjs`), Flutter, Vue.js and Angular.

- **Pages** - the actual page builder. A page is published under a slug and served from a tenant host.
- **Tooltips** - small popups attached to an element on a page.
- **Tours** - a guided step-by-step walkthrough across elements.
- **Highlights** - callouts that draw attention to a part of the page.
- **Webinars** - webinar content shown through the same SDK.
- **How AHDjs is set up** - `npm install ahdjs`, then `import AHDjs from 'ahdjs'` plus `import 'ahdjs/build/css/index.css'`, create it with `applicationId` and `apiHost`, call `initializeSiteMap()` and `showHighlights(<target>, true)`.
- **How pages are fetched** - published pages are server-rendered HTML at `https://<applicationId>.emtrendz.com/<slug>`. I take the `<main>` block and the stylesheet links. There is no headless content API that returns page JSON.
- **Unclear in the docs** - PagePilot does not document a public REST login endpoint, so the exact server-side auth flow (and the token lifetime) is guesswork. The SDK's default `apiHost` (`ahd-be-...a.run.app`) answers 500/503 for every path; using `https://pagepilot.fabbuilder.com` as `apiHost` works.

## Bonus modules (Tooltips, Tours, Webinars): honest status

What is actually in my code:

- `ahdjs` is installed and wrapped in `client/src/lib/pagepilot.js`: one lazily created instance (singleton), config from `VITE_PAGEPILOT_APP_ID` / `VITE_PAGEPILOT_API_HOST`, `initializeSiteMap()` called once, and `showHighlights(slug, false)` after each page mounts.
- `visitorId` is not hardcoded. It is a `crypto.randomUUID()` stored in `localStorage` under `pagepilot.visitorId`, so the same visitor keeps progress.
- Every SDK call is inside `try/catch` and only logs a short warning, so a PagePilot failure cannot break a page. `instance.stop()` runs on route change and unmount.
- The SDK is a trusted npm package (loaded with a dynamic `import()`), never injected as raw HTML. DOMPurify rules for page HTML are unchanged.
- Webinars are not implemented, and no tour/tooltip/highlight content is visible in my app yet.

Why nothing shows on screen:

- The tenant API for this account answers `200` with empty lists (`tooltips: []`, `tours: []`, `appBanners: []`) for every slug I tried, so there is no published content for the SDK to display.
- I could not create that content from code: the builder has no public REST login endpoint, so a tour or tooltip must be created and published in the PagePilot dashboard first.

With a plan that allows it, I would:

- Create one tooltip or a 2-step tour in PagePilot and publish it for the target page `poc-about`.
- Confirm the target id it expects (the API filters on `filter[slug]=<slug>`, which matches my route slug).
- Reload `/poc-about` and check the overlay appears, then check that closing it is remembered for the same `visitorId`.

## Known limitations

- No bonus content is visible yet (nothing published for this test tenant), and the last browser check of the SDK network calls after my constructor fix is still pending.
- `npm run dev` needs a live internet connection to PagePilot. There is no offline fixture.
- `npm test` hits the real PagePilot API, so it needs the network. It does not test MongoDB.
- Page cache is "fetch first, fall back to cache". There is no TTL, so every page load calls PagePilot.
- The CORS check also allows any `*.run.app` and `*.google.com` origin, so the allowlist is wider than ideal.
- `npm run clean` and `npm run zip` use `rm -rf` and `zip`, which do not exist in Windows PowerShell.

## How I used AI

- I built the project step by step and ran each step myself before moving on.
- When something broke, I read the server logs and the browser console first, then asked AI for the fix.
- I asked AI to check my own claims against the code (for example which Vite config the build really loads).
- I moved every secret into `.env` and had AI verify that tracked files only contain placeholders.
- I removed unused files and packages at the end so the code is quick to read.

Prompts I used (short summaries):

1. Create a MERN project with a dynamic `/:slug` route that loads pages from PagePilot.
2. Fix the "Unexpected token '<' is not valid JSON" error (the API returned HTML instead of JSON).
3. Save fetched pages into MongoDB Atlas (cache) and fix the connection (env not loading, Atlas IP allowlist, URL-encoded password).
4. Fix the npm install version conflict (esbuild/vite) so `npm install` works without flags.
5. Add security: server-side credentials, DOMPurify, Helmet, CORS, rate limit, slug validation.
6. Check and add the PagePilot AHDjs bonus integration.
7. Audit the project and remove unused files and packages.
8. Write this README.

The full prompts are available on request.

## Submission note

The submission zip must not contain `node_modules/`, `client/dist/`, `build/` or `.env`. Note that the current `npm run zip` script does not exclude `.env` or `data/`, so delete or exclude them before submitting.
