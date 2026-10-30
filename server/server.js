/**
 * Express Server for PagePilot MERN POC.
 * Mounts Helmet, CORS allowlist, API Rate Limiting, API Routes, and React Client.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import pageRoutes from './routes/pageRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables once, from the project-root .env (absolute path)
dotenv.config({ path: path.join(rootDir, '.env') });

const app = express();

const PORT = process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : 3000;
const CLIENT_URL =
  process.env.CLIENT_URL ||
  process.env.CLIENT_ORIGIN ||
  'https://ais-dev-sd3l6hhnxm6y67oizel3qj-2275519414.asia-southeast1.run.app';

// Connect to MongoDB
connectDB();

// 1. Helmet security headers
// - Allows embedding in Google AI Studio while maintaining secure defaults
app.use(
  helmet({
    frameguard: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameAncestors: [
          "'self'",
          'https://aistudio.google.com',
          'https://*.google.com',
          'https://*.run.app',
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://pagepilot.fabbuilder.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://pagepilot.fabbuilder.com',
          'https://*.emtrendz.com',
          'https://fonts.googleapis.com',
          // Published PagePilot pages and the AHDjs module load icon stylesheets here.
          'https://cdn.jsdelivr.net',
        ],
        imgSrc: ["'self'", 'data:', 'https:', 'http:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'data:'],
        connectSrc: ["'self'", 'https://pagepilot.fabbuilder.com', 'https://*.emtrendz.com'],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
  })
);

// 2. CORS allowlist for frontend origin only
const corsAllowlist = [
  CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5173',
  'https://ais-dev-sd3l6hhnxm6y67oizel3qj-2275519414.asia-southeast1.run.app',
  'https://ais-pre-sd3l6hhnxm6y67oizel3qj-2275519414.asia-southeast1.run.app',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || corsAllowlist.includes(origin) || origin.endsWith('.run.app') || origin.endsWith('.google.com')) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'));
    },
    credentials: true,
  })
);

// 3. Rate limiting on /api (100 requests per 15 minutes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again after 15 minutes.' },
});
app.use('/api', apiLimiter);

// 4. Favicon 204 handler (prevents missing favicon 404 console error)
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 5. Request parsing
app.use(express.json());

// 6. Mount API routes
app.use('/api', pageRoutes);

// 7. Serve React Client (built dist if present, otherwise Vite dev middleware)
const distDir = path.join(rootDir, 'client', 'dist');

if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  // SPA fallback: every non-API route returns index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: path.join(rootDir, 'client'),
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

// 8. Global error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({
    success: false,
    message: err.message || 'An unexpected server error occurred.',
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Open http://localhost:${PORT}`);
});

// Also listen on port 5000 if PORT is 3000 so curl/Invoke-RestMethod http://localhost:5000 works
if (Number(PORT) !== 5000) {
  try {
    const backupServer = app.listen(5000, '127.0.0.1', () => {
      console.log(`API also accessible on http://localhost:5000`);
    });
    backupServer.on('error', () => {});
  } catch (_) {}
}
