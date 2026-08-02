import type {
  StudioLivingInkBounds,
  StudioLivingInkOperation,
} from "./studio-living-ink-field";
import type {
  StudioLivingInkDisplayMode,
  StudioLivingInkMaterialControls,
} from "./studio-living-ink-gpu-protocol";

export const STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION = 1 as const;
export const STUDIO_LIVING_INK_EXECUTION_ENGINE_VERSION =
  "1.1.0-independent-webgl2-continuous-capsule" as const;

export const STUDIO_LIVING_INK_EXECUTION_LIMITS = Object.freeze({
  maximumFineDimension: 2_048,
  maximumDisplayDimension: 4_096,
  maximumMarksPerRequest: 4_096,
  maximumAdvanceTicks: 1_080,
  maximumJournalOperations: 512,
  interactivePressureIterations: 10,
  settlePressureIterations: 22,
  fixedTimeStepSeconds: 1 / 60,
  fixDurationSeconds: 1.2,
  minimumDryTimeSeconds: 2,
  maximumDryTimeSeconds: 18,
  dirtyTileSize: 32,
} as const);

export interface StudioLivingInkExecutionConfig {
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly fieldWidth: number;
  readonly fieldHeight: number;
  readonly coarseBase: 128 | 192 | 256;
  readonly seed: number;
  readonly material: StudioLivingInkMaterialControls;
  readonly displayMode: StudioLivingInkDisplayMode;
}

export interface StudioLivingInkExecutionCapabilities {
  readonly backend: "webgl2-offscreen-half-float";
  readonly worker: true;
  readonly offscreenCanvas: true;
  readonly webgl2: true;
  readonly halfFloatRenderable: true;
  readonly rgba16Float: true;
  readonly rg16Float: true;
  readonly r16Float: true;
  readonly maximumTextureSize: number;
  readonly pressureIterations: Readonly<{
    readonly interactive: 10;
    readonly settle: 22;
  }>;
}

export interface StudioLivingInkExecutionReceipt {
  readonly kind: "studio-living-ink-execution-receipt";
  readonly version: typeof STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION;
  readonly engineVersion: typeof STUDIO_LIVING_INK_EXECUTION_ENGINE_VERSION;
  readonly requestId: number;
  readonly revision: number;
  readonly operationKind: StudioLivingInkOperation["kind"] | "restore";
  readonly backend: "webgl2-offscreen-half-float";
  readonly displaySha256: `sha256:${string}`;
  readonly operationSha256: `sha256:${string}`;
  readonly dirtyBounds: StudioLivingInkBounds;
  readonly dirtyTileCount: number;
  readonly passCount: number;
  readonly pressureIterations: number;
  readonly simulationTicks: number;
  readonly elapsedMilliseconds: number;
  readonly fixedPigmentPolicy: "immutable";
  readonly dryingWindowSeconds: number;
  readonly fixDurationSeconds: 1.2;
  readonly determinism: "same-runtime-replay";
  readonly crossDeviceBitExact: false;
  readonly cpuOperationHashCrossDeviceDeterministic: true;
  readonly canonicalFrameAuthority: "first-rendered-rgba8-frame";
  readonly replayValidation: "bounded-visual-parity";
  readonly displayReadbackOrientation: "webgl-bottom-left-row-major";
  readonly gpuError: 0;
  readonly readbackFormat: "rgba8-staging-fbo";
  readonly imageOwnership: "caller-must-close";
  readonly contextRecovery: "worker-rebuild-journal-replay";
}

export interface StudioLivingInkExecutionFrame {
  readonly image: ImageBitmap;
  readonly receipt: StudioLivingInkExecutionReceipt;
}

/**
 * A simulation-only acknowledgement. It deliberately has no display hash or ImageBitmap: the
 * operation is already journaled and visible to the next explicit render, but no synchronous GPU
 * readback or presentation allocation was performed for this request.
 */
