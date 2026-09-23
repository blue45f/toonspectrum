/**
 * Chromium pointer-input driver used by Studio browser acceptance and soak gates.
 *
 * Mouse input remains available as the compatibility baseline. Pen and touch deliberately use
 * Chrome DevTools Protocol so pressure, tilt, twist and contact geometry reach the same Pointer
 * Events path as real hardware. This is deterministic browser-level evidence, not a claim that a
 * physical tablet, palm rejection, battery, thermal or OS-driver combination has been certified.
 */

export const STUDIO_POINTER_INPUT_MODES = Object.freeze([
  "auto",
  "mouse",
  "pen",
  "touch",
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value) => typeof value === "number" && Number.isFinite(value);

/** @typedef {"auto" | "mouse" | "pen" | "touch"} StudioPointerInputMode */
/** @typedef {Exclude<StudioPointerInputMode, "auto">} ResolvedStudioPointerInputMode */

/**
 * @typedef {object} StudioPointerBounds
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} StudioPointerPoint
 * @property {number} x
 * @property {number} y
 * @property {number} pressure
 * @property {number} tangentialPressure
 * @property {number} tiltX
 * @property {number} tiltY
 * @property {number} twist
 * @property {number} radiusX
 * @property {number} radiusY
 */

/**
 * @param {unknown} value
 * @returns {StudioPointerInputMode}
 */
export function parseStudioPointerInputMode(value) {
  const normalized = String(value ?? "auto").trim().toLowerCase();
  if (!STUDIO_POINTER_INPUT_MODES.includes(normalized)) {
    throw new TypeError(
      `TOONSPECTRUM_SOAK_INPUT must be one of ${STUDIO_POINTER_INPUT_MODES.join(", ")}; received ${normalized || "<empty>"}.`,
    );
  }
  return /** @type {StudioPointerInputMode} */ (normalized);
}

/**
 * @param {unknown} requested
 * @param {{ mobile: boolean }} environment
 * @returns {ResolvedStudioPointerInputMode}
 */
export function resolveStudioPointerInputMode(requested, environment) {
  const mode = parseStudioPointerInputMode(requested);
  return mode === "auto" ? (environment.mobile ? "touch" : "pen") : mode;
}

/**
 * Creates a bounded deterministic stroke with pressure, tilt and twist variation. The same points
 * can be replayed through mouse, pen or touch so failures are attributable to input semantics,
 * rather than a different geometric path.
 *
 * @param {StudioPointerBounds} bounds
 * @param {number} cycle
 * @param {{ steps?: number }} [options]
 * @returns {readonly StudioPointerPoint[]}
 */
export function createStudioPointerStrokePoints(bounds, cycle, options = {}) {
  if (
    !bounds
    || !finite(bounds.x)
    || !finite(bounds.y)
    || !finite(bounds.width)
    || !finite(bounds.height)
    || bounds.width < 120
    || bounds.height < 120
  ) {
    throw new TypeError("Studio pointer stroke requires finite bounds of at least 120×120 CSS pixels.");
  }
  if (!Number.isInteger(cycle) || cycle < 1) {
    throw new TypeError("Studio pointer stroke cycle must be a positive integer.");
  }
  const steps = options.steps ?? 28;
  if (!Number.isInteger(steps) || steps < 2 || steps > 240) {
    throw new TypeError("Studio pointer stroke steps must be an integer from 2 to 240.");
  }

  const horizontalPhase = ((cycle * 73) % 997) / 996;
  const verticalPhase = ((cycle * 151) % 991) / 990;
  const wavePhase = (((cycle * 193) % 983) / 982) * Math.PI * 2;
  const direction = cycle % 2 === 0 ? 1 : -1;
  const marginX = Math.min(36, bounds.width * 0.08);
  const marginY = Math.min(36, bounds.height * 0.08);
  const minX = bounds.x + marginX;
  const maxX = bounds.x + bounds.width - marginX;
  const minY = bounds.y + marginY;
  const maxY = bounds.y + bounds.height - marginY;
  const travel = Math.min(280, bounds.width * 0.3);
  const centerX = minX + (maxX - minX) * horizontalPhase;
  const x0 = clamp(centerX - direction * travel / 2, minX, maxX);
  const y0 = minY + (maxY - minY) * verticalPhase;
  const waveHeight = 14 + Math.min(28, bounds.height * 0.03);

  return Object.freeze(Array.from({ length: steps + 1 }, (_, step) => {
    const t = step / steps;
    const x = clamp(x0 + direction * travel * t, minX, maxX);
    const wave = Math.sin(t * Math.PI * 2 * 1.35 + wavePhase) * waveHeight;
    const drift = (t - 0.5) * ((cycle % 7) - 3) * 3;
    const y = clamp(y0 + wave + drift, minY, maxY);
    const pressure = clamp(
      0.18 + Math.pow(Math.sin(Math.PI * t), 0.75) * 0.76,
      0.05,
      0.98,
    );
    const tiltX = clamp(-48 + t * 96 + Math.sin(wavePhase) * 6, -60, 60);
    const tiltY = clamp(Math.sin(t * Math.PI * 2 + wavePhase) * 34, -55, 55);
    const tangentialPressure = clamp(
      Math.sin(t * Math.PI * 2 + wavePhase * 0.5) * 0.22,
      -0.3,
      0.3,
    );
    const twist = ((cycle * 37 + step * 11) % 360 + 360) % 360;
    return Object.freeze({
      x,
      y,
      pressure,
      tangentialPressure,
      tiltX,
      tiltY,
      twist,
      radiusX: 1.5 + pressure * 2.5,
      radiusY: 1.25 + pressure * 2,
    });
  }));
}

function summarize(points, mode) {
  const pressures = points.map((point) => point.pressure);
  const tiltX = points.map((point) => point.tiltX);
  const tiltY = points.map((point) => point.tiltY);
  const twists = points.map((point) => point.twist);
  return Object.freeze({
    mode,
    points: points.length,
    pressureMin: Math.min(...pressures),
    pressureMax: Math.max(...pressures),
    tiltXMin: Math.min(...tiltX),
    tiltXMax: Math.max(...tiltX),
    tiltYMin: Math.min(...tiltY),
    tiltYMax: Math.max(...tiltY),
    twistMin: Math.min(...twists),
    twistMax: Math.max(...twists),
  });
}

function assertPoints(points) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new TypeError("Studio pointer dispatch requires at least two points.");
  }
  for (const point of points) {
    if (
      !finite(point?.x)
      || !finite(point?.y)
      || !finite(point?.pressure)
      || point.pressure < 0
      || point.pressure > 1
      || !finite(point?.tangentialPressure)
      || point.tangentialPressure < -1
      || point.tangentialPressure > 1
      || !finite(point?.tiltX)
      || point.tiltX < -90
      || point.tiltX > 90
      || !finite(point?.tiltY)
      || point.tiltY < -90
      || point.tiltY > 90
      || !finite(point?.twist)
      || point.twist < 0
      || point.twist >= 360
    ) {
      throw new TypeError("Studio pointer dispatch received an invalid point.");
    }
  }
}

