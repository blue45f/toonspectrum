/**
 * Production-preview regression gate for Studio's complete canvas surface inventory.
 *
 * This verifier records canvas backing dimensions and a nominal uncompressed RGBA8 payload
 * (`width × height × 4`). That number is a deterministic allocation-pressure proxy, not a claim
 * about browser/GPU resident bytes: swapchains, compositor surfaces, GPU textures, driver padding,
 * lazy allocation, and compression are outside this measurement.
 *
 * Run after `pnpm build`:
 *   pnpm verify:studio-canvas-surfaces
 *
 * Reuse an already-running preview or development server:
 *   TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:4173 pnpm verify:studio-canvas-surfaces
 *
 * Artifacts:
 *   TOONSPECTRUM_CANVAS_SURFACES_VERIFY_DIR=/tmp/studio-canvas-surfaces \
 *     pnpm verify:studio-canvas-surfaces
 */
import { type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

import {
  findFreePort,
  spawnVitePreview,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

const MEBIBYTE = 1_048_576;
const RGBA8_BYTES_PER_PIXEL = 4;
const QUICK_START_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const UI_DENSITY_KEY = "toonspectrum-studio-ui-density:v1";
const RESULT_VERSION = 1;

export const STUDIO_CANVAS_SURFACE_VIEWPORT = Object.freeze({
  width: 1_600,
  height: 900,
});

/**
 * Limits measured from the hydrated empty Studio after inactive coverage/GPU surface reclamation.
 * Baseline ceilings apply to Select/initial/final. Active ceilings admit the one identity-verified
 * brush-cursor Layer while Pen is selected. The normalized ceiling scales with the actual canvas
 * viewport, preventing harmless chrome-width changes from making the absolute ceiling the only
 * authority.
 */
export const STUDIO_CANVAS_SURFACE_DPR_CASES = Object.freeze([
  Object.freeze({
    label: "dpr-1",
    deviceScaleFactor: 1,
    maxNominalRgba8MiB: 62,
    maxActiveNominalRgba8MiB: 62,
  }),
  Object.freeze({
    label: "dpr-1.5",
    deviceScaleFactor: 1.5,
    maxNominalRgba8MiB: 137,
    maxActiveNominalRgba8MiB: 140,
  }),
  Object.freeze({
    label: "dpr-2",
    deviceScaleFactor: 2,
    maxNominalRgba8MiB: 240,
    maxActiveNominalRgba8MiB: 240,
  }),
] as const);

export const STUDIO_CANVAS_SURFACE_MAX_BACKING_PIXEL_RATIO = 20.5;
export const STUDIO_CANVAS_SURFACE_TOOL_TRANSITION_CYCLES = 3;

export const STUDIO_CANVAS_RECLAIMED_SURFACES = Object.freeze([
  Object.freeze({
    id: "dynamic-coverage",
    attribute: "data-studio-live-dynamic-coverage",
    value: "true",
  }),
  Object.freeze({
    id: "gpu-webgpu",
    attribute: "data-studio-gpu-surface",
    value: "webgpu",
  }),
  Object.freeze({
    id: "gpu-canvas2d",
    attribute: "data-studio-gpu-surface",
    value: "canvas2d",
  }),
] as const);

type DprCase = (typeof STUDIO_CANVAS_SURFACE_DPR_CASES)[number];
type ReclaimedSurfaceId = (typeof STUDIO_CANVAS_RECLAIMED_SURFACES)[number]["id"];

export interface StudioCanvasSurfaceBudgetInput {
  readonly deviceScaleFactor: number;
  readonly viewportCssWidth: number;
  readonly viewportCssHeight: number;
  readonly nominalRgba8Bytes: number;
  readonly maxNominalRgba8MiB: number;
}

export interface StudioCanvasSurfaceBudget {
  readonly nominalRgba8MiB: number;
  readonly maxNominalRgba8MiB: number;
  readonly backingPixelRatio: number;
  readonly maxBackingPixelRatio: number;
  readonly withinAbsoluteLimit: boolean;
  readonly withinNormalizedLimit: boolean;
}

export function resolveStudioCanvasSurfaceBudget(
  input: StudioCanvasSurfaceBudgetInput,
): StudioCanvasSurfaceBudget {
  const nominalRgba8MiB = input.nominalRgba8Bytes / MEBIBYTE;
  const viewportDevicePixels = input.viewportCssWidth
    * input.viewportCssHeight
    * input.deviceScaleFactor
    * input.deviceScaleFactor;
  const backingPixels = input.nominalRgba8Bytes / RGBA8_BYTES_PER_PIXEL;
  const backingPixelRatio = viewportDevicePixels > 0
    && Number.isFinite(viewportDevicePixels)
    && Number.isFinite(backingPixels)
      ? backingPixels / viewportDevicePixels
      : Number.POSITIVE_INFINITY;
  return {
    nominalRgba8MiB,
    maxNominalRgba8MiB: input.maxNominalRgba8MiB,
    backingPixelRatio,
    maxBackingPixelRatio: STUDIO_CANVAS_SURFACE_MAX_BACKING_PIXEL_RATIO,
    withinAbsoluteLimit:
      Number.isFinite(nominalRgba8MiB)
      && nominalRgba8MiB <= input.maxNominalRgba8MiB,
    withinNormalizedLimit:
      Number.isFinite(backingPixelRatio)
      && backingPixelRatio <= STUDIO_CANVAS_SURFACE_MAX_BACKING_PIXEL_RATIO,
  };
}

interface CanvasRectEvidence {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasElementEvidence {
  readonly index: number;
  readonly primaryDataKey: string;
  readonly dataAttributes: Readonly<Record<string, string>>;
  readonly className: string;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly backingPixels: number;
  readonly nominalRgba8Bytes: number;
  readonly cssRect: CanvasRectEvidence;
  readonly display: string;
  readonly visibility: string;
  readonly opacity: string;
  readonly effectivelyHidden: boolean;
  readonly effectiveOpacity: number;
  readonly insideKonvaContent: boolean;
  readonly activeState: Readonly<Record<string, string>>;
}

export interface CanvasInventoryEvidence {
  readonly capturedAt: string;
  readonly devicePixelRatio: number;
  readonly velloAuthority: string | null;
  readonly frameGraphDocument: string | null;
  readonly velloCanvasCount: number;
  readonly canvasCount: number;
  readonly canvasViewport: CanvasRectEvidence;
  readonly totalBackingPixels: number;
  readonly totalNominalRgba8Bytes: number;
  readonly effectivelyHiddenNominalRgba8Bytes: number;
  readonly effectivelyVisibleNominalRgba8Bytes: number;
  readonly canvases: readonly CanvasElementEvidence[];
}

export interface StudioCanvasVelloSurfaceReadinessInput {
  readonly authority: string | null;
  readonly frameGraphDocument: string | null;
  readonly velloCanvasCount: number;
}

/**
 * Vello is a conditional document owner, not an always-mounted bootstrap surface. Empty and
 * explicitly incompatible documents settle on the Konva shadow without creating a Vello canvas;
 * an active exact-revision handoff must expose exactly one frame-graph canvas.
 */
export function isStudioCanvasVelloSurfaceReady(
  input: StudioCanvasVelloSurfaceReadinessInput,
): boolean {
  if (input.frameGraphDocument === "vello-skia") {
    return (input.authority === "active" || input.authority === "unavailable")
      && input.velloCanvasCount === 1;
  }
  return input.frameGraphDocument === "konva-shadow"
    && (
      input.authority === "disabled"
      || input.authority === "idle"
      || input.authority === "legacy"
      || input.authority === "unavailable"
    )
    && input.velloCanvasCount === 0;
}

interface ReclaimedSurfaceEvidence {
  readonly id: ReclaimedSurfaceId;
  readonly matches: readonly Readonly<{
    primaryDataKey: string;
    width: number;
    height: number;
    effectivelyHidden: boolean;
  }>[];
}

export interface StudioBrushCursorSurfaceEvidence {
  readonly primaryDataKey: string;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly nominalRgba8Bytes: number;
  readonly insideKonvaContent: boolean;
}

export interface StudioCanvasSurfaceSnapshotEvidence {
  readonly canvasCount: number;
  readonly totalNominalRgba8Bytes: number;
  /**
   * A sorted multiset. The cursor Layer is deliberately excluded because it is mounted only while
   * a brush tool is active; every document/render surface must otherwise remain byte-for-byte
   * identical to the hydrated baseline.
   */
  readonly nonCursorSignatures: readonly string[];
  readonly brushCursorCanvases: readonly StudioBrushCursorSurfaceEvidence[];
  readonly canonicalDocumentBackingSizes: readonly string[];
}

export interface StudioCanvasToolTransitionEvidence {
  readonly label: string;
  readonly toolId: "pen" | "select";
  readonly selected: boolean;
  readonly snapshot: StudioCanvasSurfaceSnapshotEvidence;
}

export interface StudioCanvasSurfaceContractInput {
  readonly label: string;
  readonly expectedDeviceScaleFactor: number;
  readonly actualDevicePixelRatio: number;
  readonly budget: StudioCanvasSurfaceBudget;
  readonly finalBudget: StudioCanvasSurfaceBudget;
  readonly transitionBudgets: readonly StudioCanvasSurfaceBudget[];
  readonly initialSnapshot: StudioCanvasSurfaceSnapshotEvidence;
  readonly finalSnapshot: StudioCanvasSurfaceSnapshotEvidence;
  readonly transitions: readonly StudioCanvasToolTransitionEvidence[];
  readonly mutationAdded: number;
  readonly mutationRemoved: number;
  readonly mutationPeakCount: number;
  readonly initialReclaimed: readonly ReclaimedSurfaceEvidence[];
  readonly finalReclaimed: readonly ReclaimedSurfaceEvidence[];
  readonly pageCrashCount: number;
  readonly cdpCrashCount: number;
  readonly pageErrorCount: number;
  readonly webglContextLossCount: number;
  readonly unexpectedGpuDeviceLossCount: number;
  readonly unhandledLossRejectionCount: number;
}

export function collectStudioCanvasSurfaceContractFailures(
  input: StudioCanvasSurfaceContractInput,
): string[] {
  const failures: string[] = [];
  if (Math.abs(input.actualDevicePixelRatio - input.expectedDeviceScaleFactor) > 0.01) {
    failures.push(
      `${input.label}: expected DPR ${input.expectedDeviceScaleFactor}, observed `
        + `${input.actualDevicePixelRatio}`,
    );
  }
  const checkBudget = (phase: string, budget: StudioCanvasSurfaceBudget): void => {
    if (!budget.withinAbsoluteLimit) {
      failures.push(
        `${input.label}: ${phase} nominal RGBA8 ${budget.nominalRgba8MiB.toFixed(3)} MiB exceeds `
          + `${budget.maxNominalRgba8MiB} MiB`,
      );
    }
    if (!budget.withinNormalizedLimit) {
      failures.push(
        `${input.label}: ${phase} backing/device-viewport ratio `
          + `${budget.backingPixelRatio.toFixed(3)} exceeds `
          + `${budget.maxBackingPixelRatio}`,
      );
    }
  };
  checkBudget("initial", input.budget);
  if (input.transitionBudgets.length !== input.transitions.length) {
    failures.push(
      `${input.label}: captured ${input.transitions.length} tool transitions but resolved `
        + `${input.transitionBudgets.length} transition budgets`,
    );
  }
  input.transitionBudgets.forEach((budget, index) => {
    checkBudget(`tool transition ${index + 1}`, budget);
  });
  checkBudget("final", input.finalBudget);
  if (
    input.finalSnapshot.totalNominalRgba8Bytes
    !== input.initialSnapshot.totalNominalRgba8Bytes
  ) {
    failures.push(
      `${input.label}: final nominal RGBA8 ${input.finalBudget.nominalRgba8MiB.toFixed(3)} MiB `
        + `did not return to initial ${input.budget.nominalRgba8MiB.toFixed(3)} MiB`,
    );
  }
  if (input.initialSnapshot.canvasCount < 1) {
    failures.push(`${input.label}: hydrated Studio exposed no canvases`);
  }
  if (input.initialSnapshot.brushCursorCanvases.length !== 0) {
    failures.push(
      `${input.label}: initial selection state unexpectedly retained `
        + `${input.initialSnapshot.brushCursorCanvases.length} brush cursor canvas(es)`,
    );
  }
  if (input.finalSnapshot.brushCursorCanvases.length !== 0) {
    failures.push(
      `${input.label}: final selection state retained `
        + `${input.finalSnapshot.brushCursorCanvases.length} brush cursor canvas(es)`,
    );
  }

  const normalizedSignatures = (signatures: readonly string[]): string =>
    JSON.stringify([...signatures].sort());
  const initialNonCursorSignatures = normalizedSignatures(
    input.initialSnapshot.nonCursorSignatures,
  );
  const canonicalDocumentBackingSizes = new Set(
    input.initialSnapshot.canonicalDocumentBackingSizes,
  );
  const penPlateaus: string[] = [];

  const expectedTransitionCount = STUDIO_CANVAS_SURFACE_TOOL_TRANSITION_CYCLES * 2;
  if (input.transitions.length !== expectedTransitionCount) {
    failures.push(
      `${input.label}: expected ${expectedTransitionCount} alternating tool transitions, captured `
        + `${input.transitions.length}`,
    );
  }
  if (canonicalDocumentBackingSizes.size !== 1) {
    failures.push(
      `${input.label}: expected one canonical document-shadow backing size, found `
        + `${canonicalDocumentBackingSizes.size}`,
    );
  }

  input.transitions.forEach((transition, index) => {
    const expectedToolId = index % 2 === 0 ? "pen" : "select";
    if (transition.toolId !== expectedToolId) {
      failures.push(
        `${input.label}: tool transition ${index + 1} expected ${expectedToolId}, observed `
          + `${transition.toolId}`,
      );
    }
    if (!transition.selected) {
      failures.push(`${input.label}: tool transition ${index + 1} did not select ${transition.toolId}`);
    }
    const expectedCursorCount = transition.toolId === "pen" ? 1 : 0;
    const actualCursorCount = transition.snapshot.brushCursorCanvases.length;
    if (actualCursorCount !== expectedCursorCount) {
      failures.push(
        `${input.label}: ${transition.label} expected ${expectedCursorCount} tagged brush cursor `
          + `canvas(es), found ${actualCursorCount}`,
      );
    }
    const expectedCanvasCount = input.initialSnapshot.canvasCount + expectedCursorCount;
    if (transition.snapshot.canvasCount !== expectedCanvasCount) {
      failures.push(
        `${input.label}: ${transition.label} canvas count ${transition.snapshot.canvasCount}, `
          + `expected bounded ${expectedCanvasCount}`,
      );
    }
    if (
      normalizedSignatures(transition.snapshot.nonCursorSignatures)
      !== initialNonCursorSignatures
    ) {
      failures.push(
        `${input.label}: ${transition.label} changed the non-cursor canvas inventory`,
      );
    }

    if (transition.toolId === "select") {
      if (
        transition.snapshot.totalNominalRgba8Bytes
        !== input.initialSnapshot.totalNominalRgba8Bytes
      ) {
        failures.push(
          `${input.label}: ${transition.label} nominal RGBA8 did not return to the initial `
            + `${input.budget.nominalRgba8MiB.toFixed(3)} MiB plateau`,
        );
      }
      return;
    }

    const cursor = transition.snapshot.brushCursorCanvases[0];
    if (!cursor) return;
    if (cursor.primaryDataKey !== "data-studio-brush-cursor-canvas=true") {
      failures.push(
        `${input.label}: ${transition.label} cursor lacked the explicit brush-cursor identity`,
      );
    }
    if (!cursor.insideKonvaContent) {
      failures.push(
        `${input.label}: ${transition.label} brush cursor canvas was outside the Konva Stage`,
      );
    }
    const cursorBackingSize = `${cursor.backingWidth}x${cursor.backingHeight}`;
    if (!canonicalDocumentBackingSizes.has(cursorBackingSize)) {
      failures.push(
        `${input.label}: ${transition.label} brush cursor backing ${cursorBackingSize} did not `
          + `match the canonical document-shadow canvas`,
      );
    }
    if (
      transition.snapshot.totalNominalRgba8Bytes
      !== input.initialSnapshot.totalNominalRgba8Bytes + cursor.nominalRgba8Bytes
    ) {
      failures.push(
        `${input.label}: ${transition.label} allocation delta was not exactly the tagged brush `
          + `cursor canvas`,
      );
    }
    penPlateaus.push(JSON.stringify({
      canvasCount: transition.snapshot.canvasCount,
      totalNominalRgba8Bytes: transition.snapshot.totalNominalRgba8Bytes,
      cursorBackingSize,
      cursorNominalRgba8Bytes: cursor.nominalRgba8Bytes,
    }));
  });

  if (new Set(penPlateaus).size > 1) {
    failures.push(`${input.label}: repeated pen activations did not stay on one stable plateau`);
  }
  if (input.finalSnapshot.canvasCount !== input.initialSnapshot.canvasCount) {
    failures.push(
      `${input.label}: final canvas count ${input.finalSnapshot.canvasCount} did not return to `
        + `${input.initialSnapshot.canvasCount}`,
    );
  }
  if (
    normalizedSignatures(input.finalSnapshot.nonCursorSignatures)
    !== initialNonCursorSignatures
  ) {
    failures.push(`${input.label}: final non-cursor canvas inventory did not return to initial`);
  }
  const allowedMutationPeak = input.initialSnapshot.canvasCount + 1;
  if (input.mutationPeakCount > allowedMutationPeak) {
    failures.push(
      `${input.label}: transient canvas count exceeded the one-cursor allowance `
        + `(${allowedMutationPeak} -> ${input.mutationPeakCount})`,
    );
  }
  if (input.mutationAdded !== input.mutationRemoved) {
    failures.push(
      `${input.label}: canvas mutations were unbalanced `
        + `(${input.mutationAdded} added, ${input.mutationRemoved} removed)`,
    );
  }

  for (const phase of [
    ["initial", input.initialReclaimed],
    ["final", input.finalReclaimed],
  ] as const) {
    for (const surface of phase[1]) {
      if (surface.matches.length !== 1) {
        failures.push(
          `${input.label}: ${phase[0]} ${surface.id} expected exactly one canvas, found `
            + `${surface.matches.length}`,
        );
        continue;
      }
      const match = surface.matches[0]!;
      if (match.width !== 1 || match.height !== 1) {
        failures.push(
          `${input.label}: ${phase[0]} ${surface.id} retained `
            + `${match.width}x${match.height}, expected 1x1 before ink`,
        );
      }
    }
  }

  if (input.pageCrashCount > 0) {
    failures.push(`${input.label}: page crash events observed (${input.pageCrashCount})`);
  }
  if (input.cdpCrashCount > 0) {
    failures.push(`${input.label}: CDP target crash events observed (${input.cdpCrashCount})`);
  }
  if (input.pageErrorCount > 0) {
    failures.push(`${input.label}: uncaught page errors observed (${input.pageErrorCount})`);
  }
  if (input.webglContextLossCount > 0) {
    failures.push(
      `${input.label}: WebGL context-loss events observed (${input.webglContextLossCount})`,
    );
  }
  if (input.unexpectedGpuDeviceLossCount > 0) {
    failures.push(
      `${input.label}: unexpected GPU device-loss events observed `
        + `(${input.unexpectedGpuDeviceLossCount})`,
    );
  }
  if (input.unhandledLossRejectionCount > 0) {
    failures.push(
      `${input.label}: unhandled device/context-loss rejections observed `
        + `(${input.unhandledLossRejectionCount})`,
    );
  }
  return failures;
}

interface BrowserLossEvidence {
  readonly instrumentation: readonly string[];
  readonly observedGpuDevices: number;
  readonly webglContextLosses: readonly Readonly<Record<string, unknown>>[];
  readonly gpuDeviceLosses: readonly Readonly<{
    reason: string;
    message: string;
    at: number;
  }>[];
  readonly unhandledLossRejections: readonly Readonly<{
    message: string;
    at: number;
  }>[];
}

interface NodeLossEvidence {
  readonly pageCrashes: Array<Readonly<{ at: string; url: string }>>;
  readonly cdpTargetCrashes: Array<Readonly<{ at: string }>>;
  readonly pageErrors: Array<Readonly<{ at: string; message: string }>>;
  readonly consoleDiagnostics: Array<Readonly<{
    at: string;
    type: string;
    text: string;
  }>>;
  readonly instrumentationErrors: string[];
}

interface CanvasMutationEvidence {
  readonly added: number;
  readonly removed: number;
  readonly peakCount: number;
}

interface ToolTransitionEvidence {
  readonly label: string;
  readonly toolId: "pen" | "select";
  readonly selected: boolean;
  readonly snapshot: StudioCanvasSurfaceSnapshotEvidence;
}

interface DprCaseEvidence {
  readonly label: string;
  readonly configuredDeviceScaleFactor: number;
  readonly initial: CanvasInventoryEvidence | null;
  readonly final: CanvasInventoryEvidence | null;
  readonly budget: StudioCanvasSurfaceBudget | null;
  readonly finalBudget: StudioCanvasSurfaceBudget | null;
  readonly transitionBudgets: readonly StudioCanvasSurfaceBudget[];
  readonly transitions: readonly ToolTransitionEvidence[];
  readonly mutationAudit: CanvasMutationEvidence | null;
  readonly initialReclaimed: readonly ReclaimedSurfaceEvidence[];
  readonly finalReclaimed: readonly ReclaimedSurfaceEvidence[];
  readonly browserLossEvidence: BrowserLossEvidence | null;
  readonly nodeLossEvidence: NodeLossEvidence;
  readonly screenshotPath: string | null;
  readonly failures: readonly string[];
  readonly error: string | null;
}

const SCRATCH =
  process.env.TOONSPECTRUM_CANVAS_SURFACES_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-canvas-surfaces");
const RESULT_PATH = join(SCRATCH, "studio-canvas-surfaces-evidence.json");

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.stack ?? cause.message : String(cause);
}

async function installLossInstrumentation(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    type MutableBrowserLossEvidence = {
      instrumentation: string[];
      observedGpuDevices: number;
      webglContextLosses: Array<Record<string, unknown>>;
      gpuDeviceLosses: Array<{ reason: string; message: string; at: number }>;
      unhandledLossRejections: Array<{ message: string; at: number }>;
    };
    const evidence: MutableBrowserLossEvidence = {
      instrumentation: [],
      observedGpuDevices: 0,
      webglContextLosses: [],
      gpuDeviceLosses: [],
      unhandledLossRejections: [],
    };
    (globalThis as typeof globalThis & {
      __studioCanvasSurfaceLossEvidence?: MutableBrowserLossEvidence;
    }).__studioCanvasSurfaceLossEvidence = evidence;

    globalThis.addEventListener("webglcontextlost", (event) => {
      const canvas = event.target instanceof HTMLCanvasElement ? event.target : null;
      evidence.webglContextLosses.push({
        at: performance.now(),
        primaryDataKey: canvas
          ? Array.from(canvas.attributes)
              .find((attribute) => attribute.name.startsWith("data-studio-"))
              ?.name ?? "canvas"
          : "unknown",
        width: canvas?.width ?? null,
        height: canvas?.height ?? null,
        statusMessage: "statusMessage" in event
          ? String((event as WebGLContextEvent).statusMessage)
          : "",
      });
    }, true);
    globalThis.addEventListener("unhandledrejection", (event) => {
      const message = event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);
      if (/\b(?:device|context)\s+(?:is\s+|was\s+)?lost\b/iu.test(message)) {
        evidence.unhandledLossRejections.push({ message, at: performance.now() });
      }
    });

    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) {
      evidence.instrumentation.push("navigator.gpu-unavailable");
      return;
    }
    const wrappedAdapters = new WeakSet<object>();
    const originalRequestAdapter = gpu.requestAdapter.bind(gpu);
    try {
      Object.defineProperty(gpu, "requestAdapter", {
        configurable: true,
        value: async (options?: GPURequestAdapterOptions) => {
          const adapter = await originalRequestAdapter(options);
          if (!adapter || wrappedAdapters.has(adapter)) return adapter;
          wrappedAdapters.add(adapter);
          const originalRequestDevice = adapter.requestDevice.bind(adapter);
          try {
            Object.defineProperty(adapter, "requestDevice", {
              configurable: true,
              value: async (descriptor?: GPUDeviceDescriptor) => {
                const device = await originalRequestDevice(descriptor);
                evidence.observedGpuDevices += 1;
                void device.lost.then((info) => {
                  evidence.gpuDeviceLosses.push({
                    reason: String(info.reason),
                    message: info.message,
                    at: performance.now(),
                  });
                });
                return device;
              },
            });
            evidence.instrumentation.push("gpu-device-loss-listener-attached");
          } catch (cause) {
            evidence.instrumentation.push(
              `gpu-adapter-request-device-wrap-failed:${String(cause)}`,
            );
          }
          return adapter;
        },
      });
      evidence.instrumentation.push("gpu-request-adapter-wrapped");
    } catch (cause) {
      evidence.instrumentation.push(`gpu-request-adapter-wrap-failed:${String(cause)}`);
    }
  });
}

