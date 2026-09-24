import { z } from "zod";

import type { HydratePayload } from "@/shared/lib/store-types";

export const MAX_LIBRARY_BACKUP_BYTES = 5 * 1024 * 1024;
const key = z.string().min(1).max(512).refine((value) => !["__proto__", "constructor", "prototype"].includes(value));
const timestamp = z.string().max(64).refine((value) => Number.isFinite(Date.parse(value)));
const rating = z.number().finite().min(0).max(5);
const review = z.object({
  titleId: key, rating, text: z.string().max(100_000), tags: z.array(z.string().max(256)).max(100),
  spoiler: z.boolean(), createdAt: timestamp,
});
const collection = z.object({
  id: key, name: z.string().min(1).max(1000), emoji: z.string().max(128),
  titleIds: z.array(key).max(50_000), createdAt: timestamp,
});
const backup = z.object({
  _app: z.literal("toonspectrum-library"), version: z.literal(1),
  ratings: z.record(key, rating),
  reads: z.record(key, z.enum(["want", "reading", "paused", "done", "dropped"])),
  subscriptions: z.record(key, z.boolean()),
  reviews: z.record(key, review),
  likedReviews: z.record(key, z.boolean()),
  collections: z.array(collection).max(5000),
});

/** Validate the full exported format before any local-library state can be replaced. */
export function parseLibraryBackup(text: string): HydratePayload {
  if (new TextEncoder().encode(text).byteLength > MAX_LIBRARY_BACKUP_BYTES) throw new Error("backup-too-large");
  // Reject dangerous own keys before a schema library can silently discard them.
  const parsed: unknown = JSON.parse(text, (property: string, value: unknown) => {
    if (["__proto__", "constructor", "prototype"].includes(property)) throw new Error("unsafe-backup-key");
    return value;
  });
  const data = backup.parse(parsed);
  if (new Set(data.collections.map((item) => item.id)).size !== data.collections.length) throw new Error("duplicate-collection");
  for (const [id, item] of Object.entries(data.reviews)) {
    if (id !== item.titleId) throw new Error("review-identity-mismatch");
  }
  // Explicit projection excludes auth, preferences, outbox and unknown input fields.
  return { ratings: data.ratings, reads: data.reads, subscriptions: data.subscriptions, reviews: data.reviews, likedReviews: data.likedReviews, collections: data.collections };
}
