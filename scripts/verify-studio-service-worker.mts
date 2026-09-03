/**
 * Browser check for the Service Worker: registration under cross-origin
 * isolation, precache population, offline Studio boot, the parked-update
 * contract, and the kill switch. Also reports cold vs warm transfer bytes.
 *
 * Run: pnpm exec tsx scripts/verify-studio-service-worker.mts
 * Expects a production build in dist/ (`pnpm exec vite build`).
 *
 * Why this serves `dist/` itself instead of `vite preview`: the production
 * header contract lives in `vercel.json`, which applies COOP/COEP/CORP by
 * *path*, while the preview middleware only attaches CORP to worker-shaped
 * requests. Replaying `vercel.json`'s own rules here means the check exercises
 * the headers that actually ship — and fails if that file regresses. It also
 * lets the update flow be tested by swapping `sw.js` mid-session, which is the
 * only honest way to simulate a deploy landing under a live editor.
 *
 * Exit: 0 all gates passed · 1 failure.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import { findFreePort } from "./lib/studio-verify-preview-harness.mjs";

const DIST = resolve(process.cwd(), "dist");
const VERCEL_CONFIG = resolve(process.cwd(), "vercel.json");
const RESET_QUERY = "__toonspectrumSwReset";

interface VercelHeaderRule {
  readonly source: string;
  readonly headers: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".vrm": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

function loadHeaderRules(): Array<{ pattern: RegExp; rule: VercelHeaderRule }> {
  const config = JSON.parse(readFileSync(VERCEL_CONFIG, "utf8")) as {
    headers?: VercelHeaderRule[];
  };
  return (config.headers ?? []).map((rule) => ({
    // Vercel `source` is a path-to-regexp pattern; the ones this repo uses are
    // plain prefixes plus `(.*)` groups, which map straight onto a RegExp.
    pattern: new RegExp(`^${rule.source.replace(/\/$/u, "")}$`, "u"),
    rule,
  }));
}

/** Serves dist/ with vercel.json's real header rules and SPA rewrite. */
function startStaticServer(
  port: number,
  swOverride: () => string | null,
): Server {
  const rules = loadHeaderRules();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);

    for (const { pattern, rule } of rules) {
      if (!pattern.test(pathname)) continue;
      for (const header of rule.headers) response.setHeader(header.key, header.value);
    }

    if (pathname === "/sw.js") {
      const override = swOverride();
      if (override !== null) {
        response.setHeader("Content-Type", MIME[".js"]);
        response.statusCode = 200;
        response.end(override);
        return;
      }
    }

    const candidate = join(DIST, normalize(pathname).replace(/^(\.\.[/\\])+/u, ""));
    const isFile = candidate.startsWith(DIST) && existsSync(candidate)
      && statSync(candidate).isFile();
    // Mirrors vercel.json's `/(.*) -> /index.html` SPA rewrite.
    const file = isFile ? candidate : join(DIST, "index.html");

    response.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
    response.statusCode = 200;
    response.end(readFileSync(file));
  });
  server.listen(port, "127.0.0.1");
  return server;
}

interface LoadMeasurement {
  readonly requests: number;
  readonly transferBytes: number;
  readonly decodedBytes: number;
  readonly serviceWorkerServed: number;
  readonly domContentLoadedMs: number;
}

async function measureLoad(page: Page): Promise<LoadMeasurement> {
  return page.evaluate(() => {
    const entries = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    return {
      requests: entries.length,
      // transferSize 0 with a non-zero body means it never touched the network.
      transferBytes: entries.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
      decodedBytes: entries.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
      serviceWorkerServed: entries.filter((entry) => entry.workerStart > 0).length,
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
    };
  });
}

async function waitForController(page: Page, timeoutMs = 60_000): Promise<void> {
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    undefined,
    { timeout: timeoutMs },
  );
}

/**
 * `data-studio-cross-origin-isolation` is published by the Studio isolation
 * gate, which is a dynamic import — so it appears a beat after `load`. Poll for
 * it rather than sampling once.
 */
