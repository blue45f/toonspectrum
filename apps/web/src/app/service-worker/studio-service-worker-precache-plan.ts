/**
 * Build-time precache planning.
 *
 * `dist/assets` is ~240 MB (123 MB of it WASM, `opencascade.wasm` alone 62.8 MB),
 * so "precache the build" is not an option — it would be hostile to anyone who
 * only came to browse the catalog. Instead two bounded tiers are selected from
 * Vite's manifest:
 *
 *   critical — the app shell every route needs: entry JS closure + CSS. Installed
 *              atomically; if any URL 404s the install fails, the new worker never
 *              activates, and the previous worker keeps serving. That is the
 *              fail-safe, not a bug.
 *   warm     — the two dictionaries the Studio route *blocks* on:
 *              `/i18n/studio/<namespace>/{ko,en}.json` are `Promise.all`-ed with the route
 *              chunk in `AppRouter`, so the route cannot commit without them and
 *              an offline Studio boot dies there. Fetched best-effort the first
 *              time a Studio navigation is seen, so catalog-only visitors never
 *              pay for it.
 *
 * Every function here is pure so the selection and its budgets are unit testable
 * without a build.
 */

export interface StudioViteManifestEntry {
  readonly file: string;
  readonly css?: readonly string[];
  readonly imports?: readonly string[];
  readonly dynamicImports?: readonly string[];
  readonly isEntry?: boolean;
  readonly name?: string;
}

export type StudioViteManifest = Readonly<
  Record<string, StudioViteManifestEntry>
>;

/**
 * The static (non-dynamic) import closure of a manifest entry, as public URLs.
 * Dynamic imports are deliberately *not* followed: they are the lazy graph, and
 * pulling them in is exactly what would turn a precache list into a cold-start
 * regression.
 */
export function collectStudioManifestClosure(
  manifest: StudioViteManifest,
  entryKey: string,
): string[] {
  const entry = manifest[entryKey];
  if (!entry) return [];

  const urls: string[] = [];
  const seenKeys = new Set<string>();
  const seenUrls = new Set<string>();

  const pushUrl = (file: string): void => {
    const url = `/${file.replace(/^\/+/u, "")}`;
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    urls.push(url);
  };

  const walk = (key: string): void => {
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const node = manifest[key];
    if (!node) return;
    pushUrl(node.file);
    for (const css of node.css ?? []) pushUrl(css);
    for (const next of node.imports ?? []) walk(next);
  };

  walk(entryKey);
  return urls;
}

export interface StudioPrecacheBudget {
  readonly criticalBytes: number;
  readonly warmBytes: number;
}

/**
 * Reference budgets, enforced as a hard build failure.
 *
 * `critical` is paid by every first-time visitor on any route, so it is held
 * near the bytes the entry document already downloads anyway (~437 KB JS +
 * ~398 KB CSS). `warm` is deliberately tight: it exists to stop the Studio
 * route closure from ever being quietly added back to it.
 */
export const STUDIO_PRECACHE_BUDGET: StudioPrecacheBudget = Object.freeze({
  criticalBytes: 2 * 1024 * 1024,
  warmBytes: 512 * 1024,
});

/** Stable same-origin files used by the HTML shell and emergency recovery. */
export const STUDIO_SERVICE_WORKER_STATIC_CRITICAL_URLS = Object.freeze([
  "/bootstrap-compat.js", "/bootstrap-theme.js",
  "/offline-draw/index.html", "/offline-draw/portable.html",
  "/offline-draw/styles.css", "/offline-draw/model.js",
  "/offline-draw/storage.js", "/offline-draw/editor.js",
  "/offline-draw/cache.js", "/offline-draw/bootstrap.js",
  "/brand/spectrum-ribbon-v2/manifest.webmanifest",
  "/brand/spectrum-ribbon-v2/favicon.ico",
  "/brand/spectrum-ribbon-v2/favicon-32.png",
  "/brand/spectrum-ribbon-v2/favicon-96.png",
  "/brand/spectrum-ribbon-v2/favicon.svg",
  "/brand/spectrum-ribbon-v2/safari-pinned-tab.svg",
  "/brand/spectrum-ribbon-v2/apple-touch-icon.png",
  "/icon-192.png", "/favicon-96.png",
  "/brand/theme-scenes/ink-studio.svg",
  "/brand/theme-scenes/motifs/ink-motifs.svg",
  "/brand/production-os-hero.svg",
  "/brand/production-os-workspace.svg",
] as const);

