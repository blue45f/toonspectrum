/**
 * Brush texture-defect lab — "does the brush the artist picks actually have a surface?"
 *
 * `brush-texture-lab.ts` measures the two wasm stroke engines; `brush-paper-grain-lab.ts` measures
 * the dynamic-dab Studio path on CanvasKit. Neither covers the *committed catalogue stroke*: the
 * React/Konva `StudioDrawNode` render that every persisted stroke goes through, which is what an
 * artist sees after releasing the pointer. This lab drives THAT node, inside a real GPU Chromium,
 * and measures the readback with **the same metric functions** the wasm lab uses —
 * `edgeMetrics`, `rippleMetrics` and `grainMetrics` are imported from `brush-texture-lab.ts`,
 * not reimplemented. The ruler does not change; only the thing being measured does.
 *
 * ── Reported axes ─────────────────────────────────────────────────────────────────
 *
 * (a) interiorToneLevels — |{ distinct 8-bit alpha > 0 among all pixels of the interior column
 *     band }|. A perfectly flat brush prints one core level plus its two antialias levels and
 *     scores ~3; a brush with real media structure prints tens to hundreds. This is a COUNT, so
 *     it is immune to the absolute opacity a preset happens to declare.
 *
 * (b) lengthAxisCv — `rippleMetrics(...).rippleCv`, i.e. the least-squares-detrended RMS of the
 *     centre row divided by its mean. Exactly 0 means the stroke is constant along its own
 *     travel direction: no dab cadence, no loading, no bite.
 *
 * (c) edgeTransitionPx — `edgeMetrics(...).transitionWidthPx`, the 90 %→10 % coverage fall-off
 *     averaged over both flanks of every measured column.
 *
 * (d) coverageWidthPx — Σ_y A(x,y) / peakAlpha(x), averaged over the interior columns: the
 *     coverage-equivalent stroke width. Measured on a horizontal AND a vertical lane of the same
 *     brush; `nibAspectRatio = coverageWidthPx(horizontal) / coverageWidthPx(vertical)` is the
 *     chisel-nib evidence — a round tip scores 1.00, a real broad nib does not.
 *
 * (e) colour fidelity — the stroke is also drawn in `#ff9500`. Every pixel is composited onto
 *     white, `C' = C·a + 255·(1 − a)`, and the minimum-luminance pixel is reported together with
 *     `maxInk = max(a)/255` measured on the ink-coloured lane. A brush that greys the artist's
 *     colour shows it as a blue channel that climbs away from 0.
 *
 * Run: pnpm exec tsx tests/benchmarks/harness/brush-defect-lab.ts
 *      pnpm exec tsx tests/benchmarks/harness/brush-defect-lab.ts --label after
 *
 * The browser is launched with DEFAULT GPU flags (never `--use-angle=swiftshader`, which makes
 * the app measure ~14× slower than it is).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";

import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

import {
  edgeMetrics,
  grainMetrics,
  rippleMetrics,
  type EdgeMetrics,
  type GrainMetrics,
  type RippleMetrics,
} from "./brush-texture-lab";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const HARNESS_PATH = "/__studio_brush_texture_defect__";
const HARNESS_ENTRY = "/scripts/studio-brush-texture-defect-browser.ts";

const INK_COLOR = "#16100c";
const HUE_COLOR = "#ff9500";

/** 770 px straight, constant-pressure lane — the geometry the defect report was measured on. */
const LANE = {
  length: 770,
  start: 64,
  margin: 80,
  sampleCount: 78,
  pressure: 0.5,
  /** Both stroke caps excluded from every statistic. */
  interiorInset: 96,
  edgeColumnStep: 6,
} as const;

export interface DefectBrushSpec {
  readonly id: string;
  readonly label: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly role: "defect" | "control";
}

/**
 * Brushes under test. `role: "control"` presets are the ones the defect report certified as
 * healthy — they exist so a texture fix cannot quietly move a brush that was already correct.
 */
