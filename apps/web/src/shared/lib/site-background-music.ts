import type { BgmPlaylistEntry } from "@toonspectrum/core/fx";

export type SiteOstRole = "opening" | "creator" | "story" | "action" | "romance" | "ending";
export type SiteOstVocalMode = "vocal" | "instrumental";
export type SiteOstProfile = "animation" | "webtoon" | "lofi" | "cinematic" | "fantasy" | "citypop";
export type SiteOstStylePreference = "auto" | SiteOstProfile;
export type SiteOstIntensity = "chill" | "normal" | "epic";
export type SiteOstVocalPreference = "auto" | SiteOstVocalMode;
export type SiteOstProvider = "elevenlabs" | "ace-step";
export type SiteOstModel = "music_v2_5" | "acestep-v15-turbo";
export type SiteOstProvenance = "c2pa-requested" | "local-generation-recorded";

export interface SiteBgmExperience {
  readonly id: string;
  readonly moodId: string;
  readonly label: string;
  readonly labelEn: string;
  readonly description: string;
  readonly descriptionEn: string;
  readonly ostRole: SiteOstRole;
  readonly fallbackTrackIndex: number;
  readonly suspended: boolean;
  readonly suspensionReason: string;
}

export interface SiteBgmPreferenceSnapshot {
  readonly followRoute: boolean;
  readonly expanded: boolean;
  readonly style: SiteOstStylePreference;
  readonly intensity: SiteOstIntensity;
  readonly vocals: SiteOstVocalPreference;
}

export interface SiteOstTrack {
  readonly id: string;
  readonly src: string;
  readonly title: string;
  readonly artist: string;
  readonly role: SiteOstRole;
  readonly origin: "original";
  readonly vocalMode: SiteOstVocalMode;
  readonly language: string;
  readonly summary: string;
  readonly license: string;
  readonly creditUrl: string;
  readonly profiles: readonly SiteOstProfile[];
  readonly intensity: SiteOstIntensity;
  readonly durationMs: number;
  readonly bpm: number;
  readonly provider: SiteOstProvider;
  readonly model: SiteOstModel;
  readonly sha256: string;
  readonly generatedAt: string;
  readonly provenance: SiteOstProvenance;
  readonly c2paRequested?: true;
  readonly generatorRevision?: string;
  readonly status: "published";
  readonly songId?: string;
}

const FOLLOW_KEY = "ts_site_bgm_follow_route";
const EXPANDED_KEY = "ts_site_bgm_expanded";
const STYLE_KEY = "ts_site_bgm_style";
const INTENSITY_KEY = "ts_site_bgm_intensity";
const VOCALS_KEY = "ts_site_bgm_vocals";

const PROFILES: readonly SiteOstProfile[] = ["animation", "webtoon", "lofi", "cinematic", "fantasy", "citypop"];
const INTENSITIES: readonly SiteOstIntensity[] = ["chill", "normal", "epic"];
const VOCAL_PREFERENCES: readonly SiteOstVocalPreference[] = ["auto", "vocal", "instrumental"];

const THEMES = {
  home: theme("home", "pop", "툰스펙트럼 오프닝", "ToonSpectrum opening", "첫 화면에서 창작의 세계가 열리는 대표 오프닝", "The flagship opening that starts the creative world", "opening", 0),
  creator: theme("creator", "atelier_focus", "창작자 테마", "Creator theme", "긴 작업 흐름을 해치지 않는 창작자 중심 테마", "A creator-first theme that stays out of the way during long work", "creator", 0),
  story: theme("story", "worldbuilding", "세계관 메인 테마", "Story-world theme", "인물과 세계가 확장되는 시네마틱 메인 테마", "A cinematic main theme for expanding characters and worlds", "story", 0),
  production: theme("production", "synthwave", "클라이맥스 드라이브", "Climax drive", "제작·리뷰·게시의 추진력을 높이는 액션 테마", "A driving action theme for production, review and publishing", "action", 0),
  discovery: theme("discovery", "library_night", "발견의 테마", "Discovery theme", "새 작품과 소재를 탐험하는 세련된 인스트루멘털", "A polished instrumental for discovering stories and assets", "story", 0),
  catalog: theme("catalog", "worldbuilding", "작품 세계 테마", "Story-world theme", "새 작품의 세계로 들어가는 메인 스코어", "A main score for entering a new story world", "story", 0),
  trends: theme("trends", "citypop", "네온 스크롤", "Neon scroll", "랭킹과 인사이트 탐색에 어울리는 현대적 시티팝 테마", "A modern city-pop theme for rankings and insights", "story", 0),
  community: theme("community", "slice_of_life", "캐릭터와 대화", "Character conversation", "창작자와 독자의 대화에 어울리는 따뜻한 캐릭터 테마", "A warm character theme for creators and readers", "romance", 0),
  market: theme("market", "funky", "소재 탐험 테마", "Asset discovery theme", "새 소재를 둘러보는 리듬감 있는 탐색 테마", "A rhythmic theme for browsing creative assets", "story", 0),
  learning: theme("learning", "library_night", "집중 인스트루멘털", "Focus instrumental", "긴 학습에는 보컬 없이 절제된 연주를 우선", "A restrained instrumental without vocals for long learning sessions", "creator", 0),
  fortune: theme("fortune", "mystery_noir", "비밀의 복선", "Hidden clues", "미스터리와 운명의 복선을 위한 서늘한 스코어", "A cool score for mystery and fate", "story", 0),
  romance: theme("romance", "royal_waltz", "로맨스 캐릭터 송", "Romance character song", "캐릭터 관계와 감정선을 위한 오리지널 보컬 테마", "An original vocal theme for relationships and emotion", "romance", 0),
  healing: theme("healing", "healing_walk", "엔딩의 여운", "Ending afterglow", "소개와 지원 페이지를 편안하게 마무리하는 엔딩 테마", "A gentle ending theme for calmer pages", "ending", 0),
  playful: theme("playful", "happy", "게시의 하늘", "Publish the sky", "완료·참여·발견을 성취감 있게 닫는 테마", "An earned victory theme for completion and discovery", "ending", 0),
} as const;

