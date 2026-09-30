/**
 * Studio 3D Cinematography Rail & Webtoon Multi-Panel Camera Director
 *
 * Implements Catmull-Rom 3D camera spline tracking, keyframe timeline easing,
 * focal length (14mm-200mm) / FOV calculation, Dutch roll interpolation,
 * and automated vertical webtoon comic strip panel extraction.
 */

export type CameraTempoEasing = "linear" | "ease-in-out" | "dramatic-snap" | "whip-pan";

export interface CameraTempoEasingUi {
  readonly labelKo: string;
  readonly labelEn: string;
  readonly tooltipKo: string;
  readonly tooltipEn: string;
}

/** 카메라 이동 템포(이지) UI 메타데이터(ko/en 라벨+툴팁). */
export const CAMERA_TEMPO_EASING_UI: Readonly<Record<CameraTempoEasing, CameraTempoEasingUi>> =
  Object.freeze({
    linear: Object.freeze({
      labelKo: "일정하게",
      labelEn: "Linear",
      tooltipKo: "일정하게 — 속도 변화 없이 균일하게 이동합니다.",
      tooltipEn: "Linear — moves at a constant speed.",
    }),
    "ease-in-out": Object.freeze({
      labelKo: "부드럽게",
      labelEn: "Ease in-out",
      tooltipKo: "부드럽게 — 천천히 시작해 천천히 멈춥니다. 기본값.",
      tooltipEn: "Ease in-out — slow start, slow stop. The default.",
    }),
    "dramatic-snap": Object.freeze({
      labelKo: "급가속",
      labelEn: "Dramatic snap",
      tooltipKo: "급가속 — 클라이맥스를 향해 급격히 빨라집니다.",
      tooltipEn: "Dramatic snap — accelerates hard toward the climax.",
    }),
    "whip-pan": Object.freeze({
      labelKo: "휩 팬",
      labelEn: "Whip pan",
      tooltipKo: "휩 팬 — 부드럽게 시작했다가 휙 지나가 안정됩니다.",
      tooltipEn: "Whip pan — smooth start, sudden whip, smooth settle.",
    }),
  });

/** 템포 이징 ID로 UI 메타데이터를 찾습니다. 없으면 undefined를 돌립니다. */
export function getCameraTempoEasingUi(easing: CameraTempoEasing): CameraTempoEasingUi | undefined {
  return CAMERA_TEMPO_EASING_UI[easing];
}

export interface CameraKeyframe {
  readonly id: string;
  readonly timeSec: number;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly focalLengthMm: number; // 14mm to 200mm
  readonly dutchRollDeg: number;  // -45 to +45 deg
  readonly dofFocusDistance: number; // meters
  readonly dofAperture: number; // f-stop (1.4, 2.8, 5.6, etc.)
  readonly tempoEasing: CameraTempoEasing;
}

export interface EvaluatedCameraFrame {
  readonly timeSec: number;
  readonly position: [number, number, number];
  readonly target: [number, number, number];
  readonly upVector: [number, number, number];
  readonly fovDeg: number;
  readonly focalLengthMm: number;
  readonly dutchRollDeg: number;
  readonly dofFocusDistance: number;
  readonly dofAperture: number;
}

export interface WebtoonPanelShotProposal {
  readonly panelIndex: number;
  readonly timeSec: number;
  readonly frame: EvaluatedCameraFrame;
  readonly recommendedAspect: "1:1" | "4:3" | "16:9" | "9:16-vertical" | "21:9-cinematic";
  readonly shotLabel: string;
}

export class Studio3DCinematographyRail {
  private keyframes: CameraKeyframe[] = [];
  private tension = 0.5; // Catmull-Rom default tension

  constructor(initialKeyframes?: readonly CameraKeyframe[]) {
    if (initialKeyframes !== undefined) {
      this.keyframes = [...initialKeyframes].sort((a, b) => a.timeSec - b.timeSec);
    } else {
      this.initDefaultRail();
    }
  }

