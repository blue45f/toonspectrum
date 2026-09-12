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
}

function eventPoint(
  canvas: HTMLCanvasElement,
  event: PointerEvent,
  program: BrushStudioV6Program,
): LivePoint {
  const rect = canvas.getBoundingClientRect();
  const rawPressure = event.pointerType === "mouse" && event.buttons ? 0.5 : event.pressure;
  const tiltDegrees = Math.hypot(event.tiltX || 0, event.tiltY || 0);
  return {
    x: event.clientX - rect.left - canvas.clientLeft,
    y: event.clientY - rect.top - canvas.clientTop,
    pressure: mapBrushStudioV6Pressure(rawPressure, program.input),
    tilt: mapBrushStudioV6Tilt(tiltDegrees, program.input),
    twist: event.twist || 0,
  };
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
  let lastTelemetry = 0;
  let samples = 0;
  let started = performance.now();
  if (context) clearPaper(context, canvas, getProgram());
  canvas.style.touchAction = "none";

  const draw = (stroke: LiveStroke, to: LivePoint): void => {
    const drawContext = fit(canvas);
    if (!drawContext) return;
    if (stroke.intent === "water") return;
    renderBrushStudioV6MaterialMarks(drawContext, stroke.material.push(to));
  };

  const down = (event: PointerEvent): void => {
    const program = getProgram();
    const transport = resolveBrushStudioV6LiveTransport(program.input.transport, capabilities);
    const intent = resolveBrushStudioV6PointerIntent(
      event,
      program.input.touchPolicy,
      program.input.palmRejection,
    );
    if (intent !== "draw" && intent !== "water") {
      emitIgnoredTelemetry(event, intent, transport, onTelemetry);
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    const point = eventPoint(canvas, event, program);
    const stroke: LiveStroke = { intent, point, program, material: createBrushStudioV6MaterialStroke(program) };
    active.set(event.pointerId, stroke);
    draw(stroke, point);
  };

  const move = (event: PointerEvent): void => {
    const program = getProgram();
    const transport = resolveBrushStudioV6LiveTransport(program.input.transport, capabilities);
    const stroke = active.get(event.pointerId);
    if (!stroke) {
      if (
        event.type === "pointermove"
        && program.input.hoverPreview
        && event.pointerType === "pen"
        && event.buttons === 0
      ) {
        onTelemetry?.({
          pointerType: "pen-hover",
          pressure: 0,
          tilt: Math.hypot(event.tiltX || 0, event.tiltY || 0),
          twist: event.twist || 0,
          sampleRateHz: 0,
          rejectedPalm: false,
          transport,
        });
      }
      return;
    }
    if (!shouldBrushStudioV6HandleMoveEvent(event.type, transport)) return;
    const sourceEvents = transport === "move-basic"
      ? [event]
      : typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : [event];
    let from = stroke.point;
    for (const source of sourceEvents.length > 0 ? sourceEvents : [event]) {
      const point = eventPoint(canvas, source, stroke.program);
      draw(stroke, point);
      from = point;
      samples += 1;
    }
    active.set(event.pointerId, { ...stroke, point: from });
    const now = performance.now();
    if (now - lastTelemetry <= 80) return;
    const elapsed = Math.max(1, now - started);
    onTelemetry?.({
      pointerType: event.pointerType,
      pressure: from.pressure,
      tilt: from.tilt * 90,
      twist: event.twist || 0,
      sampleRateHz: Math.round(samples * 1000 / elapsed),
      rejectedPalm: false,
      transport,
    });
    lastTelemetry = now;
    if (elapsed > 2_000) {
      samples = 0;
      started = now;
    }
  };

  const up = (event: PointerEvent): void => {
    active.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerrawupdate", move as EventListener);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("lostpointercapture", up);

  return {
    clear(): void {
      const clearContext = fit(canvas);
      if (clearContext) clearPaper(clearContext, canvas, getProgram());
      active.clear();
    },
    destroy(): void {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerrawupdate", move as EventListener);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("lostpointercapture", up);
      for (const pointerId of active.keys()) {
        if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
      }
      active.clear();
      canvas.style.touchAction = previousTouchAction;
    },
  };
}
