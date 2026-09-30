/**
 * Studio Bubble Emotion Shapes — 감정 기반 말풍선 형태 변형 순수 코어.
 *
 * 논문 기반:
 *  Yang et al., "Automatic Comic Generation with Stylistic Multi-page Layouts and
 *  Emotion-driven Text Balloon Generation", ACM TOMM 2021.
 *  - 감정에 따라 말풍선 형태(balloon shapes)와 말풍선 안 글자 크기(word sizes)를
 *    다르게 생성한다 (emotion-aware balloon generation).
 *  - 분노/놀람 등 강한 감정은 뾰족한 외곽선, 생각은 구름형, 속삭임은 점선 등.
 *
 * 이 모듈은 기존 `studio-ai-emotion-bubble-matcher.ts`의 감정 판정 결과
 * (SpeechEmotionKind / BubbleShapePreset)를 입력받아, 실제 SVG path 변형에 쓸
 * 파라미터로 변환한다. 감정 판정 로직은 건드리지 않는다 (브리지 패턴).
 *
 * 전부 순수·결정적. DOM/Konva 의존성 없음.
 */

import type {
  BubbleShapePreset,
  SpeechEmotionKind,
} from "../ai/studio-ai-emotion-bubble-matcher";
import { clamp01, formatCoord } from "./studio-bubble-math";

/** 말풍선 외곽선 변형 파라미터. */
export interface EmotionShapeParams {
  /** 뾰족함 (0=부드러운 타원, 1=날카로운 가시). 분노/외침. */
  spikiness: number;
  /** 출렁임 (0=정적, 1=크게 흔들림). 공포/놀람. */
  wobble: number;
  /** 구름형 (0=일반, 1=완전 구름). 생각. */
  cloudiness: number;
  /** 점선 외곽선 여부. 속삭임. */
  dashed: boolean;
  /** 외곽선 두께 배율. */
  strokeScale: number;
  /** 글자 크기 배율 (Yang et al.: 감정에 따라 word size 조절). */
  fontScale: number;
  /** 꼬리 스타일. */
  tailStyle: "solid" | "bubbles" | "none" | "jagged";
  /** 떨림 애니메이션 여부 (렌더 힌트). */
  tremble: boolean;
}

const NEUTRAL: EmotionShapeParams = {
  spikiness: 0,
  wobble: 0,
  cloudiness: 0,
  dashed: false,
  strokeScale: 1,
  fontScale: 1,
  tailStyle: "solid",
  tremble: false,
};

/** 감정 → 형태 파라미터 매핑 (Yang et al.의 emotion-aware balloon 아이디어 구현). */
const EMOTION_SHAPE_TABLE: Record<SpeechEmotionKind, EmotionShapeParams> = {
  "rage-shout": {
    spikiness: 0.9,
    wobble: 0.25,
    cloudiness: 0,
    dashed: false,
    strokeScale: 1.6,
    fontScale: 1.25,
    tailStyle: "jagged",
    tremble: true,
  },
  "shock-gasp": {
    spikiness: 0.45,
    wobble: 0.7,
    cloudiness: 0,
    dashed: false,
    strokeScale: 1.3,
    fontScale: 1.15,
    tailStyle: "solid",
    tremble: true,
  },
  "whisper-secret": {
    spikiness: 0,
    wobble: 0.1,
    cloudiness: 0,
    dashed: true,
    strokeScale: 0.8,
    fontScale: 0.85,
    tailStyle: "solid",
    tremble: false,
  },
  "thought-monologue": {
    spikiness: 0,
    wobble: 0,
    cloudiness: 1,
    dashed: false,
    strokeScale: 0.9,
    fontScale: 0.95,
    tailStyle: "bubbles",
    tremble: false,
  },
  "romance-blush": {
    spikiness: 0,
    wobble: 0.3,
    cloudiness: 0.4,
    dashed: false,
    strokeScale: 1,
    fontScale: 1.05,
    tailStyle: "solid",
    tremble: false,
  },
  "neutral-calm": { ...NEUTRAL },
};

/** 기존 BubbleShapePreset → 감정 역매핑 (matcher가 preset만 줄 때 사용). */
const PRESET_TO_EMOTION: Record<BubbleShapePreset, SpeechEmotionKind> = {
  "shout-spiky": "rage-shout",
  "wobbly-distress": "shock-gasp",
  "whisper-dashed": "whisper-secret",
  "cloud-thought": "thought-monologue",
  "soft-blush": "romance-blush",
  "standard-oval": "neutral-calm",
};

