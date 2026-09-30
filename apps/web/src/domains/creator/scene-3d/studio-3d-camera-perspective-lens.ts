/**
 * Studio 3D Manga Dynamic Camera Perspective Lens & Foreshortening Engine
 *
 * Implements:
 * - 5 Webtoon Lens Presets (12mm Fisheye, 24mm Dramatic, 50mm Standard, 85mm Portrait, 200mm Telephoto)
 * - Comic Dynamic Foreshortening (over-exaggerating foreground fists/weapons while preserving character scale)
 * - 1-Point, 2-Point, 3-Point Vanishing Point & Perspective Guide Line Solver
 */

export type CameraLensPreset =
  | "12mm-ultra-wide-fisheye"
  | "24mm-dramatic-low-angle"
  | "50mm-natural-dialogue"
  | "85mm-portrait-bokeh"
  | "200mm-telephoto-compression";

export type PerspectiveGuideMode = "1-point" | "2-point" | "3-point" | "off";

export interface LensOpticalParameters {
  readonly focalLengthMm: number;
  readonly fovDeg: number;
  readonly distortionCoeff: number; // barrel/pincushion distortion
  readonly depthOfFieldNear: number;
  readonly depthOfFieldFar: number;
}

export interface PerspectiveGridLine {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly vanishingPointIndex: number;
}

export interface VanishingPoint2D {
  readonly x: number;
  readonly y: number;
  readonly isInfinity: boolean;
}

export interface CameraLensPresetUi {
  readonly labelKo: string;
  readonly labelEn: string;
  /** 한 줄 설명(10초 이해용). */
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 호버 툴팁. */
  readonly tooltipKo: string;
  readonly tooltipEn: string;
}

/** 렌즈 프리셋 UI 메타데이터(ko/en, 한줄설명+툴팁). */
export const CAMERA_LENS_PRESET_UI: Readonly<Record<CameraLensPreset, CameraLensPresetUi>> =
  Object.freeze({
    "12mm-ultra-wide-fisheye": Object.freeze({
      labelKo: "12mm 어안",
      labelEn: "12mm Fisheye",
      descriptionKo: "극단적 광각. 공간이 휘어지는 박력 연출.",
      descriptionEn: "Extreme wide. Warped, punchy space.",
      tooltipKo: "12mm 어안 — 122° 초광각. 배경이 휘어지며 속도감·박력이 살아납니다.",
      tooltipEn: "12mm fisheye — 122° ultra-wide. Warped, high-energy space.",
    }),
    "24mm-dramatic-low-angle": Object.freeze({
      labelKo: "24mm 드라마틱",
      labelEn: "24mm Dramatic",
      descriptionKo: "넓은 화각의 로우앵글. 인물을 웅장하게.",
      descriptionEn: "Wide low-angle. Heroic, towering figures.",
      tooltipKo: "24mm 드라마틱 — 84° 광각. 로우앵글과 궁합이 좋은 웅장 연출.",
      tooltipEn: "24mm dramatic — 84° wide. Great with low angles.",
    }),
    "50mm-natural-dialogue": Object.freeze({
      labelKo: "50mm 표준",
      labelEn: "50mm Standard",
      descriptionKo: "사람 눈에 가장 가까운 자연스러운 화각.",
      descriptionEn: "Closest to human vision. Natural dialogue.",
      tooltipKo: "50mm 표준 — 46.8°. 왜곡 없는 자연스러운 대화·일상 컷.",
      tooltipEn: "50mm standard — 46.8°. Undistorted everyday shots.",
    }),
    "85mm-portrait-bokeh": Object.freeze({
      labelKo: "85mm 인물",
      labelEn: "85mm Portrait",
      descriptionKo: "배경이 녹아내리는 인물 클로즈업.",
      descriptionEn: "Melting background. Portrait close-ups.",
      tooltipKo: "85mm 인물 — 28.5°. 배경 흐림(보케)이 예쁜 인물·감정 컷.",
      tooltipEn: "85mm portrait — 28.5°. Creamy bokeh for emotion shots.",
    }),
    "200mm-telephoto-compression": Object.freeze({
      labelKo: "200mm 망원",
      labelEn: "200mm Telephoto",
      descriptionKo: "원근 압축. 멀리서 훔쳐보는 듯한 긴장감.",
      descriptionEn: "Compressed depth. Voyeuristic tension.",
      tooltipKo: "200mm 망원 — 12.3°. 원근이 압축되어 밀착·감시 느낌.",
      tooltipEn: "200mm telephoto — 12.3°. Compressed, watchful tension.",
    }),
  });

/** 렌즈 프리셋 ID로 UI 메타데이터를 찾습니다. 없으면 undefined를 돌립니다. */
export function getCameraLensPresetUi(preset: CameraLensPreset): CameraLensPresetUi | undefined {
  return CAMERA_LENS_PRESET_UI[preset];
}

export class Studio3DCameraPerspectiveLens {
  private activePreset: CameraLensPreset = "50mm-natural-dialogue";
  private foreshorteningFactor = 1.0; // 1.0 = realistic, up to 3.5 = hyper-dynamic manga
  private guideMode: PerspectiveGuideMode = "2-point";

  constructor(initialPreset: CameraLensPreset = "50mm-natural-dialogue") {
    this.activePreset = initialPreset;
  }

  public getPreset(): CameraLensPreset {
    return this.activePreset;
  }

