import type { MusicBrief, MusicProviderId as StoredMusicProviderId } from "@toonspectrum/core/studio-music";

export type MusicProviderCapability = "browser" | "api" | "cli" | "mcp" | "local";
export type MusicProviderPublicationPolicy =
  | "site-original"
  | "commercial-review"
  | "license-review"
  | "draft-only";

export interface MusicProviderMcpSetup {
  readonly serverUrl: string;
  readonly auth: "oauth" | "api-key";
  readonly clientId?: string;
}

export interface MusicProviderCliSetup {
  readonly install?: string;
  readonly command: string;
  readonly auth?: string;
}

export const MUSIC_PROVIDER_IDS = [
  "ace-step-local",
  "adobe-firefly",
  "soundverse",
  "elevenlabs",
  "suno",
  "stable-audio",
  "mubert",
  "udio",
] as const satisfies readonly Exclude<StoredMusicProviderId, "external">[];

export type MusicProviderId = (typeof MUSIC_PROVIDER_IDS)[number];

export interface MusicProviderCatalogEntry {
  readonly id: MusicProviderId;
  readonly name: string;
  readonly homeUrl: string;
  readonly signup: "none" | "google" | "account";
  readonly freeAccess: string;
  readonly capabilities: readonly MusicProviderCapability[];
  readonly publicationPolicy: MusicProviderPublicationPolicy;
  readonly recommendedFor: string;
  readonly rightsNote: string;
  readonly mcp?: MusicProviderMcpSetup;
  readonly cli?: MusicProviderCliSetup;
}

export const MUSIC_PROVIDER_VERIFIED_AT = "2026-09-25";
export const MUSIC_PROVIDER_CATALOG: readonly MusicProviderCatalogEntry[] = [
  {
    id: "ace-step-local",
    name: "ACE-Step 1.5",
    homeUrl: "https://github.com/ace-step/ACE-Step-1.5",
    signup: "none",
    freeAccess: "로컬 실행 · 생성량 제한 없음",
    capabilities: ["local", "cli", "api"],
    publicationPolicy: "site-original",
    recommendedFor: "사이트 전역 BGM·OST 마스터와 반복 가능한 배치 생성",
    rightsNote: "모델·프롬프트·seed·원본 해시·QC를 함께 보관한 검수 완료 출력만 게시합니다.",
    cli: {
      command: "python cli.py 또는 로컬 REST API",
      auth: "불필요",
    },
  },
  {
    id: "adobe-firefly",
    name: "Adobe Firefly Generate Music",
    homeUrl: "https://firefly.adobe.com/generate/audio",
    signup: "google",
    freeAccess: "Adobe 계정의 무료 일일 생성",
    capabilities: ["browser"],
    publicationPolicy: "commercial-review",
    recommendedFor: "영상·웹툰·게임용 맞춤 길이 연주 BGM",
    rightsNote: "Adobe가 상업적으로 안전한 royalty-free 음악으로 안내하지만 WAV·Content Credentials와 생성 기록을 보관합니다.",
  },
  {
    id: "soundverse",
    name: "Soundverse",
    homeUrl: "https://www.soundverse.ai/",
    signup: "google",
    freeAccess: "가입 계정 무료 토큰",
    capabilities: ["browser", "api", "mcp"],
    publicationPolicy: "license-review",
    recommendedFor: "노래·연주곡·스템·리믹스·저작권 인식 작업",
    rightsNote: "API 호출마다 선택한 license tier와 비용 원장을 결과 파일과 함께 기록해야 합니다.",
    mcp: {
      serverUrl: "https://mcp.soundverse.ai/mcp",
      auth: "oauth",
      clientId: "jt7cp9hv4m9idkuyv2gt0",
    },
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs Music",
    homeUrl: "https://elevenlabs.io/app/music",
    signup: "google",
    freeAccess: "월 10,000크레딧 · 개인 사용",
    capabilities: ["browser", "api", "cli", "mcp"],
    publicationPolicy: "draft-only",
    recommendedFor: "가사·보컬 음악, 효과음과 음성까지 묶은 제작",
    rightsNote: "무료 결과는 시안 전용입니다. 상업용은 생성 당시 유료 플랜의 허용 범위와 사용 크레딧을 개별 결과에 남깁니다.",
    mcp: {
      serverUrl: "https://api.elevenlabs.io/v1/mcp",
      auth: "oauth",
    },
    cli: {
      install: "npm i -g @elevenlabs/cli",
      command: "elevenlabs auth login",
      auth: "브라우저 OAuth",
    },
  },
  {
    id: "suno",
    name: "Suno",
    homeUrl: "https://suno.com/create",
    signup: "google",
    freeAccess: "매일 50크레딧 · 비상업",
    capabilities: ["browser"],
    publicationPolicy: "draft-only",
    recommendedFor: "보컬곡·가사·장르 아이디어의 빠른 시안",
    rightsNote: "무료 플랜 결과는 시안 전용으로 취급하고 상업 권리가 확인된 별도 결과만 검수 대상으로 올립니다.",
  },
  {
    id: "stable-audio",
    name: "Stable Audio",
    homeUrl: "https://stableaudio.com/generate",
    signup: "google",
    freeAccess: "웹 월 50크레딧(비상업) · API 가입 25크레딧",
    capabilities: ["browser", "api"],
    publicationPolicy: "license-review",
    recommendedFor: "효과음·루프·배경음과 검수된 일회성 API 시안",
    rightsNote: "웹 Free 출력은 비상업 시안입니다. 개발자 API 가입 크레딧은 1회성이므로 운영 자동 호출을 켜지 않고, 생성 당시 상업 허용 증빙이 있는 결과만 게시 검토합니다.",
  },
  {
    id: "mubert",
    name: "Mubert Render",
    homeUrl: "https://mubert.com/render",
    signup: "google",
    freeAccess: "월 25곡·5회 MP3 · 비상업",
    capabilities: ["browser", "api"],
    publicationPolicy: "draft-only",
    recommendedFor: "길이와 분위기가 명확한 영상용 연주 BGM 시안",
    rightsNote: "무료 결과는 비상업 시안으로 취급하고 유료 라이선스가 확인된 파일만 외부 게시 검토에 사용합니다.",
  },
  {
    id: "udio",
    name: "Udio",
    homeUrl: "https://www.udio.com/create",
    signup: "google",
    freeAccess: "일 10·월 100크레딧 · 다운로드 중단",
    capabilities: ["browser"],
    publicationPolicy: "draft-only",
    recommendedFor: "곡 구조·보컬·리믹스 아이디어 탐색",
    rightsNote: "다운로드 가능 상태와 생성 시점의 이용 조건을 다시 확인한 뒤 시안 밖으로 반출합니다.",
  },
];

