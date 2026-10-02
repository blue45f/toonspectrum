/**
 * 캡처(멀티패스 readback)·썸네일 계약.
 * 래스터 규약: straight alpha, top-down 행 순서, sRGB 8bit. 깊이는 0=near..1=far 선형 F32.
 */
import type { ApplyPlan } from "./apply-plan";
import type { EngineBackend } from "./backend";
import type { CharacterSource } from "./engine";
import type { PartIdPalette } from "./mesh-data";
import type { RasterPassId, RenderPassId } from "./passes";
import type { PhysicsProviderId } from "./physics";
import type { PresetId } from "./slots";

export const CAPTURE_PROFILE_ID = "character-lab-rgba8-straight-srgb-topdown-depth-f32-v1";
export type CaptureProfileId = typeof CAPTURE_PROFILE_ID;

export interface CapturedRaster {
  readonly width: number;
  readonly height: number;
  /** width*height*4, straight alpha, top-down, sRGB */
  readonly rgba: Uint8ClampedArray;
}

export interface CapturedDepth {
  readonly width: number;
  readonly height: number;
  /** width*height, 0=near..1=far 선형 */
  readonly depth: Float32Array;
  readonly near: number;
  readonly far: number;
}

export const CAMERA_FRAMING_MODES = ["full-body", "bust", "face", "custom"] as const;
export type CameraFramingMode = (typeof CAMERA_FRAMING_MODES)[number];

export interface CameraFraming {
  readonly mode: CameraFramingMode;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  /** 모드 기본 거리에 곱하는 배율(1 = 기본) */
  readonly distanceScale: number;
}

export const DEFAULT_FRAMING: CameraFraming = Object.freeze({ mode: "full-body", yawDeg: 0, pitchDeg: 0, distanceScale: 1 });
export const BUST_FRAMING: CameraFraming = Object.freeze({ mode: "bust", yawDeg: 0, pitchDeg: 0, distanceScale: 1 });
export const FACE_FRAMING: CameraFraming = Object.freeze({ mode: "face", yawDeg: 0, pitchDeg: 0, distanceScale: 1 });

export interface CaptureRequest {
  readonly width: number;
  readonly height: number;
  readonly passes: readonly RenderPassId[];
  /** 항상 투명 배경(clearColor 0,0,0,0) */
  readonly transparentBackground: true;
  /** 캡처 전 물리 settle 스텝 수(0 = settle 없음) */
  readonly settleSteps: number;
  readonly camera?: CameraFraming;
}

export interface CaptureProvenance {
  readonly backend: EngineBackend | "null";
  /** NullEngine 등 실제 GPU readback이 아닌 합성 결과이면 true */
  readonly synthetic: boolean;
  readonly physicsProvider: PhysicsProviderId;
  readonly settleSteps: number;
  readonly recipeDigest: string;
}

export interface CaptureResult {
  readonly profile: CaptureProfileId;
  readonly width: number;
  readonly height: number;
  readonly passes: Partial<Record<RasterPassId, CapturedRaster>>;
  readonly depth?: CapturedDepth;
  readonly partIdPalette: PartIdPalette;
  readonly provenance: CaptureProvenance;
}

export const THUMBNAIL_SIZES = [96, 128, 192] as const;
export type ThumbnailSize = (typeof THUMBNAIL_SIZES)[number];

export interface ThumbnailRequest {
  readonly presetId: PresetId;
  /** 프리셋을 임시 적용한 플랜 */
  readonly plan: ApplyPlan;
  readonly size: ThumbnailSize;
  readonly framing: CameraFraming;
  /**
   * 지오메트리를 바꾸는 프리셋(헤어·의상·신발·눈 스타일 등)의 미리보기 소스(2026-10-01 core 추가, 선택).
   * 절차 소스는 선택한 슬롯의 지오메트리만 담으므로(소스 재생성 키 = humanoid `geometryKeyOf`), 다른 헤어 카드도 현재 헤어로 그려지는 것을
   * 막으려면 프리셋을 적용한 소스가 필요하다. `CharacterEngine.thumbnailSources === true`인 엔진에만 보낸다.
   * 엔진은 주 장면의 리그·플랜 상태를 건드리지 않고 이 소스로 임시 리그를 만들어 `plan`을 적용해 그린 뒤 해제한다.
   * 없으면 현재 로드된 소스를 그린다.
   */
  readonly source?: CharacterSource;
}

/** 썸네일 캐시 항목(LabState.thumbnails 값) */
export interface ThumbnailEntry {
  readonly status: "pending" | "ready" | "failed";
  readonly raster?: CapturedRaster;
  readonly reasonKo?: string;
  /** state/thumbnail-cache.ts `thumbnailCacheKey` 결과 */
  readonly cacheKey: string;
}

/** 요청 크기와 패스 수로 readback 바이트 수를 추정(메모리 예산 검사용) */
export function estimateCaptureBytes(req: Pick<CaptureRequest, "width" | "height" | "passes">): number {
  const pixels = req.width * req.height;
  return pixels * 4 * req.passes.length;
}

/** 빈(완전 투명) 래스터 */
export function createEmptyRaster(width: number, height: number): CapturedRaster {
  return { width, height, rgba: new Uint8ClampedArray(width * height * 4) };
}