export const DEFECT_LAB_BRUSHES: readonly DefectBrushSpec[] = [
  // D4 — five brushes measured as completely flat.
  { id: "hard-airbrush", label: "하드 에어브러시", strokeWidth: 28, opacity: 0.76, role: "defect" },
  { id: "marker", label: "마커(굵고 반투명)", strokeWidth: 16, opacity: 0.6, role: "defect" },
  { id: "highlighter", label: "형광펜", strokeWidth: 24, opacity: 0.45, role: "defect" },
  { id: "felt-tip", label: "펠트펜", strokeWidth: 10, opacity: 0.85, role: "defect" },
  { id: "oil", label: "유화 붓", strokeWidth: 22, opacity: 0.92, role: "defect" },
  // D4 siblings that share the same declaration.
  { id: "marker-bold", label: "볼드 마커", strokeWidth: 28, opacity: 0.55, role: "defect" },
  { id: "alcohol-marker", label: "알코올 코픽마커", strokeWidth: 20, opacity: 0.65, role: "defect" },
  { id: "acrylic", label: "아크릴 물감", strokeWidth: 20, opacity: 0.95, role: "defect" },
  // D8 — chisel nib.
  { id: "calligraphy", label: "캘리그래피(펜 기울기)", strokeWidth: 12, opacity: 1, role: "control" },
  { id: "fountain-pen", label: "만년필(사선 촉)", strokeWidth: 6.5, opacity: 1, role: "defect" },
  { id: "parallel-pen", label: "평행펜(넓은 촉)", strokeWidth: 18, opacity: 0.98, role: "defect" },
  { id: "brush-pen", label: "모필 붓펜", strokeWidth: 9, opacity: 1, role: "defect" },
  // D9 — colour fidelity.
  { id: "charcoal", label: "목탄", strokeWidth: 12, opacity: 0.88, role: "defect" },
  // Controls the report certified as healthy.
  { id: "pen", label: "펜(매끈)", strokeWidth: 6, opacity: 1, role: "control" },
  { id: "pencil", label: "연필", strokeWidth: 2.5, opacity: 0.85, role: "control" },
  { id: "pencil-grain", label: "그레인 연필", strokeWidth: 4, opacity: 0.9, role: "control" },
  { id: "spray", label: "스프레이", strokeWidth: 40, opacity: 0.55, role: "control" },
  { id: "gpen", label: "G펜(필압)", strokeWidth: 7, opacity: 1, role: "control" },
  { id: "watercolor", label: "수채", strokeWidth: 24, opacity: 0.8, role: "control" },
  { id: "wash-brush", label: "물맛 붓(웻엣지)", strokeWidth: 26, opacity: 0.8, role: "control" },
  { id: "airbrush", label: "소프트 에어브러시", strokeWidth: 32, opacity: 0.7, role: "control" },
  { id: "crayon", label: "크레용", strokeWidth: 14, opacity: 0.88, role: "control" },
  { id: "chalk", label: "초크", strokeWidth: 16, opacity: 0.8, role: "control" },
  { id: "dry-media", label: "드라이 미디어", strokeWidth: 7, opacity: 0.92, role: "control" },
  { id: "pastel", label: "파스텔", strokeWidth: 20, opacity: 0.72, role: "control" },
  { id: "brush", label: "붓", strokeWidth: 18, opacity: 0.9, role: "control" },
];

interface Frame {
  data: Uint8Array;
  width: number;
  height: number;
}

interface LaneRequest {
  key: string;
  brush: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  width: number;
  height: number;
  axis: "horizontal" | "vertical";
  start: number;
  end: number;
  centre: number;
  sampleCount: number;
  pressure: number;
}

function laneGeometry(
  spec: DefectBrushSpec,
  axis: "horizontal" | "vertical",
  color: string,
): LaneRequest {
  const across = Math.max(140, Math.ceil(spec.strokeWidth * 6) + 80);
  const along = LANE.start + LANE.length + LANE.margin;
  return {
    key: `${spec.id}:${axis}:${color}`,
    brush: spec.id,
    color,
    strokeWidth: spec.strokeWidth,
    opacity: spec.opacity,
    width: axis === "horizontal" ? along : across,
    height: axis === "horizontal" ? across : along,
    axis,
    start: LANE.start,
    end: LANE.start + LANE.length,
    centre: Math.round(across / 2),
    sampleCount: LANE.sampleCount,
    pressure: LANE.pressure,
  };
}

function alphaAt(frame: Frame, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return 0;
  return frame.data[(y * frame.width + x) * 4 + 3] ?? 0;
}

/** Rotate a vertical lane into the horizontal frame the shared metric functions expect. */
function transposeFrame(frame: Frame): Frame {
  const out = new Uint8Array(frame.data.length);
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const from = (y * frame.width + x) * 4;
      const to = (x * frame.height + y) * 4;
      out[to] = frame.data[from] ?? 0;
      out[to + 1] = frame.data[from + 1] ?? 0;
      out[to + 2] = frame.data[from + 2] ?? 0;
      out[to + 3] = frame.data[from + 3] ?? 0;
    }
  }
  return { data: out, width: frame.height, height: frame.width };
}

function interiorColumns(frame: Frame): number[] {
  const xLo = LANE.start + LANE.interiorInset;
  const xHi = LANE.start + LANE.length - LANE.interiorInset;
  const columns: number[] = [];
  for (let x = xLo; x < Math.min(xHi, frame.width); x += LANE.edgeColumnStep) columns.push(x);
  return columns;
}

