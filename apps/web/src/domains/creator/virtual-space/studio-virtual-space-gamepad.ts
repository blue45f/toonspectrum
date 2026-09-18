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

export function readStudioVirtualSpaceGamepadInput(
  gamepad: StudioVirtualSpaceGamepadLike | null | undefined,
): StudioVirtualSpaceGamepadInput {
  if (!gamepad || gamepad.connected === false) {
    return { x: 0, y: 0, sprint: false, interact: false };
  }

  let x = applyStudioVirtualSpaceGamepadDeadzone(axisValue(gamepad.axes[0]));
  let y = applyStudioVirtualSpaceGamepadDeadzone(axisValue(gamepad.axes[1]));

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

  return {
    x,
    y,
    // Left-stick click (L3) gives a familiar sprint gesture without stealing face buttons.
    sprint: buttonPressed(gamepad, 10),
    // Standard A / Cross.
    interact: buttonPressed(gamepad, 0),
  };
}