/**
 * 감정 종류에서 형태 파라미터를 구한다.
 */
export function emotionShapeParams(
  emotion: SpeechEmotionKind
): EmotionShapeParams {
  return { ...EMOTION_SHAPE_TABLE[emotion] };
}

/**
 * 기존 matcher의 BubbleShapePreset에서 형태 파라미터를 구한다.
 */
export function presetShapeParams(preset: BubbleShapePreset): EmotionShapeParams {
  return emotionShapeParams(PRESET_TO_EMOTION[preset]);
}

/**
 * 강도(intensity, 0..1)로 형태 파라미터를 보간한다.
 * Comic Chat의 emotion wheel(중심=중립, 가장자리=최대) 개념을 차용.
 */
export function scaleShapeIntensity(
  params: EmotionShapeParams,
  intensity: number
): EmotionShapeParams {
  const t = Math.min(1, Math.max(0, intensity));
  const lerp = (a: number, b: number): number => a + (b - a) * t;
  return {
    spikiness: lerp(NEUTRAL.spikiness, params.spikiness),
    wobble: lerp(NEUTRAL.wobble, params.wobble),
    cloudiness: lerp(NEUTRAL.cloudiness, params.cloudiness),
    dashed: t > 0.5 ? params.dashed : false,
    strokeScale: lerp(1, params.strokeScale),
    fontScale: lerp(1, params.fontScale),
    tailStyle: t > 0.5 ? params.tailStyle : "solid",
    tremble: t > 0.6 ? params.tremble : false,
  };
}

// ── 외곽선 변형 SVG path ──────────────────────────────────────────────────

/**
 * 감정 변형이 적용된 말풍선 외곽선 SVG path를 만든다.
 *
 * - spikiness: 타원을 N개의 가시로 변형 (분노).
 * - wobble: 사인파로 외곽선을 흔든다 (공포/놀람).
 * - cloudiness: 구름형 봉긋한 곡선 (생각).
 * 모두 0이면 일반 타원이 된다.
 */
export function emotionBubblePath(
  w: number,
  h: number,
  params: EmotionShapeParams,
  seed = 1
): string {
  const spikiness = clamp01(params.spikiness);
  const wobble = clamp01(params.wobble);
  const cloudiness = clamp01(params.cloudiness);

  const rx = w / 2;
  const ry = h / 2;
  const spikes = 14;

  // 결정적 위상 (seed 기반).
  const phase = (seed * 2.399963) % (Math.PI * 2);

  const point = (angle: number): [number, number] => {
    // 기본 타원 반경.
    let r = 1;
    // 가시: 각도에 따라 반경을 뾰족하게 변조.
    if (spikiness > 0) {
      const spikeWave = Math.abs(Math.sin((angle * spikes) / 2));
      r *= 1 - spikiness * 0.35 * (1 - spikeWave);
    }
    // 출렁임: 사인파 변조.
    if (wobble > 0) {
      r *= 1 + wobble * 0.12 * Math.sin(angle * 5 + phase);
    }
    // 구름: 봉긋한 곡선 (저주파 변조).
    if (cloudiness > 0) {
      r *= 1 + cloudiness * 0.14 * Math.sin(angle * 3 + phase * 2);
    }
    return [rx + rx * r * Math.cos(angle), ry + ry * r * Math.sin(angle)];
  };

  const steps = 72;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < steps; i++) {
    pts.push(point((i / steps) * Math.PI * 2));
  }

  // Catmull-Rom → 베지어 변환으로 부드러운 닫힌 곡선.
  let d = `M ${formatCoord(pts[0][0])} ${formatCoord(pts[0][1])}`;
  for (let i = 0; i < steps; i++) {
    const p0 = pts[(i - 1 + steps) % steps];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % steps];
    const p3 = pts[(i + 2) % steps];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${formatCoord(c1x)} ${formatCoord(c1y)}, ${formatCoord(c2x)} ${formatCoord(c2y)}, ${formatCoord(p2[0])} ${formatCoord(p2[1])}`;
  }
  return d + " Z";
}

/**
 * 생각 말풍선용 꼬리 (동그라미 연속) SVG를 만든다.
 * Comic Chat §5.1: thought tail = a line of ovals.
 */
export function thoughtTailBubbles(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  count = 4
): string {
  const circles: string[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    // 화자에 가까워질수록 작아진다.
    const r = 7 * (1 - t * 0.65) + 1.5;
    circles.push(
      `<circle cx="${formatCoord(x)}" cy="${formatCoord(y)}" r="${formatCoord(r)}" />`
    );
  }
  return circles.join(" ");
}