/** (a) distinct non-zero 8-bit alpha levels printed anywhere in the interior band. */
function interiorToneLevels(frame: Frame): number {
  const xLo = LANE.start + LANE.interiorInset;
  const xHi = Math.min(LANE.start + LANE.length - LANE.interiorInset, frame.width);
  const levels = new Set<number>();
  for (let x = xLo; x < xHi; x += 1) {
    for (let y = 0; y < frame.height; y += 1) {
      const alpha = alphaAt(frame, x, y);
      if (alpha > 0) levels.add(alpha);
    }
  }
  return levels.size;
}

/** (d) coverage-equivalent width Σ_y A / peak, averaged over the interior columns. */
function coverageWidthPx(frame: Frame): number {
  const xLo = LANE.start + LANE.interiorInset;
  const xHi = Math.min(LANE.start + LANE.length - LANE.interiorInset, frame.width);
  let total = 0;
  let counted = 0;
  for (let x = xLo; x < xHi; x += 1) {
    let sum = 0;
    let peak = 0;
    for (let y = 0; y < frame.height; y += 1) {
      const alpha = alphaAt(frame, x, y);
      sum += alpha;
      if (alpha > peak) peak = alpha;
    }
    if (peak === 0) continue;
    total += sum / peak;
    counted += 1;
  }
  return counted === 0 ? 0 : total / counted;
}

function centreRowOfInk(frame: Frame): number {
  const x = LANE.start + Math.floor(LANE.length / 2);
  let best = Math.floor(frame.height / 2);
  let bestAlpha = -1;
  for (let y = 0; y < frame.height; y += 1) {
    const alpha = alphaAt(frame, x, y);
    if (alpha > bestAlpha) {
      bestAlpha = alpha;
      best = y;
    }
  }
  return best;
}

interface ColourFidelity {
  readonly maxInk: number;
  readonly darkestOverWhite: readonly [number, number, number];
  readonly darkestAlpha: number;
}

function colourFidelity(inkFrame: Frame, hueFrame: Frame): ColourFidelity {
  let maxInk = 0;
  for (let index = 3; index < inkFrame.data.length; index += 4) {
    maxInk = Math.max(maxInk, inkFrame.data[index] ?? 0);
  }
  let darkest: [number, number, number] = [255, 255, 255];
  let darkestAlpha = 0;
  let bestLuma = Number.POSITIVE_INFINITY;
  for (let index = 0; index < hueFrame.data.length; index += 4) {
    const alpha = (hueFrame.data[index + 3] ?? 0) / 255;
    if (alpha <= 0) continue;
    const r = (hueFrame.data[index] ?? 0) * alpha + 255 * (1 - alpha);
    const g = (hueFrame.data[index + 1] ?? 0) * alpha + 255 * (1 - alpha);
    const b = (hueFrame.data[index + 2] ?? 0) * alpha + 255 * (1 - alpha);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma < bestLuma) {
      bestLuma = luma;
      darkest = [Math.round(r), Math.round(g), Math.round(b)];
      darkestAlpha = alpha;
    }
  }
  return { maxInk: maxInk / 255, darkestOverWhite: darkest, darkestAlpha };
}

export interface DefectBrushRecord {
  readonly id: string;
  readonly label: string;
  readonly role: DefectBrushSpec["role"];
  readonly interiorToneLevels: number;
  readonly lengthAxisCv: number;
  readonly edgeTransitionPx: number;
  readonly coverageWidthHorizontalPx: number;
  readonly coverageWidthVerticalPx: number;
  readonly nibAspectRatio: number;
  readonly maxInk: number;
  readonly darkestOverWhite: readonly [number, number, number];
  readonly ripple: RippleMetrics;
  readonly edge: EdgeMetrics;
  readonly grain: GrainMetrics;
}

