import type {
  BrushStudioV6InputTransport,
  BrushStudioV6Program,
  BrushStudioV6TouchPolicy,
} from "./brush-studio-v6-engine";

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

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

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

function rgba(hex: string, alpha: number): string {
  const [red, green, blue] = rgb(hex);
  return `rgba(${red},${green},${blue},${clamp(alpha)})`;
}

export function mixPreviewPigments(first: string, second: string, weight: number): string {
  const firstChannels = rgb(first);
  const secondChannels = rgb(second);
  const ratio = clamp(weight);
  const output = firstChannels.map((channel, index) => {
    const firstReflectance = Math.pow((channel + 12) / 267, 2.2);
    const secondReflectance = Math.pow((secondChannels[index]! + 12) / 267, 2.2);
    const absorption = (1 - firstReflectance) * (1 - ratio) + (1 - secondReflectance) * ratio;
    const scattering = Math.sqrt(Math.max(0.0001, firstReflectance * secondReflectance));
    return Math.round(
      clamp(
        Math.pow(clamp(1 - absorption * (0.88 + scattering * 0.25)), 1 / 2.2),
      ) * 255,
    );
  });
  return `rgba(${output[0]},${output[1]},${output[2]},1)`;
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
  const rect = canvas.getBoundingClientRect();
  const devicePixelRatio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width * devicePixelRatio));
  const height = Math.max(1, Math.round(rect.height * devicePixelRatio));
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

type PreviewPoint = readonly [number, number, number];

function pathPoints(width: number, height: number): readonly PreviewPoint[] {
  const result: PreviewPoint[] = [];
  for (let index = 0; index <= 100; index += 1) {
    const progress = index / 100;
    result.push([
      width * (0.08 + progress * 0.84),
      height * (0.52 + Math.sin(progress * Math.PI * 2.15) * 0.25),
      0.12 + Math.sin(progress * Math.PI) * 0.86,
    ]);
  }
  return result;
}

function lineStroke(
  context: CanvasRenderingContext2D,
  points: readonly PreviewPoint[],
  program: BrushStudioV6Program,
): void {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  const chisel = program.slots.tip === "tip-chisel-sdf";
  const dry = program.slots.deposition === "deposit-dry";
  const neon = program.slots.finish.includes("finish-neon");
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const pressure = point[2];
    context.beginPath();
    context.moveTo(previous[0], previous[1]);
    context.lineTo(point[0], point[1]);
    context.lineWidth = program.tuning.size * (0.25 + pressure * 0.75) * (chisel ? 0.72 : 1);
    context.strokeStyle = rgba(
      program.tuning.primaryColor,
      program.tuning.opacity * (dry ? 0.25 + pressure * 0.55 : 0.75),
    );
    if (neon) {
      context.shadowColor = program.tuning.secondaryColor;
      context.shadowBlur = program.tuning.size * 0.8;
    }
    context.stroke();
  }
  context.restore();
}