  private initDefaultRail(): void {
    this.keyframes = [
      {
        id: "kf-0",
        timeSec: 0,
        position: [0, 1.8, 6.0],
        target: [0, 1.4, 0],
        focalLengthMm: 35,
        dutchRollDeg: 0,
        dofFocusDistance: 6.0,
        dofAperture: 4.0,
        tempoEasing: "ease-in-out",
      },
      {
        id: "kf-1",
        timeSec: 2.0,
        position: [2.5, 1.6, 3.5],
        target: [0, 1.4, 0],
        focalLengthMm: 50,
        dutchRollDeg: -5,
        dofFocusDistance: 4.2,
        dofAperture: 2.8,
        tempoEasing: "ease-in-out",
      },
      {
        id: "kf-2",
        timeSec: 4.0,
        position: [0.8, 1.2, 1.5],
        target: [0, 1.4, 0],
        focalLengthMm: 85,
        dutchRollDeg: 8,
        dofFocusDistance: 1.6,
        dofAperture: 1.8,
        tempoEasing: "dramatic-snap",
      },
    ];
  }

  public getKeyframes(): readonly CameraKeyframe[] {
    return this.keyframes;
  }

  public getDurationSec(): number {
    if (this.keyframes.length === 0) return 0;
    return this.keyframes[this.keyframes.length - 1].timeSec;
  }

  public addKeyframe(kf: CameraKeyframe): void {
    this.keyframes = [...this.keyframes.filter((k) => k.id !== kf.id), kf].sort(
      (a, b) => a.timeSec - b.timeSec,
    );
  }

  public removeKeyframe(id: string): void {
    this.keyframes = this.keyframes.filter((k) => k.id !== id);
  }

  public setTension(tension: number): void {
    this.tension = Math.max(0, Math.min(1, tension));
  }

  /**
   * Evaluates camera parameters along the spline at any arbitrary timeSec.
   */
  public evaluateAt(timeSec: number): EvaluatedCameraFrame {
    if (this.keyframes.length === 0) {
      return {
        timeSec,
        position: [0, 1.5, 5],
        target: [0, 1.5, 0],
        upVector: [0, 1, 0],
        fovDeg: 50,
        focalLengthMm: 35,
        dutchRollDeg: 0,
        dofFocusDistance: 5,
        dofAperture: 2.8,
      };
    }

    if (this.keyframes.length === 1 || timeSec <= this.keyframes[0].timeSec) {
      const kf = this.keyframes[0];
      return this.frameFromKeyframe(kf, timeSec);
    }

    if (timeSec >= this.keyframes[this.keyframes.length - 1].timeSec) {
      const kf = this.keyframes[this.keyframes.length - 1];
      return this.frameFromKeyframe(kf, timeSec);
    }

    // Find segment [k1, k2]
    let segIdx = 0;
    for (let i = 0; i < this.keyframes.length - 1; i += 1) {
      if (timeSec >= this.keyframes[i].timeSec && timeSec <= this.keyframes[i + 1].timeSec) {
        segIdx = i;
        break;
      }
    }

    const k0 = this.keyframes[Math.max(0, segIdx - 1)];
    const k1 = this.keyframes[segIdx];
    const k2 = this.keyframes[segIdx + 1];
    const k3 = this.keyframes[Math.min(this.keyframes.length - 1, segIdx + 2)];

    const segDuration = k2.timeSec - k1.timeSec;
    const rawT = segDuration > 0 ? (timeSec - k1.timeSec) / segDuration : 0;
    const t = applyTempoEasing(rawT, k1.tempoEasing);

    // Catmull-Rom position and target interpolation
    const position = catmullRomVector3(k0.position, k1.position, k2.position, k3.position, t, this.tension);
    const target = catmullRomVector3(k0.target, k1.target, k2.target, k3.target, t, this.tension);

    // Linear interpolation for scalars
    const focalLengthMm = lerp(k1.focalLengthMm, k2.focalLengthMm, t);
    const dutchRollDeg = lerp(k1.dutchRollDeg, k2.dutchRollDeg, t);
    const dofFocusDistance = lerp(k1.dofFocusDistance, k2.dofFocusDistance, t);
    const dofAperture = lerp(k1.dofAperture, k2.dofAperture, t);

    const fovDeg = focalLengthToFov(focalLengthMm);
    const upVector = computeUpVectorWithDutchRoll(position, target, dutchRollDeg);

    return {
      timeSec,
      position,
      target,
      upVector,
      fovDeg,
      focalLengthMm,
      dutchRollDeg,
      dofFocusDistance,
      dofAperture,
    };
  }

