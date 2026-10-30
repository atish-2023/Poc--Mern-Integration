/**
 * MongoDB connection configuration using Mongoose.
 * Connects to 'pagepilot_poc' database using process.env.MONGODB_URI.
 * A missing MONGODB_URI is fatal; a failed connection only schedules a background
 * retry, so the HTTP server can keep serving pages straight from PagePilot.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// Safeguard: loads root .env only if not already present in process.env (no duplicate logs)
dotenv.config({ path: path.join(rootDir, '.env') });

const RETRY_MS = 10000;
let retryTimer = null;
let failureReported = false;

/** Force the connection to target the pagepilot_poc database. */
function withPocDatabase(uri) {
  if (uri.includes('pagepilot_poc')) return uri;
  return uri.replace(/\/(\?|$)/, '/pagepilot_poc$1');
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is missing in .env');
    process.exit(1);
  }

  if (mongoose.connection.readyState === 1) return;

  try {
    await mongoose.connect(withPocDatabase(uri), { serverSelectionTimeoutMS: 5000 });
    failureReported = false;
    console.log(`MongoDB connected: ${mongoose.connection.name}`);
  } catch (err) {
    // Mongoose error messages never include the password
    if (!failureReported) {
      failureReported = true;
      console.error(`[MongoDB] Connection failed: ${err.message}`);
      console.warn(
        '[MongoDB] Check Atlas Network Access allows your IP, and the password is URL-encoded. '
          + 'Server stays up and serves pages from PagePilot; caching resumes once MongoDB connects.'
      );
    } else {
      console.warn(`[MongoDB] Still offline, retrying in ${RETRY_MS / 1000}s...`);
    }
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connectDB, RETRY_MS);
  }
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
