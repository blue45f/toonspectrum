/**
 * Pen-side contact routing for standards-compliant eraser tips and optional barrel-button erase.
 * The setting is browser-local because hardware button layouts belong to the input device, not to
 * the artwork. A contact resolves once at pointerdown and the resulting draw mode is snapshotted by
 * the regular stroke input contract.
 */

export const STUDIO_PEN_BUTTON_POLICY_VERSION = 1 as const;

export type StudioPenBarrelAction = "context-menu" | "eraser";
export type StudioPenContactAction = "primary" | "eraser" | "ignore";

export interface StudioPenButtonPolicy {
  readonly version: typeof STUDIO_PEN_BUTTON_POLICY_VERSION;
  readonly eraserTipEnabled: boolean;
  readonly barrelAction: StudioPenBarrelAction;
  readonly eraserWidthScale: number;
}

export interface StudioPenContactLike {
  readonly pointerType?: unknown;
  readonly button?: unknown;
  readonly buttons?: unknown;
}

export const DEFAULT_STUDIO_PEN_BUTTON_POLICY: StudioPenButtonPolicy = Object.freeze({
  version: STUDIO_PEN_BUTTON_POLICY_VERSION,
  eraserTipEnabled: true,
  // Preserve the existing right-click/context-menu contract unless the artist explicitly opts in.
  barrelAction: "context-menu",
  eraserWidthScale: 2,
});

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeStudioPenButtonPolicy(value: unknown): StudioPenButtonPolicy {
  const source = value && typeof value === "object"
    ? value as Partial<StudioPenButtonPolicy>
    : {};
  return Object.freeze({
    version: STUDIO_PEN_BUTTON_POLICY_VERSION,
    eraserTipEnabled: source.eraserTipEnabled !== false,
    barrelAction: source.barrelAction === "eraser" ? "eraser" : "context-menu",
    eraserWidthScale: clamp(finiteOr(source.eraserWidthScale, 2), 1, 4),
  });
}

function buttonOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : -1;
}

function buttonsOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

/** W3C Pointer Events: barrel = button 2/buttons 2, eraser = button 5/buttons 32. */
export function resolveStudioPenContactAction(
  event: StudioPenContactLike,
  policy: StudioPenButtonPolicy = DEFAULT_STUDIO_PEN_BUTTON_POLICY,
): StudioPenContactAction {
  if (event.pointerType !== "pen") return "primary";
  const button = buttonOf(event.button);
  const buttons = buttonsOf(event.buttons);
  const eraserTip = button === 5 || (buttons & 32) !== 0;
  if (eraserTip) return policy.eraserTipEnabled ? "eraser" : "ignore";
  const barrel = button === 2 || (buttons & 2) !== 0;
  if (barrel) return policy.barrelAction === "eraser" ? "eraser" : "ignore";
  return "primary";
}

/** Allows pointer admission for the normal primary contact or an explicitly routed pen eraser. */
export function isStudioDrawingContactDown(
  event: StudioPenContactLike,
  policy: StudioPenButtonPolicy = DEFAULT_STUDIO_PEN_BUTTON_POLICY,
): boolean {
  const action = resolveStudioPenContactAction(event, policy);
  if (event.pointerType === "pen") {
    if (action === "eraser") return true;
    if (action === "ignore") return false;
  }
  const button = buttonOf(event.button);
  if (button === 1 || button === 2) return false;
  if (typeof event.buttons === "number" && Number.isFinite(event.buttons)) {
    if (event.buttons === 0) return false;
    return (buttonsOf(event.buttons) & 1) !== 0;
  }
  return button === 0 || button === -1;
}

export function resolveStudioPenContactDrawMode<T extends string>(
  drawMode: T,
  event: StudioPenContactLike,
  policy: StudioPenButtonPolicy = DEFAULT_STUDIO_PEN_BUTTON_POLICY,
): T | "eraser" {
  if (drawMode !== "pen") return drawMode;
  return resolveStudioPenContactAction(event, policy) === "eraser" ? "eraser" : drawMode;
}

export function resolveStudioPenContactStrokeWidth(
  strokeWidth: number,
  drawMode: string,
  event: StudioPenContactLike,
  policy: StudioPenButtonPolicy = DEFAULT_STUDIO_PEN_BUTTON_POLICY,
): number {
  const safeWidth = clamp(finiteOr(strokeWidth, 1), 0.05, 4096);
  return drawMode === "pen" && resolveStudioPenContactAction(event, policy) === "eraser"
    ? safeWidth * policy.eraserWidthScale
    : safeWidth;
}