async function readIsolationDiagnostic(page: Page): Promise<string | null> {
  return page
    .waitForFunction(
      () => {
        const value = document.documentElement.getAttribute(
          "data-studio-cross-origin-isolation",
        );
        return value ? value : null;
      },
      undefined,
      { timeout: 20_000 },
    )
    .then((handle) => handle.jsonValue() as Promise<string>)
    .catch(() => null);
}

async function inspectWorker(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(async () => {
    const worker = navigator.serviceWorker.controller;
    if (!worker) return null;
    return new Promise<Record<string, unknown> | null>((done) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => done(null), 5_000);
      channel.port1.onmessage = (event: MessageEvent) => {
        clearTimeout(timer);
        done(event.data as Record<string, unknown>);
      };
      worker.postMessage({ type: "toonspectrum-sw:inspect" }, [channel.port2]);
    });
  });
}

async function main(): Promise<void> {
  if (!existsSync(join(DIST, "sw.js"))) {
    throw new Error("dist/sw.js missing — run `pnpm exec vite build` first");
  }

  const notes: string[] = [];
  const failures: string[] = [];
  const check = (label: string, ok: boolean, detail = ""): void => {
    notes.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures.push(label);
  };

  const realSw = readFileSync(join(DIST, "sw.js"), "utf8");
  // A "next deploy": same behaviour, different build id, so the precache bucket
  // name changes and the browser sees a byte-different worker script.
  const nextSw = realSw.replace(
    /toonspectrum-sw-/u,
    "toonspectrum-sw-",
  ) + `\n// deploy:${createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 8)}\n`;
  let serveNextSw = false;

  const port = await findFreePort({ unavailableMessage: "sw verify port" });
  const origin = `http://127.0.0.1:${port}`;
  const server = startStaticServer(port, () => (serveNextSw ? nextSw : null));

  let browser: Browser | null = null;
  const report: Record<string, unknown> = { origin };

  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    // ---- 1. Cold load -----------------------------------------------------
    await page.goto(`${origin}/studio`, { waitUntil: "load", timeout: 120_000 });
    const cold = await measureLoad(page);
    report.cold = cold;

    const isolated = await page.evaluate(() => globalThis.crossOriginIsolated);
    const onlineDiagnostic = await readIsolationDiagnostic(page);
    report.onlineIsolationDiagnostic = onlineDiagnostic;
    check(
      "studio document is cross-origin isolated",
      isolated === true && onlineDiagnostic === "enabled",
      `crossOriginIsolated=${String(isolated)} diagnostic=${String(onlineDiagnostic)}`,
    );

    // ---- 2. Registration + control ---------------------------------------
    await waitForController(page);
    const controlled = await page.evaluate(
      () => navigator.serviceWorker.controller?.scriptURL ?? null,
    );
    check(
      "service worker controls the isolated studio client",
      controlled?.endsWith("/sw.js") === true,
      String(controlled),
    );

    // ---- 3. Precache populated -------------------------------------------
    const state = await inspectWorker(page);
    report.workerState = state;
    const entries = (state?.entries ?? {}) as Record<string, number>;
    check(
      "precache bucket populated",
      (entries.precache ?? 0) >= 10,
      `precache entries=${entries.precache ?? 0}, buildId=${String(state?.buildId)}`,
    );

    // ---- 4. Warm load -----------------------------------------------------
    await page.reload({ waitUntil: "load", timeout: 120_000 });
    await waitForController(page);
    const warm = await measureLoad(page);
    report.warm = warm;
    check(
      "warm load transfers fewer bytes than cold",
      warm.transferBytes < cold.transferBytes,
      `cold=${cold.transferBytes}B warm=${warm.transferBytes}B (${(
        (1 - warm.transferBytes / Math.max(1, cold.transferBytes)) * 100
      ).toFixed(1)}% saved)`,
    );
    check(
      "warm load is served through the service worker",
      warm.serviceWorkerServed > 0,
      `${warm.serviceWorkerServed}/${warm.requests} requests via SW`,
    );

    const warmState = await inspectWorker(page);
    report.workerStateAfterWarm = warmState;
    const warmEntries = (warmState?.entries ?? {}) as Record<string, number>;
    // Runtime caches are intentionally demand-filled, so the cold controlled
    // load may still report zero entries. The first warm navigation is the
    // earliest deterministic point where immutable assets must be present.
    check(
      "runtime immutable bucket populated",
      (warmEntries.immutable ?? 0) > 0,
      `immutable entries=${warmEntries.immutable ?? 0}`,
    );
    check(
      "studio navigation triggers the deferred i18n warm-up",
      warmState?.warmUpStarted === true && (warmEntries.data ?? 0) > 0,
      `warmUpStarted=${String(warmState?.warmUpStarted)} data entries=${warmEntries.data ?? 0}`,
    );

    // ---- 5. Offline -------------------------------------------------------
    await context.setOffline(true);
    await page.reload({ waitUntil: "load", timeout: 120_000 });
    const offlineIsolated = await page.evaluate(() => globalThis.crossOriginIsolated);
    const offlineDiagnostic = await readIsolationDiagnostic(page);
    const offlineMounted = await page.evaluate(
      () => (document.getElementById("root")?.childElementCount ?? 0) > 0,
    );
    const offline = await measureLoad(page);
    report.offline = offline;
    check("studio renders with the network down", offlineMounted, `#root children>0=${offlineMounted}`);
    check(
      "offline studio keeps cross-origin isolation",
      offlineIsolated === true && offlineDiagnostic === "enabled",
      `crossOriginIsolated=${String(offlineIsolated)} diagnostic=${String(offlineDiagnostic)}`,
    );
    check(
      "offline load makes no network transfer",
      offline.transferBytes === 0,
      `transferBytes=${offline.transferBytes}`,
    );
    await context.setOffline(false);

    // ---- 6. Update flow: a new worker must park, not take over ------------
    serveNextSw = true;
    const controllerBefore = await page.evaluate(
      () => navigator.serviceWorker.controller?.scriptURL ?? null,
    );
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    const waiting = await page
      .waitForFunction(
        async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return Boolean(registration?.waiting);
        },
        undefined,
        { timeout: 30_000 },
      )
      .then(() => true)
      .catch(() => false);
    check("a new deploy installs and parks in `waiting`", waiting);

    const controllerAfter = await page.evaluate(
      () => navigator.serviceWorker.controller?.scriptURL ?? null,
    );
    const stillSameController = controllerBefore === controllerAfter;
    check(
      "waiting worker does NOT seize control of the live session",
      stillSameController,
      "no mid-session swap",
    );

    const promptShown = await page
      .waitForFunction(
        () => Boolean(document.getElementById("toonspectrum-sw-update")),
        undefined,
        { timeout: 15_000 },
      )
      .then(() => true)
      .catch(() => false);
    check("artist is told an update is ready", promptShown);

    // Applying is explicit; it must then actually hand over.
    const applied = await page.evaluate(async () => {
      const api = (globalThis as unknown as {
        __toonspectrumServiceWorker?: { applyUpdate: () => Promise<void> };
      }).__toonspectrumServiceWorker;
      if (!api) return false;
      const changed = new Promise<boolean>((done) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => done(true), {
          once: true,
        });
        setTimeout(() => done(false), 10_000);
      });
      const registration = await navigator.serviceWorker.getRegistration();
      registration?.waiting?.postMessage({ type: "toonspectrum-sw:apply-update" });
      return changed;
    });
    check("explicit apply hands control to the new worker", applied);

    // ---- 7. Kill switch ---------------------------------------------------
    serveNextSw = false;
    await page.goto(`${origin}/studio?${RESET_QUERY}=1`, {
      waitUntil: "load",
      timeout: 120_000,
    });
    const recovered = await page
      .waitForFunction(
        async () => {
          const registrations = await navigator.serviceWorker.getRegistrations();
          const keys = await caches.keys();
          return (
            registrations.length === 0
            && keys.every((key) => !key.startsWith("toonspectrum-sw-"))
          );
        },
        undefined,
        { timeout: 30_000 },
      )
      .then(() => true)
      .catch(() => false);
    check(
      "kill switch unregisters the worker and purges every owned cache",
      recovered,
    );

    report.pageErrors = pageErrors;
    check("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  } finally {
    await browser?.close().catch(() => undefined);
    await new Promise<void>((done) => server.close(() => done()));
  }

  report.notes = notes;
  report.ok = failures.length === 0;
  report.failures = failures;
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exit(1);
}

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