async function optionalDelay(page, stepDelayMs) {
  if (stepDelayMs > 0) await page.waitForTimeout(stepDelayMs);
}

/**
 * @param {{
 *   page: { mouse: { move: Function, down: Function, up: Function }, waitForTimeout: Function },
 *   cdp: { send: Function } | null,
 *   mode: ResolvedStudioPointerInputMode,
 *   points: readonly StudioPointerPoint[],
 *   stepDelayMs?: number,
 * }} input
 */
export async function dispatchStudioPointerStroke(input) {
  const { page, cdp, mode, points } = input;
  const stepDelayMs = input.stepDelayMs ?? 0;
  if (!Number.isFinite(stepDelayMs) || stepDelayMs < 0 || stepDelayMs > 100) {
    throw new TypeError("Studio pointer step delay must be from 0 to 100 milliseconds.");
  }
  assertPoints(points);
  const first = points[0];
  const last = points.at(-1);

  if (mode === "mouse") {
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const point of points.slice(1)) {
      await page.mouse.move(point.x, point.y, { steps: 1 });
      await optionalDelay(page, stepDelayMs);
    }
    await page.mouse.up();
    return summarize(points, mode);
  }

  if (!cdp || typeof cdp.send !== "function") {
    throw new Error(`${mode} input requires an attached Chromium CDP session.`);
  }

  if (mode === "touch") {
    const touchPoint = (point) => ({
      x: point.x,
      y: point.y,
      radiusX: point.radiusX,
      radiusY: point.radiusY,
      rotationAngle: point.twist,
      force: point.pressure,
      id: 1,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touchPoint(first)],
    });
    for (const point of points.slice(1)) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [touchPoint(point)],
      });
      await optionalDelay(page, stepDelayMs);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    return summarize(points, mode);
  }

  const penFields = (point, force = point.pressure) => ({
    force,
    tangentialPressure: point.tangentialPressure,
    tiltX: point.tiltX,
    tiltY: point.tiltY,
    twist: point.twist,
    pointerType: "pen",
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: first.x,
    y: first.y,
    button: "none",
    buttons: 0,
    ...penFields(first, 0),
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: first.x,
    y: first.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
    ...penFields(first),
  });
  for (const point of points.slice(1)) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x,
      y: point.y,
      button: "none",
      buttons: 1,
      ...penFields(point),
    });
    await optionalDelay(page, stepDelayMs);
  }
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: last.x,
    y: last.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    ...penFields(last, 0),
  });
  return summarize(points, mode);
}