  /**
   * Generates a sequence of discrete Webtoon panel cuts spaced along the rail.
   */
  public generateWebtoonPanelProposals(panelCount = 4): readonly WebtoonPanelShotProposal[] {
    const count = Math.max(1, panelCount);
    const duration = this.getDurationSec();
    const proposals: WebtoonPanelShotProposal[] = [];

    for (let i = 0; i < count; i += 1) {
      const t = count > 1 ? (i / (count - 1)) * duration : 0;
      const frame = this.evaluateAt(t);

      let aspect: WebtoonPanelShotProposal["recommendedAspect"];
      let label: string;

      if (frame.focalLengthMm <= 24) {
        aspect = "21:9-cinematic";
        label = `Cut ${i + 1} (와이드 익스트림 샷)`;
      } else if (frame.focalLengthMm >= 70) {
        aspect = "9:16-vertical";
        label = `Cut ${i + 1} (클로즈업 감정선)`;
      } else {
        aspect = "1:1";
        label = `Cut ${i + 1} (미디엄 샷)`;
      }

      proposals.push({
        panelIndex: i,
        timeSec: t,
        frame,
        recommendedAspect: aspect,
        shotLabel: label,
      });
    }

    return proposals;
  }

  private frameFromKeyframe(kf: CameraKeyframe, timeSec: number): EvaluatedCameraFrame {
    const fovDeg = focalLengthToFov(kf.focalLengthMm);
    const upVector = computeUpVectorWithDutchRoll(kf.position, kf.target, kf.dutchRollDeg);

    return {
      timeSec,
      position: [...kf.position],
      target: [...kf.target],
      upVector,
      fovDeg,
      focalLengthMm: kf.focalLengthMm,
      dutchRollDeg: kf.dutchRollDeg,
      dofFocusDistance: kf.dofFocusDistance,
      dofAperture: kf.dofAperture,
    };
  }
}

function focalLengthToFov(focalLengthMm: number): number {
  const clamped = Math.max(12, Math.min(300, focalLengthMm));
  // 35mm full-frame sensor height = 24mm
  return 2 * Math.atan(24 / (2 * clamped)) * (180 / Math.PI);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function applyTempoEasing(t: number, easing: CameraTempoEasing): number {
  switch (easing) {
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case "dramatic-snap":
      // Accelerates rapidly toward the climax
      return Math.pow(t, 3);
    case "whip-pan":
      // Smooth start, sudden whip, smooth settle
      return Math.sin((t * Math.PI) / 2);
    case "linear":
    default:
      return t;
  }
}

function catmullRomVector3(
  p0: readonly [number, number, number],
  p1: readonly [number, number, number],
  p2: readonly [number, number, number],
  p3: readonly [number, number, number],
  t: number,
  _tension: number,
): [number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;

  const result: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const v0 = p0[i];
    const v1 = p1[i];
    const v2 = p2[i];
    const v3 = p3[i];

    result[i] =
      0.5 *
      (2 * v1 +
        (-v0 + v2) * t +
        (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
        (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
  }
  return result;
}

function computeUpVectorWithDutchRoll(
  pos: readonly [number, number, number],
  tgt: readonly [number, number, number],
  dutchRollDeg: number,
): [number, number, number] {
  // Forward vector
  const fx = tgt[0] - pos[0];
  const fy = tgt[1] - pos[1];
  const fz = tgt[2] - pos[2];
  const fLen = Math.hypot(fx, fy, fz) || 1;
  const dirX = fx / fLen;
  const dirY = fy / fLen;
  const dirZ = fz / fLen;

  // Approximate default world up [0, 1, 0]
  const rollRad = (dutchRollDeg * Math.PI) / 180;
  const cosR = Math.cos(rollRad);
  const sinR = Math.sin(rollRad);

  // Right vector = WorldUp x Forward
  const rx = -dirZ;
  const ry = 0;
  const rz = dirX;
  const rLen = Math.hypot(rx, ry, rz) || 1;
  const rNormX = rx / rLen;
  const rNormY = ry / rLen;
  const rNormZ = rz / rLen;

  // Real camera Up = Forward x Right
  const upX = dirY * rNormZ - dirZ * rNormY;
  const upY = dirZ * rNormX - dirX * rNormZ;
  const upZ = dirX * rNormY - dirY * rNormX;

  // Apply Dutch Roll rotation around Forward axis
  return [
    upX * cosR + rNormX * sinR,
    upY * cosR + rNormY * sinR,
    upZ * cosR + rNormZ * sinR,
  ];
}
