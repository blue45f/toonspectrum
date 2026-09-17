import type { BgmPlaylistEntry } from "@toonspectrum/core/fx";

export type SiteBgmSource = "page-theme" | "vocal-ost";

export interface SiteBgmExperience {
  readonly id: string;
  readonly moodId: string;
  readonly label: string;
  readonly labelEn: string;
  readonly description: string;
  readonly descriptionEn: string;
  readonly vocalTrackIndex: number;
  readonly suspended: boolean;
  readonly suspensionReason: string;
}

interface SiteBgmPreferenceSnapshot {
  readonly source: SiteBgmSource;
  readonly followRoute: boolean;
  readonly expanded: boolean;
}

interface ManifestTrack {
  readonly src: string;
  readonly title: string;
  readonly artist: string;
  readonly license: string;
  readonly creditUrl: string;
}

const SOURCE_KEY = "ts_site_bgm_source";
const FOLLOW_KEY = "ts_site_bgm_follow_route";
const EXPANDED_KEY = "ts_site_bgm_expanded";

const THEMES = {
  home: theme("home", "pop", "툰스튜디오 오프닝", "ToonStudio opening", "아이디어가 시작되는 밝고 설레는 오프닝", "A bright opening for starting a new idea", 0),
  creator: theme("creator", "atelier_focus", "작가의 작업실", "Creator atelier", "긴 창작 시간에 집중을 돕는 낮은 피아노와 패드", "Low-key piano and pads for long creative sessions", 2),
  story: theme("story", "worldbuilding", "세계관 항해", "Worldbuilding voyage", "인물과 세계가 확장되는 신비로운 공간감", "Spacious wonder for characters and worlds", 0),
  production: theme("production", "synthwave", "프로덕션 드라이브", "Production drive", "마감과 협업 흐름을 밀어주는 안정적인 추진력", "Steady momentum for deadlines and collaboration", 1),
  discovery: theme("discovery", "library_night", "밤의 자료실", "Night library", "검색과 탐색을 방해하지 않는 조용한 자료실", "A quiet library for browsing and research", 0),
  catalog: theme("catalog", "worldbuilding", "작품 세계 탐험", "Story-world discovery", "새 작품의 세계로 들어가는 넓고 반짝이는 테마", "A spacious theme for entering new story worlds", 0),
  trends: theme("trends", "citypop", "트렌드 시티팝", "Trend city pop", "랭킹과 인사이트를 경쾌하게 읽는 도시적 그루브", "An urban groove for rankings and insights", 1),
  community: theme("community", "slice_of_life", "창작자 카페", "Creator café", "대화와 반응에 어울리는 따뜻한 일상 코미디", "Warm slice-of-life music for conversation", 2),
  market: theme("market", "funky", "소재 마켓 그루브", "Asset-market groove", "소재를 둘러보는 재미를 살리는 가벼운 그루브", "A playful groove for browsing assets", 1),
  learning: theme("learning", "library_night", "집중 학습실", "Focus study room", "문서와 튜토리얼에 집중하기 위한 절제된 앰비언스", "Restrained ambience for docs and tutorials", 0),
  fortune: theme("fortune", "mystery_noir", "비밀의 복선", "Hidden clues", "운세와 미스터리에 어울리는 서늘한 단서의 리듬", "A cool pulse of clues for fortune and mystery", 2),
  romance: theme("romance", "royal_waltz", "로판 무도회", "Royal fantasy waltz", "캐릭터와 로맨스 장면을 위한 우아한 실내악풍 왈츠", "An elegant chamber waltz for characters and romance", 2),
  healing: theme("healing", "healing_walk", "힐링 산책", "Healing walk", "소개와 지원 페이지를 편안하게 둘러보는 따뜻한 테마", "A warm theme for calmly exploring information", 2),
  playful: theme("playful", "happy", "즐거운 엔딩 크레딧", "Joyful ending credits", "가벼운 참여와 발견을 위한 밝은 축제감", "Bright celebration for playful discovery", 1),
} as const;

function theme(
  id: string,
  moodId: string,
  label: string,
  labelEn: string,
  description: string,
  descriptionEn: string,
  vocalTrackIndex: number,
): SiteBgmExperience {
  return { id, moodId, label, labelEn, description, descriptionEn, vocalTrackIndex, suspended: false, suspensionReason: "" };
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
  if (hasPrefix(path, ["/studio/assets/audio", "/music"])) return suspended("음악 제작 화면에서는 미리듣기와 겹치지 않도록 사이트 BGM을 잠시 멈춥니다.");
  if (hasPrefix(path, ["/studio/animatic", "/studio/promo", "/studio/spatial", "/studio/live", "/create/promo", "/showcase/promo", "/read/spatial"])) return suspended("오디오가 포함된 제작 도구에서는 사이트 BGM을 잠시 멈춥니다.");
  if (hasPrefix(path, ["/play", "/messages", "/collaboration"])) return suspended("게임·통화·메시지 소리를 방해하지 않도록 사이트 BGM을 잠시 멈춥니다.");
  if (hasPrefix(path, ["/admin", "/auth", "/login", "/signup", "/account", "/settings", "/my", "/me"])) return suspended("로그인·계정·관리 화면에서는 집중과 개인정보 보호를 위해 사이트 BGM을 잠시 멈춥니다.");
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
  return {
    source: readStored(SOURCE_KEY) === "vocal-ost" ? "vocal-ost" : "page-theme",
    followRoute: readStored(FOLLOW_KEY) !== "0",
    expanded: readStored(EXPANDED_KEY) === "1",
  };
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

function parseTrack(value: unknown): ManifestTrack | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const track = value as Record<string, unknown>;
  const src = safeText(track.src, 240);
  const title = safeText(track.title, 120);
  const artist = safeText(track.artist, 120);
  const license = safeText(track.license, 160);
  const creditUrl = safeText(track.creditUrl, 500);
  if (!/^\/audio\/[a-zA-Z0-9._-]+\.(?:mp3|ogg|wav|m4a)$/u.test(src)) return null;
  if (!title || !artist || !license || !/^https:\/\//u.test(creditUrl)) return null;
  return { src, title, artist, license, creditUrl };
}

export function parseSiteBgmManifest(value: unknown): readonly ManifestTrack[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const tracks = (value as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.slice(0, 12).map(parseTrack).filter((track): track is ManifestTrack => track !== null);
}

export async function loadSiteBgmPlaylist(signal?: AbortSignal): Promise<readonly BgmPlaylistEntry[]> {
  const response = await fetch("/audio/playlist.json", { signal, headers: { Accept: "application/json" }, cache: "force-cache" });
  if (!response.ok) throw new Error("고품질 보컬 OST 목록을 불러오지 못했습니다.");
  return parseSiteBgmManifest(await response.json()).map((track) => ({
    url: track.src,
    label: track.title,
    artist: track.artist,
    creditUrl: track.creditUrl,
  }));
}