function round(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function decodeFrame(payload: { width: number; height: number; rgbaBase64: string }): Frame {
  return {
    data: new Uint8Array(Buffer.from(payload.rgbaBase64, "base64")),
    width: payload.width,
    height: payload.height,
  };
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a brush-defect harness port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function main(): Promise<void> {
  const labelIndex = process.argv.indexOf("--label");
  const label = labelIndex >= 0 ? (process.argv[labelIndex + 1] ?? "before") : "before";
  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex >= 0 ? (process.argv[onlyIndex + 1] ?? "").split(",").filter(Boolean) : [];
  const brushes = only.length > 0
    ? DEFECT_LAB_BRUSHES.filter((spec) => only.includes(spec.id))
    : DEFECT_LAB_BRUSHES;

  const port = await findFreePort();
  const viteServer = await createViteServer({
    root: REPO_ROOT,
    configFile: join(REPO_ROOT, "vite.config.ts"),
    logLevel: "warn",
    appType: "custom",
    server: { port, strictPort: true, host: "127.0.0.1" },
    plugins: [
      {
        name: "studio-brush-texture-defect-harness",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (request.url !== HARNESS_PATH) {
              next();
              return;
            }
            // React fast-refresh injects a preamble through transformIndexHtml; without it
            // @vitejs/plugin-react rejects every transformed .tsx module at runtime.
            server
              .transformIndexHtml(
                HARNESS_PATH,
                '<!doctype html><html><head><meta charset="utf-8">'
                + "<title>Studio brush texture defect lab</title></head>"
                + "<body><main>rendering…</main>"
                + `<script type="module" src="${HARNESS_ENTRY}"></script></body></html>`,
              )
              .then((html) => {
                response.setHeader("Content-Type", "text/html; charset=utf-8");
                response.end(html);
              })
              .catch(next);
          });
        },
      },
    ],
  });
  await viteServer.listen(port);

  // Default GPU flags on purpose: swiftshader misreports this app by more than an order of
  // magnitude, and a software rasteriser would also change antialiasing.
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const records: DefectBrushRecord[] = [];
  const consoleErrors: string[] = [];
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      consoleErrors.push(message.text());
      process.stderr.write(`[browser console] ${message.text()}\n`);
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
      process.stderr.write(`[browser pageerror] ${error.stack ?? error.message}\n`);
    });
    // Vite's dependency optimizer can restart mid-navigation on a cold cache; one retry after the
    // optimiser settles is the documented recovery and keeps the run deterministic.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await page.goto(`http://127.0.0.1:${port}${HARNESS_PATH}`, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });
        await page.waitForFunction(() => window.__studioBrushDefectReady === true, undefined, {
          timeout: 120_000,
        });
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
        process.stderr.write(`[harness] navigation retry ${attempt + 1}\n`);
      }
    }

    for (const spec of brushes) {
      const render = async (request: LaneRequest): Promise<Frame> => {
        const payload = await page.evaluate(
          (input) => window.__studioBrushDefectRenderLane!(input),
          request as never,
        );
        return decodeFrame(payload as never);
      };
      const horizontal = await render(laneGeometry(spec, "horizontal", INK_COLOR));
      const verticalRaw = await render(laneGeometry(spec, "vertical", INK_COLOR));
      const vertical = transposeFrame(verticalRaw);
      const hue = await render(laneGeometry(spec, "horizontal", HUE_COLOR));

      const centreY = centreRowOfInk(horizontal);
      const columns = interiorColumns(horizontal);
      const ripple = rippleMetrics(
        horizontal,
        centreY,
        LANE.start + LANE.interiorInset,
        LANE.start + LANE.length - LANE.interiorInset,
        Math.max(1, spec.strokeWidth / 2),
      );
      const edge = edgeMetrics(horizontal, centreY, columns);
      const grain = grainMetrics(
        horizontal,
        LANE.start + Math.floor(LANE.length / 2),
        centreY,
        64,
      );
      const colour = colourFidelity(horizontal, hue);
      const widthH = coverageWidthPx(horizontal);
      const widthV = coverageWidthPx(vertical);

      records.push({
        id: spec.id,
        label: spec.label,
        role: spec.role,
        interiorToneLevels: interiorToneLevels(horizontal),
        lengthAxisCv: round(ripple.rippleCv),
        edgeTransitionPx: round(edge.transitionWidthPx),
        coverageWidthHorizontalPx: round(widthH, 2),
        coverageWidthVerticalPx: round(widthV, 2),
        nibAspectRatio: widthV === 0 ? 0 : round(widthH / widthV),
        maxInk: round(colour.maxInk, 3),
        darkestOverWhite: colour.darkestOverWhite,
        ripple,
        edge,
        grain,
      });
      process.stdout.write(
        `${spec.id.padEnd(16)} tone=${String(records.at(-1)!.interiorToneLevels).padStart(4)}`
        + ` cv=${records.at(-1)!.lengthAxisCv.toFixed(3)}`
        + ` edge=${records.at(-1)!.edgeTransitionPx.toFixed(2)}px`
        + ` w=${widthH.toFixed(1)}/${widthV.toFixed(1)}`
        + ` ratio=${records.at(-1)!.nibAspectRatio.toFixed(2)}`
        + ` ink=${records.at(-1)!.maxInk.toFixed(3)}`
        + ` dark=[${colour.darkestOverWhite.join(",")}]\n`,
      );
    }
  } finally {
    await browser.close().catch(() => undefined);
    await viteServer.close().catch(() => undefined);
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, `brush-defect-lab.${label}.json`);
  await writeFile(
    out,
    `${JSON.stringify({ label, lane: LANE, consoleErrors, brushes: records }, null, 2)}\n`,
  );
  process.stdout.write(`\nwrote ${out}\n`);
  if (consoleErrors.length > 0) {
    process.stdout.write(`console errors: ${consoleErrors.slice(0, 5).join(" | ")}\n`);
  }
}

const invokedDirectly = process.argv[1]?.includes("brush-defect-lab");
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