function grainStroke(
  context: CanvasRenderingContext2D,
  points: readonly PreviewPoint[],
  program: BrushStudioV6Program,
): void {
  const random = rng(program.seed ^ 0x43c1);
  context.save();
  context.fillStyle = rgba(
    program.tuning.primaryColor,
    0.24 + program.tuning.granulation * 0.42,
  );
  const count = Math.round(500 + program.tuning.surfaceTooth * 900);
  for (let index = 0; index < count; index += 1) {
    const point = points[Math.floor(random() * points.length)]!;
    const radius = program.tuning.size * (0.05 + random() * 0.15) * point[2];
    const spread = program.tuning.size * (0.2 + program.tuning.surfaceTooth);
    context.beginPath();
    context.ellipse(
      point[0] + (random() - 0.5) * spread,
      point[1] + (random() - 0.5) * spread,
      Math.max(0.4, radius),
      Math.max(0.25, radius * (0.35 + random() * 0.5)),
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.restore();
}

function bristleStroke(
  context: CanvasRenderingContext2D,
  points: readonly PreviewPoint[],
  program: BrushStudioV6Program,
): void {
  const random = rng(program.seed ^ 0x717);
  const lanes = Math.min(34, Math.max(6, Math.round(program.tuning.bristleStrands / 4)));
  context.save();
  context.lineCap = "round";
  for (let lane = 0; lane < lanes; lane += 1) {
    const offset = (lane / Math.max(1, lanes - 1) - 0.5) * program.tuning.size;
    context.beginPath();
    points.forEach((point, index) => {
      const y = point[1] + offset + Math.sin(index * 0.2 + lane) * program.tuning.size * 0.035;
      if (index === 0) context.moveTo(point[0], y);
      else context.lineTo(point[0], y);
    });
    context.globalAlpha = 0.2 + random() * 0.55;
    context.strokeStyle = lane % 4 === 0
      ? program.tuning.secondaryColor
      : program.tuning.primaryColor;
    context.lineWidth = 0.45 + random() * 1.7;
    context.stroke();
  }
  context.restore();
}

function particleStroke(
  context: CanvasRenderingContext2D,
  points: readonly PreviewPoint[],
  program: BrushStudioV6Program,
): void {
  const random = rng(program.seed ^ 0x97f);
  const count = Math.min(2_200, Math.round(program.tuning.particleCount * 0.7));
  context.save();
  for (let index = 0; index < count; index += 1) {
    const point = points[Math.floor(random() * points.length)]!;
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * program.tuning.size * (1 + program.tuning.patternJitter);
    const radius = 0.35 + random() * Math.max(0.8, program.tuning.size * 0.09);
    context.fillStyle = rgba(
      random() > 0.8 ? program.tuning.secondaryColor : program.tuning.primaryColor,
      0.18 + random() * 0.62,
    );
    context.beginPath();
    context.arc(
      point[0] + Math.cos(angle) * distance,
      point[1] + Math.sin(angle) * distance + (
        program.slots.physics.includes("physics-thin-film")
          ? random() * program.tuning.gravity * 24
          : 0
      ),
      radius,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.restore();
}

function wetStroke(
  context: CanvasRenderingContext2D,
  points: readonly PreviewPoint[],
  program: BrushStudioV6Program,
): void {
  context.save();
  context.globalCompositeOperation = "multiply";
  const mixed = mixPreviewPigments(
    program.tuning.primaryColor,
    program.tuning.secondaryColor,
    0.42,
  );
  const layers = 7 + Math.round(program.tuning.diffusion * 9);
  for (let layer = layers; layer >= 0; layer -= 1) {
    context.beginPath();
    for (const [index, point] of points.entries()) {
      const y = point[1] + Math.sin(index * 0.29 + layer) * layer * 0.22;
      if (index === 0) context.moveTo(point[0], y);
      else context.lineTo(point[0], y);
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = program.tuning.size + layer * (1.4 + program.tuning.diffusion * 2.4);
    context.strokeStyle = layer === 0
      ? rgba(program.tuning.primaryColor, 0.34)
      : mixed.replace(",1)", `,${0.018 + program.tuning.wetness * 0.018})`);
    context.stroke();
  }
  if (program.slots.finish.includes("finish-edge-bloom")) {
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point[0], point[1]);
      else context.lineTo(point[0], point[1]);
    });
    context.lineWidth = program.tuning.size * 1.15;
    context.strokeStyle = rgba(
      program.tuning.primaryColor,
      0.16 + program.tuning.edgeDarkening * 0.34,
    );
    context.stroke();
  }
  context.restore();
}

function pattern(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  program: BrushStudioV6Program,
): void {
  const id = program.slots.pattern;
  if (id === "pattern-none") return;
  const scale = Math.max(5, 13 * program.tuning.patternScale);
  context.save();
  context.globalAlpha = 0.22 + program.tuning.patternDensity * 0.45;
  context.strokeStyle = program.tuning.secondaryColor;
  context.fillStyle = program.tuning.secondaryColor;
  context.lineWidth = 1;
  if (id === "pattern-dot-tone") {
    for (let y = scale / 2; y < height; y += scale) {
      for (let x = scale / 2; x < width; x += scale) {
        context.beginPath();
        context.arc(x, y, 1.2 + program.tuning.patternDensity * 2.4, 0, Math.PI * 2);
        context.fill();
      }
    }
  } else if (id === "pattern-cross-hatch" || id === "pattern-weave") {
    for (let x = -height; x < width + height; x += scale) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + height, height);
      context.stroke();
      if (id === "pattern-weave") {
        context.beginPath();
        context.moveTo(x + height, 0);
        context.lineTo(x, height);
        context.stroke();
      }
    }
  } else if (id === "pattern-brick") {
    for (let y = 0; y < height; y += scale) {
      for (let x = (Math.round(y / scale) % 2) * -scale; x < width; x += scale * 2) {
        context.strokeRect(x, y, scale * 2, scale);
      }
    }
  } else if (id === "pattern-kaleido") {
    const centerX = width / 2;
    const centerY = height / 2;
    for (let index = 0; index < 16; index += 1) {
      context.save();
      context.translate(centerX, centerY);
      context.rotate(index * Math.PI / 8);
      context.beginPath();
      context.moveTo(10, 0);
      context.quadraticCurveTo(width * 0.18, -height * 0.18, width * 0.38, 0);
      context.stroke();
      context.restore();
    }
  } else {
    const random = rng(program.seed ^ 0x7e5);
    for (let index = 0; index < 90 * program.tuning.patternDensity; index += 1) {
      const x = random() * width;
      const y = random() * height;
      context.beginPath();
      context.ellipse(x, y, scale * 0.35, scale * 0.13, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

export function renderBrushStudioV6Preview(
  canvas: HTMLCanvasElement,
  program: BrushStudioV6Program,
  options: { readonly settleProgress?: number } = {},
): void {
  const settleProgress = clamp(options.settleProgress ?? 1);
  const context = fit(canvas);
  if (!context) return;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  clearPaper(context, canvas, program);
  pattern(context, width, height, program);
  const points = pathPoints(width, height);
  if (
    program.slots.physics.includes("physics-inkwash")
    || program.slots.deposition === "deposit-wet"
  ) {
    wetStroke(context, points, program);
  } else if (
    program.slots.carrier === "carrier-krita-hairy"
    || program.slots.physics.includes("physics-bristle")
  ) {
    bristleStroke(context, points, program);
  } else if (
    program.slots.carrier === "carrier-webgpu-particles"
    || program.slots.deposition === "deposit-particles"
  ) {
    particleStroke(context, points, program);
  } else {
    lineStroke(context, points, program);
    if (
      program.slots.deposition === "deposit-dry"
      || program.slots.tip === "tip-grain-exemplar"
    ) {
      grainStroke(context, points, program);
    }
  }
  if (program.slots.physics.includes("physics-thin-film")) {
    context.save();
    context.strokeStyle = rgba(program.tuning.primaryColor, 0.24);
    context.lineCap = "round";
    for (let index = 0; index < 9; index += 1) {
      const point = points[20 + index * 8]!;
      context.lineWidth = Math.max(1, program.tuning.size * (0.08 + index * 0.006));
      context.beginPath();
      context.moveTo(point[0], point[1]);
      context.lineTo(
        point[0] + (index % 2 ? 3 : -2),
        point[1] + (18 + program.tuning.gravity * 52) * settleProgress,
      );
      context.stroke();
    }
    context.restore();
  }
}

interface LivePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tilt: number;
}

interface LiveStroke {
  readonly intent: "draw" | "water";
  readonly point: LivePoint;
}

function eventPoint(
  canvas: HTMLCanvasElement,
  event: PointerEvent,
  program: BrushStudioV6Program,
): LivePoint {
  const rect = canvas.getBoundingClientRect();
  const rawPressure = event.pressure > 0 ? event.pressure : event.buttons ? 0.5 : 0;
  const normalized = clamp(
    (rawPressure - program.input.pressureOnset)
    / Math.max(0.05, program.input.pressureSaturation - program.input.pressureOnset),
  );
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure: Math.pow(normalized, program.input.pressureGamma),
    tilt: Math.hypot(event.tiltX || 0, event.tiltY || 0) / 90,
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

  const draw = (
    from: LivePoint,
    to: LivePoint,
    program: BrushStudioV6Program,
    waterOnly: boolean,
  ): void => {
    const drawContext = fit(canvas);
    if (!drawContext) return;
    const size = program.tuning.size
      * (0.18 + to.pressure * 0.82)
      * (1 + to.tilt * 0.55);
    drawContext.save();
    drawContext.lineCap = "round";
    drawContext.lineJoin = "round";
    drawContext.beginPath();
    drawContext.moveTo(from.x, from.y);
    drawContext.lineTo(to.x, to.y);
    drawContext.lineWidth = size;
    const wet = program.slots.physics.includes("physics-inkwash");
    const bristle = program.slots.physics.includes("physics-bristle");
    if (waterOnly) {
      drawContext.globalCompositeOperation = "destination-out";
      drawContext.globalAlpha = 0.025 + program.tuning.wetness * 0.04;
      drawContext.strokeStyle = "#ffffff";
    } else if (wet) {
      drawContext.globalCompositeOperation = "multiply";
      drawContext.globalAlpha = 0.1 + program.tuning.flow * 0.28;
      drawContext.strokeStyle = program.tuning.primaryColor;
      drawContext.shadowColor = program.tuning.secondaryColor;
      drawContext.shadowBlur = size * program.tuning.diffusion * 0.65;
    } else {
      drawContext.globalAlpha = program.tuning.opacity * (0.32 + to.pressure * 0.68);
      drawContext.strokeStyle = program.tuning.primaryColor;
    }
    drawContext.stroke();
    if (bristle && !waterOnly) {
      drawContext.globalAlpha *= 0.45;
      for (let index = -3; index <= 3; index += 1) {
        drawContext.beginPath();
        drawContext.moveTo(from.x, from.y + index * size * 0.09);
        drawContext.lineTo(to.x, to.y + index * size * 0.09);
        drawContext.lineWidth = Math.max(0.5, size * 0.045);
        drawContext.stroke();
      }
    }
    drawContext.restore();
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
    active.set(event.pointerId, {
      intent,
      point: eventPoint(canvas, event, program),
    });
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
      const point = eventPoint(canvas, source, program);
      draw(from, point, program, stroke.intent === "water");
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
