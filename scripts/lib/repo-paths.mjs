/**
 * scripts/lib/repo-paths.mjs
 *
 * Single source of truth for every repo-layout path a script depends on.
 *
 * THESE CONSTANTS ARE THE KNOBS FOR THE PLANNED `apps/web` MOVE.
 * The Vite frontend (index.html, src/, public/, vite.config.ts, dist/) lives at
 * the repository root today, so `WEB_ROOT === REPO_ROOT`. When the frontend
 * moves to `apps/web`, retarget `WEB_ROOT` here — and nothing else — and every
 * consumer follows. A script that re-derives these paths on its own (typically
 * `join(process.cwd(), …)`) would silently keep pointing at the old location
 * instead of failing loudly, which is exactly what this module exists to stop.
 *
 * Every constant is anchored to `import.meta.url`, never `process.cwd()`, so the
 * resolved paths do not depend on the directory a script happens to be launched
 * from.
 *
 * Import with an explicit `.mjs` specifier — `./lib/repo-paths.mjs` — matching
 * the sibling `studio-verify-preview-harness.mts` convention: `.mjs` is what
 * tsx/tsc resolve from an `.mts` consumer, and plain `.mjs`/`.js` scripts
 * import this file directly.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the repository root (this file lives in `<root>/scripts/lib`). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Root of the Vite frontend package — the directory holding `index.html`,
 * `vite.config.ts`, `src/` and `public/`.
 *
 * Today the frontend is the repository root. The planned restructuring moves it
 * to `apps/web`; that is a one-line change here.
 */
export const WEB_ROOT = REPO_ROOT;

/** Frontend application sources (`<web root>/src`). */
export const WEB_SRC = join(WEB_ROOT, "src");

/** Frontend static assets served verbatim (`<web root>/public`). */
export const WEB_PUBLIC = join(WEB_ROOT, "public");

/** Vite's HTML entry point (`<web root>/index.html`). */
export const WEB_INDEX_HTML = join(WEB_ROOT, "index.html");

/** Vite config consumed by the programmatic `createServer`/`build` callers. */
export const WEB_VITE_CONFIG = join(WEB_ROOT, "vite.config.ts");

/** Production build output directory (`<web root>/dist`). */
export const DIST_DIR = join(WEB_ROOT, "dist");
