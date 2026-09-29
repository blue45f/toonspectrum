/**
 * 웹툰 포즈 프리셋 팀 공유용 JSON 내보내기/가져오기.
 *
 * 기존 데생 인형 JSON 파일 내보내기/가져오기(Blob 다운로드 + FileReader) 패턴을
 * 포즈 프리셋 컬렉션에 맞게 재사용한다. 페이로드는 버전드 + 앱 마커 + 방어적
 * 정규화를 따르며, 모르는 프리셋 id는 가져오기 시 버린다.
 */

import { ADVANCED_WEBTOON_POSES } from "./studio-3d-advanced-poses-library";

export const WEBTOON_POSE_SHARE_APP_MARKER = "toonstudio.webtoon-pose-share";
export const WEBTOON_POSE_SHARE_VERSION = 1;

export interface WebtoonPoseSharePayload {
  readonly app: typeof WEBTOON_POSE_SHARE_APP_MARKER;
  readonly version: typeof WEBTOON_POSE_SHARE_VERSION;
  /** 공유되는 프리셋 id 목록. */
  readonly presetIds: readonly string[];
  /** 즐겨찾기로 함께 가져올 프리셋 id 목록. */
  readonly favoriteIds: readonly string[];
  readonly exportedAt: string;
}

const KNOWN_PRESET_IDS: ReadonlySet<string> = new Set(
  ADVANCED_WEBTOON_POSES.map((preset) => preset.id),
);

function normalizePresetIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) continue;
    if (!KNOWN_PRESET_IDS.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

/**
 * 공유 페이로드를 JSON 문자열로 직렬화한다. (팀 공유 내보내기)
 */
export function serializeWebtoonPoseSharePayload(input: {
  readonly presetIds: readonly string[];
  readonly favoriteIds?: readonly string[];
}): string {
  const presetIds = normalizePresetIdList(input.presetIds);
  const favoriteIds = normalizePresetIdList(input.favoriteIds ?? input.presetIds);
  const payload: WebtoonPoseSharePayload = {
    app: WEBTOON_POSE_SHARE_APP_MARKER,
    version: WEBTOON_POSE_SHARE_VERSION,
    presetIds,
    favoriteIds: favoriteIds.filter((id) => presetIds.includes(id)),
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * 공유 JSON 텍스트를 파싱한다. 형식이 맞지 않거나 마커가 다르면 null을 돌려준다.
 */
export function parseWebtoonPoseSharePayload(text: unknown): WebtoonPoseSharePayload | null {
  if (typeof text !== "string" || text.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (record.app !== WEBTOON_POSE_SHARE_APP_MARKER) return null;
  if (record.version !== WEBTOON_POSE_SHARE_VERSION) return null;
  const presetIds = normalizePresetIdList(record.presetIds);
  if (presetIds.length === 0) return null;
  const favoriteIds = normalizePresetIdList(record.favoriteIds).filter((id) =>
    presetIds.includes(id),
  );
  const exportedAt =
    typeof record.exportedAt === "string" && record.exportedAt.length > 0
      ? record.exportedAt
      : new Date().toISOString();
  return { app: WEBTOON_POSE_SHARE_APP_MARKER, version: WEBTOON_POSE_SHARE_VERSION, presetIds, favoriteIds, exportedAt };
}

/** 내보내기 파일명. */
export function buildWebtoonPoseShareFileName(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `toonstudio-webtoon-poses-${stamp}.json`;
}
