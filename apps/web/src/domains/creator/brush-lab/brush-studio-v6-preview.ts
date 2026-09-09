import type { BrushStudioV6Program } from "./brush-studio-v6-engine";

export interface BrushStudioV6Telemetry {
  readonly pointerType: string;
  readonly pressure: number;
  readonly tilt: number;
  readonly twist: number;
  readonly sampleRateHz: number;
  readonly rejectedPalm: boolean;
  readonly transport: string;
}
export interface BrushStudioV6LiveController { clear(): void; destroy(): void; }

function clamp(value: number, min = 0, max = 1): number { return Math.min(max, Math.max(min, value)); }
function rng(seed: number): () => number { let state = seed >>> 0 || 1; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }; }
function rgb(hex: string): [number, number, number] { const value = /^#[0-9a-f]{6}$/iu.test(hex) ? hex.slice(1) : "111827"; return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)]; }
function rgba(hex: string, alpha: number): string { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${clamp(alpha)})`; }

export function mixPreviewPigments(first: string, second: string, weight: number): string {
  const a = rgb(first); const b = rgb(second); const t = clamp(weight); const out = a.map((channel, index) => {
    const ra = Math.pow((channel + 12) / 267, 2.2); const rb = Math.pow((b[index]! + 12) / 267, 2.2);
    const absorption = (1 - ra) * (1 - t) + (1 - rb) * t; const scattering = Math.sqrt(Math.max(0.0001, ra * rb));
    return Math.round(clamp(Math.pow(clamp(1 - absorption * (0.88 + scattering * 0.25)), 1 / 2.2)) * 255);
  });
  return `rgba(${out[0]},${out[1]},${out[2]},1)`;
}

function fit(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const rect = canvas.getBoundingClientRect(); const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width * dpr)); const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext("2d"); if (!context) return null; context.setTransform(dpr, 0, 0, dpr, 0, 0); return context;
}
function clearPaper(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, program: BrushStudioV6Program): void {
  const width = canvas.clientWidth || canvas.width; const height = canvas.clientHeight || canvas.height; context.clearRect(0, 0, width, height); context.fillStyle = "#f8f4ea"; context.fillRect(0, 0, width, height);
  const random = rng(program.seed ^ 0x91a7); const tooth = program.tuning.surfaceTooth + (program.slots.surface === "surface-smooth" ? 0 : 0.18);
  context.save(); context.globalAlpha = 0.05 + tooth * 0.1; context.strokeStyle = "#475569"; context.lineWidth = 0.55;
  const fibers = Math.round(90 + tooth * 280); for (let i = 0; i < fibers; i += 1) { const x = random() * width; const y = random() * height; const length = 4 + random() * 22; context.beginPath(); context.moveTo(x, y); context.lineTo(x + length, y + (random() - 0.5) * 3); context.stroke(); }
  if (program.slots.surface === "surface-linen") { context.globalAlpha = 0.07; for (let x = 0; x < width; x += 9) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x + 2, height); context.stroke(); } for (let y = 0; y < height; y += 8) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y + 2); context.stroke(); } }
  context.restore();
}

function pathPoints(width: number, height: number): readonly [number, number, number][] { const result: [number, number, number][] = []; for (let i = 0; i <= 100; i += 1) { const t = i / 100; result.push([width * (0.08 + t * 0.84), height * (0.52 + Math.sin(t * Math.PI * 2.15) * 0.25), 0.12 + Math.sin(t * Math.PI) * 0.86]); } return result; }
function lineStroke(context: CanvasRenderingContext2D, points: readonly [number, number, number][], program: BrushStudioV6Program): void {
  context.save(); context.lineCap = "round"; context.lineJoin = "round";
  const chisel = program.slots.tip === "tip-chisel-sdf"; const dry = program.slots.deposition === "deposit-dry"; const neon = program.slots.finish.includes("finish-neon");
  for (let i = 1; i < points.length; i += 1) { const previous = points[i - 1]!; const point = points[i]!; const pressure = point[2]; context.beginPath(); context.moveTo(previous[0], previous[1]); context.lineTo(point[0], point[1]); context.lineWidth = program.tuning.size * (0.25 + pressure * 0.75) * (chisel ? 0.72 : 1); context.strokeStyle = rgba(program.tuning.primaryColor, program.tuning.opacity * (dry ? 0.25 + pressure * 0.55 : 0.75)); if (neon) { context.shadowColor = program.tuning.secondaryColor; context.shadowBlur = program.tuning.size * 0.8; } context.stroke(); }
  context.restore();
}
function grainStroke(context: CanvasRenderingContext2D, points: readonly [number, number, number][], program: BrushStudioV6Program): void {
  const random = rng(program.seed ^ 0x43c1); context.save(); context.fillStyle = rgba(program.tuning.primaryColor, 0.24 + program.tuning.granulation * 0.42);
  const count = Math.round(500 + program.tuning.surfaceTooth * 900); for (let i = 0; i < count; i += 1) { const point = points[Math.floor(random() * points.length)]!; const radius = program.tuning.size * (0.05 + random() * 0.15) * point[2]; const spread = program.tuning.size * (0.2 + program.tuning.surfaceTooth); context.beginPath(); context.ellipse(point[0] + (random() - 0.5) * spread, point[1] + (random() - 0.5) * spread, Math.max(0.4, radius), Math.max(0.25, radius * (0.35 + random() * 0.5)), random() * Math.PI, 0, Math.PI * 2); context.fill(); }
  context.restore();
}
function bristleStroke(context: CanvasRenderingContext2D, points: readonly [number, number, number][], program: BrushStudioV6Program): void {
  const random = rng(program.seed ^ 0x717); const lanes = Math.min(34, Math.max(6, Math.round(program.tuning.bristleStrands / 4))); context.save(); context.lineCap = "round";
  for (let lane = 0; lane < lanes; lane += 1) { const offset = (lane / Math.max(1, lanes - 1) - 0.5) * program.tuning.size; context.beginPath(); points.forEach((point, index) => { const y = point[1] + offset + Math.sin(index * 0.2 + lane) * program.tuning.size * 0.035; index ? context.lineTo(point[0], y) : context.moveTo(point[0], y); }); context.globalAlpha = 0.2 + random() * 0.55; context.strokeStyle = lane % 4 === 0 ? program.tuning.secondaryColor : program.tuning.primaryColor; context.lineWidth = 0.45 + random() * 1.7; context.stroke(); }
  context.restore();
}
function particleStroke(context: CanvasRenderingContext2D, points: readonly [number, number, number][], program: BrushStudioV6Program): void {
  const random = rng(program.seed ^ 0x97f); const count = Math.min(2200, Math.round(program.tuning.particleCount * 0.7)); context.save();
  for (let i = 0; i < count; i += 1) { const point = points[Math.floor(random() * points.length)]!; const angle = random() * Math.PI * 2; const distance = Math.sqrt(random()) * program.tuning.size * (1 + program.tuning.patternJitter); const radius = 0.35 + random() * Math.max(0.8, program.tuning.size * 0.09); context.fillStyle = rgba(random() > 0.8 ? program.tuning.secondaryColor : program.tuning.primaryColor, 0.18 + random() * 0.62); context.beginPath(); context.arc(point[0] + Math.cos(angle) * distance, point[1] + Math.sin(angle) * distance + (program.slots.physics.includes("physics-thin-film") ? random() * program.tuning.gravity * 24 : 0), radius, 0, Math.PI * 2); context.fill(); }
  context.restore();
}
function wetStroke(context: CanvasRenderingContext2D, points: readonly [number, number, number][], program: BrushStudioV6Program): void {
  context.save(); context.globalCompositeOperation = "multiply"; const mixed = mixPreviewPigments(program.tuning.primaryColor, program.tuning.secondaryColor, 0.42); const layers = 7 + Math.round(program.tuning.diffusion * 9);
  for (let layer = layers; layer >= 0; layer -= 1) { context.beginPath(); for (const [index, point] of points.entries()) { const y = point[1] + Math.sin(index * 0.29 + layer) * layer * 0.22; index ? context.lineTo(point[0], y) : context.moveTo(point[0], y); } context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = program.tuning.size + layer * (1.4 + program.tuning.diffusion * 2.4); context.strokeStyle = layer === 0 ? rgba(program.tuning.primaryColor, 0.34) : mixed.replace(",1)", `,${0.018 + program.tuning.wetness * 0.018})`); context.stroke(); }
  if (program.slots.finish.includes("finish-edge-bloom")) { context.beginPath(); points.forEach((point, index) => index ? context.lineTo(point[0], point[1]) : context.moveTo(point[0], point[1])); context.lineWidth = program.tuning.size * 1.15; context.strokeStyle = rgba(program.tuning.primaryColor, 0.16 + program.tuning.edgeDarkening * 0.34); context.stroke(); }
  context.restore();
}
function pattern(context: CanvasRenderingContext2D, width: number, height: number, program: BrushStudioV6Program): void {
  const id = program.slots.pattern; if (id === "pattern-none") return; const scale = Math.max(5, 13 * program.tuning.patternScale); context.save(); context.globalAlpha = 0.22 + program.tuning.patternDensity * 0.45; context.strokeStyle = program.tuning.secondaryColor; context.fillStyle = program.tuning.secondaryColor; context.lineWidth = 1;
  if (id === "pattern-dot-tone") for (let y = scale / 2; y < height; y += scale) for (let x = scale / 2; x < width; x += scale) { context.beginPath(); context.arc(x, y, 1.2 + program.tuning.patternDensity * 2.4, 0, Math.PI * 2); context.fill(); }
  else if (id === "pattern-cross-hatch" || id === "pattern-weave") { for (let x = -height; x < width + height; x += scale) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x + height, height); context.stroke(); if (id === "pattern-weave") { context.beginPath(); context.moveTo(x + height, 0); context.lineTo(x, height); context.stroke(); } } }
  else if (id === "pattern-brick") for (let y = 0; y < height; y += scale) for (let x = (Math.round(y / scale) % 2) * -scale; x < width; x += scale * 2) context.strokeRect(x, y, scale * 2, scale);
  else if (id === "pattern-kaleido") { const cx = width / 2; const cy = height / 2; for (let i = 0; i < 16; i += 1) { context.save(); context.translate(cx, cy); context.rotate(i * Math.PI / 8); context.beginPath(); context.moveTo(10, 0); context.quadraticCurveTo(width * 0.18, -height * 0.18, width * 0.38, 0); context.stroke(); context.restore(); } }
  else { const random = rng(program.seed ^ 0x7e5); for (let i = 0; i < 90 * program.tuning.patternDensity; i += 1) { const x = random() * width; const y = random() * height; context.beginPath(); context.ellipse(x, y, scale * 0.35, scale * 0.13, random() * Math.PI, 0, Math.PI * 2); context.fill(); } }
  context.restore();
}

export function renderBrushStudioV6Preview(
  canvas: HTMLCanvasElement,
  program: BrushStudioV6Program,
  options: { readonly settleProgress?: number } = {},
): void {
  const settleProgress = clamp(options.settleProgress ?? 1);
  const context = fit(canvas); if (!context) return; const width = canvas.clientWidth || canvas.width; const height = canvas.clientHeight || canvas.height; clearPaper(context, canvas, program); pattern(context, width, height, program); const points = pathPoints(width, height);
  if (program.slots.physics.includes("physics-inkwash") || program.slots.deposition === "deposit-wet") wetStroke(context, points, program);
  else if (program.slots.carrier === "carrier-krita-hairy" || program.slots.physics.includes("physics-bristle")) bristleStroke(context, points, program);
  else if (program.slots.carrier === "carrier-webgpu-particles" || program.slots.deposition === "deposit-particles") particleStroke(context, points, program);
  else { lineStroke(context, points, program); if (program.slots.deposition === "deposit-dry" || program.slots.tip === "tip-grain-exemplar") grainStroke(context, points, program); }
  if (program.slots.physics.includes("physics-thin-film")) { context.save(); context.strokeStyle = rgba(program.tuning.primaryColor, 0.24); context.lineCap = "round"; for (let i = 0; i < 9; i += 1) { const point = points[20 + i * 8]!; context.lineWidth = Math.max(1, program.tuning.size * (0.08 + i * 0.006)); context.beginPath(); context.moveTo(point[0], point[1]); context.lineTo(point[0] + (i % 2 ? 3 : -2), point[1] + (18 + program.tuning.gravity * 52) * settleProgress); context.stroke(); } context.restore(); }
}

interface LivePoint { x: number; y: number; pressure: number; tilt: number; time: number; }
function eventPoint(canvas: HTMLCanvasElement, event: PointerEvent, program: BrushStudioV6Program): LivePoint { const rect = canvas.getBoundingClientRect(); const raw = event.pressure > 0 ? event.pressure : event.buttons ? 0.5 : 0; const normalized = clamp((raw - program.input.pressureOnset) / Math.max(0.05, program.input.pressureSaturation - program.input.pressureOnset)); return { x: event.clientX - rect.left, y: event.clientY - rect.top, pressure: Math.pow(normalized, program.input.pressureGamma), tilt: Math.hypot(event.tiltX || 0, event.tiltY || 0) / 90, time: performance.now() }; }
function palm(event: PointerEvent, program: BrushStudioV6Program): boolean { return program.input.palmRejection && event.pointerType === "touch" && (event.width * event.height > 850 || event.width > 38 || event.height > 38); }

export function attachBrushStudioV6LivePreview(canvas: HTMLCanvasElement, getProgram: () => BrushStudioV6Program, onTelemetry?: (telemetry: BrushStudioV6Telemetry) => void): BrushStudioV6LiveController {
  const context = fit(canvas); const active = new Map<number, LivePoint>(); let lastTelemetry = 0; let samples = 0; let started = performance.now(); if (context) clearPaper(context, canvas, getProgram()); canvas.style.touchAction = "none";
  const draw = (from: LivePoint, to: LivePoint, program: BrushStudioV6Program, waterOnly: boolean) => { const ctx = fit(canvas); if (!ctx) return; const size = program.tuning.size * (0.18 + to.pressure * 0.82) * (1 + to.tilt * 0.55); ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.lineWidth = size; const wet = program.slots.physics.includes("physics-inkwash"); const bristle = program.slots.physics.includes("physics-bristle"); if (waterOnly) { ctx.globalCompositeOperation = "destination-out"; ctx.globalAlpha = 0.025 + program.tuning.wetness * 0.04; ctx.strokeStyle = "#ffffff"; } else if (wet) { ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.1 + program.tuning.flow * 0.28; ctx.strokeStyle = program.tuning.primaryColor; ctx.shadowColor = program.tuning.secondaryColor; ctx.shadowBlur = size * program.tuning.diffusion * 0.65; } else { ctx.globalAlpha = program.tuning.opacity * (0.32 + to.pressure * 0.68); ctx.strokeStyle = program.tuning.primaryColor; } ctx.stroke(); if (bristle && !waterOnly) { ctx.globalAlpha *= 0.45; for (let i = -3; i <= 3; i += 1) { ctx.beginPath(); ctx.moveTo(from.x, from.y + i * size * 0.09); ctx.lineTo(to.x, to.y + i * size * 0.09); ctx.lineWidth = Math.max(0.5, size * 0.045); ctx.stroke(); } } ctx.restore(); };
  const down = (event: PointerEvent) => { const program = getProgram(); const rejected = palm(event, program); if (rejected || (event.pointerType === "touch" && program.input.touchPolicy === "pen-only")) { onTelemetry?.({ pointerType: event.pointerType, pressure: event.pressure, tilt: 0, twist: event.twist || 0, sampleRateHz: 0, rejectedPalm: true, transport: program.input.transport }); return; } canvas.setPointerCapture?.(event.pointerId); active.set(event.pointerId, eventPoint(canvas, event, program)); };
  const move = (event: PointerEvent) => { const program = getProgram(); const previous = active.get(event.pointerId); if (!previous) { if (program.input.hoverPreview && event.pointerType === "pen" && event.buttons === 0) onTelemetry?.({ pointerType: "pen-hover", pressure: 0, tilt: Math.hypot(event.tiltX || 0, event.tiltY || 0), twist: event.twist || 0, sampleRateHz: 0, rejectedPalm: false, transport: program.input.transport }); return; } const events = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [event]; let from = previous; const waterOnly = event.pointerType === "touch" && program.input.touchPolicy === "pen-ink-finger-water"; for (const source of events.length ? events : [event]) { const point = eventPoint(canvas, source, program); draw(from, point, program, waterOnly); from = point; samples += 1; } active.set(event.pointerId, from); const now = performance.now(); if (now - lastTelemetry > 80) { const elapsed = Math.max(1, now - started); onTelemetry?.({ pointerType: event.pointerType, pressure: from.pressure, tilt: from.tilt * 90, twist: event.twist || 0, sampleRateHz: Math.round(samples * 1000 / elapsed), rejectedPalm: false, transport: program.input.transport }); lastTelemetry = now; if (elapsed > 2000) { samples = 0; started = now; } } };
  const up = (event: PointerEvent) => { active.delete(event.pointerId); if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId); };
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("lostpointercapture", up);
  return { clear() { const ctx = fit(canvas); if (ctx) clearPaper(ctx, canvas, getProgram()); active.clear(); }, destroy() { canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("lostpointercapture", up); active.clear(); } };
}