  public setPreset(preset: CameraLensPreset): void {
    this.activePreset = preset;
  }

  public getForeshorteningFactor(): number {
    return this.foreshorteningFactor;
  }

  public setForeshorteningFactor(factor: number): void {
    this.foreshorteningFactor = Math.max(0.5, Math.min(3.5, factor));
  }

  public getGuideMode(): PerspectiveGuideMode {
    return this.guideMode;
  }

  public setGuideMode(mode: PerspectiveGuideMode): void {
    this.guideMode = mode;
  }

  /**
   * Resolves optical lens characteristics for the chosen focal length preset.
   */
  public evaluateLensParameters(preset: CameraLensPreset = this.activePreset): LensOpticalParameters {
    switch (preset) {
      case "12mm-ultra-wide-fisheye":
        return {
          focalLengthMm: 12,
          fovDeg: 122,
          distortionCoeff: -0.35, // Barrel distortion
          depthOfFieldNear: 0.1,
          depthOfFieldFar: 1000,
        };
      case "24mm-dramatic-low-angle":
        return {
          focalLengthMm: 24,
          fovDeg: 84,
          distortionCoeff: -0.08,
          depthOfFieldNear: 0.3,
          depthOfFieldFar: 500,
        };
      case "50mm-natural-dialogue":
        return {
          focalLengthMm: 50,
          fovDeg: 46.8,
          distortionCoeff: 0.0,
          depthOfFieldNear: 1.0,
          depthOfFieldFar: 100,
        };
      case "85mm-portrait-bokeh":
        return {
          focalLengthMm: 85,
          fovDeg: 28.5,
          distortionCoeff: 0.02,
          depthOfFieldNear: 1.5,
          depthOfFieldFar: 40,
        };
      case "200mm-telephoto-compression":
        return {
          focalLengthMm: 200,
          fovDeg: 12.3,
          distortionCoeff: 0.05, // Pincushion
          depthOfFieldNear: 5.0,
          depthOfFieldFar: 20,
        };
    }
  }

  /**
   * Calculates comic dynamic foreshortening scale multiplier for a 3D vertex based on distance from camera plane.
   */
  public evaluateForeshortenedVertex(
    vertexPos: readonly [number, number, number],
    cameraPos: readonly [number, number, number],
    referenceDistance = 2.0, // distance in meters where scale is 1.0
  ): [number, number, number] {
    const dx = vertexPos[0] - cameraPos[0];
    const dy = vertexPos[1] - cameraPos[1];
    const dz = vertexPos[2] - cameraPos[2];
    const dist = Math.hypot(dx, dy, dz) || 1e-4;

    if (dist >= referenceDistance || this.foreshorteningFactor <= 1.0) {
      return [vertexPos[0], vertexPos[1], vertexPos[2]];
    }

    // Proximity ratio: closer items scale up dramatically
    const proximityRatio = (referenceDistance - dist) / referenceDistance;
    const boost = 1.0 + (this.foreshorteningFactor - 1.0) * Math.pow(proximityRatio, 1.5);

    // Expand vertex radially from camera ray
    const rx = cameraPos[0] + dx * boost;
    const ry = cameraPos[1] + dy * boost;
    const rz = cameraPos[2] + dz; // Keep depth

    return [rx, ry, rz];
  }

  /**
   * Evaluates 2D canvas vanishing points and perspective guide lines for artist overlays.
   */
  public evaluatePerspectiveGuides(
    canvasWidth: number,
    canvasHeight: number,
    cameraYawDeg = 30,
    cameraPitchDeg = -15,
  ): {
    readonly vanishingPoints: readonly VanishingPoint2D[];
    readonly guideLines: readonly PerspectiveGridLine[];
  } {
    if (this.guideMode === "off") {
      return { vanishingPoints: [], guideLines: [] };
    }

    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;

    const horizonY = cy + Math.tan((cameraPitchDeg * Math.PI) / 180) * (canvasHeight * 0.8);
    const yawRad = (cameraYawDeg * Math.PI) / 180;

    // VP1 (Left) & VP2 (Right) on Horizon
    const vpDist = canvasWidth * 1.2;
    const vp1: VanishingPoint2D = { x: cx - vpDist * Math.cos(yawRad), y: horizonY, isInfinity: false };
    const vp2: VanishingPoint2D = { x: cx + vpDist * Math.sin(yawRad), y: horizonY, isInfinity: false };
    // VP3 (Vertical 3-Point)
    const vp3: VanishingPoint2D = {
      x: cx,
      y: cameraPitchDeg < 0 ? -canvasHeight * 1.5 : canvasHeight * 2.5,
      isInfinity: false,
    };

    const vanishingPoints: VanishingPoint2D[] = [vp1, vp2];
    if (this.guideMode === "3-point") {
      vanishingPoints.push(vp3);
    }

    const guideLines: PerspectiveGridLine[] = [];
    const lineCountPerVp = 6;

    for (let vpIdx = 0; vpIdx < vanishingPoints.length; vpIdx++) {
      const vp = vanishingPoints[vpIdx];
      for (let i = 0; i < lineCountPerVp; i++) {
        const t = i / (lineCountPerVp - 1);
        const targetX = t * canvasWidth;
        const targetY = canvasHeight;

        guideLines.push({
          startX: vp.x,
          startY: vp.y,
          endX: targetX,
          endY: targetY,
          vanishingPointIndex: vpIdx,
        });
      }
    }

    return { vanishingPoints, guideLines };
  }
}
