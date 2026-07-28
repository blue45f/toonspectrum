export const STUDIO_P5_BRUSH_REAL_RUNTIME_CASE_IDS = Object.freeze([
  "flow-field",
  "hatch",
  "mass",
  "watercolor-fill",
  "flat-wash",
] as const);

export type StudioP5BrushRealRuntimeCaseId =
  (typeof STUDIO_P5_BRUSH_REAL_RUNTIME_CASE_IDS)[number];

export interface StudioP5BrushRealRuntimePixelEvidence {
  readonly byteLength: number;
  readonly pixelHash: `sha256:${string}`;
  readonly alphaSum: number;
  readonly nonTransparentPixels: number;
  readonly paintedPixels: number;
  readonly paintedBounds: Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }> | null;
}

export interface StudioP5BrushRealRuntimeCaseEvidence {
  readonly id: StudioP5BrushRealRuntimeCaseId;
  readonly technique: StudioP5BrushRealRuntimeCaseId;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly first: StudioP5BrushRealRuntimePixelEvidence;
  readonly replay: StudioP5BrushRealRuntimePixelEvidence;
  readonly exactPixelReplay: boolean;
  readonly quality: Readonly<{
    readonly ok: boolean;
    readonly findings: readonly Readonly<{
      readonly code: string;
      readonly message: string;
    }>[];
    readonly metrics: Readonly<{
      readonly paintedCoverage: number;
      readonly boundsCanvasCoverage: number;
      readonly boundsOccupancy: number;
      readonly colorBucketCount: number;
      readonly luminanceStandardDeviation: number;
      readonly neighborLinkRatio: number;
      readonly edgeDensity: number;
      readonly textureScore: number;
      readonly scratchByteLength: number;
    }> | null;
  }>;
  readonly capability: `procedural:${StudioP5BrushRealRuntimeCaseId}`;
  readonly adapterId: "p5-brush-standalone-worker";
  readonly adapterCompatibility: "p5.brush/standalone";
  readonly execution: Readonly<{
    stage: "settled";
    locality: "dedicated-worker";
    surface: "offscreen-canvas-webgl2";
    backend: "webgl2";
    mainThreadFallback: false;
  }>;
}

export interface StudioP5BrushRealRuntimeCapabilities {
  readonly worker: true;
  readonly dedicatedWorkerScope: true;
  readonly workerScopeConstructor: string;
  readonly offscreenCanvas: true;
  readonly webgl2: true;
  readonly webglVersion: string;
  readonly webglVendor: string;
  readonly webglRenderer: string;
  readonly unmaskedVendor: string | null;
  readonly unmaskedRenderer: string | null;
}

export type StudioP5BrushRealWorkerResult =
  | Readonly<{
      status: "ok";
      backend: "p5.brush/standalone-offscreen-webgl2";
      adapterVersion: string;
      capabilities: StudioP5BrushRealRuntimeCapabilities;
      cases: readonly StudioP5BrushRealRuntimeCaseEvidence[];
      surfaceCount: number;
    }>
  | Readonly<{
      status: "unsupported";
      reason: "webgl2-unavailable";
      message: string;
      probe: Readonly<{
        dedicatedWorkerScope: boolean;
        offscreenCanvas: boolean;
        webgl2ContextAttempted: true;
      }>;
    }>
  | Readonly<{
      status: "error";
      message: string;
      stack: string | null;
      probe: Readonly<{
        dedicatedWorkerScope: boolean;
        offscreenCanvas: boolean;
        webgl2ContextAttempted: boolean;
      }>;
    }>;

export interface StudioP5BrushSecurityPolicyViolation {
  readonly blockedUri: string;
  readonly effectiveDirective: string;
  readonly violatedDirective: string;
  readonly disposition: string;
}

export interface StudioP5BrushRealBrowserResult {
  readonly workerResult: StudioP5BrushRealWorkerResult;
  readonly freshWorkerReplay: StudioP5BrushRealWorkerResult;
  readonly mainThread: Readonly<{
    worker: boolean;
    userAgent: string;
  }>;
  readonly securityPolicyViolations:
    readonly StudioP5BrushSecurityPolicyViolation[];
}