function theme(
  id: string,
  moodId: string,
  label: string,
  labelEn: string,
  description: string,
  descriptionEn: string,
  ostRole: SiteOstRole,
  fallbackTrackIndex: number,
): SiteBgmExperience {
  return { id, moodId, label, labelEn, description, descriptionEn, ostRole, fallbackTrackIndex, suspended: false, suspensionReason: "" };
}

function hasPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function suspended(reason: string): SiteBgmExperience {
  return { ...THEMES.creator, id: "suspended", suspended: true, suspensionReason: reason };
}

export function resolveSiteBgmExperience(pathname: string): SiteBgmExperience {
  const path = pathname.split("?")[0]?.split("#")[0] || "/";
  const segments = path.split("/").filter(Boolean);
  if (hasPrefix(path, ["/studio/assets/audio", "/music"])) return suspended("음악 제작 화면에서는 미리듣기와 겹치지 않도록 사이트 OST를 잠시 멈춥니다.");
  if (hasPrefix(path, ["/studio/animatic", "/studio/promo", "/studio/spatial", "/studio/live", "/create/promo", "/showcase/promo", "/read/spatial"])) return suspended("오디오가 포함된 제작 도구에서는 사이트 OST를 잠시 멈춥니다.");
  if (hasPrefix(path, ["/play", "/messages", "/collaboration"])) return suspended("게임·통화·메시지 소리를 방해하지 않도록 사이트 OST를 잠시 멈춥니다.");
  if (hasPrefix(path, ["/admin", "/auth", "/login", "/signup", "/account", "/settings", "/my", "/me"])) return suspended("로그인·계정·관리 화면에서는 사이트 OST를 잠시 멈춥니다.");
  if (path === "/") return THEMES.home;

  if (segments[0] === "studio" && segments[1] === "p" && segments.length >= 4) {
    const section = segments[3];
    if (section === "story") return THEMES.story;
    if (["production", "review", "export"].includes(section ?? "")) return THEMES.production;
    if (section === "assets") return THEMES.market;
  }

  if (hasPrefix(path, ["/story-lab", "/studio/storyworld", "/studio/series-kit"])) return THEMES.story;
  if (hasPrefix(path, ["/production", "/studio/production", "/studio/review", "/studio/publish", "/studio/toolchain", "/studio/engines", "/studio/jobs"])) return THEMES.production;
  if (hasPrefix(path, ["/studio/assets/characters", "/studio/character", "/character-shaper", "/studio/vrm", "/character", "/four-panel"])) return THEMES.romance;
  if (hasPrefix(path, ["/studio/bg3d", "/studio/lift3d", "/studio/immersive"])) return THEMES.story;
  if (hasPrefix(path, ["/studio/templates", "/discover", "/search", "/recommend", "/random", "/explore", "/compare", "/research/catalog"])) return THEMES.discovery;
  if (hasPrefix(path, ["/studio/assets/brushes", "/studio/brushes"])) return THEMES.creator;
  if (hasPrefix(path, ["/studio/assets", "/market", "/creator-resources", "/resources", "/opportunities", "/research/assets", "/research/packs", "/research/3d-assets"])) return THEMES.market;
  if (hasPrefix(path, ["/studio/manual", "/learn", "/guide", "/reference", "/references", "/manual", "/technology", "/design-system", "/design", "/research"])) return THEMES.learning;
  if (hasPrefix(path, ["/studio", "/create", "/creator", "/open-creation"])) return THEMES.creator;
  if (hasPrefix(path, ["/title", "/titles", "/author", "/authors", "/tags", "/library", "/global-books", "/research/books"])) return THEMES.catalog;
  if (hasPrefix(path, ["/ranking", "/insights", "/calendar", "/now", "/news"])) return THEMES.trends;
  if (hasPrefix(path, ["/community", "/collaborate", "/cafe", "/pencafe", "/reviews", "/feedback", "/u"])) return THEMES.community;
  if (hasPrefix(path, ["/fortune"])) return THEMES.fortune;
  if (hasPrefix(path, ["/about", "/help", "/support", "/contact", "/policy", "/terms", "/privacy", "/copyright", "/accessibility", "/sitemap"])) return THEMES.healing;
  if (hasPrefix(path, ["/challenges", "/recipes", "/showcase"])) return THEMES.playful;
  return THEMES.home;
}

