import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, useLocation, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import Header, { NAV_LINKS } from './components/Header.jsx';
import { showPagePilotHighlights, hidePagePilotHighlights } from './lib/pagepilot.js';

/**
 * Dynamic Page Renderer.
 * Handles dynamic route slugs and multi-segment catch-all paths.
 * Renders published PagePilot pages or falls back to PagePilot's /poc-not-found page.
 */
function DynamicPage({ isCatchAll = false }) {
  const params = useParams();
  const location = useLocation();
  const slug = isCatchAll
    ? location.pathname.replace(/^\/+/, '')
    : params.slug || location.pathname.replace(/^\/+/, '');

  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [is404, setIs404] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setIs404(false);

    async function loadPage() {
      try {
        const pageRes = await fetch(`/api/pages/${encodeURIComponent(slug)}`);
        const contentType = pageRes.headers.get('content-type') || '';

        if (pageRes.ok && contentType.includes('application/json')) {
          const resJson = await pageRes.json();
          const pageData = resJson.data || resJson;
          if (isMounted) setPage(pageData);
          return;
        }

        // When PagePilot returns 404, attempt to load published PagePilot Not Found page (/poc-not-found)
        if (pageRes.status === 404) {
          const notFoundRes = await fetch('/api/pages/poc-not-found');
          const notFoundType = notFoundRes.headers.get('content-type') || '';
          if (notFoundRes.ok && notFoundType.includes('application/json')) {
            const notFoundJson = await notFoundRes.json();
            const notFoundData = notFoundJson.data || notFoundJson;
            if (isMounted) setPage({ ...notFoundData, isNotFoundFallback: true });
            return;
          }
          if (isMounted) setIs404(true);
          return;
        }

        // Other errors (e.g. 502 Gateway, 500 Server Error)
        let errorMsg = 'Could not load page, try again';
        if (contentType.includes('application/json')) {
          const errData = await pageRes.json().catch(() => ({}));
          errorMsg = errData.message || errorMsg;
        }
        throw new Error(errorMsg);
      } catch (err) {
        if (isMounted) setError(err.message || 'Could not load page, try again');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadPage();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  // Inject PagePilot stylesheets dynamically without unsafe querySelector lookups
  useEffect(() => {
    if (page?.content?.stylesheets && Array.isArray(page.content.stylesheets)) {
      const addedLinks = [];
      const existingHrefs = Array.from(document.querySelectorAll('link')).map((l) => l.href);

      page.content.stylesheets.forEach((href) => {
        if (!existingHrefs.includes(href)) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          document.head.appendChild(link);
          addedLinks.push(link);
        }
      });

      return () => {
        addedLinks.forEach((link) => {
          if (link.parentNode) link.parentNode.removeChild(link);
        });
      };
    }
  }, [page]);

  // Bonus module: start PagePilot AHDjs highlights once the page content is mounted,
  // and hide them again on route change / unmount. Failures never break rendering.
  useEffect(() => {
    if (!page?.content?.html) return undefined;

    showPagePilotHighlights(String(slug || '').replace(/^\/+/, ''));

    return () => {
      hidePagePilotHighlights();
    };
  }, [page, slug]);

  // 1. Loading State with Spinner
  if (loading) {
    return (
      <div className="state-box">
        <div className="spinner-wrapper">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading page...</p>
        </div>
      </div>
    );
  }

  // 2. 404 Page Not Found Screen
  if (is404 || (!page?.content?.html && !error)) {
    return (
      <div className="fallback-404">
        <h2>Page not found</h2>
        <p style={{ marginTop: '0.6rem', marginBottom: '1.5rem', color: '#64748b' }}>
          The page you requested does not exist or has been moved.
        </p>
        <Link to="/" className="home-btn">
          Home
        </Link>
      </div>
    );
  }

  // 3. Friendly Error State with Home button
  if (error) {
    return (
      <div className="state-box">
        <h2 className="error-title">Could not load page, try again</h2>
        <p className="error-desc">{error}</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={() => window.location.reload()}
            className="home-btn"
            style={{ backgroundColor: '#475569', borderColor: '#475569' }}
          >
            Retry
          </button>
          <Link to="/" className="home-btn">
            Home
          </Link>
        </div>
      </div>
    );
  }

  // 4. Sanitize HTML strictly before rendering (strip scripts and inline event handlers)
  const cleanHtml = DOMPurify.sanitize(page.content.html, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    ADD_TAGS: ['style', 'picture'],
    ADD_ATTR: ['style', 'target'],
  });

  return (
    <article className="page-container">
      {page.title && <h1 className="page-title">{page.title}</h1>}
      <div
        className="page-body-rendered"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    </article>
  );
}

/**
 * Home Page component.
 * Displays simple link buttons for About, Pricing, and Contact by reusing NAV_LINKS.
 */
function HomePage() {
  const pageButtons = NAV_LINKS.filter((item) => item.slug);

  return (
    <div className="home-container">
      <div className="hero-card">
        <h1>PagePilot MERN Integration POC</h1>
        <p>Dynamic routing and MongoDB caching demonstration for PagePilot.</p>
        <div className="home-buttons">
          {pageButtons.map((item) => (
            <Link key={item.path} to={item.path} className="home-btn">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Root Application component with dynamic and catch-all routing.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/:slug" element={<DynamicPage />} />
          <Route path="*" element={<DynamicPage isCatchAll={true} />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <p>PagePilot MERN POC</p>
      </footer>
    </BrowserRouter>
  );
}
