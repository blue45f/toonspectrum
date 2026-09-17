import type { BgmPlaylistEntry } from "@toonspectrum/core/fx";

export type SiteBgmSource = "original-ost" | "focus-instrumental";
export type SiteOstRole = "opening" | "creator" | "story" | "action" | "romance" | "ending";
export type SiteOstOrigin = "original" | "licensed-reference";
export type SiteOstVocalMode = "vocal" | "instrumental" | "unknown";

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

interface SiteBgmPreferenceSnapshot {
  readonly source: SiteBgmSource;
  readonly followRoute: boolean;
  readonly expanded: boolean;
}

export interface SiteOstTrack {
  readonly id: string;
  readonly src: string;
  readonly title: string;
  readonly artist: string;
  readonly role: SiteOstRole;
  readonly origin: SiteOstOrigin;
  readonly vocalMode: SiteOstVocalMode;
  readonly language: string;
  readonly summary: string;
  readonly license: string;
  readonly creditUrl: string;
}

const SOURCE_KEY = "ts_site_bgm_source";
const FOLLOW_KEY = "ts_site_bgm_follow_route";
const EXPANDED_KEY = "ts_site_bgm_expanded";

const THEMES = {
  home: theme("home", "pop", "툰스튜디오 오프닝", "ToonStudio opening", "첫 화면에서 작품의 시작을 알리는 밝은 오프닝", "A bright opening that signals the start of a story", "opening", 0),
  creator: theme("creator", "atelier_focus", "창작자 테마", "Creator theme", "빈 캔버스에서 세계가 완성되는 창작자 테마", "A creator theme for turning a blank canvas into a world", "creator", 0),
  story: theme("story", "worldbuilding", "세계관 메인 테마", "Story-world theme", "인물과 세계가 확장되는 메인 테마", "A main theme for expanding characters and worlds", "story", 0),
  production: theme("production", "synthwave", "클라이맥스 드라이브", "Climax drive", "마감과 액션의 추진력을 올리는 강한 테마", "A driving theme for production and action", "action", 1),
  discovery: theme("discovery", "library_night", "발견의 테마", "Discovery theme", "새 작품과 소재를 발견하는 장면을 위한 테마", "A theme for discovering new stories and assets", "story", 0),
  catalog: theme("catalog", "worldbuilding", "작품 세계 테마", "Story-world theme", "새 작품의 세계로 들어가는 메인 테마", "A theme for entering a new story world", "story", 0),
  trends: theme("trends", "citypop", "청춘 드라이브", "Youth drive", "랭킹과 인사이트를 경쾌하게 읽는 청춘 테마", "An upbeat youth theme for rankings and insights", "opening", 1),
  community: theme("community", "slice_of_life", "우리들의 일상", "Our everyday theme", "창작자와 독자의 대화에 어울리는 따뜻한 캐릭터 테마", "A warm character theme for creators and readers", "romance", 2),
  market: theme("market", "funky", "소재 탐험 테마", "Asset discovery theme", "새 소재를 둘러보는 재미를 살리는 경쾌한 테마", "A playful theme for browsing assets", "opening", 1),
  learning: theme("learning", "library_night", "집중 인스트", "Focus instrumental", "긴 학습에는 보컬보다 절제된 연주를 우선하는 테마", "A restrained instrumental theme for long learning sessions", "creator", 0),
  fortune: theme("fortune", "mystery_noir", "비밀의 복선", "Hidden clues", "미스터리와 운명의 복선을 위한 서늘한 테마", "A cool theme for mystery and fate", "story", 2),
  romance: theme("romance", "royal_waltz", "로맨스 캐릭터 송", "Romance character song", "캐릭터 관계와 감정선을 위한 보컬 테마", "A vocal character theme for relationships and emotion", "romance", 2),
  healing: theme("healing", "healing_walk", "엔딩의 여운", "Ending afterglow", "소개와 지원 페이지를 편안하게 마무리하는 엔딩 테마", "A gentle ending theme for calmer pages", "ending", 2),
  playful: theme("playful", "happy", "밝은 엔딩 크레딧", "Bright ending credits", "참여와 발견을 밝게 닫는 엔딩 테마", "A bright ending theme for playful discovery", "ending", 1),
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
  if (hasPrefix(path, ["/admin", "/auth", "/login", "/signup", "/account", "/settings", "/my", "/me"])) return suspended("로그인·계정·관리 화면에서는 집중과 개인정보 보호를 위해 사이트 OST를 잠시 멈춥니다.");
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

export function readSiteBgmPreferences(): SiteBgmPreferenceSnapshot {
  const storedSource = readStored(SOURCE_KEY);
  const source: SiteBgmSource = storedSource === "focus-instrumental" || storedSource === "page-theme"
    ? "focus-instrumental"
    : "original-ost";
  return { source, followRoute: readStored(FOLLOW_KEY) !== "0", expanded: readStored(EXPANDED_KEY) === "1" };
}
export function writeSiteBgmSource(source: SiteBgmSource): void {
  writeStored(SOURCE_KEY, source);
}

export function writeSiteBgmFollowRoute(value: boolean): void {
  writeStored(FOLLOW_KEY, value ? "1" : "0");
}

export function writeSiteBgmExpanded(value: boolean): void {
  writeStored(EXPANDED_KEY, value ? "1" : "0");
}

function safeText(value: unknown, max: number): string {
  return typeof value === "string" && value.trim().length <= max ? value.trim() : "";
}

function isRole(value: string): value is SiteOstRole {
  return ["opening", "creator", "story", "action", "romance", "ending"].includes(value);
}

function isOrigin(value: string): value is SiteOstOrigin {
  return value === "original" || value === "licensed-reference";
}

function isVocalMode(value: string): value is SiteOstVocalMode {
  return value === "vocal" || value === "instrumental" || value === "unknown";
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
  const summary = safeText(track.summary, 220);
  const license = safeText(track.license, 180);
  const creditUrl = safeText(track.creditUrl, 500);
  if (!id || !src.startsWith("/audio/") || !src.match(/\.(?:mp3|ogg|wav|m4a)$/u)) return null;
  if (!title || !artist || !isRole(role) || !isOrigin(origin) || !isVocalMode(vocalMode)) return null;
  if (!language || !summary || !license || !creditUrl.startsWith("https://")) return null;
  return { id, src, title, artist, role, origin, vocalMode, language, summary, license, creditUrl };
}

export function parseSiteBgmManifest(value: unknown): readonly SiteOstTrack[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const tracks = (value as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.slice(0, 24).map(parseTrack).filter((track): track is SiteOstTrack => track !== null);
}
export function resolveSiteOstTrackIndex(
  tracks: readonly SiteOstTrack[],
  experience: SiteBgmExperience,
): number {
  if (!tracks.length) return 0;
  const originalMatch = tracks.findIndex((track) => track.origin === "original" && track.role === experience.ostRole);
  if (originalMatch >= 0) return originalMatch;
  const roleMatch = tracks.findIndex((track) => track.role === experience.ostRole);
  if (roleMatch >= 0) return roleMatch;
  const anyOriginal = tracks.findIndex((track) => track.origin === "original");
  if (anyOriginal >= 0) return anyOriginal;
  return experience.fallbackTrackIndex % tracks.length;
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
