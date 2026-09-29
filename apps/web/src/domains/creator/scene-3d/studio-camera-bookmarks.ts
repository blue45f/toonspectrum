/**
 * Studio 3D 데생 인형 — Magic Poser 벤치마크: 카메라 북마크/FOV (MP4).
 *
 * 시점(카메라 위치·주시점)과 FOV를 북마크로 저장·복원합니다.
 * Magic Poser의 뷰 북마크 UX를 웹툰 콘티용으로 흡수한 것으로,
 * 컷 단위로 동일한 카메라 앵글을 재현할 때 사용합니다.
 *
 * Three.js 카메라 객체를 직접 다루지 않는 순수 데이터+로직 모듈입니다.
 */

import type { StudioMannequinVec3 } from "./studio-mannequin-model";

/** FOV 허용 범위(도). */
export const STUDIO_CAMERA_FOV_MIN = 10 as const;
export const STUDIO_CAMERA_FOV_MAX = 120 as const;

export interface StudioCameraBookmark {
  readonly id: string;
  /** 북마크 이름(컷 이름 등). */
  readonly name: string;
  /** 카메라 위치(m). */
  readonly position: StudioMannequinVec3;
  /** 주시점(m). */
  readonly target: StudioMannequinVec3;
  /** 시야각(도). */
  readonly fov: number;
  /** 저장 시각(ms epoch). */
  readonly savedAt: number;
}

export class StudioCameraBookmarkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioCameraBookmarkError";
  }
}

/** FOV를 허용 범위로 클램프합니다. 비유한 값은 50으로 처리합니다. */
export function clampStudioCameraFov(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 50;
  return Math.min(STUDIO_CAMERA_FOV_MAX, Math.max(STUDIO_CAMERA_FOV_MIN, value));
}

function validateVec3(value: unknown, field: string): StudioMannequinVec3 {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || !value.every((component) => typeof component === "number" && Number.isFinite(component))
  ) {
    throw new StudioCameraBookmarkError(`${field}는 3개의 유한한 숫자로 이루어진 벡터여야 합니다.`);
  }
  return value as StudioMannequinVec3;
}

let bookmarkSequence = 0;

function nextBookmarkId(): string {
  bookmarkSequence += 1;
  return `camera-bookmark-${bookmarkSequence}`;
}

/**
 * 북마크를 생성합니다. now 주입으로 테스트에서 저장 시각을 고정할 수 있습니다.
 */
export function createStudioCameraBookmark(
  input: {
    readonly name: string;
    readonly position: unknown;
    readonly target: unknown;
    readonly fov: unknown;
  },
  now: () => number = () => Date.now(),
): StudioCameraBookmark {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new StudioCameraBookmarkError("북마크 이름이 비어 있습니다.");
  }
  return Object.freeze({
    id: nextBookmarkId(),
    name,
    position: validateVec3(input.position, "position"),
    target: validateVec3(input.target, "target"),
    fov: clampStudioCameraFov(input.fov),
    savedAt: now(),
  });
}

/** 북마크 목록에 추가합니다. ID 중복은 허용하지 않습니다. */
export function addStudioCameraBookmark(
  bookmarks: readonly StudioCameraBookmark[],
  bookmark: StudioCameraBookmark,
): readonly StudioCameraBookmark[] {
  if (bookmarks.some((existing) => existing.id === bookmark.id)) {
    throw new StudioCameraBookmarkError(`이미 존재하는 북마크입니다: ${bookmark.id}`);
  }
  return [...bookmarks, bookmark];
}

/** ID로 북마크를 찾습니다. 없으면 undefined를 돌립니다. */
export function findStudioCameraBookmark(
  bookmarks: readonly StudioCameraBookmark[],
  id: string,
): StudioCameraBookmark | undefined {
  return bookmarks.find((bookmark) => bookmark.id === id);
}

/** 북마크를 부분 업데이트합니다(이름·위치·주시점·FOV). */
export function updateStudioCameraBookmark(
  bookmarks: readonly StudioCameraBookmark[],
  id: string,
  patch: {
    readonly name?: string;
    readonly position?: unknown;
    readonly target?: unknown;
    readonly fov?: unknown;
  },
): readonly StudioCameraBookmark[] {
  return bookmarks.map((bookmark) => {
    if (bookmark.id !== id) return bookmark;
    const name = patch.name === undefined ? bookmark.name : patch.name.trim();
    if (name.length === 0) {
      throw new StudioCameraBookmarkError("북마크 이름이 비어 있습니다.");
    }
    return Object.freeze({
      ...bookmark,
      name,
      position: patch.position === undefined ? bookmark.position : validateVec3(patch.position, "position"),
      target: patch.target === undefined ? bookmark.target : validateVec3(patch.target, "target"),
      fov: patch.fov === undefined ? bookmark.fov : clampStudioCameraFov(patch.fov),
    });
  });
}

/** 북마크를 삭제합니다. 없는 ID면 목록을 그대로 돌립니다. */
export function removeStudioCameraBookmark(
  bookmarks: readonly StudioCameraBookmark[],
  id: string,
): readonly StudioCameraBookmark[] {
  return bookmarks.filter((bookmark) => bookmark.id !== id);
}

/**
 * 북마크에서 카메라 적용 스펙(위치·주시점·FOV)을 복원합니다.
 * 실제 카메라 적용은 R3F 뷰 컴포넌트가 이 값을 읽어 수행합니다.
 */
export function applyStudioCameraBookmark(bookmark: StudioCameraBookmark): {
  readonly position: StudioMannequinVec3;
  readonly target: StudioMannequinVec3;
  readonly fov: number;
} {
  return { position: bookmark.position, target: bookmark.target, fov: bookmark.fov };
}
