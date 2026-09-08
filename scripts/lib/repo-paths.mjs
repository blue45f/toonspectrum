/**
 * scripts/lib/repo-paths.mjs
 *
 * Single source of truth for every repo-layout path a script depends on.
 *
 * These constants are the canonical paths for the apps/web frontend.
 * The Vite frontend lives under `apps/web`; root Vite config and `dist/` remain
 * deployment-level workspace infrastructure. Scripts must use these constants rather than re-deriving paths from process.cwd().
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
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the repository root (this file lives in `<root>/scripts/lib`). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Root of the Vite frontend package — the directory holding `index.html`, `src/`,
* and `public/`.
 */
export const WEB_ROOT = join(REPO_ROOT, "apps/web");

/** Frontend application sources (`<web root>/src`). */
export const WEB_SRC = join(WEB_ROOT, "src");

/** Frontend static assets served verbatim (`<web root>/public`). */
export const WEB_PUBLIC = join(WEB_ROOT, "public");

/** Vite's HTML entry point (`<web root>/index.html`). */
export const WEB_INDEX_HTML = join(WEB_ROOT, "index.html");

/** Vite config consumed by the programmatic `createServer`/`build` callers. */
export const WEB_VITE_CONFIG = join(REPO_ROOT, "vite.config.ts");

/** Production build output directory (`<web root>/dist`). */
export const DIST_DIR = join(REPO_ROOT, "dist");

/**
 * Vite manifest key for a frontend source file, given its **repository-relative**
 * path (`apps/web/src/...`).
 *
 * `dist/.vite/manifest.json` indexes modules relative to the *Vite root*
 * (`apps/web`), not the repository root: the autosave SQLite store is keyed
 * `src/domains/creator/studio-autosave-sqlite-store.ts`, never
 * `apps/web/src/domains/creator/studio-autosave-sqlite-store.ts`. Callers keep
 * writing the repo-relative path they use everywhere else and this helper
 * rebases it, so a future move of `WEB_ROOT` cannot desynchronise the two.
 */
export function viteManifestKey(repositoryRelativePath) {
  return relative(WEB_ROOT, join(REPO_ROOT, repositoryRelativePath))
    .split(sep)
    .join("/");
}
