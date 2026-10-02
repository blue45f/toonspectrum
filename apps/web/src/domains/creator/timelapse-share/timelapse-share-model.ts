/**
 * 타임랩스 원클릭 공유 — 순수 모델.
 *
 * Clip Studio Paint·MediBang 타임랩스 공유 플로우 벤치마크:
 *  - 녹화 → 워터마크 오버레이 → 게시(제목·설명·공개범위) → 갤러리 피드 → 좋아요·조회수
 * 게스트-퍼스트: 클립 미리보기·갤러리는 로그인 없이, 게시·좋아요는 로그인 유도(useAccountGate).
 *
 * 이 파일은 DOM/React를 모른다. Blob·ObjectURL 같은 세션 휘발성 자원은 스토어 모듈의
 * 인메모리 레지스트리가 맡고, 여기에는 메타데이터·정렬·가시성 규칙만 둔다.
 */

/** 갤러리 피드에 노출되는 공개 범위. */
export type TimelapseClipVisibility = "public" | "unlisted" | "private";

export interface TimelapseClipVisibilityOption {
  readonly id: TimelapseClipVisibility;
  readonly ko: string;
  readonly en: string;
}

export const TIMELAPSE_CLIP_VISIBILITY_OPTIONS: readonly TimelapseClipVisibilityOption[] = [
  { id: "public", ko: "전체 공개", en: "Public" },
  { id: "unlisted", ko: "링크 공개", en: "Unlisted" },
  { id: "private", ko: "나만 보기", en: "Private" },
];

/** 공유된 타임랩스 클립 메타데이터(로컬 persist 대상 — Blob 제외). */
export interface TimelapseSharedClip {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly visibility: TimelapseClipVisibility;
  readonly width: number;
  readonly height: number;
  readonly durationSec: number;
  readonly stepCount: number;
  /** 내보낼 때 툰스튜디오 워터마크를 입혔는지. 게스트는 항상 true(해제 불가). */
  readonly watermark: boolean;
  readonly authorName: string;
  readonly authorIsGuest: boolean;
  /**
   * 소유자 키(`user:{id}` / `guest:{id}`) — 내 클립 판정·가시성 필터용.
   * authorName은 표시용이라 식별자로 쓰지 않는다.
   */
  readonly ownerKey: string;
  /** 게시 시각 ISO 8601. */
  readonly createdAt: string;
  readonly likes: number;
  readonly views: number;
  readonly liked: boolean;
  /**
   * 320px 썸네일 data URL(없으면 ""). 영상 Blob은 세션 휘발성이라 썸네일만 persist한다 —
   * 새로고침 후에는 썸네일·메타만 보이고 영상 재생은 이 브라우저 세션에서만 가능하다.
   */
  readonly thumbnailDataUrl: string;
}

export interface TimelapsePublishInput {
  readonly title: string;
  readonly description: string;
  readonly visibility: TimelapseClipVisibility;
  readonly width: number;
  readonly height: number;
  readonly durationSec: number;
  readonly stepCount: number;
  readonly watermark: boolean;
  readonly authorName: string;
  readonly authorIsGuest: boolean;
  readonly ownerKey: string;
  readonly thumbnailDataUrl: string;
}

export type TimelapseClipSort = "recent" | "likes" | "views";

export const TIMELAPSE_CLIP_SORT_OPTIONS: readonly {
  readonly id: TimelapseClipSort;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "recent", ko: "최신", en: "Latest" },
  { id: "likes", ko: "인기", en: "Popular" },
  { id: "views", ko: "조회", en: "Most viewed" },
];

/** 쿼리 파라미터 → 정렬. 모르면 "recent". */
export function parseTimelapseClipSort(value: string | null | undefined): TimelapseClipSort {
  if (value === "likes" || value === "views" || value === "recent") return value;
  return "recent";
}

/** 갤러리에 보관하는 최대 클립 수(썸네일 data URL이 localStorage를 잠식하지 않도록). */
export const MAX_TIMELAPSE_CLIPS = 50;

/** 썸네일 최대 가로(px). 16:9·9:16 모두 이 너비에 맞춰 축소한다. */
export const TIMELAPSE_THUMBNAIL_MAX_WIDTH = 320;

