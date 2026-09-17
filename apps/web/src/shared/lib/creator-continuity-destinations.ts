import type {
  CreatorContinuityLocale,
  CreatorDestinationId,
  CreatorRecentDestination,
} from "./creator-continuity-model";

export interface CreatorDestinationDefinition {
  readonly id: CreatorDestinationId;
  readonly pathname: string;
  readonly label: Record<CreatorContinuityLocale, string>;
  readonly description: Record<CreatorContinuityLocale, string>;
}

// Specific nested paths come first so they never collapse into a parent route.
export const CREATOR_DESTINATIONS: readonly CreatorDestinationDefinition[] = [
  { id: "comic", pathname: "/studio/comic", label: { ko: "컷툰 작업", en: "Comic workspace" }, description: { ko: "컷과 대사를 이어서 구성하기", en: "Continue arranging panels and dialogue" } },
  { id: "reference-atlas", pathname: "/research/assets", label: { ko: "레퍼런스 아틀라스", en: "Reference atlas" }, description: { ko: "복식·소품·미술 자료 이어보기", en: "Continue exploring costume, prop and art references" } },
  { id: "opportunities", pathname: "/opportunities", label: { ko: "작가 기회센터", en: "Creator opportunities" }, description: { ko: "공모전과 지원사업 이어보기", en: "Continue reviewing contests and support programs" } },
  { id: "research", pathname: "/research", label: { ko: "리서치 데스크", en: "Research desk" }, description: { ko: "출처와 판단 노트 이어서 정리하기", en: "Continue organizing sources and decision notes" } },
  { id: "studio", pathname: "/studio", label: { ko: "창작 스튜디오", en: "Creative studio" }, description: { ko: "마지막 창작 흐름으로 돌아가기", en: "Return to your creative workspace" } },
  { id: "shaper", pathname: "/shaper", label: { ko: "캐릭터 셰이퍼", en: "Character shaper" }, description: { ko: "캐릭터와 포즈 구상 이어가기", en: "Continue shaping characters and poses" } },
  { id: "market", pathname: "/market", label: { ko: "에셋 마켓", en: "Asset market" }, description: { ko: "브러시·배경·소품 다시 살펴보기", en: "Return to brushes, backgrounds and props" } },
  { id: "daily", pathname: "/now", label: { ko: "오늘의 영감", en: "Daily inspiration" }, description: { ko: "오늘의 소재와 5컷 미션 이어보기", en: "Continue today's prompt and five-panel mission" } },
  { id: "gallery", pathname: "/create", label: { ko: "창작 갤러리", en: "Creator gallery" }, description: { ko: "다른 창작자의 작품과 흐름 보기", en: "Continue discovering other creators" } },
  { id: "explore", pathname: "/explore", label: { ko: "작품 탐색", en: "Story discovery" }, description: { ko: "장르와 태그 탐색 이어보기", en: "Continue exploring genres and tags" } },
  { id: "ranking", pathname: "/ranking", label: { ko: "통합 랭킹", en: "Rankings" }, description: { ko: "지금 움직이는 작품 다시 보기", en: "Return to stories gaining momentum" } },
  { id: "calendar", pathname: "/calendar", label: { ko: "연재 캘린더", en: "Release calendar" }, description: { ko: "요일별 연재 일정 다시 보기", en: "Return to the release schedule" } },
  { id: "community", pathname: "/community", label: { ko: "커뮤니티", en: "Community" }, description: { ko: "작품과 창작 이야기를 이어가기", en: "Continue the conversation around stories and making" } },
] as const;

const BY_ID = new Map(CREATOR_DESTINATIONS.map((item) => [item.id, item] as const));
const SAFE_STUDIO_PRESETS = new Set(["webtoon", "4cut", "illustration"]);
const SAFE_STUDIO_SURFACES = new Set(["canvas", "comic", "animation", "brushes", "bg3d", "poser", "character"]);
const SAFE_STUDIO_DCC_MODES = new Set(["model", "build", "cad", "sculpt", "material", "shot"]);
const SAFE_STUDIO_DOCUMENT_WORKSPACES = new Set([
  "draw", "comic", "image", "design", "slides", "storyboard", "whiteboard", "3d",
  "animation", "motion", "audio", "localization", "review",
]);
const SAFE_STUDIO_UI_MODES = new Set(["basic", "standard", "simple", "studio", "focus", "full"]);