async function installBrowserRuntimeHelpers(context: BrowserContext): Promise<void> {
  // tsx/esbuild `keepNames` can serialize browser callbacks with a `__name` reference. Install the
  // inert helper as raw source first so every later init/evaluate callback remains self-contained.
  await context.addInitScript(
    "globalThis.__name = globalThis.__name ?? ((fn) => fn);",
  );
}

async function seedStudioContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ({ quickStartKey, mobileHintKey, uiDensityKey }) => {
      try {
        localStorage.setItem(quickStartKey, "1");
        localStorage.setItem(mobileHintKey, "1");
        localStorage.setItem(
          "toonspectrum-lang",
          JSON.stringify({ state: { lang: "ko" }, version: 0 }),
        );
        localStorage.setItem(uiDensityKey, JSON.stringify({ mode: "full" }));
      } catch {
        // Storage-partitioned preview contexts can still be dismissed after hydration.
      }
    },
    {
      quickStartKey: QUICK_START_KEY,
      mobileHintKey: MOBILE_HINT_KEY,
      uiDensityKey: UI_DENSITY_KEY,
    },
  );
}

async function waitForStableHydratedEditor(page: Page): Promise<void> {
  await page.locator('[data-route-stage-key="/studio/draft/editor"]').waitFor({
    state: "attached",
    timeout: 60_000,
  });
  await page.locator('[data-studio-editor="true"]').waitFor({
    state: "attached",
    timeout: 60_000,
  });
  await page.locator("[data-studio-canvas-viewport]").waitFor({
    state: "visible",
    timeout: 60_000,
  });
  await page.locator("[data-studio-vello-hub-authority]").waitFor({
    state: "attached",
    timeout: 60_000,
  });
  for (const selector of [
    'canvas[data-studio-live-dynamic-coverage="true"]',
    'canvas[data-studio-ink-mesh-live-preview="predicted-tail-only"]',
    'canvas[data-studio-canonical-vnext-dry-media="true"]',
    'canvas[data-studio-gpu-surface="webgpu"]',
    'canvas[data-studio-gpu-surface="canvas2d"]',
  ]) {
    await page.locator(selector).waitFor({ state: "attached", timeout: 60_000 });
  }

  await page.waitForFunction(() => {
    const host = document.querySelector("[data-studio-vello-hub-authority]");
    const authority = host?.getAttribute("data-studio-vello-hub-authority") ?? null;
    const frameGraphDocument = host?.getAttribute("data-studio-frame-graph-document") ?? null;
    const velloCanvasCount = document.querySelectorAll(
      'canvas[data-studio-vello-hub-surface="frame-graph"]',
    ).length;
    if (frameGraphDocument === "vello-skia") {
      return (authority === "active" || authority === "unavailable")
        && velloCanvasCount === 1;
    }
    return frameGraphDocument === "konva-shadow"
      && (
        authority === "disabled"
        || authority === "idle"
        || authority === "legacy"
        || authority === "unavailable"
      )
      && velloCanvasCount === 0;
  }, undefined, { timeout: 60_000 });

  const quickStart = page.locator('[data-studio-creative-starter="true"]');
  if (await quickStart.isVisible({ timeout: 500 }).catch(() => false)) {
    await quickStart.locator('[data-studio-quickstart-dismiss="true"]').click();
  }

  let previousCount = -1;
  let stableSamples = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const count = await page.locator("canvas").count();
    if (count === previousCount) stableSamples += 1;
    else stableSamples = 0;
    previousCount = count;
    if (count >= 15 && stableSamples >= 5) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Studio canvas inventory did not stabilize (last count ${previousCount})`);
}

async function captureCanvasInventory(page: Page): Promise<CanvasInventoryEvidence> {
  return page.evaluate(() => {
    const round = (value: number) => Number(value.toFixed(3));
    const attributes = (element: Element): Record<string, string> =>
      Object.fromEntries(
        Array.from(element.attributes)
          .filter((attribute) => attribute.name.startsWith("data-"))
          .map((attribute) => [attribute.name, attribute.value])
          .sort(([left], [right]) => left.localeCompare(right)),
      );
    const rectEvidence = (rect: DOMRect): CanvasRectEvidence => ({
      left: round(rect.left),
      top: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
    });
    const viewport = document.querySelector("[data-studio-canvas-viewport]");
    const viewportRect = viewport?.getBoundingClientRect() ?? new DOMRect();
    const velloHost = document.querySelector("[data-studio-vello-hub-authority]");
    const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas"));
    const evidence = canvases.map((canvas, index): CanvasElementEvidence => {
      const dataAttributes = attributes(canvas);
      const preferredKey = [
        "data-studio-gpu-surface",
        "data-studio-live-dynamic-coverage",
        "data-studio-live-dynamic-settled",
        "data-studio-live-dynamic-active",
        "data-studio-live-retained-settled",
        "data-studio-live-retained-active",
        "data-studio-live-ink-overlay",
        "data-studio-live-stamp-overlay",
        "data-studio-live-ink-prediction",
        "data-studio-ink-mesh-live-preview",
        "data-studio-living-ink-overlay",
        "data-studio-hokusai-live-overlay",
        "data-studio-canonical-vnext-dry-media",
        "data-studio-vello-hub-surface",
        "data-studio-brush-cursor-canvas",
      ].find((key) => key in dataAttributes)
        ?? Object.keys(dataAttributes).find((key) => key.startsWith("data-studio-"));
      const primaryDataKey = preferredKey
        ? `${preferredKey}=${dataAttributes[preferredKey]}`
        : canvas.closest(".konvajs-content")
          ? "konva-scene-canvas"
          : `canvas-${index}`;
      const ownStyle = getComputedStyle(canvas);
      let effectiveDisplayNone = false;
      let effectiveVisibilityHidden = false;
      let effectiveOpacity = 1;
      const activeState: Record<string, string> = {};
      let current: Element | null = canvas;
      let depth = 0;
      while (current) {
        const style = getComputedStyle(current);
        if (style.display === "none") effectiveDisplayNone = true;
        if (style.visibility === "hidden" || style.visibility === "collapse") {
          effectiveVisibilityHidden = true;
        }
        const opacity = Number.parseFloat(style.opacity);
        if (Number.isFinite(opacity)) effectiveOpacity *= opacity;
        for (const [name, value] of Object.entries(attributes(current))) {
          if (/(?:active|authorized|visible|pinned|state|backend)/u.test(name)) {
            activeState[`${depth === 0 ? "self" : `ancestor-${depth}`}:${name}`] = value;
          }
        }
        current = current.parentElement;
        depth += 1;
      }
      const rect = canvas.getBoundingClientRect();
      const backingPixels = canvas.width * canvas.height;
      return {
        index,
        primaryDataKey,
        dataAttributes,
        className: canvas.className,
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        backingPixels,
        nominalRgba8Bytes: backingPixels * 4,
        cssRect: rectEvidence(rect),
        display: ownStyle.display,
        visibility: ownStyle.visibility,
        opacity: ownStyle.opacity,
        effectivelyHidden:
          effectiveDisplayNone
          || effectiveVisibilityHidden
          || effectiveOpacity === 0
          || rect.width === 0
          || rect.height === 0,
        effectiveOpacity: round(effectiveOpacity),
        insideKonvaContent: canvas.closest(".konvajs-content") !== null,
        activeState,
      };
    });
    const totalNominalRgba8Bytes = evidence.reduce(
      (total, canvas) => total + canvas.nominalRgba8Bytes,
      0,
    );
    const effectivelyHiddenNominalRgba8Bytes = evidence.reduce(
      (total, canvas) => total + (canvas.effectivelyHidden ? canvas.nominalRgba8Bytes : 0),
      0,
    );
    return {
      capturedAt: new Date().toISOString(),
      devicePixelRatio: globalThis.devicePixelRatio,
      velloAuthority:
        velloHost?.getAttribute("data-studio-vello-hub-authority") ?? null,
      frameGraphDocument:
        velloHost?.getAttribute("data-studio-frame-graph-document") ?? null,
      velloCanvasCount: canvases.filter(
        (canvas) => canvas.dataset.studioVelloHubSurface === "frame-graph",
      ).length,
      canvasCount: evidence.length,
      canvasViewport: rectEvidence(viewportRect),
      totalBackingPixels: evidence.reduce((total, canvas) => total + canvas.backingPixels, 0),
      totalNominalRgba8Bytes,
      effectivelyHiddenNominalRgba8Bytes,
      effectivelyVisibleNominalRgba8Bytes:
        totalNominalRgba8Bytes - effectivelyHiddenNominalRgba8Bytes,
      canvases: evidence,
    };
  });
}

function snapshotCanvasSurfaceInventory(
  inventory: CanvasInventoryEvidence,
): StudioCanvasSurfaceSnapshotEvidence {
  const isBrushCursor = (canvas: CanvasElementEvidence): boolean =>
    canvas.dataAttributes["data-studio-brush-cursor-canvas"] === "true";
  const signature = (canvas: CanvasElementEvidence): string => JSON.stringify({
    primaryDataKey: canvas.primaryDataKey,
    dataAttributes: canvas.dataAttributes,
    className: canvas.className,
    backingWidth: canvas.backingWidth,
    backingHeight: canvas.backingHeight,
    effectivelyHidden: canvas.effectivelyHidden,
    insideKonvaContent: canvas.insideKonvaContent,
  });
  return {
    canvasCount: inventory.canvasCount,
    totalNominalRgba8Bytes: inventory.totalNominalRgba8Bytes,
    nonCursorSignatures: inventory.canvases
      .filter((canvas) => !isBrushCursor(canvas))
      .map(signature)
      .sort(),
    brushCursorCanvases: inventory.canvases
      .filter(isBrushCursor)
      .map((canvas) => ({
        primaryDataKey: canvas.primaryDataKey,
        backingWidth: canvas.backingWidth,
        backingHeight: canvas.backingHeight,
        nominalRgba8Bytes: canvas.nominalRgba8Bytes,
        insideKonvaContent: canvas.insideKonvaContent,
      })),
    canonicalDocumentBackingSizes: [...new Set(
      inventory.canvases
        .filter((canvas) => canvas.insideKonvaContent && !isBrushCursor(canvas))
        .map((canvas) => `${canvas.backingWidth}x${canvas.backingHeight}`),
    )].sort(),
  };
}

function reclaimedSurfaceEvidence(
  inventory: CanvasInventoryEvidence,
): ReclaimedSurfaceEvidence[] {
  return STUDIO_CANVAS_RECLAIMED_SURFACES.map((target) => ({
    id: target.id,
    matches: inventory.canvases
      .filter((canvas) => canvas.dataAttributes[target.attribute] === target.value)
      .map((canvas) => ({
        primaryDataKey: canvas.primaryDataKey,
        width: canvas.backingWidth,
        height: canvas.backingHeight,
        effectivelyHidden: canvas.effectivelyHidden,
      })),
  }));
}

async function installCanvasMutationAudit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = {
      added: 0,
      removed: 0,
      peakCount: document.querySelectorAll("canvas").length,
    };
    (globalThis as typeof globalThis & {
      __studioCanvasSurfaceMutationAudit?: typeof state;
    }).__studioCanvasSurfaceMutationAudit = state;
    const canvasCount = (node: Node): number => {
      if (node instanceof HTMLCanvasElement) return 1;
      return node instanceof Element ? node.querySelectorAll("canvas").length : 0;
    };
    new MutationObserver((entries) => {
      for (const entry of entries) {
        for (const node of entry.addedNodes) state.added += canvasCount(node);
        for (const node of entry.removedNodes) state.removed += canvasCount(node);
      }
      state.peakCount = Math.max(state.peakCount, document.querySelectorAll("canvas").length);
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
}

async function clickRailTool(page: Page, toolId: "pen" | "select"): Promise<void> {
  const selector = `[data-studio-rail-tool-id="${toolId}"]`;
  await page.locator(selector).waitFor({ state: "visible", timeout: 15_000 });
  await page.evaluate((targetSelector) => {
    const button = document.querySelector<HTMLButtonElement>(targetSelector);
    if (!button) throw new Error(`Missing Studio rail tool ${targetSelector}`);
    if (button.disabled) throw new Error(`Studio rail tool is disabled ${targetSelector}`);
    button.click();
  }, selector);
  await page.waitForFunction(
    (targetSelector) =>
      document.querySelector(targetSelector)?.getAttribute("aria-pressed") === "true",
    selector,
    { timeout: 15_000 },
  );
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function exerciseToolTransitions(page: Page): Promise<ToolTransitionEvidence[]> {
  const transitions: ToolTransitionEvidence[] = [];
  for (let cycle = 1; cycle <= STUDIO_CANVAS_SURFACE_TOOL_TRANSITION_CYCLES; cycle += 1) {
    for (const toolId of ["pen", "select"] as const) {
      await clickRailTool(page, toolId);
      const inventory = await captureCanvasInventory(page);
      transitions.push({
        label: `${cycle}:${toolId}`,
        toolId,
        selected:
          await page
            .locator(`[data-studio-rail-tool-id="${toolId}"]`)
            .getAttribute("aria-pressed") === "true",
        snapshot: snapshotCanvasSurfaceInventory(inventory),
      });
    }
  }
  return transitions;
}

async function readMutationAudit(page: Page): Promise<CanvasMutationEvidence> {
  return page.evaluate(() => {
    const audit = (globalThis as typeof globalThis & {
      __studioCanvasSurfaceMutationAudit?: CanvasMutationEvidence;
    }).__studioCanvasSurfaceMutationAudit;
    return audit ?? {
      added: 0,
      removed: 0,
      peakCount: document.querySelectorAll("canvas").length,
    };
  });
}

async function readBrowserLossEvidence(page: Page): Promise<BrowserLossEvidence> {
  return page.evaluate(() => {
    const evidence = (globalThis as typeof globalThis & {
      __studioCanvasSurfaceLossEvidence?: BrowserLossEvidence;
    }).__studioCanvasSurfaceLossEvidence;
    return evidence ?? {
      instrumentation: ["loss-instrumentation-missing"],
      observedGpuDevices: 0,
      webglContextLosses: [],
      gpuDeviceLosses: [],
      unhandledLossRejections: [],
    };
  });
}

function newNodeLossEvidence(): NodeLossEvidence {
  return {
    pageCrashes: [],
    cdpTargetCrashes: [],
    pageErrors: [],
    consoleDiagnostics: [],
    instrumentationErrors: [],
  };
}

async function runDprCase(
  browser: Browser,
  studioUrl: string,
  definition: DprCase,
): Promise<DprCaseEvidence> {
  const context = await browser.newContext({
    viewport: STUDIO_CANVAS_SURFACE_VIEWPORT,
    deviceScaleFactor: definition.deviceScaleFactor,
    locale: "ko-KR",
  });
  const nodeLossEvidence = newNodeLossEvidence();
  let initial: CanvasInventoryEvidence | null = null;
  let final: CanvasInventoryEvidence | null = null;
  let budget: StudioCanvasSurfaceBudget | null = null;
  let finalBudget: StudioCanvasSurfaceBudget | null = null;
  let transitionBudgets: StudioCanvasSurfaceBudget[] = [];
  let transitions: ToolTransitionEvidence[] = [];
  let mutationAudit: CanvasMutationEvidence | null = null;
  let initialReclaimed: ReclaimedSurfaceEvidence[] = [];
  let finalReclaimed: ReclaimedSurfaceEvidence[] = [];
  let browserLossEvidence: BrowserLossEvidence | null = null;
  let screenshotPath: string | null = null;
  let failures: string[] = [];
  let error: string | null = null;

  try {
    await installBrowserRuntimeHelpers(context);
    await installLossInstrumentation(context);
    await seedStudioContext(context);
    const page = await context.newPage();
    page.on("crash", () => {
      nodeLossEvidence.pageCrashes.push({ at: new Date().toISOString(), url: page.url() });
    });
    page.on("pageerror", (pageError) => {
      nodeLossEvidence.pageErrors.push({
        at: new Date().toISOString(),
        message: pageError.message.slice(0, 4_096),
      });
    });
    page.on("console", (message) => {
      const text = message.text();
      if (!/(?:canvas|webgl|webgpu|gpu|adapter|context\s+lost|device\s+lost|crash)/iu.test(text)) {
        return;
      }
      if (nodeLossEvidence.consoleDiagnostics.length >= 100) return;
      nodeLossEvidence.consoleDiagnostics.push({
        at: new Date().toISOString(),
        type: message.type(),
        text: text.slice(0, 2_048),
      });
    });
    await page.route("**/api/auth/session", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ authenticated: false, user: null }),
      });
    });
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Inspector.enable");
      cdp.on("Inspector.targetCrashed", () => {
        nodeLossEvidence.cdpTargetCrashes.push({ at: new Date().toISOString() });
      });
    } catch (cause) {
      nodeLossEvidence.instrumentationErrors.push(
        `cdp-crash-listener-unavailable:${errorMessage(cause)}`,
      );
    }

    await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForStableHydratedEditor(page);
    initial = await captureCanvasInventory(page);
    initialReclaimed = reclaimedSurfaceEvidence(initial);
    await installCanvasMutationAudit(page);
    transitions = await exerciseToolTransitions(page);
    final = await captureCanvasInventory(page);
    finalReclaimed = reclaimedSurfaceEvidence(final);
    mutationAudit = await readMutationAudit(page);
    browserLossEvidence = await readBrowserLossEvidence(page);
    budget = resolveStudioCanvasSurfaceBudget({
      deviceScaleFactor: definition.deviceScaleFactor,
      viewportCssWidth: initial.canvasViewport.width,
      viewportCssHeight: initial.canvasViewport.height,
      nominalRgba8Bytes: initial.totalNominalRgba8Bytes,
      maxNominalRgba8MiB: definition.maxNominalRgba8MiB,
    });
    const initialCanvasViewport = initial.canvasViewport;
    transitionBudgets = transitions.map((transition) => resolveStudioCanvasSurfaceBudget({
      deviceScaleFactor: definition.deviceScaleFactor,
      viewportCssWidth: initialCanvasViewport.width,
      viewportCssHeight: initialCanvasViewport.height,
      nominalRgba8Bytes: transition.snapshot.totalNominalRgba8Bytes,
      maxNominalRgba8MiB: transition.toolId === "pen"
        ? definition.maxActiveNominalRgba8MiB
        : definition.maxNominalRgba8MiB,
    }));
    finalBudget = resolveStudioCanvasSurfaceBudget({
      deviceScaleFactor: definition.deviceScaleFactor,
      viewportCssWidth: final.canvasViewport.width,
      viewportCssHeight: final.canvasViewport.height,
      nominalRgba8Bytes: final.totalNominalRgba8Bytes,
      maxNominalRgba8MiB: definition.maxNominalRgba8MiB,
    });
    const unexpectedGpuDeviceLossCount = browserLossEvidence.gpuDeviceLosses.filter(
      ({ reason }) => reason !== "destroyed",
    ).length;
    failures = collectStudioCanvasSurfaceContractFailures({
      label: definition.label,
      expectedDeviceScaleFactor: definition.deviceScaleFactor,
      actualDevicePixelRatio: initial.devicePixelRatio,
      budget,
      finalBudget,
      transitionBudgets,
      initialSnapshot: snapshotCanvasSurfaceInventory(initial),
      finalSnapshot: snapshotCanvasSurfaceInventory(final),
      transitions,
      mutationAdded: mutationAudit.added,
      mutationRemoved: mutationAudit.removed,
      mutationPeakCount: mutationAudit.peakCount,
      initialReclaimed,
      finalReclaimed,
      pageCrashCount: nodeLossEvidence.pageCrashes.length,
      cdpCrashCount: nodeLossEvidence.cdpTargetCrashes.length,
      pageErrorCount: nodeLossEvidence.pageErrors.length,
      webglContextLossCount: browserLossEvidence.webglContextLosses.length,
      unexpectedGpuDeviceLossCount,
      unhandledLossRejectionCount: browserLossEvidence.unhandledLossRejections.length,
    });
    screenshotPath = join(SCRATCH, `studio-canvas-surfaces-${definition.label}.png`);
    await page.screenshot({ path: screenshotPath });
  } catch (cause) {
    error = errorMessage(cause);
    failures.push(`${definition.label}: verifier execution failed: ${error}`);
  } finally {
    await context.close().catch(() => undefined);
  }

  return {
    label: definition.label,
    configuredDeviceScaleFactor: definition.deviceScaleFactor,
    initial,
    final,
    budget,
    finalBudget,
    transitionBudgets,
    transitions,
    mutationAudit,
    initialReclaimed,
    finalReclaimed,
    browserLossEvidence,
    nodeLossEvidence,
    screenshotPath,
    failures,
    error,
  };
}

export async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });
  const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  const port = externalOrigin ? null : await findFreePort();
  const origin = externalOrigin
    ? `${externalOrigin.replace(/\/+$/u, "")}/`
    : `http://127.0.0.1:${port ?? 0}/`;
  const studioUrl = `${origin}studio`;
  const server: ChildProcess | null = port === null
    ? null
    : spawnVitePreview({ port, runner: "pnpm-exec" });
  let browser: Browser | null = null;

  try {
    await waitForServer(studioUrl, {
      timeoutMs: 30_000,
      notReadyMessage: "production preview did not become ready",
    });
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const cases: DprCaseEvidence[] = [];
    for (const definition of STUDIO_CANVAS_SURFACE_DPR_CASES) {
      cases.push(await runDprCase(browser, studioUrl, definition));
    }
    const failures = cases.flatMap((result) => result.failures);
    const evidence = {
      version: RESULT_VERSION,
      capturedAt: new Date().toISOString(),
      source: externalOrigin ? "external-origin" : "production-preview",
      studioUrl,
      browserVersion: browser.version(),
      configuredViewport: STUDIO_CANVAS_SURFACE_VIEWPORT,
      thresholds: {
        dprCases: STUDIO_CANVAS_SURFACE_DPR_CASES,
        maxBackingPixelRatio: STUDIO_CANVAS_SURFACE_MAX_BACKING_PIXEL_RATIO,
        toolTransitionCycles: STUDIO_CANVAS_SURFACE_TOOL_TRANSITION_CYCLES,
      },
      measurementNotice:
        "Nominal RGBA8 bytes are width*height*4 allocation-pressure evidence, not actual GPU or browser resident memory.",
      cases,
      failures,
    };
    writeFileSync(RESULT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({
      source: evidence.source,
      browserVersion: evidence.browserVersion,
      cases: cases.map((result) => ({
        label: result.label,
        canvasCount: result.initial?.canvasCount ?? null,
        nominalRgba8MiB: result.budget
          ? Number(result.budget.nominalRgba8MiB.toFixed(3))
          : null,
        backingPixelRatio: result.budget
          ? Number(result.budget.backingPixelRatio.toFixed(3))
          : null,
        finalNominalRgba8MiB: result.finalBudget
          ? Number(result.finalBudget.nominalRgba8MiB.toFixed(3))
          : null,
        transitionNominalRgba8MiB: result.transitionBudgets.map((transitionBudget) =>
          Number(transitionBudget.nominalRgba8MiB.toFixed(3))),
        reclaimed: result.initialReclaimed,
        failures: result.failures,
      })),
      failures,
      evidence: RESULT_PATH,
    }, null, 2));
    if (failures.length > 0) {
      throw new Error(`Studio canvas surface verification failed:\n${failures.join("\n")}`);
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) await stopChildProcess(server).catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((cause: unknown) => {
    console.error(cause);
    process.exitCode = 1;
  });
}
