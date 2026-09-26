import { api, httpStatus } from "@/platform/api";

export type CreatorIntelligenceReferenceProvider = "openverse" | "pexels" | "pixabay";
export type CreatorIntelligenceReferenceMediaType = "image" | "video";
export type CreatorIntelligenceTranslationProvider = "deepl" | "libretranslate";
export type CreatorIntelligenceVoiceProvider = "gemini" | "deepgram";
export type CreatorIntelligenceProviderState = "ready" | "not_configured" | "disabled";

export interface CreatorIntelligenceProviderStatus {
  readonly status: CreatorIntelligenceProviderState;
  readonly reason: string;
}

export interface CreatorIntelligenceStatus {
  readonly schema: "toonspectrum.creator-intelligence.status.v1";
  readonly references: Readonly<Record<CreatorIntelligenceReferenceProvider, CreatorIntelligenceProviderStatus>>;
  readonly translation: Readonly<Record<CreatorIntelligenceTranslationProvider, CreatorIntelligenceProviderStatus>>;
  readonly voice: Readonly<Record<CreatorIntelligenceVoiceProvider, CreatorIntelligenceProviderStatus>>;
  readonly scene: CreatorIntelligenceProviderStatus;
  readonly anilist: CreatorIntelligenceProviderStatus;
  readonly freesound: CreatorIntelligenceProviderStatus;
  readonly soundEffects: CreatorIntelligenceProviderStatus;
  readonly meshy: CreatorIntelligenceProviderStatus;
  readonly safeSearch: CreatorIntelligenceProviderStatus;
  readonly paidExecution?: {
    readonly enabled: boolean;
    readonly distributed: boolean;
    readonly requiresAuthentication: true;
    readonly requiresIdempotencyKey: true;
    readonly failClosedInProduction: true;
    readonly reason: "ready" | "disabled" | "coordination-required";
  };
  readonly meshArtifacts?: {
    readonly configured: boolean;
    readonly requiredInProduction: true;
    readonly providerUrlsReturnedInProduction: false;
  };
}

export interface CreatorIntelligenceReference {
  readonly id: string;
  readonly provider: CreatorIntelligenceReferenceProvider;
  readonly mediaType: CreatorIntelligenceReferenceMediaType;
  readonly title: string;
  readonly creator: string;
  readonly sourceUrl: string;
  readonly previewUrl?: string;
  readonly creatorUrl?: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly durationSeconds?: number | null;
  readonly rightsStatus: "verify-source" | "provider-license";
  readonly importable: false;
  readonly fetchedAt: string;
}

export interface ReferenceSearchResponse {
  readonly provider: CreatorIntelligenceReferenceProvider;
  readonly mediaType: CreatorIntelligenceReferenceMediaType;
  readonly status: CreatorIntelligenceProviderState;
  readonly page: number;
  readonly items: readonly CreatorIntelligenceReference[];
  readonly hasMore: boolean;
  readonly notice?: string;
  readonly cache?: {
    readonly hit: boolean;
    readonly ttlSeconds: number;
  };
}

export interface SceneReferenceResponse {
  readonly status: CreatorIntelligenceProviderState;
  readonly date?: string;
  readonly timezone?: string;
  readonly fetchedAt?: string;
  readonly attribution?: string;
  readonly message?: string;
  readonly location?: {
    readonly latitude: number;
    readonly longitude: number;
    readonly label: string;
  } | null;
  readonly weather?: {
    readonly weatherCode: number | null;
    readonly temperatureMaxC: number | null;
    readonly temperatureMinC: number | null;
    readonly precipitationMm: number | null;
    readonly sunrise: string;
    readonly sunset: string;
    readonly daylightSeconds: number | null;
    readonly sunshineSeconds: number | null;
  } | null;
}

export interface AniListReference {
  readonly id: string;
  readonly type: string;
  readonly format: string;
  readonly status: string;
  readonly title: string;
  readonly nativeTitle: string;
  readonly year: number | null;
  readonly genres: readonly string[];
  readonly description: string;
  readonly sourceUrl: string;
  readonly rightsStatus: "metadata-only";
}

export interface AniListResponse {
  readonly status: CreatorIntelligenceProviderState;
  readonly items: readonly AniListReference[];
  readonly notice?: string;
}

