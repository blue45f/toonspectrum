/**
 * 앰비언트 애니메이션 (Track 4 · "살아있는 공간")
 *
 * 정적인 배경 오브젝트에 생동감을 주는 시간 기반 애니메이션 계산.
 * - 깃발 펄럭임 · 풍차/물레방아 회전 · 분수 물줄기
 * - 창문 불빛 깜빡임 · 가로등/네온사인 · 건물 조명
 * - 연기 상승 · 구름 이동 · 나뭇잎/랜턴 흔들림
 *
 * 낮/밤 사이클 연동: 조명 계열(lamp-glow, neon-flicker, window-flicker,
 * building-glow)은 입력의 `ambientLevel`(트랙3 낮/밤 사이클의 주변광 0~1)을
 * 구독해 밤이 되면 켜지고 낮이 되면 꺼진다.
 *
 * 성능: viewport가 주어지면 화면 밖 오브젝트는 계산을 스킵(컬링)하고
 * `visible: false` 프레임만 반환한다. 모든 값은 시간의 결정적 함수다.
 *
 * 순수 로직 모듈. 실제 렌더링은 호출 측이 프레임 값을 스프라이트에 매핑한다.
 */

/** 앰비언트 애니메이션 종류. */
export type StudioAmbientAnimationKind =
  | "flag-wave"
  | "windmill-spin"
  | "waterwheel-spin"
  | "fountain-spray"
  | "window-flicker"
  | "lamp-glow"
  | "neon-flicker"
  | "smoke-rise"
  | "cloud-drift"
  | "leaf-sway"
  | "building-glow"
  | "lantern-sway";

export const STUDIO_AMBIENT_ANIMATION_KINDS: readonly StudioAmbientAnimationKind[] = Object.freeze([
  "flag-wave", "windmill-spin", "waterwheel-spin", "fountain-spray",
  "window-flicker", "lamp-glow", "neon-flicker", "smoke-rise",
  "cloud-drift", "leaf-sway", "building-glow", "lantern-sway",
]);

export interface StudioAmbientObject {
  readonly id: string;
  readonly kind: StudioAmbientAnimationKind;
  readonly x: number;
  readonly y: number;
  /** 결정적 오프셋용 시드. */
  readonly seed?: string;
  readonly scale?: number;
}

export interface StudioAmbientViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioAmbientAnimationInput {
  readonly nowMs: number;
  /**
   * 낮/밤 사이클의 주변광 밝기 0~1.
   * `studioAmbientLightFor()` / `studioCurrentAmbientLight()`의 level을 그대로 넣는다.
   */
  readonly ambientLevel: number;
  /** null이면 컬링하지 않는다. */
  readonly viewport: StudioAmbientViewport | null;
  readonly reducedMotion: boolean;
}

export interface StudioAmbientFrame {
  readonly id: string;
  readonly kind: StudioAmbientAnimationKind;
  /** 화면 밖이면 false. 렌더러는 이 오브젝트를 스킵한다. */
  readonly visible: boolean;
  /** 회전 (라디안) — windmill-spin · waterwheel-spin · lantern-sway. */
  readonly rotation: number;
  /** 0~1 위상 — wave · sway · flicker · spray. */
  readonly phase01: number;
  /** 조명 강도 0~1 — lamp-glow · neon-flicker · window-flicker · building-glow. */
  readonly intensity: number;
  /** 흔들림 오프셋 (px). */
  readonly offsetX: number;
  readonly offsetY: number;
  /** 분수 물줄기 분출 사이클 번호 (호출 측이 파티클 스폰 타이밍에 사용). */
  readonly cycle: number;
}

/** 컬링 여유 (px). */
export const STUDIO_AMBIENT_CULL_MARGIN = 160;
/** 구름 이동 래핑 너비 (px). */
export const STUDIO_CLOUD_WRAP_WIDTH = 1600;