function readStored(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStored(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(key, value); } catch { /* private browsing */ }
}

function storedEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = readStored(key);
  return value && allowed.includes(value as T) ? value as T : fallback;
}

export function readSiteBgmPreferences(): SiteBgmPreferenceSnapshot {
  return {
    followRoute: readStored(FOLLOW_KEY) !== "0",
    expanded: readStored(EXPANDED_KEY) === "1",
    style: storedEnum(STYLE_KEY, ["auto", ...PROFILES] as const, "auto"),
    intensity: storedEnum(INTENSITY_KEY, INTENSITIES, "normal"),
    vocals: storedEnum(VOCALS_KEY, VOCAL_PREFERENCES, "auto"),
  };
}

export function writeSiteBgmFollowRoute(value: boolean): void {
  writeStored(FOLLOW_KEY, value ? "1" : "0");
}

export function writeSiteBgmExpanded(value: boolean): void {
  writeStored(EXPANDED_KEY, value ? "1" : "0");
}

export function writeSiteBgmStyle(value: SiteOstStylePreference): void {
  writeStored(STYLE_KEY, value);
}

export function writeSiteBgmIntensity(value: SiteOstIntensity): void {
  writeStored(INTENSITY_KEY, value);
}

export function writeSiteBgmVocals(value: SiteOstVocalPreference): void {
  writeStored(VOCALS_KEY, value);
}

function safeText(value: unknown, max: number): string {
  return typeof value === "string" && value.trim().length <= max ? value.trim() : "";
}

function safeInteger(value: unknown, min: number, max: number): number | null {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
}

function isRole(value: string): value is SiteOstRole {
  return ["opening", "creator", "story", "action", "romance", "ending"].includes(value);
}

function isVocalMode(value: string): value is SiteOstVocalMode {
  return value === "vocal" || value === "instrumental";
}

function isIntensity(value: string): value is SiteOstIntensity {
  return INTENSITIES.includes(value as SiteOstIntensity);
}

function parseProfiles(value: unknown): readonly SiteOstProfile[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > PROFILES.length) return null;
  const profiles = value.map((item) => safeText(item, 24));
  if (profiles.some((item) => !PROFILES.includes(item as SiteOstProfile))) return null;
  return [...new Set(profiles)] as SiteOstProfile[];
}

