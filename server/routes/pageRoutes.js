/**
 * Express router for PagePilot integration endpoints.
 * Provides /api/health and /api/pages/:slug.
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import { Page } from '../models/Page.js';
import { isDbConnected } from '../config/db.js';
import {
  fetchPagePilotPage,
  isValidSlug,
  PAGEPILOT_APP_ID,
  PAGEPILOT_API_HOST,
} from '../pagePilot.js';

const router = Router();

/**
 * GET /api/health
 * Returns server health and database status.
 */
router.get('/health', (req, res) => {
  const readyState = mongoose.connection.readyState;
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      status: readyState === 1 ? 'connected' : 'disconnected',
      readyState,
      name: mongoose.connection.name || 'pagepilot_poc',
    },
    pagePilot: {
      applicationId: PAGEPILOT_APP_ID,
      apiHost: PAGEPILOT_API_HOST,
      liveTenant: `https://${PAGEPILOT_APP_ID}.emtrendz.com`,
    },
  });
});

/**
 * GET /api/pages/:slug
 * Validates slug, fetches from PagePilot, upserts into MongoDB, and handles cache fallback.
 */
router.get('/pages/:slug', async (req, res) => {
  const { slug } = req.params;

  // Validate slug: only a-z, 0-9, hyphen, underscore, max 100 characters
  if (!slug || !isValidSlug(slug)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid slug. Only alphanumeric characters, hyphens, and underscores are allowed (max 100 chars).',
    });
  }

  const cleanSlug = slug.toLowerCase().replace(/^\/+/, '');
  let cachedDoc = null;

  // Skip MongoDB work entirely while the connection is down (avoids buffering delays);
  // the page is still served from PagePilot and cached once the connection returns.
  const dbUp = isDbConnected();

  // Query MongoDB cache first
  if (dbUp) {
    try {
      cachedDoc = await Page.findOne({ slug: cleanSlug });
    } catch (dbErr) {
      console.warn(`[MongoDB] Query error for "${cleanSlug}":`, dbErr.message);
    }
  } else {
    console.log(`[MongoDB] Offline; serving "${cleanSlug}" directly from PagePilot`);
  }

  // Fetch page from PagePilot
  try {
    const pageData = await fetchPagePilotPage(cleanSlug);

    // If PagePilot returns 404 (does not exist)
    if (!pageData) {
      return res.status(404).json({
        success: false,
        message: `Page "${cleanSlug}" was not found on PagePilot.`,
      });
    }

    // Upsert into MongoDB
    let savedDoc = null;
    if (dbUp) {
      try {
        savedDoc = await Page.findOneAndUpdate(
          { slug: cleanSlug },
          {
            slug: cleanSlug,
            title: pageData.title || cleanSlug,
            content: pageData.content,
            fetchedAt: new Date(),
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`[MongoDB] Upserted document for "${cleanSlug}" in MongoDB`);
      } catch (saveErr) {
        console.error(`[MongoDB] Upsert error for "${cleanSlug}":`, saveErr.message);
      }
    }

    const resultData = savedDoc ? savedDoc.toObject() : {
      slug: cleanSlug,
      title: pageData.title,
      content: pageData.content,
      fetchedAt: new Date(),
    };

    return res.status(200).json({
      success: true,
      message: `Page "${cleanSlug}" retrieved successfully.`,
      data: resultData,
      source: 'pagepilot',
    });
  } catch (fetchErr) {
    console.error(`[PagePilot] Fetch error for "${cleanSlug}":`, fetchErr.message);

    // If PagePilot is unreachable but the page is already in MongoDB, return the cached copy
    if (cachedDoc) {
      console.log(`[Cache] Serving cached copy for "${cleanSlug}"`);
      return res.status(200).json({
        success: true,
        message: `PagePilot is unreachable. Served cached copy for "${cleanSlug}".`,
        data: cachedDoc.toObject ? cachedDoc.toObject() : cachedDoc,
        source: 'mongodb-cache',
        cached: true,
      });
    }

    // Other PagePilot errors return 502 JSON
    return res.status(502).json({
      success: false,
      message: `PagePilot service error: ${fetchErr.message}`,
    });
  }
});

export default router;
