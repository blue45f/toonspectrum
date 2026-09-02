/**
 * studio-3d-camera-cinematic-director.ts
 *
 * Webtoon Cinematography Director & Camera Cut System.
 * Supports webtoon cut bookmarks, cinematic camera movements,
 * transition easing solvers, and multi-frequency camera shake effects (earthquake, shockwave, handheld).
 */

export type WebtoonShotAngleKind =
  | "birds-eye-topdown"
  | "high-angle-drama"
  | "eye-level-dialogue"
  | "low-angle-heroic"
  | "dutch-tilt-tension"
  | "extreme-close-up-gaze"
  | "over-the-shoulder"
  | "wide-establishing";

export type CameraShakePreset =
  | "none"
  | "handheld-subtle"
  | "earthquake-rumble"
  | "explosive-shockwave"
  | "heartbeat-throb"
  | "running-footstep";

export interface WebtoonShotBookmark {
  readonly id: string;
  readonly name: string;
  readonly episodePanelIndex: number;
  readonly angleKind: WebtoonShotAngleKind;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number; // Field of View in degrees
  readonly dutchRollDegrees: number; // Dutch tilt angle
  readonly transitionSeconds: number;
  readonly easing: "linear" | "ease-in-out" | "spring-punch" | "whip-pan";
}

export interface CameraShakeConfig {
  readonly preset: CameraShakePreset;
  readonly intensity: number; // 0.0 to 2.0
  readonly frequency: number; // Hz (e.g. 5 to 30)
  readonly decayRate: number; // 0.0 to 1.0 per second
}

export interface CameraShakeOffset {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly offsetZ: number;
  readonly rollDegrees: number;
}

export const WEBTOON_SHOT_ANGLE_PRESETS: readonly {
  readonly kind: WebtoonShotAngleKind;
  readonly label: string;
  readonly description: string;
  readonly defaultFov: number;
  readonly defaultDutchRoll: number;
  readonly relativeOffset: readonly [number, number, number];
}[] = [
  {
    kind: "birds-eye-topdown",
    label: "조감도 (Bird's Eye Topdown)",
    description: "전체 전장 및 맵 전체를 위에서 수직으로 내려다보는 연출",
    defaultFov: 45,
    defaultDutchRoll: 0,
    relativeOffset: [0, 8.0, 0.1],
  },
  {
    kind: "high-angle-drama",
    label: "하이 앵글 부감 (High Angle)",
    description: "캐릭터를 위에서 내려다보며 심리적 위축이나 고립감을 극대화",
    defaultFov: 38,
    defaultDutchRoll: 0,
    relativeOffset: [0, 3.5, 4.0],
  },
  {
    kind: "eye-level-dialogue",
    label: "아이레벨 대화샷 (Eye Level)",
    description: "인물의 눈높이에 맞춘 자연스러운 일상 대화 및 감정 교류",
    defaultFov: 50,
    defaultDutchRoll: 0,
    relativeOffset: [0, 1.5, 3.0],
  },
  {
    kind: "low-angle-heroic",
    label: "로우 앵글 앙각 (Heroic Low Angle)",
    description: "아래에서 올려다보며 압도적인 위압감과 주인공의 승리감을 강조",
    defaultFov: 28,
    defaultDutchRoll: 0,
    relativeOffset: [0, 0.3, 2.5],
  },
  {
    kind: "dutch-tilt-tension",
    label: "더치 앵글 사각 (Dutch Tilt Tension)",
    description: "카메라를 15~25도 기울여 광기, 공포, 극도의 불안 긴장감 조성",
    defaultFov: 35,
    defaultDutchRoll: 20,
    relativeOffset: [0.8, 1.2, 2.8],
  },
  {
    kind: "extreme-close-up-gaze",
    label: "익스트림 클로즈업 (Extreme Close-Up)",
    description: "눈동자, 입술, 손끝 등 결정적 디테일을 강렬하게 포커싱",
    defaultFov: 24,
    defaultDutchRoll: 0,
    relativeOffset: [0, 1.55, 1.1],
  },
  {
    kind: "over-the-shoulder",
    label: "어깨 너머 샷 (Over the Shoulder)",
    description: "상대방의 어깨 뒤에서 대치하는 구도로 몰입감 넘치는 대화 연출",
    defaultFov: 42,
    defaultDutchRoll: 0,
    relativeOffset: [0.4, 1.6, 2.2],
  },
  {
    kind: "wide-establishing",
    label: "와이드 배경 제시 (Wide Establishing)",
    description: "화려한 성, 도시, 숲 전체의 웅장한 전경을 한눈에 담는 샷",
    defaultFov: 65,
    defaultDutchRoll: 0,
    relativeOffset: [0, 4.0, 12.0],
  },
];

