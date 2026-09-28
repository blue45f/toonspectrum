/**
 * 가상 스튜디오 가구 배치의 서버 정본 계약.
 *
 * 이 파일은 웹과 API가 함께 쓰는 유일한 허용 목록이다. 서버는 클라이언트가
 * 보낸 값을 신뢰하지 않고 여기 정의된 값만 받아들인다. 웹 쪽
 * `studio-virtual-space-customization.ts`의 로컬 상수와 어긋나면 그 차이를
 * 이 파일의 테스트가 잡아낸다.
 */

/** 서버가 받아들이는 가구 종류. 웹의 STUDIO_VIRTUAL_DECOR_TYPES와 열이 같아야 한다. */
export const STUDIO_VIRTUAL_DECOR_TYPES = [
  "tree", "flower-bed", "bench", "lamp", "banner", "market-stall",
  "fountain", "portal", "rug", "sign", "parasol", "pet",
  "drawing-desk", "bookshelf", "review-board", "sofa",
] as const;

export type StudioVirtualDecorType = (typeof STUDIO_VIRTUAL_DECOR_TYPES)[number];

/** 서버가 받아들이는 장소. 웹의 STUDIO_TOWN_DISTRICT_IDS와 열이 같아야 한다. */
export const STUDIO_VIRTUAL_DISTRICT_IDS = [
  "archive-grove", "story-terrace", "production-heights", "atelier-gardens",
  "review-falls", "commons-market", "sky-port",
] as const;

export type StudioVirtualDistrictId = (typeof STUDIO_VIRTUAL_DISTRICT_IDS)[number];

export const STUDIO_VIRTUAL_PRESET_KEYS = ["minimal", "creator-garden", "festival", "night-market"] as const;
export type StudioVirtualPresetKey = (typeof STUDIO_VIRTUAL_PRESET_KEYS)[number];

export const STUDIO_VIRTUAL_PRESENTATION_MODES = ["minimal", "decorated", "festival"] as const;
export type StudioVirtualPresentationMode = (typeof STUDIO_VIRTUAL_PRESENTATION_MODES)[number];

export const STUDIO_VIRTUAL_ROTATIONS = [0, 90, 180, 270] as const;
export type StudioVirtualRotation = (typeof STUDIO_VIRTUAL_ROTATIONS)[number];

/** 한 장소에 둘 수 있는 가구 수의 상한. 서버가 더 많은 요청을 잘라낸다. */
export const STUDIO_VIRTUAL_MAX_PLACEMENTS = 36;

/** 확대·축소 범위. 0 이하는 렌러에서 보이지 않거나 뒤집히므로 서버가 거부한다. */
export const STUDIO_VIRTUAL_SCALE_MIN = 0.5;
export const STUDIO_VIRTUAL_SCALE_MAX = 2;

/** 월드 좌표 상한. 이전 저장본의 1280×960 월드와, 더 큰 월드를 모두 받아들인다. */
export const STUDIO_VIRTUAL_WORLD_MAX = 8192;

/** furniture id 허용 형식. 서버가 발급한 값만 다시 받아들이기 위한 형식 강제다. */
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/u;

export interface StudioVirtualPlacementDto {
  readonly id: string;
  readonly type: StudioVirtualDecorType;
  readonly x: number;
  readonly y: number;
  readonly rotation: StudioVirtualRotation;
  readonly scale: number;
}

export interface StudioVirtualDecorationSaveDto {
  readonly districtKey: StudioVirtualDistrictId;
  readonly presetKey: StudioVirtualPresetKey;
  readonly presentationMode: StudioVirtualPresentationMode;
  readonly placements: readonly StudioVirtualPlacementDto[];
  /** 낙관적 동시성 토큰. 서버 revision과 다르면 409로 거절한다. */
  readonly expectedRevision: number;
  readonly layoutWidth: number;
  readonly layoutHeight: number;
}

export interface StudioVirtualDecorationStateDto {
  readonly districtKey: StudioVirtualDistrictId;
  readonly presetKey: StudioVirtualPresetKey;
  readonly presentationMode: StudioVirtualPresentationMode;
  readonly placements: readonly StudioVirtualPlacementDto[];
  readonly revision: number;
  readonly layoutWidth: number;
  readonly layoutHeight: number;
}

export type StudioVirtualDecorationSaveResult =
  | { readonly ok: true; readonly value: StudioVirtualDecorationSaveDto }
  | { readonly ok: false; readonly error: string; readonly reason: StudioVirtualDecorationRejectReason };

export type StudioVirtualDecorationRejectReason =
  | "shape"
  | "district"
  | "preset"
  | "mode"
  | "placement"
  | "too_many"
  | "revision";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/**
 * `isOneOf`는 문자열만 받는다. 회전각을 거기에 넣으면 `typeof` 검사에서 항상
 * 걸러져 정상 배치가 전부 "malformed"가 된다. 숫자 목록은 반드시 이 경로로 확인한다.
 */