export interface SoundEffectReference {
  readonly id: string;
  readonly title: string;
  readonly creator: string;
  readonly sourceUrl: string;
  readonly previewUrl: string;
  readonly license: string;
  readonly durationSeconds: number | null;
  readonly tags: readonly string[];
  readonly rightsStatus: "verify-item-license";
}

export interface SoundSearchResponse {
  readonly status: CreatorIntelligenceProviderState;
  readonly page?: number;
  readonly items: readonly SoundEffectReference[];
  readonly hasMore?: boolean;
  readonly notice?: string;
}

export interface TranslateResponse {
  readonly status: CreatorIntelligenceProviderState;
  readonly provider: CreatorIntelligenceTranslationProvider;
  readonly text?: string;
  readonly detectedSourceLanguage?: string;
}

export interface VoiceSynthesizeResponse {
  readonly status: CreatorIntelligenceProviderState;
  readonly provider: CreatorIntelligenceVoiceProvider;
  readonly model?: string;
  readonly voice?: string;
  readonly mimeType?: "audio/wav" | "audio/mpeg";
  readonly audioBase64?: string;
  readonly generatedAt?: string;
}

export interface SoundGenerateResponse {
  readonly status: CreatorIntelligenceProviderState;
  readonly provider?: "elevenlabs";
  readonly mimeType?: "audio/mpeg";
  readonly audioBase64?: string;
  readonly prompt?: string;
  readonly generatedAt?: string;
}

export interface MeshyJobResponse {
  readonly status: CreatorIntelligenceProviderState;
  readonly provider?: "meshy";
  readonly jobId?: string;
  readonly jobStatus?: string;
  readonly progress?: number | null;
  readonly glbUrl?: string;
  readonly thumbnailUrl?: string;
  readonly taskError?: string;
}

export interface SafeSearchResponse {
  readonly status: CreatorIntelligenceProviderState;
  readonly provider?: "google-vision";
  readonly values?: Readonly<Record<"adult" | "spoof" | "medical" | "violence" | "racy", string>>;
  readonly reviewRequired?: boolean;
  readonly policy?: "flag-for-human-review";
}

// These discovery reads are public and never depend on user identity. Omitting
// ambient cookies also keeps the reference vault available when session-backed
// account services are temporarily unavailable.
const PUBLIC_DISCOVERY_REQUEST = Object.freeze({ credentials: "omit" as const });

const PAID_REQUEST_KEY_TTL_MS = 15 * 60_000;
const PAID_REQUEST_KEY_CAPACITY = 128;
let requestSequence = 0;
const pendingPaidRequestKeys = new Map<string, {
  readonly key: string;
  readonly expiresAt: number;
}>();

function stableRequestJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(stableRequestJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableRequestJson(record[key])}`)
    .join(",")}}`;
}

function cleanupPaidRequestKeys(now: number): void {
  for (const [identity, entry] of pendingPaidRequestKeys) {
    if (entry.expiresAt <= now) pendingPaidRequestKeys.delete(identity);
  }
  while (pendingPaidRequestKeys.size > PAID_REQUEST_KEY_CAPACITY) {
    const oldest = pendingPaidRequestKeys.keys().next().value;
    if (oldest === undefined) break;
    pendingPaidRequestKeys.delete(oldest);
  }
}

function compactRequestIdentity(value: string): string {
  let first = 5_381;
  let second = 52_711;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = (first * 33 + code) % 2_147_483_647;
    second = (second * 65_599 + code) % 2_147_483_629;
  }
  return `${value.length.toString(36)}-${first.toString(36)}-${second.toString(36)}`;
}

