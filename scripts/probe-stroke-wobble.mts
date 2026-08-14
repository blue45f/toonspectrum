/**
 * Deterministic long-stroke wobble probe (owner report 2026-08-14: 운영에서 긴 선이 미세하게 떨림).
 *
 * Drives the shipped Studio UI with a slow, perfectly horizontal long stroke and measures the
 * rendered ink band's per-column vertical centroid on BOTH the live pointer-down preview and the
 * settled (pointer-up) canvas. Wobble = high-frequency deviation of that centroid from its own
 * low-pass trend, reported as RMS/max in device pixels plus the dominant spatial period so chunk
 * seams (fixed sample counts) and speed-pressure noise (input-rate periods) can be told apart.
 *
 * Usage:
 *   TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:4321 pnpm exec tsx scripts/probe-stroke-wobble.mts
 *   env TOONSPECTRUM_WOBBLE_BRUSHES=pen,gpen,ink-particle to pick brushes (default core trio).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Page } from "playwright";

const SCRATCH = join(tmpdir(), "toonspectrum-stroke-wobble");
mkdirSync(SCRATCH, { recursive: true });
const LOG_PATH = join(SCRATCH, "probe.log");

function log(line: string): void {
  const message = `[stroke-wobble] ${line}`;
  console.log(message);
  appendFileSync(LOG_PATH, `${message}\n`);
}

function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("no port")));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForServer(origin: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const response = await fetch(origin, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      if (Date.now() > deadline) throw new Error(`preview server not reachable at ${origin}`);
    }
    await new Promise((tick) => setTimeout(tick, 250));
  }
}

interface ColumnBand {
  readonly x: number;
  readonly centroid: number;
  readonly mass: number;
}

interface WobbleReport {
  readonly brushId: string;
  readonly phase: "live" | "settled";
  readonly columns: number;
  readonly rmsPx: number;
  readonly maxPx: number;
  readonly dominantPeriodPx: number | null;
  readonly dominantAmplitudePx: number;
}

/** Per-column ink centroid inside the stroke clip, alpha-weighted against the empty baseline. */
async function measureBand(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
  emptyPng: Buffer,
  inkPng: Buffer,
): Promise<ColumnBand[]> {
  return page.evaluate(
    async ([emptyB64, inkB64, width, height]) => {
      // tsx/esbuild keepNames injects __name calls into serialized closures; neutralize in-page.
      (globalThis as unknown as { __name?: (fn: unknown) => unknown }).__name ??= (fn) => fn;
      const decode = async (b64: string): Promise<ImageData> => {
        const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const empty = await decode(emptyB64 as string);
      const ink = await decode(inkB64 as string);
      const bands: Array<{ x: number; centroid: number; mass: number }> = [];
      const w = Math.min(empty.width, ink.width, Number(width) * 2);
      const h = Math.min(empty.height, ink.height, Number(height) * 2);
      for (let x = 0; x < w; x += 1) {
        let mass = 0;
        let weighted = 0;
        for (let y = 0; y < h; y += 1) {
          const offset = (y * ink.width + x) * 4;
          const deltaR = Math.abs(ink.data[offset]! - empty.data[offset]!);
          const deltaG = Math.abs(ink.data[offset + 1]! - empty.data[offset + 1]!);
          const deltaB = Math.abs(ink.data[offset + 2]! - empty.data[offset + 2]!);
          const energy = deltaR + deltaG + deltaB;
          if (energy > 24) {
            mass += energy;
            weighted += energy * y;
          }
        }
        if (mass > 0) bands.push({ x, centroid: weighted / mass, mass });
      }
      return bands;
    },
    [emptyPng.toString("base64"), inkPng.toString("base64"), clip.width, clip.height] as const,
  );
}

/** High-pass wobble stats: deviation from a +-K-column moving-average trend, plus dominant period. */
function wobbleStats(bands: readonly ColumnBand[]): {
  rmsPx: number;
  maxPx: number;
  dominantPeriodPx: number | null;
  dominantAmplitudePx: number;
} {
  const K = 24;
  const usable = bands.filter((band) => band.mass > 0);
  if (usable.length < K * 3) return { rmsPx: 0, maxPx: 0, dominantPeriodPx: null, dominantAmplitudePx: 0 };
  const residuals: number[] = [];
  for (let index = K; index < usable.length - K; index += 1) {
    let sum = 0;
    for (let offset = -K; offset <= K; offset += 1) sum += usable[index + offset]!.centroid;
    const trend = sum / (K * 2 + 1);
    residuals.push(usable[index]!.centroid - trend);
  }
  const rms = Math.sqrt(residuals.reduce((total, r) => total + r * r, 0) / residuals.length);
  const max = residuals.reduce((total, r) => Math.max(total, Math.abs(r)), 0);
  // Coarse DFT over spatial periods 4..160 px to expose chunk-seam / input-rate periodicity.
  let bestPeriod: number | null = null;
  let bestAmplitude = 0;
  for (let period = 4; period <= 160; period += 1) {
    let re = 0;
    let im = 0;
    for (let index = 0; index < residuals.length; index += 1) {
      const angle = (2 * Math.PI * index) / period;
      re += residuals[index]! * Math.cos(angle);
      im += residuals[index]! * Math.sin(angle);
    }
    const amplitude = (2 * Math.hypot(re, im)) / residuals.length;
    if (amplitude > bestAmplitude) {
      bestAmplitude = amplitude;
      bestPeriod = period;
    }
  }
  return { rmsPx: rms, maxPx: max, dominantPeriodPx: bestPeriod, dominantAmplitudePx: bestAmplitude };
}

async function main(): Promise<void> {
  const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  const port = externalOrigin ? null : await findFreePort();
  const origin = externalOrigin ? `${externalOrigin.replace(/\/+$/, "")}/` : `http://127.0.0.1:${port}/`;
  const server: ChildProcess | null = externalOrigin
    ? null
    : spawn(
        process.execPath,
        [join(process.cwd(), "node_modules", "vite", "bin", "vite.js"), "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
  server?.stdout?.on("data", (chunk) => appendFileSync(LOG_PATH, String(chunk)));
  server?.stderr?.on("data", (chunk) => appendFileSync(LOG_PATH, String(chunk)));
  const brushes = (process.env.TOONSPECTRUM_WOBBLE_BRUSHES ?? "default")
    .split(",").map((id) => id.trim()).filter(Boolean);

  let browser = null;
  const reports: WobbleReport[] = [];
  try {
    await waitForServer(origin);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 1480, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto(`${origin}studio`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator('[data-studio-editor="true"]').waitFor({ state: "visible", timeout: 30_000 });
    await page.addStyleTag({
      content: [
        '[data-studio-brush-hud="true"] { display: none !important; }',
        'canvas[data-studio-brush-cursor-canvas="true"] { display: none !important; }',
      ].join("\n"),
    });

    const clip = { x: 340, y: 330, width: 760, height: 120 };
    for (const brushId of brushes) {
      // Fresh page state per brush keeps strokes from stacking in the clip.
      await page.keyboard.press("b");
      await page.locator('[data-studio-draw-options="true"]').waitFor({ state: "visible" });
      if (brushId !== "default") {
        // Select via the quick tray's accessible name, mirroring the brush verifier's UI path.
        const quick = page.locator(`button[aria-label="${brushId} 선택"]`).first();
        if (await quick.isVisible({ timeout: 500 }).catch(() => false)) await quick.click();
        else log(`brush ${brushId}: quick-tray control absent; measuring current brush instead`);
      }
      await page.waitForTimeout(200);

      const empty = await page.screenshot({ animations: "disabled", clip });
      const startX = clip.x + 20;
      const endX = clip.x + clip.width - 20;
      const y = clip.y + clip.height / 2;
      const jitterAmplitude = Number(process.env.TOONSPECTRUM_WOBBLE_JITTER ?? "0");
      await page.mouse.move(startX, y);
      await page.mouse.down();
      if (jitterAmplitude > 0) {
        // Seeded hand-tremor emulation: dense per-event vertical noise around the true line.
        let state = 0x9e3779b9 >>> 0;
        const nextNoise = (): number => {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          return ((state / 0xffffffff) * 2 - 1) * jitterAmplitude;
        };
        const steps = 240;
        for (let step = 1; step <= steps; step += 1) {
          const x = startX + ((endX - startX) * step) / steps;
          await page.mouse.move(x, y + nextNoise());
        }
      } else {
        // Slow, dense, perfectly horizontal: 240 steps over ~720px ≈ 3px per move event.
        await page.mouse.move(endX, y, { steps: 240 });
      }
      const live = await page.screenshot({ animations: "disabled", clip });
      await page.mouse.up();
      await page.waitForTimeout(450);
      const settled = await page.screenshot({ animations: "disabled", clip });

      for (const [phase, png] of [["live", live], ["settled", settled]] as const) {
        const bands = await measureBand(page, clip, empty, png);
        const stats = wobbleStats(bands);
        reports.push({ brushId, phase, columns: bands.length, ...stats });
        log(
          `${brushId} ${phase}: columns=${bands.length} rms=${stats.rmsPx.toFixed(3)}px `
            + `max=${stats.maxPx.toFixed(3)}px dominantPeriod=${stats.dominantPeriodPx ?? "-"}px `
            + `amp=${stats.dominantAmplitudePx.toFixed(3)}px`,
        );
      }
      writeFileSync(join(SCRATCH, `wobble-${brushId}-settled.png`), settled);
      writeFileSync(join(SCRATCH, `wobble-${brushId}-live.png`), live);
      // Undo so the next brush starts on clean paper.
      await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
      await page.waitForTimeout(250);
    }
  } finally {
    await browser?.close();
    server?.kill("SIGTERM");
  }
  writeFileSync(join(SCRATCH, "wobble-report.json"), JSON.stringify(reports, null, 1));
  log(`report: ${join(SCRATCH, "wobble-report.json")}`);
}

await main();