function hash01(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** 어둠 정도 0~1 (밤이 깊을수록 1). */
function darkness(ambientLevel: number): number {
  const level = Number.isFinite(ambientLevel) ? ambientLevel : 1;
  return clamp01(1.25 - level * 1.35);
}

/** 120ms 버킷의 결정적 깜빡임 값 0~1. */
function flicker(seed: string, nowMs: number): number {
  const bucket = Math.floor(nowMs / 120);
  return hash01(`${seed}:flicker:${bucket}`);
}

const HIDDEN = (id: string, kind: StudioAmbientAnimationKind): StudioAmbientFrame => Object.freeze({
  id, kind, visible: false, rotation: 0, phase01: 0, intensity: 0, offsetX: 0, offsetY: 0, cycle: 0,
});

function isCulled(object: StudioAmbientObject, viewport: StudioAmbientViewport | null): boolean {
  if (!viewport) return false;
  const margin = STUDIO_AMBIENT_CULL_MARGIN;
  return object.x < viewport.x - margin || object.x > viewport.x + viewport.width + margin
    || object.y < viewport.y - margin || object.y > viewport.y + viewport.height + margin;
}

/** 오브젝트 하나의 프레임을 계산한다 (컬링은 호출 측에서). */
function frameFor(object: StudioAmbientObject, input: StudioAmbientAnimationInput): StudioAmbientFrame {
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;
  const seed = object.seed ?? object.id;
  const offset = hash01(`${seed}:offset`) * Math.PI * 2;
  const seconds = nowMs / 1000;
  const frozen = input.reducedMotion;

  const base = {
    id: object.id, kind: object.kind, visible: true,
    rotation: 0, phase01: 0, intensity: 0, offsetX: 0, offsetY: 0, cycle: 0,
  };

  switch (object.kind) {
    case "windmill-spin":
      return Object.freeze({ ...base, rotation: frozen ? offset : offset + seconds * 0.9 });
    case "waterwheel-spin":
      return Object.freeze({ ...base, rotation: frozen ? offset : offset + seconds * 0.45 });
    case "flag-wave": {
      const phase = frozen ? 0.5 : (Math.sin(seconds * 3.1 + offset) * 0.5 + 0.5);
      return Object.freeze({ ...base, phase01: phase, offsetX: frozen ? 0 : Math.sin(seconds * 3.1 + offset) * 5 });
    }
    case "fountain-spray": {
      const periodMs = 1400;
      const cycle = Math.floor(nowMs / periodMs);
      const phase = (nowMs % periodMs) / periodMs;
      return Object.freeze({ ...base, phase01: frozen ? 0.4 : phase, cycle, offsetY: frozen ? 0 : -Math.sin(phase * Math.PI) * 6 });
    }
    case "window-flicker": {
      const level = darkness(input.ambientLevel);
      const on = frozen ? 0.85 : 0.72 + flicker(seed, nowMs) * 0.28;
      return Object.freeze({ ...base, intensity: clamp01(level * on) });
    }
    case "lamp-glow": {
      const level = darkness(input.ambientLevel);
      const breathing = frozen ? 1 : 0.94 + 0.06 * Math.sin(seconds * 2 + offset);
      return Object.freeze({ ...base, intensity: clamp01(level * breathing) });
    }
    case "neon-flicker": {
      const level = darkness(input.ambientLevel);
      // 가끔 뚝뚝 끊기는 네온 특유의 깜빡임
      const dropout = !frozen && flicker(seed, nowMs) > 0.93 ? 0.25 : 1;
      return Object.freeze({ ...base, intensity: clamp01(level * dropout * (frozen ? 1 : 0.9 + 0.1 * Math.sin(seconds * 7 + offset))) });
    }
    case "building-glow": {
      const level = darkness(input.ambientLevel);
      return Object.freeze({ ...base, intensity: clamp01(level) });
    }
    case "smoke-rise": {
      const periodMs = 3200;
      const phase = ((nowMs + offset * 500) % periodMs) / periodMs;
      return Object.freeze({
        ...base,
        phase01: frozen ? 0.5 : phase,
        offsetY: frozen ? -20 : -phase * 44,
        offsetX: frozen ? 0 : Math.sin(phase * 5 + offset) * 6,
      });
    }
    case "cloud-drift": {
      const speed = 14; // px/s
      const x = frozen ? 0 : ((offset * 300 + seconds * speed) % STUDIO_CLOUD_WRAP_WIDTH) - 200;
      return Object.freeze({ ...base, offsetX: x });
    }
    case "leaf-sway": {
      const sway = frozen ? 0 : Math.sin(seconds * 1.7 + offset) * 4;
      return Object.freeze({
        ...base,
        phase01: frozen ? 0.5 : Math.sin(seconds * 1.7 + offset) * 0.5 + 0.5,
        offsetX: sway,
        rotation: frozen ? 0 : Math.sin(seconds * 1.7 + offset) * 0.05,
      });
    }
    case "lantern-sway": {
      const swing = frozen ? 0 : Math.sin(seconds * 1.2 + offset);
      return Object.freeze({
        ...base,
        rotation: swing * 0.14,
        offsetX: swing * 7,
        phase01: swing * 0.5 + 0.5,
        intensity: clamp01(darkness(input.ambientLevel)),
      });
    }
  }
}

/**
 * 앰비언트 오브젝트 전체의 프레임을 계산한다.
 * 화면 밖 오브젝트는 `visible: false`로 스킵(컬링)한다.
 */
export function advanceStudioAmbientAnimations(
  objects: readonly StudioAmbientObject[],
  input: StudioAmbientAnimationInput,
): readonly StudioAmbientFrame[] {
  return Object.freeze(objects.map((object) =>
    isCulled(object, input.viewport) ? HIDDEN(object.id, object.kind) : frameFor(object, input),
  ));
}

/** 애니메이션 종류 라벨. */
export function studioAmbientAnimationLabel(kind: StudioAmbientAnimationKind): { readonly ko: string; readonly en: string } {
  switch (kind) {
    case "flag-wave": return { ko: "깃발 펄럭임", en: "Flag waving" };
    case "windmill-spin": return { ko: "풍차 회전", en: "Windmill spin" };
    case "waterwheel-spin": return { ko: "물레방아 회전", en: "Waterwheel spin" };
    case "fountain-spray": return { ko: "분수 물줄기", en: "Fountain spray" };
    case "window-flicker": return { ko: "창문 불빛", en: "Window lights" };
    case "lamp-glow": return { ko: "가로등 불빛", en: "Lamp glow" };
    case "neon-flicker": return { ko: "네온사인", en: "Neon sign" };
    case "smoke-rise": return { ko: "연기 상승", en: "Rising smoke" };
    case "cloud-drift": return { ko: "구름 이동", en: "Drifting clouds" };
    case "leaf-sway": return { ko: "나뭇잎 흔들림", en: "Leaf sway" };
    case "building-glow": return { ko: "건물 조명", en: "Building lights" };
    case "lantern-sway": return { ko: "랜턴 흔들림", en: "Lantern sway" };
  }
}