function isOneOfNumber<T extends readonly number[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "number" && (values as readonly number[]).includes(value);
}

/** 유한한 수만 받아들인다. NaN과 Infinity는 좌표를 조용히 망가뜨린다. */
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseStudioVirtualPlacement(value: unknown): StudioVirtualPlacementDto | string {
  const body = record(value);
  if (!body) return "malformed";

  if (typeof body.id !== "string" || !ID_PATTERN.test(body.id)) return "malformed";
  if (!isOneOf(STUDIO_VIRTUAL_DECOR_TYPES, body.type)) return "malformed";
  if (!isOneOfNumber(STUDIO_VIRTUAL_ROTATIONS, body.rotation)) return "malformed";
  if (!finite(body.x) || !finite(body.y)) return "malformed";
  if (!finite(body.scale)) return "malformed";
  if (body.scale < STUDIO_VIRTUAL_SCALE_MIN || body.scale > STUDIO_VIRTUAL_SCALE_MAX) return "malformed";

  return {
    id: body.id,
    type: body.type,
    x: body.x,
    y: body.y,
    rotation: body.rotation,
    scale: body.scale,
  };
}

export function validateStudioVirtualDecorationSave(input: unknown): StudioVirtualDecorationSaveResult {
  const body = record(input);
  if (!body) return { ok: false, error: "배치 정보를 확인해 주세요.", reason: "shape" };

  if (!isOneOf(STUDIO_VIRTUAL_DISTRICT_IDS, body.districtKey)) {
    return { ok: false, error: "알 수 없는 장소입니다.", reason: "district" };
  }
  if (!isOneOf(STUDIO_VIRTUAL_PRESET_KEYS, body.presetKey)) {
    return { ok: false, error: "알 수 없는 미리보기입니다.", reason: "preset" };
  }
  if (!isOneOf(STUDIO_VIRTUAL_PRESENTATION_MODES, body.presentationMode)) {
    return { ok: false, error: "알 수 없는 연출 방식입니다.", reason: "mode" };
  }

  if (!finite(body.expectedRevision) || body.expectedRevision < 0 || !Number.isInteger(body.expectedRevision)) {
    return { ok: false, error: "저장 버전이 올바르지 않습니다.", reason: "revision" };
  }

  const width = finite(body.layoutWidth) ? body.layoutWidth : 1280;
  const height = finite(body.layoutHeight) ? body.layoutHeight : 960;
  if (width <= 0 || height <= 0 || width > STUDIO_VIRTUAL_WORLD_MAX || height > STUDIO_VIRTUAL_WORLD_MAX) {
    return { ok: false, error: "월드 크기가 허용 범위를 벗어났습니다.", reason: "placement" };
  }

  if (!Array.isArray(body.placements)) {
    return { ok: false, error: "가구 목록이 올바르지 않습니다.", reason: "placement" };
  }
  if (body.placements.length > STUDIO_VIRTUAL_MAX_PLACEMENTS) {
    return {
      ok: false,
      error: `가구 수는 ${STUDIO_VIRTUAL_MAX_PLACEMENTS}개를 넘을 수 없습니다.`,
      reason: "too_many",
    };
  }

  const placements: StudioVirtualPlacementDto[] = [];
  const seen = new Set<string>();
  for (const candidate of body.placements) {
    const parsed = parseStudioVirtualPlacement(candidate);
    if (typeof parsed === "string") {
      return { ok: false, error: "가구 배치 값이 올바르지 않습니다.", reason: "placement" };
    }
    // 같은 id가 두 번 오면 렌더 순서가 입력 순서에 의존하게 되어 저장 결과가 흔들린다.
    if (seen.has(parsed.id)) {
      return { ok: false, error: "같은 가구가 두 번 포함되어 있습니다.", reason: "placement" };
    }
    seen.add(parsed.id);
    placements.push(parsed);
  }

  return {
    ok: true,
    value: {
      districtKey: body.districtKey,
      presetKey: body.presetKey,
      presentationMode: body.presentationMode,
      placements,
      expectedRevision: body.expectedRevision,
      layoutWidth: width,
      layoutHeight: height,
    },
  };
}

/** 서버가 아직 저장이 없을 때 처음 내려주는 상태. 클라이언트 로컬 기본값과 같은 모양이어야 한다. */
export function emptyStudioVirtualDecorationState(
  districtKey: StudioVirtualDistrictId,
): StudioVirtualDecorationStateDto {
  return {
    districtKey,
    presetKey: "minimal",
    presentationMode: "minimal",
    placements: [],
    revision: 0,
    layoutWidth: 1280,
    layoutHeight: 960,
  };
}
