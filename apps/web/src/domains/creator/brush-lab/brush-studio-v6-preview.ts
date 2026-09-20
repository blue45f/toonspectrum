import { normalizeStudioMaterialPointerPressure, resolveStudioMaterialReleasePressure } from "../brush/studio-material-pointer-pressure";
import { mapBrushStudioMaterialInput } from "./brush-studio-material-input";
import type {
  BrushStudioV6InputTransport,
  BrushStudioV6Program,
  BrushStudioV6TouchPolicy,
} from "./brush-studio-v6-engine";
import { createBrushStudioV6MaterialStroke, mapBrushStudioV6Pressure, mapBrushStudioV6Tilt, mixBrushStudioV6MaterialColors, renderBrushStudioV6MaterialMarks, type BrushStudioV6MaterialStroke } from "./brush-studio-v6-material-engine";

export interface BrushStudioV6Telemetry {
  readonly pointerType: string;
  readonly pressure: number;
  readonly tilt: number;
  readonly twist: number;
  readonly sampleRateHz: number;
  readonly rejectedPalm: boolean;
  readonly transport: string;
}

export interface BrushStudioV6LiveController {
  clear(): void;
  destroy(): void;
}

export type BrushStudioV6PointerIntent =
  | "draw"
  | "water"
  | "gesture"
  | "ignore"
  | "reject-palm";

export type BrushStudioV6ResolvedTransport = Exclude<BrushStudioV6InputTransport, "auto">;

export interface BrushStudioV6LiveInputCapabilities {
  readonly pointerRawUpdate: boolean;
  readonly coalescedEvents: boolean;
}

export interface BrushStudioV6PointerLike {
  readonly pointerType: string;
  readonly width: number;
  readonly height: number;
}

const PALM_AREA_THRESHOLD = 850;
const PALM_AXIS_THRESHOLD = 38;

function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function rgb(hex: string): [number, number, number] {
  const value = /^#[0-9a-f]{6}$/iu.test(hex) ? hex.slice(1) : "111827";
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}


export function mixPreviewPigments(first: string, second: string, weight: number): string {
  const [red, green, blue] = rgb(mixBrushStudioV6MaterialColors(first, second, weight));
  return `rgba(${red},${green},${blue},1)`;
}

export function resolveBrushStudioV6LiveTransport(
  requested: BrushStudioV6InputTransport,
  capabilities: BrushStudioV6LiveInputCapabilities,
): BrushStudioV6ResolvedTransport {
  if (requested === "raw-coalesced") {
    return capabilities.pointerRawUpdate && capabilities.coalescedEvents
      ? "raw-coalesced"
      : capabilities.coalescedEvents
        ? "move-coalesced"
        : "move-basic";
  }
  if (requested === "move-coalesced") {
    return capabilities.coalescedEvents ? "move-coalesced" : "move-basic";
  }
  if (requested === "move-basic") return "move-basic";
  if (capabilities.pointerRawUpdate && capabilities.coalescedEvents) return "raw-coalesced";
  return capabilities.coalescedEvents ? "move-coalesced" : "move-basic";
}

export function shouldBrushStudioV6HandleMoveEvent(
  eventType: string,
  transport: BrushStudioV6ResolvedTransport,
): boolean {
  return transport === "raw-coalesced"
    ? eventType === "pointerrawupdate"
    : eventType === "pointermove";
}

export function resolveBrushStudioV6PointerIntent(
  event: BrushStudioV6PointerLike,
  touchPolicy: BrushStudioV6TouchPolicy,
  palmRejection: boolean,
): BrushStudioV6PointerIntent {
  if (event.pointerType !== "touch") return "draw";
  const looksLikePalm = palmRejection && (
    event.width * event.height > PALM_AREA_THRESHOLD
    || event.width > PALM_AXIS_THRESHOLD
    || event.height > PALM_AXIS_THRESHOLD
  );
  if (looksLikePalm) return "reject-palm";
  switch (touchPolicy) {
    case "pen-ink-finger-water":
      return "water";
    case "touch-draw":
      return "draw";
    case "pen-draw-finger-pan":
    case "pen-draw-two-finger-gesture":
      return "gesture";
    case "pen-only":
    default:
      return "ignore";
  }
}

function fit(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const devicePixelRatio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
  const height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  return context;
}

function clearPaper(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  program: BrushStudioV6Program,
): void {
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f8f4ea";
  context.fillRect(0, 0, width, height);
  const random = rng(program.seed ^ 0x91a7);
  const tooth = program.tuning.surfaceTooth + (program.slots.surface === "surface-smooth" ? 0 : 0.18);
  context.save();
  context.globalAlpha = 0.05 + tooth * 0.1;
  context.strokeStyle = "#475569";
  context.lineWidth = 0.55;
  const fibers = Math.round(90 + tooth * 280);
  for (let index = 0; index < fibers; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const length = 4 + random() * 22;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y + (random() - 0.5) * 3);
    context.stroke();
  }
  if (program.slots.surface === "surface-linen") {
    context.globalAlpha = 0.07;
    for (let x = 0; x < width; x += 9) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + 2, height);
      context.stroke();
    }
    for (let y = 0; y < height; y += 8) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y + 2);
      context.stroke();
    }
  }
  context.restore();
}