function randomClipId(): string {
  // guest-session.ts와 동일한 규약 — crypto 난수만 사용하고 Math.random 폴백은 금지
  // (CodeQL js/insecure-randomness, CWE-338).
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) return `timelapse-clip:${randomUUID()}`;
  const getRandomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (!getRandomValues) throw new Error("타임랩스 클립 ID를 만들 난수 소스가 없어요.");
  const bytes = getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `timelapse-clip:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 게시 입력 → 저장용 클립 메타데이터. 제목은 비어 있으면 기본 제목으로 대체된다. 순수. */
export function buildTimelapseSharedClip(input: TimelapsePublishInput, now: Date = new Date()): TimelapseSharedClip {
  const title = input.title.trim().slice(0, 80) || "제목 없는 타임랩스";
  return {
    id: randomClipId(),
    title,
    description: input.description.trim().slice(0, 500),
    visibility: input.visibility,
    width: Math.max(1, Math.round(input.width)),
    height: Math.max(1, Math.round(input.height)),
    durationSec: Math.max(0, input.durationSec),
    stepCount: Math.max(0, Math.round(input.stepCount)),
    watermark: input.watermark,
    authorName: input.authorName.trim().slice(0, 40) || "익명의 창작자",
    authorIsGuest: input.authorIsGuest,
    ownerKey: input.ownerKey.trim().slice(0, 160) || "guest:anonymous",
    createdAt: now.toISOString(),
    likes: 0,
    views: 0,
    liked: false,
    thumbnailDataUrl: input.thumbnailDataUrl,
  };
}

/** 갤러리 정렬. 동점자는 최신 게시 순. 순수. */
export function sortTimelapseClips(
  clips: readonly TimelapseSharedClip[],
  sort: TimelapseClipSort,
): TimelapseSharedClip[] {
  const ranked = [...clips];
  const createdAtOf = (clip: TimelapseSharedClip): number => Date.parse(clip.createdAt) || 0;
  switch (sort) {
    case "likes":
      ranked.sort((a, b) => b.likes - a.likes || createdAtOf(b) - createdAtOf(a));
      break;
    case "views":
      ranked.sort((a, b) => b.views - a.views || createdAtOf(b) - createdAtOf(a));
      break;
    case "recent":
    default:
      ranked.sort((a, b) => createdAtOf(b) - createdAtOf(a));
      break;
  }
  return ranked;
}

export interface TimelapseClipViewer {
  /** 내 클립 식별자 집합(ownerKey 기준). */
  readonly ownerIds: readonly string[];
}

/**
 * 갤러리 노출 규칙. 순수.
 * - public: 모두에게 노출
 * - unlisted/private: 내 클립(ownerIds에 ownerKey 포함)일 때만 노출
 */
export function visibleTimelapseClips(
  clips: readonly TimelapseSharedClip[],
  viewer: TimelapseClipViewer,
): TimelapseSharedClip[] {
  const owners = new Set(viewer.ownerIds);
  return clips.filter(
    (clip) => clip.visibility === "public" || owners.has(clip.ownerKey),
  );
}

export interface TimelapseThumbnailSource {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

export interface TimelapseThumbnailCanvas {
  readonly width: number;
  readonly height: number;
  getContext(contextId: "2d"): CanvasRenderingContext2D | null;
  toDataURL(type?: string, quality?: number): string;
}

/**
 * 녹화 결과의 첫 프레임(이미지)을 320px 썸네일 data URL(JPEG)로 바꾼다.
 * 캔버스 생성은 주입받아 jsdom에서도 테스트 가능하게 둔다. 순수(DOM 생성 제외).
 */
export function captureTimelapseThumbnailDataUrl(
  image: TimelapseThumbnailSource,
  createCanvas: (width: number, height: number) => TimelapseThumbnailCanvas,
  maxWidth: number = TIMELAPSE_THUMBNAIL_MAX_WIDTH,
): string {
  const sourceWidth = Math.max(1, Math.round(image.width));
  const sourceHeight = Math.max(1, Math.round(image.height));
  const scale = Math.min(1, maxWidth / sourceWidth);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  try {
    ctx.drawImage(image.source, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    // toDataURL이 막힌 환경(privacy 설정 등) — 썸네일 없이 게시한다.
    return "";
  }
}
