/**
 * Page model for caching PagePilot content in MongoDB.
 * Database: pagepilot_poc | Collection: pages
 */
import mongoose from 'mongoose';

const pageSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    title: {
      type: String,
      default: '',
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    fetchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'pages',
  }
);

export const Page = mongoose.models.Page || mongoose.model('Page', pageSchema);
