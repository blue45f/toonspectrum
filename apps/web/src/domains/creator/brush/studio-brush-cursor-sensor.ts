export interface StudioBrushCursorSensorInput {
  readonly pointerType?: unknown;
  readonly pressure?: unknown;
  readonly buttons?: unknown;
  readonly tiltX?: unknown;
  readonly tiltY?: unknown;
  readonly twist?: unknown;
  readonly altitudeAngle?: unknown;
  readonly azimuthAngle?: unknown;
}

export interface StudioBrushCursorSensorVisual {
  readonly visible: boolean;
  /** Absolute stylus orientation in screen/document degrees before the base brush rotation. */
  readonly rotationDeg: number;
  /** Contact-pressure scale. Hover remains at the nominal footprint scale. */
  readonly scaleX: number;
  /** Tilt compresses the minor axis so the ghost reads as a nib/contact footprint. */
  readonly scaleY: number;
  readonly opacity: number;
  readonly hovering: boolean;
}

const HIDDEN_SENSOR_VISUAL: StudioBrushCursorSensorVisual = Object.freeze({
  visible: false,
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0,
  hovering: false,
});

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeDegrees(value: number): number {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Converts browser stylus telemetry into a transient cursor ghost only.
 *
 * This deliberately does not claim to be the canonical brush dab. The normal Studio cursor ring
 * remains the exact configured brush footprint; this secondary ghost communicates live hardware
 * pressure/orientation while hovering or drawing. It never enters document, history or renderer
 * state.
 */
export function planStudioBrushCursorSensorVisual(
  input: StudioBrushCursorSensorInput,
): StudioBrushCursorSensorVisual {
  if (typeof input.pointerType !== "string" || input.pointerType.toLowerCase() !== "pen") {
    return HIDDEN_SENSOR_VISUAL;
  }

  const pressure = clamp(finite(input.pressure, 0), 0, 1);
  const buttons = Math.max(0, Math.floor(finite(input.buttons, 0)));
  const hovering = pressure === 0 && buttons === 0;
  const tiltX = clamp(finite(input.tiltX, 0), -90, 90);
  const tiltY = clamp(finite(input.tiltY, 0), -90, 90);
  const tiltMagnitude = clamp(Math.hypot(tiltX, tiltY), 0, 90);
  const twist = normalizeDegrees(finite(input.twist, 0));
  const explicitAzimuth = finite(input.azimuthAngle, Number.NaN);
  const azimuthDeg = Number.isFinite(explicitAzimuth)
    ? normalizeDegrees((explicitAzimuth * 180) / Math.PI)
    : tiltMagnitude > 0.01
      ? normalizeDegrees((Math.atan2(tiltY, tiltX) * 180) / Math.PI)
      : 0;
  const explicitAltitude = finite(input.altitudeAngle, Number.NaN);
  const altitudeDeg = Number.isFinite(explicitAltitude)
    ? clamp((explicitAltitude * 180) / Math.PI, 0, 90)
    : 90 - tiltMagnitude;

  // Hover shows nominal size because Pointer Events pressure is zero before contact. During contact,
  // use a perceptual square-root curve so light pressure is visible without making heavy pressure
  // exceed the exact nominal brush ring.
  const contactScale = hovering ? 1 : 0.3 + 0.7 * Math.sqrt(pressure);
  // A vertical pen keeps a round ghost; a shallow pen compresses the minor axis. Never collapse to
  // zero, because a nearly-flat pen still needs a discoverable cursor on photographic backgrounds.
  const altitudeScale = 0.28 + 0.72 * Math.sin((altitudeDeg * Math.PI) / 180);

  return Object.freeze({
    visible: true,
    rotationDeg: normalizeDegrees(azimuthDeg + twist),
    scaleX: clamp(contactScale, 0.3, 1),
    scaleY: clamp(contactScale * altitudeScale, 0.16, 1),
    opacity: hovering ? 0.48 : 0.7,
    hovering,
  });
}