export function renderBrushStudioV6Preview(
  canvas: HTMLCanvasElement,
  program: BrushStudioV6Program,
  _options: { readonly settleProgress?: number } = {},
): void {
  const context = fit(canvas);
  if (!context) return;
  clearPaper(context, canvas, program);
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  const material = createBrushStudioV6MaterialStroke(program);
  for (let index = 0; index <= 100; index++) {
    const progress = index / 100;
    renderBrushStudioV6MaterialMarks(context, material.push({
      x: width * (0.08 + progress * 0.84),
      y: height * (0.52 + Math.sin(progress * Math.PI * 2.15) * 0.25),
      pressure: mapBrushStudioV6Pressure(0.12 + Math.sin(progress * Math.PI) * 0.86, program.input),
      tilt: mapBrushStudioV6Tilt(18, program.input),
      twist: 15,
    }));
  }
}

interface LivePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tilt: number;
  readonly twist: number;
}

interface LiveStroke {
  readonly intent: "draw" | "water";
  readonly point: LivePoint;
  readonly material: BrushStudioV6MaterialStroke;
  readonly program: BrushStudioV6Program;
  readonly transport: BrushStudioV6ResolvedTransport;
  readonly lastContactPressure: number;
  readonly previousSurface: HTMLCanvasElement;
}

function eventPoint(
  canvas: HTMLCanvasElement,
  event: PointerEvent,
  program: BrushStudioV6Program,
  pressure = normalizeStudioMaterialPointerPressure(event.pointerType, event.pressure),
): LivePoint {
  const rect = canvas.getBoundingClientRect();
  return mapBrushStudioMaterialInput({
    x: event.clientX - rect.left - canvas.clientLeft,
    y: event.clientY - rect.top - canvas.clientTop,
    pressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    twist: event.twist,
  }, program.input);
}

function liveCapabilities(canvas: HTMLCanvasElement): BrushStudioV6LiveInputCapabilities {
  return {
    pointerRawUpdate: "onpointerrawupdate" in canvas,
    coalescedEvents: typeof globalThis.PointerEvent !== "undefined"
      && typeof globalThis.PointerEvent.prototype.getCoalescedEvents === "function",
  };
}

function emitIgnoredTelemetry(
  event: PointerEvent,
  intent: BrushStudioV6PointerIntent,
  transport: BrushStudioV6ResolvedTransport,
  onTelemetry?: (telemetry: BrushStudioV6Telemetry) => void,
): void {
  onTelemetry?.({
    pointerType: intent === "gesture" ? "touch-gesture" : event.pointerType,
    pressure: event.pressure,
    tilt: 0,
    twist: event.twist || 0,
    sampleRateHz: 0,
    rejectedPalm: intent === "reject-palm",
    transport,
  });
}