function parseTrack(value: unknown): SiteOstTrack | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const track = value as Record<string, unknown>;
  const id = safeText(track.id, 100);
  const src = safeText(track.src, 240);
  const title = safeText(track.title, 120);
  const artist = safeText(track.artist, 120);
  const role = safeText(track.role, 40);
  const origin = safeText(track.origin, 40);
  const vocalMode = safeText(track.vocalMode, 40);
  const language = safeText(track.language, 40);
  const summary = safeText(track.summary, 260);
  const license = safeText(track.license, 220);
  const creditUrl = safeText(track.creditUrl, 500);
  const intensity = safeText(track.intensity, 40);
  const provider = safeText(track.provider, 40);
  const model = safeText(track.model, 80);
  const sha256 = safeText(track.sha256, 64);
  const generatedAt = safeText(track.generatedAt, 80);
  const status = safeText(track.status, 40);
  const songId = safeText(track.songId, 160);
  const profiles = parseProfiles(track.profiles);
  const durationMs = safeInteger(track.durationMs, 3_000, 300_000);
  const bpm = safeInteger(track.bpm, 50, 220);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) return null;
  if (!/^\/audio\/original\/[a-z0-9._-]+\.(?:mp3|ogg|wav|m4a)$/u.test(src)) return null;
  if (!title || !artist || !isRole(role) || origin !== "original" || !isVocalMode(vocalMode)) return null;
  if (!language || !summary || !license || !creditUrl.startsWith("https://")) return null;
  if (!profiles || !isIntensity(intensity) || durationMs === null || bpm === null) return null;
  const provenance = safeText(track.provenance, 80);
  const generatorRevision = safeText(track.generatorRevision, 64);
  if (!/^[a-f0-9]{64}$/u.test(sha256) || !generatedAt || Number.isNaN(Date.parse(generatedAt)) || status !== "published") return null;
  const elevenLabs = provider === "elevenlabs" && model === "music_v2_5" && provenance === "c2pa-requested" && track.c2paRequested === true;
  const aceStep = provider === "ace-step" && model === "acestep-v15-turbo" && provenance === "local-generation-recorded" && /^[a-f0-9]{40}$/u.test(generatorRevision);
  if (!elevenLabs && !aceStep) return null;

  return {
    id, src, title, artist, role, origin: "original", vocalMode, language, summary, license, creditUrl,
    profiles, intensity, durationMs, bpm, provider: provider as SiteOstProvider, model: model as SiteOstModel, sha256, generatedAt,
    provenance: provenance as SiteOstProvenance,
    ...(elevenLabs ? { c2paRequested: true as const } : { generatorRevision }),
    status: "published", ...(songId ? { songId } : {}),
  };
}

export function parseSiteBgmManifest(value: unknown): readonly SiteOstTrack[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const tracks = (value as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.slice(0, 64).map(parseTrack).filter((track): track is SiteOstTrack => track !== null);
}

const AUTO_PROFILE: Readonly<Record<string, SiteOstProfile>> = {
  home: "animation",
  creator: "webtoon",
  story: "fantasy",
  production: "cinematic",
  discovery: "citypop",
  catalog: "webtoon",
  trends: "citypop",
  community: "citypop",
  market: "citypop",
  learning: "lofi",
  fortune: "cinematic",
  romance: "webtoon",
  healing: "lofi",
  playful: "animation",
};

const INTENSITY_SCORE: Readonly<Record<SiteOstIntensity, number>> = { chill: 0, normal: 1, epic: 2 };

function scoreTrack(track: SiteOstTrack, experience: SiteBgmExperience, preferences: Pick<SiteBgmPreferenceSnapshot, "style" | "intensity" | "vocals">): number {
  let score = track.role === experience.ostRole ? 120 : 0;
  const profile = preferences.style === "auto" ? AUTO_PROFILE[experience.id] : preferences.style;
  if (profile) score += track.profiles.includes(profile) ? 30 : -12;
  if (preferences.vocals !== "auto") score += track.vocalMode === preferences.vocals ? 36 : -30;
  else if (["creator", "learning", "story"].includes(experience.id)) score += track.vocalMode === "instrumental" ? 18 : -8;
  const intensityDistance = Math.abs(INTENSITY_SCORE[track.intensity] - INTENSITY_SCORE[preferences.intensity]);
  score += intensityDistance === 0 ? 16 : intensityDistance === 1 ? 4 : -8;
  return score;
}

export function resolveSiteOstTrackIndex(
  tracks: readonly SiteOstTrack[],
  experience: SiteBgmExperience,
  preferences: Pick<SiteBgmPreferenceSnapshot, "style" | "intensity" | "vocals"> = { style: "auto", intensity: "normal", vocals: "auto" },
): number {
  if (!tracks.length) return 0;
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  tracks.forEach((track, index) => {
    const score = scoreTrack(track, experience, preferences);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export async function loadSiteOstManifest(signal?: AbortSignal): Promise<readonly SiteOstTrack[]> {
  const response = await fetch("/audio/playlist.json", {
    signal,
    headers: { Accept: "application/json" },
    cache: "force-cache",
  });
  if (!response.ok) throw new Error("사이트 OST 목록을 불러오지 못했습니다.");
  return parseSiteBgmManifest(await response.json());
}

export function siteOstTrackToPlaylistEntry(track: SiteOstTrack): BgmPlaylistEntry {
  return { url: track.src, label: track.title, artist: track.artist, creditUrl: track.creditUrl };
}

export async function loadSiteBgmPlaylist(signal?: AbortSignal): Promise<readonly BgmPlaylistEntry[]> {
  return (await loadSiteOstManifest(signal)).map(siteOstTrackToPlaylistEntry);
}
