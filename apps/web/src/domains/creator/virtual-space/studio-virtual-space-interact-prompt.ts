/**
 * 상호작용 프롬프트 키 표준.
 *
 * 실제 입력은 E와 X를 모두 받는다(레거시 호환). 하지만 표시는 그동안
 * 월드 키캡·HUD 프롬프트·도움말이 제각각이라(X를 그리면서 주석은 E라고 하는 등)
 * Gather처럼 한 키로 통일한다: 표시는 E, X는 조용한 별칭으로만 남긴다.
 */

/** 표시·안내에 쓰는 기본 상호작용 키. */
export const STUDIO_INTERACT_KEY_LABEL = "E";
/** 함께 동작하는 레거시 별칭 키. 표기에는 쓰지 않는다. */
export const STUDIO_INTERACT_KEY_ALIAS = "X";
/** aria-keyshortcuts 표기(기본 키 + 별칭). */
export const STUDIO_INTERACT_KEY_SHORTCUTS = `${STUDIO_INTERACT_KEY_LABEL} ${STUDIO_INTERACT_KEY_ALIAS}`;

export interface StudioInteractPromptDescriptor {
  /** 키캡에 그릴 글자. */
  readonly keyLabel: string;
  /** aria-keyshortcuts에 넣을 값. */
  readonly keyShortcuts: string;
}

/** DOM 프롬프트와 월드 키캡이 함께 쓰는 상호작용 키 디스크립터. */
export function studioInteractPromptDescriptor(): StudioInteractPromptDescriptor {
  return Object.freeze({
    keyLabel: STUDIO_INTERACT_KEY_LABEL,
    keyShortcuts: STUDIO_INTERACT_KEY_SHORTCUTS,
  });
}

/** 월드 키캡 텍스처의 캐시 키. 키 글자가 바뀌면 캐시도 함께 바뀐다. */
export function studioInteractKeycapTextureKey(paper: number, ink: number, accent: number): string {
  return `campus-keycap-${STUDIO_INTERACT_KEY_LABEL.toLowerCase()}-${paper.toString(16)}-${ink.toString(16)}-${accent.toString(16)}`;
}
