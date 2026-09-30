import type { MaterialAsset } from "../material-atlas/model";

/** 소재 탐색 UX 고도화의 순수 로직. React 의존성 없음. */

export const TRENDING_MATERIAL_KEYWORDS = [
  "나무", "벽돌", "콘크리트", "숲", "야경", "의자", "돌", "금속", "하늘", "도시",
] as const;

export const MATERIAL_SEARCH_EXAMPLES = [
  "벚꽃 배경", "한복 캐릭터", "나무 질감", "골목 야경", "낡은 벽돌", "숲속 빛",
] as const;

const RECENT_KEY = "toonstudio.material-recent-searches.v1";
const GUIDE_KEY = "toonstudio.material-guide-seen.v1";
/** 스튜디오 캔버스 전달 계약. `/studio/new` 진입 시 스튜디오가 읽을 수 있다. */
export const MATERIAL_DROP_KEY = "toonstudio.material-drop.v1";
const MAX_RECENT = 5;

function readStrings(key: string, max: number): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= 80).slice(0, max);
  } catch { return []; }
}

export function getRecentMaterialSearches(): string[] {
  return readStrings(RECENT_KEY, MAX_RECENT);
}

export function saveRecentMaterialSearch(term: string): string[] {
  const cleaned = term.trim().slice(0, 80);
  if (!cleaned) return getRecentMaterialSearches();
  const next = [cleaned, ...readStrings(RECENT_KEY, MAX_RECENT).filter((entry) => entry !== cleaned)].slice(0, MAX_RECENT);
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* 저장 실패는 무시 */ }
  return next;
}

export function clearRecentMaterialSearches(): void {
  try { window.localStorage.removeItem(RECENT_KEY); } catch { /* 무시 */ }
}

export function hasSeenMaterialGuide(): boolean {
  try { return window.localStorage.getItem(GUIDE_KEY) === "1"; } catch { return true; }
}

export function markMaterialGuideSeen(): void {
  try { window.localStorage.setItem(GUIDE_KEY, "1"); } catch { /* 무시 */ }
}

export interface MaterialSuggestion { value: string; kind: "keyword" | "tag" | "title"; count: number }

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().trim();

export function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch { return false; }
}

/** 입력 접두사와 일치하는 태그·제목 기반 자동완성 후보. */
export function buildMaterialSuggestions(query: string, assets: readonly MaterialAsset[], limit = 8): MaterialSuggestion[] {
  const needle = normalize(query);
  if (needle.length < 1) return [];
  const tagCounts = new Map<string, number>();
  const titleHits = new Map<string, number>();
  for (const asset of assets) {
    for (const tag of asset.tags) {
      const tagNorm = normalize(tag);
      if (tagNorm.startsWith(needle) && tagNorm !== needle) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const titleNorm = normalize(asset.title);
    if (titleNorm.includes(needle) && titleNorm !== needle) titleHits.set(asset.title, (titleHits.get(asset.title) ?? 0) + 1);
  }
  const keywordHits = TRENDING_MATERIAL_KEYWORDS.filter((word) => normalize(word).startsWith(needle) && normalize(word) !== needle)
    .map((value) => ({ value, kind: "keyword" as const, count: 0 }));
  const tagHits = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, kind: "tag" as const, count }));
  const titleSuggestions = [...titleHits.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit - tagHits.length - keywordHits.length))
    .map(([value, count]) => ({ value, kind: "title" as const, count }));
  return [...keywordHits, ...tagHits, ...titleSuggestions].slice(0, limit);
}

/** 트렌딩 캐러셀용 소재: 종류·제공처를 고르게 섞고 썸네일이 있는 것만. */
export function buildTrendingMaterials(assets: readonly MaterialAsset[], limit = 8): MaterialAsset[] {
  const withThumb = assets.filter((asset) => asset.thumbnailUrl);
  const pool = withThumb.length >= limit ? withThumb : assets;
  const picked: MaterialAsset[] = [];
  const seenKind = new Set<string>();
  for (const asset of pool) {
    if (picked.length >= limit) break;
    if (seenKind.size < 3 && seenKind.has(asset.kind)) continue;
    seenKind.add(asset.kind);
    picked.push(asset);
  }
  for (const asset of pool) {
    if (picked.length >= limit) break;
    if (!picked.includes(asset)) picked.push(asset);
  }
  return picked.slice(0, limit);
}

/** 스튜디오 전달용 페이로드 직렬화. */
export function serializeMaterialDrop(asset: MaterialAsset): string {
  return JSON.stringify({
    schema: "toonstudio.material-drop.v1",
    id: asset.id, provider: asset.provider, kind: asset.kind, title: asset.title,
    sourceUrl: asset.sourceUrl, thumbnailUrl: asset.thumbnailUrl, tags: asset.tags.slice(0, 8),
  });
}

export function storeMaterialDrop(asset: MaterialAsset): boolean {
  try { window.sessionStorage.setItem(MATERIAL_DROP_KEY, serializeMaterialDrop(asset)); return true; }
  catch { return false; }
}

export function readMaterialDrop(): string | null {
  try { return window.sessionStorage.getItem(MATERIAL_DROP_KEY); } catch { return null; }
}

/** 드래그앤드롭 전달용 MIME. */
export const MATERIAL_DRAG_MIME = "application/x-toonstudio-material";

export function serializeMaterialDrag(asset: MaterialAsset): string {
  return serializeMaterialDrop(asset);
}
