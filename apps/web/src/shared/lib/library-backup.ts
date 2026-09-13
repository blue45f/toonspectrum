import type { Collection, HydratePayload } from "./store-types";
import type { ReadState, UserReview } from "./types";

export const MAX_LIBRARY_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 50_000;
const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
function invalid(): never { throw new Error("Invalid ToonSpectrum library backup"); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 512): string {
  if (typeof value !== "string" || value.length > maximum) return invalid();
  return value;
}
function identity(value: unknown): string {
  const result = text(value);
  if (!result.trim() || unsafeKeys.has(result)) return invalid();
  return result;
}
function rating(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 5) return invalid();
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") return invalid();
  return value;
}
function date(value: unknown): string {
  const result = text(value, 64);
  if (!Number.isFinite(Date.parse(result))) return invalid();
  return result;
}
function strings(value: unknown, maximum = MAX_ENTRIES): string[] {
  if (!Array.isArray(value) || value.length > maximum) return invalid();
  return value.map(identity);
}
function dictionary<T>(value: unknown, parse: (item: unknown, key: string) => T): Record<string, T> {
  const entries = Object.entries(record(value));
  if (entries.length > MAX_ENTRIES) return invalid();
  return Object.fromEntries(entries.map(([key, item]) => [identity(key), parse(item, key)]));
}
function review(value: unknown, key: string): UserReview {
  const item = record(value);
  const titleId = identity(item.titleId);
  if (titleId !== key) return invalid();
  return { titleId, rating: rating(item.rating), text: text(item.text, 100_000), tags: strings(item.tags, 100), spoiler: boolean(item.spoiler), createdAt: date(item.createdAt) };
}
function collection(value: unknown): Collection {
  const item = record(value);
  return { id: identity(item.id), name: text(item.name), emoji: text(item.emoji, 64), titleIds: strings(item.titleIds), createdAt: date(item.createdAt) };
}

/** Validate the entire supported export before any mutation. Unknown account fields are discarded. */
export function parseLibraryBackup(source: string): HydratePayload {
  if (new TextEncoder().encode(source).byteLength > MAX_LIBRARY_BACKUP_BYTES) return invalid();
  const data = record(JSON.parse(source) as unknown);
  if (data._app !== "toonspectrum-library" || data.version !== 1) return invalid();
  if (!Array.isArray(data.collections) || data.collections.length > 1000) return invalid();
  const collections = data.collections.map(collection);
  if (new Set(collections.map((item) => item.id)).size !== collections.length) return invalid();
  return {
    ratings: dictionary(data.ratings, rating),
    reads: dictionary<ReadState>(data.reads, (value) => {
      if (value !== "want" && value !== "reading" && value !== "done" && value !== "dropped") return invalid();
      return value;
    }),
    subscriptions: dictionary(data.subscriptions, boolean),
    likedReviews: dictionary(data.likedReviews, boolean),
    reviews: dictionary(data.reviews, review),
    collections,
  };
}
