/**
 * 3D 배경 → 웹툰 컷 렌더링 작업 명세.
 *
 * bg3d 에디터의 3D 장면을 웹툰 컷(2D 이미지)으로 뽑아내는 렌더 작업의
 * 입력 명세를 검증·정규화하는 순수 모듈. 실제 캡처는 기존 CaptureBridge 패턴의
 * 어댑터가 수행하고, 이 모듈은 "무엇을 어떻게 뽑을지"만 다룬다.
 */

export type XrCutAspectId = "cut-1-1" | "cut-3-4" | "cut-4-5" | "cut-9-16" | "cut-16-9";

export interface XrCutAspect {
  readonly id: XrCutAspectId;
  readonly widthRatio: number;
  readonly heightRatio: number;
  readonly label: { readonly ko: string; readonly en: string };
}

export const XR_CUT_ASPECTS: Readonly<Record<XrCutAspectId, XrCutAspect>> = Object.freeze({
  "cut-1-1": {
    id: "cut-1-1",
    widthRatio: 1,
    heightRatio: 1,
    label: { ko: "정사각형 (1:1)", en: "Square (1:1)" },
  },
  "cut-3-4": {
    id: "cut-3-4",
    widthRatio: 3,
    heightRatio: 4,
    label: { ko: "세로 컷 (3:4)", en: "Portrait cut (3:4)" },
  },
  "cut-4-5": {
    id: "cut-4-5",
    widthRatio: 4,
    heightRatio: 5,
    label: { ko: "웹툰 표준 (4:5)", en: "Webtoon standard (4:5)" },
  },
  "cut-9-16": {
    id: "cut-9-16",
    widthRatio: 9,
    heightRatio: 16,
    label: { ko: "풀 세로 (9:16)", en: "Full portrait (9:16)" },
  },
  "cut-16-9": {
    id: "cut-16-9",
    widthRatio: 16,
    heightRatio: 9,
    label: { ko: "와이드 (16:9)", en: "Wide (16:9)" },
  },
});

export type XrCutScreentone = "none" | "dots" | "lines";

export interface XrCutToonStyle {
  /** 만화식 단계 음영을 켠다. */
  readonly toonShading: boolean;
  /** 외곽선 강조 0..1. */
  readonly outline: number;
  readonly screentone: XrCutScreentone;
  /** 하프톤 도트 사용. */
  readonly halftone: boolean;
}

export type XrCutVec3 = readonly [number, number, number];

export interface XrCutCamera {
  readonly position: XrCutVec3;
  readonly lookAt: XrCutVec3;
  /** 수직 화각(deg). 10..120. */
  readonly fovDeg: number;
}

/** 자주 쓰는 카메라 프리셋. */
export const XR_CUT_CAMERA_PRESETS = Object.freeze({
  "eye-level": {
    position: [0, 1.6, 4] as XrCutVec3,
    lookAt: [0, 1.2, 0] as XrCutVec3,
    fovDeg: 45,
  },
  "low-angle": {
    position: [0, 0.6, 3.2] as XrCutVec3,
    lookAt: [0, 1.8, 0] as XrCutVec3,
    fovDeg: 50,
  },
  "high-angle": {
    position: [0, 3.4, 3.4] as XrCutVec3,
    lookAt: [0, 0.8, 0] as XrCutVec3,
    fovDeg: 50,
  },
  "close-up": {
    position: [0, 1.7, 1.6] as XrCutVec3,
    lookAt: [0, 1.6, 0] as XrCutVec3,
    fovDeg: 35,
  },
} as const);
export type XrCutCameraPresetId = keyof typeof XR_CUT_CAMERA_PRESETS;

export interface XrCutCaptureJob {
  readonly kind: "toonstudio.xr-cut-capture-job";
  readonly jobId: string;
  readonly aspect: XrCutAspect;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly camera: XrCutCamera;
  readonly style: XrCutToonStyle;
}

export type XrCutCaptureErrorCode =
  | "bad-aspect"
  | "bad-size"
  | "bad-fov"
  | "bad-outline"
  | "bad-job-id";

export class XrCutCaptureError extends Error {
  readonly code: XrCutCaptureErrorCode;
  constructor(code: XrCutCaptureErrorCode, message: string) {
    super(message);
    this.name = "XrCutCaptureError";
    this.code = code;
  }
}