/**
 * Generates procedural camera shake offset at time `timeSeconds`
 */
export function calculateCameraShake(
  config: CameraShakeConfig,
  timeSeconds: number,
): CameraShakeOffset {
  if (config.preset === "none" || config.intensity <= 0.001) {
    return { offsetX: 0, offsetY: 0, offsetZ: 0, rollDegrees: 0 };
  }

  const freq = config.frequency;
  const amp = config.intensity;

  let rawX = 0;
  let rawY = 0;
  let rawZ = 0;
  let rawRoll = 0;

  switch (config.preset) {
    case "handheld-subtle": {
      // Natural organic breathing and micro hand movement (Lissajous curve)
      rawX = Math.sin(timeSeconds * freq * 0.7) * 0.015 * amp;
      rawY = Math.cos(timeSeconds * freq * 0.9) * 0.012 * amp;
      rawRoll = Math.sin(timeSeconds * freq * 0.5) * 0.3 * amp;
      break;
    }

    case "earthquake-rumble": {
      // High-frequency ground shaking
      rawX = (Math.sin(timeSeconds * freq * 1.3) + Math.cos(timeSeconds * freq * 2.7) * 0.5) * 0.06 * amp;
      rawY = (Math.sin(timeSeconds * freq * 1.9) + Math.sin(timeSeconds * freq * 3.1) * 0.4) * 0.08 * amp;
      rawZ = Math.cos(timeSeconds * freq * 2.1) * 0.04 * amp;
      rawRoll = Math.sin(timeSeconds * freq * 1.5) * 1.2 * amp;
      break;
    }

    case "explosive-shockwave": {
      // Strong punchy impulse decaying fast
      const decay = Math.exp(-config.decayRate * Math.max(0, timeSeconds));
      rawX = Math.sin(timeSeconds * freq * 3.0) * 0.15 * amp * decay;
      rawY = Math.cos(timeSeconds * freq * 3.4) * 0.20 * amp * decay;
      rawZ = Math.sin(timeSeconds * freq * 2.5) * 0.12 * amp * decay;
      rawRoll = Math.sin(timeSeconds * freq * 2.0) * 3.5 * amp * decay;
      break;
    }

    case "heartbeat-throb": {
      // Rhythmic surge in Z-direction and subtle zoom pulse
      const phase = (timeSeconds * (freq / 10)) % 1.0;
      const pulse = phase < 0.2 ? Math.sin((phase / 0.2) * Math.PI) : 0;
      rawZ = -pulse * 0.08 * amp;
      rawY = pulse * 0.02 * amp;
      rawRoll = pulse * 0.4 * amp;
      break;
    }

    case "running-footstep": {
      // Bobbing up and down synchronized with running stride
      const stride = timeSeconds * freq;
      rawY = Math.abs(Math.sin(stride)) * 0.05 * amp;
      rawX = Math.sin(stride * 0.5) * 0.03 * amp;
      rawRoll = Math.sin(stride * 0.5) * 0.8 * amp;
      break;
    }
  }

  return {
    offsetX: rawX,
    offsetY: rawY,
    offsetZ: rawZ,
    rollDegrees: rawRoll,
  };
}

/**
 * Creates a new Webtoon Shot Bookmark
 */
export function createShotBookmark(
  id: string,
  name: string,
  episodePanelIndex: number,
  angleKind: WebtoonShotAngleKind,
  targetPosition: readonly [number, number, number] = [0, 1.0, 0],
): WebtoonShotBookmark {
  const preset = WEBTOON_SHOT_ANGLE_PRESETS.find((p) => p.kind === angleKind) ?? WEBTOON_SHOT_ANGLE_PRESETS[2]!;
  const camPos: [number, number, number] = [
    targetPosition[0] + preset.relativeOffset[0],
    targetPosition[1] + preset.relativeOffset[1],
    targetPosition[2] + preset.relativeOffset[2],
  ];

  return {
    id,
    name,
    episodePanelIndex,
    angleKind,
    position: camPos,
    target: targetPosition,
    fov: preset.defaultFov,
    dutchRollDegrees: preset.defaultDutchRoll,
    transitionSeconds: 0.8,
    easing: "ease-in-out",
  };
}