const STUDIO_WORKSPACE_LABELS: Readonly<Record<string, Record<CreatorContinuityLocale, string>>> = Object.freeze({
  draw: { ko: "드로잉", en: "Drawing" },
  comic: { ko: "웹툰", en: "Webtoon" },
  image: { ko: "이미지 편집", en: "Image editing" },
  design: { ko: "디자인", en: "Design" },
  slides: { ko: "발표 자료", en: "Slides" },
  storyboard: { ko: "콘티", en: "Storyboard" },
  whiteboard: { ko: "화이트보드", en: "Whiteboard" },
  "3d": { ko: "3D", en: "3D" },
  animation: { ko: "애니메이션", en: "Animation" },
  motion: { ko: "모션 웹툰", en: "Motion comic" },
  audio: { ko: "음성·오디오", en: "Voice & audio" },
  localization: { ko: "현지화", en: "Localization" },
  review: { ko: "검토", en: "Review" },
  canvas: { ko: "드로잉", en: "Drawing" },
  brushes: { ko: "브러시", en: "Brushes" },
  bg3d: { ko: "3D 배경", en: "3D background" },
  poser: { ko: "포즈", en: "Posing" },
  character: { ko: "캐릭터", en: "Character" },
});

function safeIdentitySegment(segment: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (
    decoded.length === 0
    || decoded.length > 160
    || decoded.trim() !== decoded
    || decoded === "."
    || decoded === ".."
    || decoded.includes("\\")
  ) return null;
  for (let index = 0; index < decoded.length; index += 1) {
    const code = decoded.charCodeAt(index);
    if (code <= 31 || code === 127) return null;
  }
  return encodeURIComponent(decoded);
}

function safeFocus(value: string | null): string | null {
  if (!value || value.length > 256 || value.includes("\\")) return null;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return null;
  }
  return value;
}

function canonicalStudioPathname(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "studio") return null;
  if (segments.length === 1) return "/studio";
  if (segments.length === 2 && SAFE_STUDIO_SURFACES.has(segments[1] ?? "")) {
    return `/studio/${segments[1]}`;
  }
  if (segments.length === 3 && segments[1] === "draft") {
    const draftId = safeIdentitySegment(segments[2] ?? "");
    return draftId ? `/studio/draft/${draftId}` : null;
  }
  if (segments.length === 5 && segments[1] === "p" && segments[3] === "d") {
    const projectId = safeIdentitySegment(segments[2] ?? "");
    const documentId = safeIdentitySegment(segments[4] ?? "");
    return projectId && documentId ? `/studio/p/${projectId}/d/${documentId}` : null;
  }
  if (
    segments.length === 4
    && (segments[1] === "work" || segments[1] === "remix")
    && SAFE_STUDIO_SURFACES.has(segments[3] ?? "")
  ) {
    const identity = safeIdentitySegment(segments[2] ?? "");
    return identity ? `/studio/${segments[1]}/${identity}/${segments[3]}` : null;
  }
  const dccOffset = segments[1] === "work" || segments[1] === "remix" ? 3 : 1;
  if (
    segments.length === dccOffset + 3
    && segments[dccOffset] === "3d"
    && segments[dccOffset + 1] === "dcc"
    && SAFE_STUDIO_DCC_MODES.has(segments[dccOffset + 2] ?? "")
  ) {
    if (dccOffset === 1) return `/studio/3d/dcc/${segments[dccOffset + 2]}`;
    const identity = safeIdentitySegment(segments[2] ?? "");
    return identity
      ? `/studio/${segments[1]}/${identity}/3d/dcc/${segments[dccOffset + 2]}`
      : null;
  }
  return null;
}