export const XR_CUT_LONG_EDGE_MIN_PX = 256 as const;
export const XR_CUT_LONG_EDGE_MAX_PX = 4096 as const;

function isFiniteVec3(v: XrCutVec3): boolean {
  return v.length === 3 && v.every(Number.isFinite);
}

/** 화면비와 긴 변 길이로부터 출력 해상도를 계산한다. */
export function xrCutOutputSize(
  aspectId: XrCutAspectId,
  longEdgePx: number,
): { readonly width: number; readonly height: number } {
  const aspect = XR_CUT_ASPECTS[aspectId];
  if (!aspect) {
    throw new XrCutCaptureError("bad-aspect", `Unknown cut aspect: ${aspectId}`);
  }
  if (!Number.isFinite(longEdgePx)) {
    throw new XrCutCaptureError("bad-size", "Long edge must be a finite number.");
  }
  const longEdge = Math.round(longEdgePx);
  if (longEdge < XR_CUT_LONG_EDGE_MIN_PX || longEdge > XR_CUT_LONG_EDGE_MAX_PX) {
    throw new XrCutCaptureError(
      "bad-size",
      `Long edge must be ${XR_CUT_LONG_EDGE_MIN_PX}..${XR_CUT_LONG_EDGE_MAX_PX}px.`,
    );
  }
  const landscape = aspect.widthRatio >= aspect.heightRatio;
  const width = landscape
    ? longEdge
    : Math.round((longEdge * aspect.widthRatio) / aspect.heightRatio);
  const height = landscape
    ? Math.round((longEdge * aspect.heightRatio) / aspect.widthRatio)
    : longEdge;
  return { width, height };
}

function normalizeStyle(style: XrCutToonStyle): XrCutToonStyle {
  const outline = Number.isFinite(style.outline)
    ? Math.min(1, Math.max(0, style.outline))
    : 0.5;
  return {
    toonShading: style.toonShading === true,
    outline,
    screentone: style.screentone === "dots" || style.screentone === "lines"
      ? style.screentone
      : "none",
    halftone: style.halftone === true,
  };
}

function normalizeCamera(camera: XrCutCamera): XrCutCamera {
  if (!isFiniteVec3(camera.position) || !isFiniteVec3(camera.lookAt)) {
    throw new XrCutCaptureError("bad-fov", "Camera position/lookAt must be finite vec3.");
  }
  if (!Number.isFinite(camera.fovDeg) || camera.fovDeg < 10 || camera.fovDeg > 120) {
    throw new XrCutCaptureError("bad-fov", "FOV must be 10..120 degrees.");
  }
  return {
    position: [camera.position[0], camera.position[1], camera.position[2]],
    lookAt: [camera.lookAt[0], camera.lookAt[1], camera.lookAt[2]],
    fovDeg: camera.fovDeg,
  };
}

export interface XrCutCaptureJobInput {
  readonly jobId: string;
  readonly aspectId: XrCutAspectId;
  readonly longEdgePx: number;
  readonly camera: XrCutCamera;
  readonly style: XrCutToonStyle;
}

/** 렌더 작업 명세를 검증·정규화해 만든다. */
export function createXrCutCaptureJob(input: XrCutCaptureJobInput): XrCutCaptureJob {
  if (typeof input.jobId !== "string" || input.jobId.trim().length === 0) {
    throw new XrCutCaptureError("bad-job-id", "Job id must be a non-empty string.");
  }
  const aspect = XR_CUT_ASPECTS[input.aspectId];
  if (!aspect) {
    throw new XrCutCaptureError("bad-aspect", `Unknown cut aspect: ${input.aspectId}`);
  }
  const { width, height } = xrCutOutputSize(input.aspectId, input.longEdgePx);
  return Object.freeze({
    kind: "toonstudio.xr-cut-capture-job",
    jobId: input.jobId.trim(),
    aspect,
    widthPx: width,
    heightPx: height,
    camera: normalizeCamera(input.camera),
    style: normalizeStyle(input.style),
  });
}

/** 저장 파일명. 예: toonstudio-cut-cut-4-5-800x1000.png */
export function xrCutCaptureFilename(job: XrCutCaptureJob): string {
  return `toonstudio-cut-${job.aspect.id}-${job.widthPx}x${job.heightPx}.png`;
}