export interface StudioLivingInkExecutionApplied {
  readonly kind: "living-ink/applied";
  readonly version: typeof STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION;
  readonly engineVersion: typeof STUDIO_LIVING_INK_EXECUTION_ENGINE_VERSION;
  readonly requestId: number;
  readonly revision: number;
  readonly operationKind: StudioLivingInkOperation["kind"];
  readonly operationSha256: `sha256:${string}`;
  readonly backend: "webgl2-offscreen-half-float";
  readonly dirtyBounds: StudioLivingInkBounds;
  readonly dirtyTileCount: number;
  readonly passCount: number;
  readonly pressureIterations: number;
  readonly simulationTicks: number;
  readonly elapsedMilliseconds: number;
  readonly presented: false;
  readonly displayReadbackCount: 0;
  readonly imageBitmapCount: 0;
}

export type StudioLivingInkExecutionApplyResult =
  | StudioLivingInkExecutionFrame
  | StudioLivingInkExecutionApplied;

export interface StudioLivingInkExecutionApplyOptions {
  readonly simulationTicks?: number;
  readonly quality?: "interactive" | "settle";
  readonly displayMode?: StudioLivingInkDisplayMode;
  /**
   * Defaults to true for compatibility. False applies every operation and advances the journal,
   * while deferring readPixels/ImageBitmap work to an explicit render at the presentation cadence.
   */
  readonly present?: boolean;
}

interface StudioLivingInkWorkerRequestBase {
  readonly version: typeof STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION;
  readonly requestId: number;
}

export type StudioLivingInkWorkerRequest =
  | (StudioLivingInkWorkerRequestBase & Readonly<{
      type: "living-ink/probe";
    }>)
  | (StudioLivingInkWorkerRequestBase & Readonly<{
      type: "living-ink/initialize";
      config: StudioLivingInkExecutionConfig;
    }>)
  | (StudioLivingInkWorkerRequestBase & Readonly<{
      type: "living-ink/apply";
      operation: StudioLivingInkOperation;
      options: StudioLivingInkExecutionApplyOptions;
    }>)
  | (StudioLivingInkWorkerRequestBase & Readonly<{
      type: "living-ink/render";
      displayMode: StudioLivingInkDisplayMode;
    }>)
  | (StudioLivingInkWorkerRequestBase & Readonly<{
      type: "living-ink/cancel";
      targetRequestId: number;
    }>)
  | (StudioLivingInkWorkerRequestBase & Readonly<{
      type: "living-ink/dispose";
    }>);

interface StudioLivingInkWorkerResponseBase {
  readonly version: typeof STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION;
  readonly requestId: number;
}

export type StudioLivingInkWorkerResponse =
  | (StudioLivingInkWorkerResponseBase & Readonly<{
      type: "living-ink/capabilities";
      capabilities: StudioLivingInkExecutionCapabilities;
    }>)
  | (StudioLivingInkWorkerResponseBase & Readonly<{
      type: "living-ink/ready";
      capabilities: StudioLivingInkExecutionCapabilities;
    }>)
  | (StudioLivingInkWorkerResponseBase & Readonly<{
      type: "living-ink/frame";
      frame: StudioLivingInkExecutionFrame;
    }>)
  | (StudioLivingInkWorkerResponseBase & Readonly<{
      type: "living-ink/applied";
      applied: StudioLivingInkExecutionApplied;
    }>)
  | (StudioLivingInkWorkerResponseBase & Readonly<{
      type: "living-ink/cancelled";
      targetRequestId: number;
    }>)
  | (StudioLivingInkWorkerResponseBase & Readonly<{
      type: "living-ink/disposed";
    }>)
  | (StudioLivingInkWorkerResponseBase & Readonly<{
      /** Epoch-wide structured-clone/Worker failure; it is not tied to one pending request. */
      type: "living-ink/fatal";
      code: "invalid-message" | "unavailable" | "gpu-failure";
      message: string;
    }>)
  | (StudioLivingInkWorkerResponseBase & Readonly<{
      type: "living-ink/error";
      code:
        | "invalid-message"
        | "unavailable"
        | "not-ready"
        | "gpu-failure"
        | "budget-exceeded"
        | "cancelled";
      message: string;
    }>);

export function studioLivingInkWorkerResponseTransfers(
  response: StudioLivingInkWorkerResponse,
): Transferable[] {
  return response.type === "living-ink/frame" ? [response.frame.image] : [];
}
