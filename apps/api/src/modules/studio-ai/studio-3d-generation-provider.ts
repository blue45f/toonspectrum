export const STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION = 1 as const;

export const STUDIO_3D_GENERATION_IMAGE_LABELS = [
  "F",
  "FL",
  "FR",
  "B",
  "BL",
  "BR",
  "L",
  "R",
  "U",
  "D",
  "?",
] as const;

export type Studio3dGenerationImageLabel =
  (typeof STUDIO_3D_GENERATION_IMAGE_LABELS)[number];

export type Studio3dGenerationMode =
  | "text-to-3d"
  | "image-to-3d"
  | "multiview-to-3d"
  | "texture-only";

export type Studio3dGenerationTier =
  | "Gen-2.5-Extreme-Low"
  | "Gen-2.5-Low"
  | "Gen-2.5-Medium"
  | "Gen-2.5-High"
  | "Gen-2.5-Extreme-High";

export type Studio3dGenerationMeshMode = "Raw" | "Quad";
export type Studio3dGenerationQuality = "extra-low" | "low" | "medium" | "high";
export type Studio3dGenerationFormat = "glb" | "usdz" | "fbx" | "obj" | "stl";
export type Studio3dGenerationMaterial = "PBR" | "Shaded" | "Hybrid" | "All" | "None";
export type Studio3dGenerationTextureMode =
  | "legacy"
  | "extreme-low"
  | "low"
  | "medium"
  | "high"
  | "extreme-high";
export type Studio3dGenerationSymmetry =
  | "symmetric"
  | "balanced"
  | "asymmetric"
  | "unknown";

export interface Studio3dGenerationBinary {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface Studio3dGenerationImage extends Studio3dGenerationBinary {
  readonly label?: Studio3dGenerationImageLabel;
}

export interface Studio3dGenerationOptions {
  readonly tier?: Studio3dGenerationTier;
  readonly meshMode?: Studio3dGenerationMeshMode;
  readonly quality?: Studio3dGenerationQuality;
  readonly targetFaceCount?: number;
  readonly geometryFormat?: Studio3dGenerationFormat;
  readonly material?: Studio3dGenerationMaterial;
  readonly textureMode?: Studio3dGenerationTextureMode;
  readonly seed?: number;
  readonly boundingBox?: readonly [number, number, number];
  readonly symmetry?: Studio3dGenerationSymmetry;
  readonly taPose?: boolean;
  readonly preserveAlpha?: boolean;
  readonly previewRender?: boolean;
  readonly highDefinitionTexture?: boolean;
  readonly ultraHighDefinitionTexture?: boolean;
  readonly highPack?: boolean;
  readonly geometryInstructionMode?: "faithful" | "creative";
  readonly textureDelight?: boolean;
  readonly textureResolution?: "Basic" | "High";
  readonly textureReferenceScale?: number;
  readonly textureComplexity?: number;
}

export interface Studio3dGenerationRequest {
  readonly schemaVersion: typeof STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION;
  /** Caller-owned idempotency identity. Providers must not replace it with a task UUID. */
  readonly requestId: string;
  readonly mode: Studio3dGenerationMode;
  readonly prompt?: string;
  readonly images?: readonly Studio3dGenerationImage[];
  readonly model?: Studio3dGenerationBinary;
  readonly options?: Studio3dGenerationOptions;
}

export interface Studio3dGenerationCapabilities {
  readonly schemaVersion: typeof STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION;
  readonly providerId: string;
  readonly modes: readonly Studio3dGenerationMode[];
  readonly maxImages: number;
  readonly supportedFormats: readonly Studio3dGenerationFormat[];
  readonly supportsCancellation: boolean;
  readonly firstPollDelayMs: number;
  readonly maxPollDelayMs: number;
  readonly deadlineMs: number;
}

export interface Studio3dGenerationSubmission {
  readonly schemaVersion: typeof STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION;
  readonly providerId: string;
  readonly requestId: string;
  /** Provider task identity used only by the download endpoint. */
  readonly taskUuid: string;
  /** Provider subscription identity used only by the status endpoint. */
  readonly subscriptionKey: string;
  readonly jobUuids: readonly string[];
  readonly consumedCredits: number | null;
  readonly submittedAt: string;
}

export interface Studio3dGenerationJobIdentity {
  readonly providerId: string;
  readonly requestId: string;
  readonly taskUuid: string;
  readonly subscriptionKey: string;
  readonly jobUuids: readonly string[];
}

export type Studio3dGenerationJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface Studio3dGenerationJobProgress {
  readonly jobUuid: string;
  readonly status: string;
  readonly progressPercent: number | null;
}

export interface Studio3dGenerationProgress {
  readonly schemaVersion: typeof STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION;
  readonly providerId: string;
  readonly requestId: string;
  readonly state: Studio3dGenerationJobState;
  readonly jobs: readonly Studio3dGenerationJobProgress[];
  readonly retryAfterMs: number | null;
}

export interface Studio3dGenerationArtifact {
  readonly name: string;
  /** Signed provider URL. The server must internalize it immediately; never persist it long-term. */
  readonly url: string;
}

export interface Studio3dGenerationArtifacts {
  readonly schemaVersion: typeof STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION;
  readonly providerId: string;
  readonly requestId: string;
  readonly taskUuid: string;
  readonly artifacts: readonly Studio3dGenerationArtifact[];
}

export type Studio3dGenerationProviderErrorCode =
  | "not-configured"
  | "invalid-request"
  | "cancelled"
  | "timeout"
  | "rate-limited"
  | "authentication"
  | "provider-rejected"
  | "provider-unavailable"
  | "invalid-response"
  | "generation-failed";

export class Studio3dGenerationProviderError extends Error {
  readonly code: Studio3dGenerationProviderErrorCode;
  readonly retryable: boolean;
  readonly responseStatus: number | null;
  readonly retryAfterMs: number | null;
  readonly providerCode: string | null;

  constructor(options: {
    readonly code: Studio3dGenerationProviderErrorCode;
    readonly message: string;
    readonly retryable?: boolean;
    readonly responseStatus?: number | null;
    readonly retryAfterMs?: number | null;
    readonly providerCode?: string | null;
  }) {
    super(options.message);
    this.name = "Studio3dGenerationProviderError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.responseStatus = options.responseStatus ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.providerCode = options.providerCode ?? null;
  }
}

export interface Studio3dGenerationProvider {
  readonly providerId: string;
  capabilities(): Promise<Studio3dGenerationCapabilities>;
  submit(
    request: Studio3dGenerationRequest,
    signal: AbortSignal
  ): Promise<Studio3dGenerationSubmission>;
  poll(
    job: Studio3dGenerationJobIdentity,
    signal: AbortSignal
  ): Promise<Studio3dGenerationProgress>;
  download(
    job: Studio3dGenerationJobIdentity,
    signal: AbortSignal
  ): Promise<Studio3dGenerationArtifacts>;
  cancel?(job: Studio3dGenerationJobIdentity, signal: AbortSignal): Promise<void>;
}