export interface MusicProviderHandoff {
  readonly version: 1;
  readonly createdAt: string;
  readonly verifiedAt: string;
  readonly reviewRequired: true;
  readonly autoPublish: false;
  readonly provider: {
    readonly id: MusicProviderId;
    readonly name: string;
    readonly homeUrl: string;
    readonly capabilities: readonly MusicProviderCapability[];
    readonly publicationPolicy: MusicProviderPublicationPolicy;
  };
  readonly prompt: string;
  readonly brief: {
    readonly title: string;
    readonly scene: string;
    readonly purpose: string;
    readonly mood: string;
    readonly seconds: number;
    readonly bpm: number;
    readonly instruments: readonly string[];
    readonly vocals: boolean;
    readonly lyricsLanguage: string;
    readonly lyrics: string;
    readonly workId: string;
    readonly episodeId: string;
    readonly sourceRightsConfirmed: boolean;
  };
  readonly rightsChecklist: readonly string[];
  readonly outputChecklist: readonly string[];
}
export function findMusicProvider(providerId: string): MusicProviderCatalogEntry {
  const provider = MUSIC_PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error("지원하지 않는 AI 음악 서비스입니다.");
  return provider;
}

export function musicProviderLabel(providerId: StoredMusicProviderId): string {
  if (providerId === "external") return "외부 음원";
  return MUSIC_PROVIDER_CATALOG.find((candidate) => candidate.id === providerId)?.name ?? providerId;
}

export function buildMusicProviderHandoff(
  providerId: MusicProviderId,
  brief: MusicBrief,
  prompt: string,
  createdAt = new Date().toISOString(),
): MusicProviderHandoff {
  const provider = findMusicProvider(providerId);
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt || normalizedPrompt.length > 5_000) {
    throw new Error("외부 생성 서비스로 전달할 음악 프롬프트를 확인해 주세요.");
  }
  return {
    version: 1,
    createdAt,
    verifiedAt: MUSIC_PROVIDER_VERIFIED_AT,
    reviewRequired: true,
    autoPublish: false,
    provider: {
      id: provider.id as MusicProviderId,
      name: provider.name,
      homeUrl: provider.homeUrl,
      capabilities: provider.capabilities,
      publicationPolicy: provider.publicationPolicy,
    },
    prompt: normalizedPrompt,
    brief: {
      title: brief.title,
      scene: brief.scene,
      purpose: brief.purpose,
      mood: brief.mood,
      seconds: brief.seconds,
      bpm: brief.bpm,
      instruments: [...brief.instruments],
      vocals: brief.vocals,
      lyricsLanguage: brief.lyricsLanguage,
      lyrics: brief.vocals ? brief.lyrics : "",
      workId: brief.workId,
      episodeId: brief.episodeId,
      sourceRightsConfirmed: brief.rightsConfirmed,
    },
    rightsChecklist: [
      "입력 장면·가사·참조 오디오의 사용 권리를 확인한다.",
      "생성 시점의 플랜·license tier·상업/동기화/배포 허용 범위를 캡처한다.",
      "유명 가수·작가·작품의 모사 요청과 무권리 커버곡을 제외한다.",
      "외부 결과를 자동 게시하지 않고 운영자 청음·권리 검수를 거친다.",
    ],
    outputChecklist: [
      "원본 파일과 provider project/song ID를 함께 보관한다.",
      "SHA-256, 포맷, 길이, loudness, 생성 시각을 기록한다.",
      "필요 시 스템·Content Credentials·license 영수증을 보관한다.",
      "사이트 게시 전 지속 가능한 HTTPS MP3와 출처 메타데이터를 만든다.",
    ],
  };
}