function paidRequestKey(prefix: string, payload: unknown): {
  readonly identity: string;
  readonly key: string;
} {
  const now = Date.now();
  cleanupPaidRequestKeys(now);
  const identity = `${prefix}:${compactRequestIdentity(stableRequestJson(payload))}`;
  const existing = pendingPaidRequestKeys.get(identity);
  if (existing) return { identity, key: existing.key };
  requestSequence += 1;
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${now.toString(36)}-${requestSequence.toString(36)}`;
  const key = `${prefix}-${suffix}`;
  pendingPaidRequestKeys.set(identity, {
    key,
    expiresAt: now + PAID_REQUEST_KEY_TTL_MS,
  });
  return { identity, key };
}

function paidRequestOptions(key: string, signal?: AbortSignal) {
  return {
    signal,
    timeout: 55_000,
    retry: 0,
    headers: { "Idempotency-Key": key },
  } as const;
}

async function paidPost<T>(
  path: string,
  payload: unknown,
  prefix: string,
  signal?: AbortSignal,
): Promise<T> {
  const request = paidRequestKey(prefix, payload);
  try {
    const result = await api.post<T>(
      path,
      payload,
      paidRequestOptions(request.key, signal),
    );
    if (pendingPaidRequestKeys.get(request.identity)?.key === request.key) {
      pendingPaidRequestKeys.delete(request.identity);
    }
    return result;
  } catch (error) {
    const status = httpStatus(error);
    // A definite pre-dispatch rejection is safe to submit again with a new key after the caller
    // fixes authentication, input, or quota state. Transport errors, 409 receipts, 5xx responses,
    // and timeouts retain the original key so an uncertain provider outcome can never be charged
    // twice by a manual retry.
    if (status !== null && [400, 401, 403, 404, 422, 429, 503].includes(status)) {
      if (pendingPaidRequestKeys.get(request.identity)?.key === request.key) {
        pendingPaidRequestKeys.delete(request.identity);
      }
    }
    throw error;
  }
}

export const creatorIntelligenceClient = {
  status: () => api.get<CreatorIntelligenceStatus>(
    "/creator-intelligence/status",
    PUBLIC_DISCOVERY_REQUEST,
  ),
  references: (
    provider: CreatorIntelligenceReferenceProvider,
    query: string,
    page = 1,
    media: CreatorIntelligenceReferenceMediaType = "image",
  ) => api.get<ReferenceSearchResponse>("/creator-intelligence/references", {
    ...PUBLIC_DISCOVERY_REQUEST,
    params: { provider, q: query, page, media },
  }),
  scene: (place: string, date: string) =>
    api.get<SceneReferenceResponse>("/creator-intelligence/scene", {
      ...PUBLIC_DISCOVERY_REQUEST,
      params: { place, date },
    }),
  anilist: (query: string, type: "MANGA" | "ANIME") =>
    api.get<AniListResponse>("/creator-intelligence/anilist", {
      ...PUBLIC_DISCOVERY_REQUEST,
      params: { q: query, type },
    }),
  soundSearch: (query: string, page = 1) =>
    api.get<SoundSearchResponse>("/creator-intelligence/sfx/search", {
      ...PUBLIC_DISCOVERY_REQUEST,
      params: { q: query, page },
    }),
  voiceSynthesize: (input: {
    readonly provider: CreatorIntelligenceVoiceProvider;
    readonly text: string;
    readonly style?: string;
    readonly voice?: string;
    readonly language?: string;
  }, signal?: AbortSignal) =>
    paidPost<VoiceSynthesizeResponse>(
      "/creator-intelligence/voice/synthesize",
      input,
      "voice",
      signal,
    ),
  soundGenerate: (prompt: string, durationSeconds: number, loop: boolean) =>
    paidPost<SoundGenerateResponse>(
      "/creator-intelligence/sfx/generate",
      { prompt, durationSeconds, loop },
      "sfx",
    ),
  translate: (input: {
    readonly provider: CreatorIntelligenceTranslationProvider;
    readonly text: string;
    readonly targetLanguage: string;
    readonly sourceLanguage?: string;
    readonly glossaryId?: string;
  }) => paidPost<TranslateResponse>(
    "/creator-intelligence/translate",
    input,
    "translation",
  ),
  meshCreate: (imageUrl: string) =>
    paidPost<MeshyJobResponse>(
      "/creator-intelligence/mesh/jobs",
      { imageUrl },
      "mesh",
    ),
  meshStatus: (jobId: string) =>
    api.get<MeshyJobResponse>(`/creator-intelligence/mesh/jobs/${encodeURIComponent(jobId)}`),
  safeSearch: (dataUrl: string) =>
    paidPost<SafeSearchResponse>(
      "/creator-intelligence/preflight/safe-search",
      { dataUrl },
      "safe-search",
    ),
};