function safeStudioSearch(pathname: string, search: string): string {
  const input = new URLSearchParams(search);
  const output = new URLSearchParams();
  if (pathname === "/studio") {
    const preset = input.get("preset");
    if (preset && SAFE_STUDIO_PRESETS.has(preset)) output.set("preset", preset);
  } else {
    const workspace = input.get("workspace");
    if (workspace && SAFE_STUDIO_DOCUMENT_WORKSPACES.has(workspace)) output.set("workspace", workspace);
    const focus = safeFocus(input.get("focus"));
    if (focus) output.set("focus", focus);
    const language = input.get("language");
    if (language && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(language)) {
      output.set("language", language);
    }
    const version = input.get("version");
    const safeVersion = version ? safeIdentitySegment(version) : null;
    if (safeVersion) output.set("version", decodeURIComponent(safeVersion));
    const uiMode = input.get("uiMode");
    if (uiMode && SAFE_STUDIO_UI_MODES.has(uiMode)) output.set("uiMode", uiMode);
  }
  output.sort();
  const serialized = output.toString();
  return serialized ? `?${serialized}` : "";
}

export function isCreatorDestinationId(value: unknown): value is CreatorDestinationId {
  return typeof value === "string" && BY_ID.has(value as CreatorDestinationId);
}

export function matchCreatorDestination(pathname: string): CreatorDestinationDefinition | undefined {
  return CREATOR_DESTINATIONS.find(
    (item) => pathname === item.pathname || pathname.startsWith(`${item.pathname}/`),
  );
}

/** Preserve only canonical, resumable Studio locations and a minimal allow-list of view context. */
export function safeCreatorDestinationHref(
  destination: CreatorDestinationDefinition,
  pathname = destination.pathname,
  search = "",
): string {
  if (destination.id !== "studio") return destination.pathname;
  const canonicalPathname = canonicalStudioPathname(pathname) ?? destination.pathname;
  return `${canonicalPathname}${safeStudioSearch(canonicalPathname, search)}`;
}

export function creatorDestinationLabel(
  id: CreatorDestinationId,
  locale: CreatorContinuityLocale,
): string {
  return BY_ID.get(id)?.label[locale] ?? id;
}

export function creatorDestinationDescription(
  id: CreatorDestinationId,
  locale: CreatorContinuityLocale,
): string {
  return BY_ID.get(id)?.description[locale] ?? "";
}

function studioWorkspaceFromHref(href: string): string | null {
  try {
    const url = new URL(href, "https://toonstudio.local");
    const explicit = url.searchParams.get("workspace");
    if (explicit && SAFE_STUDIO_DOCUMENT_WORKSPACES.has(explicit)) return explicit;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 2 && SAFE_STUDIO_SURFACES.has(segments[1] ?? "")) return segments[1] ?? null;
    if (
      segments.length === 4
      && (segments[1] === "work" || segments[1] === "remix")
      && SAFE_STUDIO_SURFACES.has(segments[3] ?? "")
    ) return segments[3] ?? null;
    if (segments.includes("dcc")) return "3d";
    if (segments[1] === "p" || segments[1] === "draft") return "draw";
  } catch {
    return null;
  }
  return null;
}

export function creatorRecentDestinationDescription(
  item: CreatorRecentDestination,
  locale: CreatorContinuityLocale,
): string {
  if (item.id !== "studio" || item.href === "/studio" || item.href.startsWith("/studio?preset=")) {
    return creatorDestinationDescription(item.id, locale);
  }
  const workspace = studioWorkspaceFromHref(item.href);
  const workspaceLabel = workspace ? STUDIO_WORKSPACE_LABELS[workspace]?.[locale] : null;
  if (locale === "ko") {
    return workspaceLabel
      ? `${workspaceLabel} 문서의 마지막 페이지·선택·화면 위치로 돌아가기`
      : "마지막 문서와 작업 위치로 돌아가기";
  }
  return workspaceLabel
    ? `Return to the last page, selection and view in this ${workspaceLabel} document`
    : "Return to the last document and editing position";
}

export function formatCreatorRelativeTime(
  visitedAt: number,
  locale: CreatorContinuityLocale,
  now = Date.now(),
): string {
  const minutes = Math.floor(Math.max(0, now - visitedAt) / 60_000);
  if (minutes < 1) return locale === "ko" ? "방금 전" : "Just now";
  if (minutes < 60) return locale === "ko" ? `${minutes}분 전` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "ko" ? `${hours}시간 전` : `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return locale === "ko" ? "어제" : "Yesterday";
  if (days < 30) return locale === "ko" ? `${days}일 전` : `${days} days ago`;
  const months = Math.floor(days / 30);
  return locale === "ko" ? `${months}개월 전` : `${months} mo ago`;
}
