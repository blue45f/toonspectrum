import { api } from "@/infrastructure/api";

export type CreatorIntelligenceReferenceProvider = "openverse" | "pexels" | "pixabay";
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
}

export interface CreatorIntelligenceReference {
  readonly id: string;
  readonly provider: CreatorIntelligenceReferenceProvider;
  readonly title: string;
  readonly creator: string;
  readonly sourceUrl: string;
  readonly previewUrl?: string;
  readonly creatorUrl?: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly rightsStatus: "verify-source" | "provider-license";
  readonly importable: false;
  readonly fetchedAt: string;
}

export interface ReferenceSearchResponse {
  readonly provider: CreatorIntelligenceReferenceProvider;
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

export const creatorIntelligenceClient = {
  status: () => api.get<CreatorIntelligenceStatus>(
    "/creator-intelligence/status",
    PUBLIC_DISCOVERY_REQUEST,
  ),
  references: (provider: CreatorIntelligenceReferenceProvider, query: string, page = 1) =>
    api.get<ReferenceSearchResponse>("/creator-intelligence/references", {
      ...PUBLIC_DISCOVERY_REQUEST,
      params: { provider, q: query, page },
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
    api.post<VoiceSynthesizeResponse>(
      "/creator-intelligence/voice/synthesize",
      input,
      { signal, timeout: 55_000, retry: 0 },
    ),
  soundGenerate: (prompt: string, durationSeconds: number, loop: boolean) =>
    api.post<SoundGenerateResponse>("/creator-intelligence/sfx/generate", { prompt, durationSeconds, loop }),
  translate: (input: {
    readonly provider: CreatorIntelligenceTranslationProvider;
    readonly text: string;
    readonly targetLanguage: string;
    readonly sourceLanguage?: string;
    readonly glossaryId?: string;
  }) => api.post<TranslateResponse>("/creator-intelligence/translate", input),
  meshCreate: (imageUrl: string) =>
    api.post<MeshyJobResponse>("/creator-intelligence/mesh/jobs", { imageUrl }),
  meshStatus: (jobId: string) =>
    api.get<MeshyJobResponse>(`/creator-intelligence/mesh/jobs/${encodeURIComponent(jobId)}`),
  safeSearch: (dataUrl: string) =>
    api.post<SafeSearchResponse>("/creator-intelligence/preflight/safe-search", { dataUrl }),
};