export function attachBrushStudioV6LivePreview(
  canvas: HTMLCanvasElement,
  getProgram: () => BrushStudioV6Program,
  onTelemetry?: (telemetry: BrushStudioV6Telemetry) => void,
): BrushStudioV6LiveController {
  const context = fit(canvas);
  const active = new Map<number, LiveStroke>();
  const capabilities = liveCapabilities(canvas);
  const previousTouchAction = canvas.style.touchAction;
  let disposed = false;
  let lastTelemetry = 0;
  let samples = 0;
  let started = performance.now();
  if (context) clearPaper(context, canvas, getProgram());
  canvas.style.touchAction = "none";

  const releaseCapture = (pointerId: number): void => {
    try {
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    } catch {
      // The browser may already have released or transferred this pointer.
    }
  };
  const retire = (pointerId: number, rollback: boolean): void => {
    const stroke = active.get(pointerId);
    if (!stroke) return;
    // Remove ownership before releasing capture: lostpointercapture can be reentrant.
    active.delete(pointerId);
    try {
      if (rollback) {
        const drawContext = fit(canvas);
        if (drawContext) {
          drawContext.save();
          try {
            drawContext.setTransform(1, 0, 0, 1, 0, 0);
            drawContext.clearRect(0, 0, canvas.width, canvas.height);
            drawContext.drawImage(stroke.previousSurface, 0, 0, canvas.width, canvas.height);
          } finally { drawContext.restore(); }
        }
      }
    } finally {
      releaseCapture(pointerId);
      stroke.previousSurface.width = 0;
      stroke.previousSurface.height = 0;
    }
  };
  const draw = (stroke: LiveStroke, point: LivePoint): void => {
    const drawContext = fit(canvas);
    if (!drawContext || stroke.intent === "water") return;
    renderBrushStudioV6MaterialMarks(drawContext, stroke.material.push(point));
  };

  const down = (event: PointerEvent): void => {
    if (disposed || active.size > 0 || event.button !== 0 || event.isPrimary === false) return;
    const program = getProgram();
    const transport = resolveBrushStudioV6LiveTransport(program.input.transport, capabilities);
    const intent = resolveBrushStudioV6PointerIntent(event, program.input.touchPolicy, program.input.palmRejection);
    if (intent !== "draw" && intent !== "water") {
      emitIgnoredTelemetry(event, intent, transport, onTelemetry);
      return;
    }
    if (!fit(canvas)) return;
    // A single writer owns one pre-stroke bitmap, released on every exit path.
    const previousSurface = canvas.ownerDocument.createElement("canvas");
    previousSurface.width = canvas.width;
    previousSurface.height = canvas.height;
    const previousContext = previousSurface.getContext("2d");
    if (!previousContext) return;
    previousContext.drawImage(canvas, 0, 0);
    try { canvas.setPointerCapture(event.pointerId); }
    catch {
      previousSurface.width = previousSurface.height = 0;
      return;
    }
    const lastContactPressure = normalizeStudioMaterialPointerPressure(event.pointerType, event.pressure);
    try {
      const point = eventPoint(canvas, event, program, lastContactPressure);
      const stroke: LiveStroke = { intent, point, program, transport, lastContactPressure,
        previousSurface, material: createBrushStudioV6MaterialStroke(program) };
      active.set(event.pointerId, stroke);
      draw(stroke, point);
    } catch (error) {
      if (active.has(event.pointerId)) retire(event.pointerId, true);
      else {
        releaseCapture(event.pointerId);
        previousSurface.width = previousSurface.height = 0;
      }
      throw error;
    }
  };

  const move = (event: PointerEvent): void => {
    if (disposed) return;
    const stroke = active.get(event.pointerId);
    if (!stroke) {
      const program = getProgram();
      if (event.type === "pointermove" && program.input.hoverPreview
        && event.pointerType === "pen" && event.buttons === 0) {
        onTelemetry?.({ pointerType: "pen-hover", pressure: 0,
          tilt: Math.hypot(event.tiltX || 0, event.tiltY || 0), twist: event.twist || 0,
          sampleRateHz: 0, rejectedPalm: false,
          transport: resolveBrushStudioV6LiveTransport(program.input.transport, capabilities) });
      }
      return;
    }
    const transport = stroke.transport;
    if (!shouldBrushStudioV6HandleMoveEvent(event.type, transport)) return;
    const sourceEvents = transport === "move-basic" ? [event]
      : typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [event];
    let point = stroke.point;
    let lastContactPressure = stroke.lastContactPressure;
    try {
      for (const source of sourceEvents.length > 0 ? sourceEvents : [event]) {
        lastContactPressure = normalizeStudioMaterialPointerPressure(source.pointerType, source.pressure);
        point = eventPoint(canvas, source, stroke.program, lastContactPressure);
        draw(stroke, point);
        samples += 1;
      }
    } catch (error) {
      retire(event.pointerId, true);
      throw error;
    }
    active.set(event.pointerId, { ...stroke, point, lastContactPressure });
    const now = performance.now();
    if (now - lastTelemetry <= 80) return;
    const elapsed = Math.max(1, now - started);
    onTelemetry?.({ pointerType: event.pointerType, pressure: point.pressure,
      tilt: point.tilt * 90, twist: event.twist || 0,
      sampleRateHz: Math.round(samples * 1000 / elapsed), rejectedPalm: false, transport });
    lastTelemetry = now;
    if (elapsed > 2_000) { samples = 0; started = now; }
  };

  const up = (event: PointerEvent): void => {
    const stroke = active.get(event.pointerId);
    if (!stroke) return;
    let completed = false;
    try {
      const pressure = resolveStudioMaterialReleasePressure(event.pointerType, event.pressure, stroke.lastContactPressure);
      const point = eventPoint(canvas, event, stroke.program, pressure);
      if (point.x !== stroke.point.x || point.y !== stroke.point.y) draw(stroke, point);
      completed = true;
    } finally { retire(event.pointerId, !completed); }
  };
  const cancel = (event: PointerEvent): void => { retire(event.pointerId, true); };

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerrawupdate", move as EventListener);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", cancel);

  return {
    clear(): void {
      if (disposed) return;
      for (const pointerId of [...active.keys()]) retire(pointerId, false);
      const clearContext = fit(canvas);
      if (clearContext) clearPaper(clearContext, canvas, getProgram());
    },
    destroy(): void {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerrawupdate", move as EventListener);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", cancel);
      try {
        for (const pointerId of [...active.keys()]) retire(pointerId, true);
      } finally { canvas.style.touchAction = previousTouchAction; }
    },
  };
}
