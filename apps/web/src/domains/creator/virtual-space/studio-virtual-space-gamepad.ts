import {
  applyStudioInputResponseCurve,
  snapStudioVectorTo8Way,
  type StudioInputResponseCurve,
} from "./studio-virtual-space-joystick-input";

export const STUDIO_VIRTUAL_SPACE_GAMEPAD_DEADZONE = 0.18;

export interface StudioVirtualSpaceGamepadButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

export interface StudioVirtualSpaceGamepadLike {
  readonly connected?: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly StudioVirtualSpaceGamepadButtonLike[];
}

export interface StudioVirtualSpaceGamepadInput {
  readonly x: number;
  readonly y: number;
  readonly sprint: boolean;
  readonly interact: boolean;
}

function axisValue(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, Number(value))) : 0;
}

function buttonPressed(
  gamepad: StudioVirtualSpaceGamepadLike,
  index: number,
): boolean {
  const button = gamepad.buttons[index];
  return Boolean(button?.pressed || (button?.value ?? 0) > 0.55);
}

export function applyStudioVirtualSpaceGamepadDeadzone(
  value: number,
  deadzone = STUDIO_VIRTUAL_SPACE_GAMEPAD_DEADZONE,
): number {
  const bounded = axisValue(value);
  const magnitude = Math.abs(bounded);
  if (magnitude <= deadzone) return 0;
  const normalized = Math.min(1, (magnitude - deadzone) / Math.max(0.001, 1 - deadzone));
  return Math.sign(bounded) * normalized;
}

/** 게임패드 입력 옵션. */
export interface StudioVirtualSpaceGamepadInputOptions {
  /** 스틱 데드존 (기본 STUDIO_VIRTUAL_SPACE_GAMEPAD_DEADZONE). */
  readonly deadzone?: number;
  /** 스틱 응답 곡선 (기본 "linear"). D-패드에는 적용되지 않는다. */
  readonly responseCurve?: StudioInputResponseCurve;
  /** 8방향 스냅 (기본 false). */
  readonly snap8Way?: boolean;
}

export function readStudioVirtualSpaceGamepadInput(
  gamepad: StudioVirtualSpaceGamepadLike | null | undefined,
): StudioVirtualSpaceGamepadInput {
  return readStudioVirtualSpaceGamepadInputWithOptions(gamepad);
}

/**
 * 옵션을 적용한 게임패드 입력 읽기.
 * - 데드존(기본 0.18) → 응답 곡선(스틱만) → 8방향 스냅 순으로 적용
 * - 옵션 없이 호출하면 기존 readStudioVirtualSpaceGamepadInput과 동일
 */
export function readStudioVirtualSpaceGamepadInputWithOptions(
  gamepad: StudioVirtualSpaceGamepadLike | null | undefined,
  options: StudioVirtualSpaceGamepadInputOptions = {},
): StudioVirtualSpaceGamepadInput {
  if (!gamepad || gamepad.connected === false) {
    return { x: 0, y: 0, sprint: false, interact: false };
  }
  const deadzone = options.deadzone ?? STUDIO_VIRTUAL_SPACE_GAMEPAD_DEADZONE;
  const curve = options.responseCurve ?? "linear";

  let x = applyStudioVirtualSpaceGamepadDeadzone(axisValue(gamepad.axes[0]), deadzone);
  let y = applyStudioVirtualSpaceGamepadDeadzone(axisValue(gamepad.axes[1]), deadzone);

  // 응답 곡선은 스틱 크기에 적용 (D-패드 디지털 입력과 합치기 전)
  const stickLength = Math.hypot(x, y);
  if (stickLength > 0.0001) {
    const curved = applyStudioInputResponseCurve(stickLength, curve);
    x = x / stickLength * curved;
    y = y / stickLength * curved;
  }

  // Standard mapping: D-pad up/down/left/right = 12/13/14/15.
  if (buttonPressed(gamepad, 14)) x -= 1;
  if (buttonPressed(gamepad, 15)) x += 1;
  if (buttonPressed(gamepad, 12)) y -= 1;
  if (buttonPressed(gamepad, 13)) y += 1;

  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  if (options.snap8Way) {
    const snapped = snapStudioVectorTo8Way({ x, y });
    x = snapped.x;
    y = snapped.y;
  }

  return {
    x,
    y,
    // Left-stick click (L3) gives a familiar sprint gesture without stealing face buttons.
    sprint: buttonPressed(gamepad, 10),
    // Standard A / Cross.
    interact: buttonPressed(gamepad, 0),
  };
}

/** Prefer the controller that is actually active instead of the lowest browser slot. */
export function readStudioVirtualSpaceGamepadsInput(
  gamepads: readonly (StudioVirtualSpaceGamepadLike | null | undefined)[],
): StudioVirtualSpaceGamepadInput {
  let selected = { x: 0, y: 0, sprint: false, interact: false };
  let selectedScore = -1;
  for (const gamepad of gamepads) {
    if (!gamepad || gamepad.connected === false) continue;
    const input = readStudioVirtualSpaceGamepadInput(gamepad);
    const score = Math.hypot(input.x, input.y)
      + (input.sprint ? 0.5 : 0)
      + (input.interact ? 2 : 0);
    if (score > selectedScore) {
      selected = input;
      selectedScore = score;
    }
  }
  return selected;
}