export interface StudioPrecachePlanInput {
  readonly manifest: StudioViteManifest;
  readonly appEntryKey: string;
  /**
   * Same-origin URLs outside the JS module graph that Studio *blocks* on.
   *
   * Deliberately not the Studio route's import closure: that is 5.4 MB across
   * 194 chunks, and the browser downloads all of it during the very navigation
   * that would trigger the warm-up — so warming it would duplicate the page's
   * own requests rather than save anything. Those chunks land in the immutable
   * runtime cache through plain cache-first, which is why one online Studio
   * visit is enough to make the editor work offline afterwards.
   */
  readonly warmUrls?: readonly string[];
  /** Stable shell/recovery assets outside Vite's hashed module graph. */
  readonly staticCriticalUrls?: readonly string[];
  /** Byte size of a public URL, or `null` when the file is not in the build. */
  readonly sizeOf: (url: string) => number | null;
  /** Content fingerprint used to rotate the worker for stable public URLs. */
  readonly fingerprintOf?: (url: string) => string | null;
  readonly budget?: StudioPrecacheBudget;
}

export interface StudioPrecachePlan {
  /** HTML shells. `/studio` must be fetched with an HTML `Accept` so the origin
   * attaches COOP/COEP and the replayed offline document stays isolated. */
  readonly shellUrls: readonly string[];
  readonly criticalUrls: readonly string[];
  readonly criticalFingerprints: readonly string[];
  readonly warmUrls: readonly string[];
  readonly criticalBytes: number;
  readonly warmBytes: number;
  /** Non-fatal notes (missing sizes); surfaced by the build plugin. */
  readonly warnings: readonly string[];
  /** Budget violations. The build plugin turns these into a hard failure. */
  readonly violations: readonly string[];
}

const SHELL_URLS = ["/", "/studio"] as const;

function sumSizes(
  urls: readonly string[],
  sizeOf: (url: string) => number | null,
  warnings: string[],
): number {
  let total = 0;
  for (const url of urls) {
    const size = sizeOf(url);
    if (size === null) {
      warnings.push(`precache target has no file on disk: ${url}`);
      continue;
    }
    total += size;
  }
  return total;
}

export function planStudioServiceWorkerPrecache(
  input: StudioPrecachePlanInput,
): StudioPrecachePlan {
  const budget = input.budget ?? STUDIO_PRECACHE_BUDGET;
  const warnings: string[] = [];
  const violations: string[] = [];

  const manifestCriticalUrls = collectStudioManifestClosure(
    input.manifest,
    input.appEntryKey,
  );
  if (manifestCriticalUrls.length === 0) {
    violations.push(
      `app entry ${JSON.stringify(input.appEntryKey)} is missing from the Vite manifest`,
    );
  }

  const criticalUrls = [...manifestCriticalUrls];
  const criticalSet = new Set(criticalUrls);
  for (const url of input.staticCriticalUrls ?? []) {
    if (!url.startsWith("/") || url.startsWith("//")) {
      violations.push(`critical precache URL must be same-origin rooted: ${url}`);
      continue;
    }
    if (criticalSet.has(url)) continue;
    criticalSet.add(url);
    criticalUrls.push(url);
    if (input.sizeOf(url) === null) {
      violations.push(`critical precache target has no file on disk: ${url}`);
    }
  }
  const criticalFingerprints = criticalUrls.map((url) =>
    `${url}:${input.fingerprintOf?.(url) ?? "url-only"}`,
  );
  const warmUrls: string[] = [];
  const warmSeen = new Set<string>();
  for (const url of input.warmUrls ?? []) {
    // Never warm what install already guarantees, and never list a URL twice.
    if (criticalSet.has(url) || warmSeen.has(url)) continue;
    warmSeen.add(url);
    warmUrls.push(url);
  }

  const criticalBytes = sumSizes(criticalUrls, input.sizeOf, warnings);
  const warmBytes = sumSizes(warmUrls, input.sizeOf, warnings);

  if (criticalBytes > budget.criticalBytes) {
    violations.push(
      `critical precache is ${criticalBytes} bytes (budget ${budget.criticalBytes})`,
    );
  }
  if (warmBytes > budget.warmBytes) {
    violations.push(
      `warm precache is ${warmBytes} bytes (budget ${budget.warmBytes})`,
    );
  }

  return {
    shellUrls: SHELL_URLS,
    criticalUrls,
    criticalFingerprints,
    warmUrls,
    criticalBytes,
    warmBytes,
    warnings,
    violations,
  };
}

/**
 * A build id derived from what is actually precached, not from the wall clock.
 * A rebuild that changes nothing observable keeps the same id, so browsers are
 * not told to install a byte-identical worker.
 */
export function studioServiceWorkerBuildId(
  plan: Pick<StudioPrecachePlan, "criticalUrls" | "warmUrls">
    & Partial<Pick<StudioPrecachePlan, "criticalFingerprints">>,
  digest: (value: string) => string,
): string {
  const fingerprint = [
    ...plan.criticalUrls,
    "--critical-content--",
    ...(plan.criticalFingerprints ?? []),
    "--warm--",
    ...plan.warmUrls,
  ].join("\n");
  return digest(fingerprint).slice(0, 12);
}

/** Serialisable shape injected into the worker bundle at build time. */
export interface StudioServiceWorkerManifest {
  readonly buildId: string;
  readonly shellUrls: readonly string[];
  readonly criticalUrls: readonly string[];
  readonly warmUrls: readonly string[];
  readonly offlineUrls?: readonly string[];
}
