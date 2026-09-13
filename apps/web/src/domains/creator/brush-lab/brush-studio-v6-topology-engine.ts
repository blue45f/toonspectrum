import { brushStudioV6Topology } from "./brush-studio-v6-topology-catalog";
import type { BrushStudioV6MaterialProgram } from "./brush-studio-v6-material-engine";

export interface BrushTopologyContact {
  readonly x: number; readonly y: number; readonly radius: number;
  readonly pressure: number; readonly direction: number; readonly index: number;
  readonly directional: boolean; readonly discontinuity: boolean;
}
export interface BrushTopologyPrimitive {
  readonly x: number; readonly y: number; readonly radiusX: number; readonly radiusY: number;
  readonly angle: number; readonly opacity: number; readonly mix: number;
  readonly shape: "ellipse" | "capsule" | "ring";
}
export interface BrushTopologyStroke {
  readonly maxPrimitivesPerDab: number;
  readonly retainedStateBytes: number;
  deposit(contact: BrushTopologyContact, emit: (primitive: BrushTopologyPrimitive) => void): void;
  reset(): void;
}
const TAU = Math.PI * 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
const unit = (n: number) => clamp(n, 0, 1);
const noise = (a: number, b: number, seed: number): number => {
  let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/** Distance-clocked solvers: no wall clock, canvas readback, global RNG or unbounded tree. */
export function createBrushStudioV6TopologyStroke(program: BrushStudioV6MaterialProgram, step: number): BrushTopologyStroke | null {
  const descriptor = brushStudioV6Topology(program.slots.carrier);
  if (!descriptor) return null;
  const model = descriptor.model, t = program.tuning;
  const size = clamp(t.size, 1, 240), seed = program.seed | 0;
  const count = model === "spring" ? Math.round(clamp(t.bristleStrands / 4, 2, 32))
    : model === "weave" ? Math.round(2 + unit(t.patternDensity) * 4)
    : model === "orbit" ? 2 : Math.round(clamp(t.particleCount / 128, 2, 32));
  const x = new Float64Array(count), y = new Float64Array(count);
  const vx = new Float64Array(count), vy = new Float64Array(count);
  const age = new Float64Array(count), generation = new Uint8Array(count);
  let initialized = false, originX = 0, originY = 0, previousX = 0, previousY = 0;
  const dt = clamp(step / size, 0.001, 0.25), cycle = Math.max(0.1, t.patternScale) * size;
  const reset = () => { initialized = false; x.fill(0); y.fill(0); vx.fill(0); vy.fill(0); age.fill(0); generation.fill(0); };
  return {
    maxPrimitivesPerDab: count * 2 + 2,
    retainedStateBytes: x.byteLength + y.byteLength + vx.byteLength + vy.byteLength + age.byteLength + generation.byteLength,
    reset,
    deposit(c, emit) {
      if (![c.x, c.y, c.radius, c.pressure, c.direction].every(Number.isFinite)) return;
      if (c.pressure <= 0) { reset(); return; }
      if (c.discontinuity) reset();
      const thickness = Math.max(0.15, size * (0.004 + c.pressure * 0.01));
      const nx = -Math.sin(c.direction), ny = Math.cos(c.direction), ux = Math.cos(c.direction), uy = Math.sin(c.direction);
      const segment = (ax: number, ay: number, bx: number, by: number, width: number, opacity: number, mix: number) => {
        const length = Math.hypot(bx - ax, by - ay);
        if (!Number.isFinite(length) || length > size * 6) { ax = bx; ay = by; }
        width = Math.max(0.12, width);
        const travel = Math.hypot(bx - ax, by - ay);
        emit({ x: (ax + bx) / 2, y: (ay + by) / 2, radiusX: travel / 2 + width, radiusY: width,
          angle: travel > 1e-9 ? Math.atan2(by - ay, bx - ax) : c.direction, opacity: unit(opacity), mix: unit(mix), shape: "capsule" });
      };
      const spawn = (i: number) => {
        const theta = noise(c.index, i, seed ^ 11) * TAU;
        const spread = c.radius * (0.1 + unit(t.patternJitter)) * Math.sqrt(noise(c.index, i, seed ^ 73));
        x[i] = c.x + Math.cos(theta) * spread; y[i] = c.y + Math.sin(theta) * spread;
        age[i] = 0; generation[i] = 0;
      };
      if (!c.directional) {
        for (let i = 0; i < Math.min(4, count); i++) {
          const theta = noise(i, 97, seed) * TAU, r = c.radius * 0.45;
          emit({ x: c.x + Math.cos(theta) * r, y: c.y + Math.sin(theta) * r,
            radiusX: thickness * 1.5, radiusY: thickness * 1.5, angle: 0, opacity: 0.7, mix: i / count, shape: "ellipse" });
        }
        return;
      }
      const first = !initialized;
      if (first) {
        originX = c.x; originY = c.y; previousX = c.x; previousY = c.y;
        for (let i = 0; i < count; i++) { spawn(i); age[i] = noise(i, 107, seed); }
        initialized = true;
      }
      const phase = c.index * step / cycle * TAU + noise(0, 173, seed) * TAU;
      if (model === "spring") {
        for (let i = 0; i < count; i++) {
          const spread = (i / (count - 1) - 0.5) * c.radius * 2;
          const tx = c.x + nx * spread, ty = c.y + ny * spread;
          if (first) { x[i] = tx; y[i] = ty; }
          const ax = x[i]!, ay = y[i]!;
          // Semi-implicit Euler with four fixed substeps and exponential damping.
          const h = dt / 4, k = (6 + unit(t.friction) * 48) * (0.7 + noise(i, 113, seed) * 0.6);
          const damping = Math.exp(-(1 + unit(t.viscosity) * 18) * h);
          for (let sub = 0; sub < 4; sub++) {
            vx[i] = clamp((vx[i]! + (tx - x[i]!) * k * h) * damping, -size * 8, size * 8);
            vy[i] = clamp((vy[i]! + (ty - y[i]!) * k * h) * damping, -size * 8, size * 8);
            x[i] = x[i]! + vx[i]! * h; y[i] = y[i]! + vy[i]! * h;
          }
          if (Math.hypot(x[i]! - c.x, y[i]! - c.y) > size * 3) { x[i] = tx; y[i] = ty; vx[i] = 0; vy[i] = 0; }
          segment(ax, ay, x[i]!, y[i]!, thickness, 0.65 + noise(i, 127, seed) * 0.35, i / (count - 1));
        }
      } else if (model === "curl") {
        const k = TAU / Math.max(0.2, t.patternScale), strength = 0.2 + unit(t.advection) * 2.8;
        // Curl of a sine stream function; midpoint advection, not a fluid-grid solver.
        const field = (px: number, py: number): [number, number] => {
          const sx = (px - originX) / size * k + noise(0, 131, seed) * TAU;
          const sy = (py - originY) / size * k + noise(0, 137, seed) * TAU;
          return [Math.sin(sx) * Math.cos(sy), -Math.cos(sx) * Math.sin(sy)];
        };
        for (let i = 0; i < count; i++) {
          if (age[i]! > 1.2 || Math.hypot(x[i]! - c.x, y[i]! - c.y) > size * 2) { spawn(i); vx[i] = 0; vy[i] = 0; }
          const ax = x[i]!, ay = y[i]!, a = field(ax, ay);
          const b = field(ax + a[0] * step * strength / 2, ay + a[1] * step * strength / 2);
          const response = 1 - Math.exp(-dt / (0.025 + unit(t.viscosity) * 0.45));
          vx[i] = vx[i]! + (b[0] * strength + ux * 0.2 - vx[i]!) * response;
          vy[i] = vy[i]! + (b[1] * strength + uy * 0.2 - vy[i]!) * response;
          x[i] = x[i]! + vx[i]! * step; y[i] = y[i]! + vy[i]! * step; age[i] = age[i]! + dt;
          segment(ax, ay, x[i]!, y[i]!, thickness * 0.75, Math.max(0.08, 1 - age[i]! / 1.3), i / (count - 1));
        }
      } else if (model === "ballistic") {
        for (let i = 0; i < count; i++) {
          const lifetime = (0.35 + unit(t.reservoir) * 1.8) * (0.7 + noise(i, 139, seed) * 0.6);
          if (first || age[i]! >= lifetime || Math.hypot(x[i]! - c.x, y[i]! - c.y) > size * 4) {
            spawn(i); age[i] = first ? lifetime * i / count : 0;
            const turn = -Math.PI / 2 + (noise(c.index, i, seed ^ 149) - 0.5) * TAU * unit(t.patternJitter);
            const speed = size * (0.3 + unit(t.advection) * 2.5) * (0.5 + noise(c.index, i, seed ^ 151));
            vx[i] = Math.cos(turn) * speed; vy[i] = Math.sin(turn) * speed;
          }
          const ax = x[i]!, ay = y[i]!;
          const drag = Math.exp(-unit(t.viscosity) * 4 * dt);
          vx[i] = vx[i]! * drag; vy[i] = (vy[i]! + clamp(t.gravity, -1, 1) * size * 4 * dt) * drag;
          x[i] = x[i]! + vx[i]! * dt; y[i] = y[i]! + vy[i]! * dt; age[i] = age[i]! + dt;
          const fade = Math.max(0.04, 1 - age[i]! / lifetime);
          segment(ax, ay, x[i]!, y[i]!, thickness * (0.5 + fade), fade, i / (count - 1));
          emit({ x: x[i]!, y: y[i]!, radiusX: thickness * 2, radiusY: thickness * 2, angle: 0, opacity: fade, mix: i / count, shape: "ellipse" });
        }
      } else if (model === "weave") {
        // Back strands first, front strands last: real over/under paint order.
        for (const front of [false, true]) for (let i = 0; i < count; i++) {
          const theta = phase + i * TAU / count;
          if ((Math.cos(theta) >= 0) !== front) continue;
          const lateral = Math.sin(theta) * c.radius;
          const along = Math.cos(theta) * c.radius * unit(t.patternJitter) * 0.5;
          const bx = c.x + nx * lateral + ux * along, by = c.y + ny * lateral + uy * along;
          if (first) { x[i] = bx; y[i] = by; }
          segment(x[i]!, y[i]!, bx, by, thickness * (front ? 2.4 : 1.1), front ? 1 : 0.55, i / (count - 1));
          x[i] = bx; y[i] = by;
        }
        if (c.index % 4 === 0) segment(c.x - nx * c.radius, c.y - ny * c.radius, c.x + nx * c.radius, c.y + ny * c.radius, thickness * 0.55, 0.45, 0.5);
      } else if (model === "branch") {
        segment(previousX, previousY, c.x, c.y, thickness * 1.4, 0.9, 0);
        const lifetime = 0.3 + unit(t.reservoir) * 1.6;
        const interval = Math.max(2, Math.round((0.38 - unit(t.reactionRate) * 0.3) / dt));
        if (first) age.fill(lifetime + 1);
        const birth = (i: number, bx: number, by: number, angle: number, level: number) => {
          x[i] = bx; y[i] = by; vx[i] = Math.cos(angle); vy[i] = Math.sin(angle); age[i] = 0; generation[i] = level;
        };
        if (c.index % interval === 0 || first) {
          const i = Math.floor(c.index / interval) % count;
          const sign = noise(c.index, i, seed ^ 157) < 0.5 ? -1 : 1;
          birth(i, c.x, c.y, c.direction + sign * (0.35 + unit(t.patternJitter) * 1.2), 0);
        }
        for (let i = 0; i < count; i++) {
          if (age[i]! >= lifetime) continue;
          const ax = x[i]!, ay = y[i]!;
          const turn = Math.atan2(vy[i]!, vx[i]!) + (noise(c.index, i, seed ^ 163) - 0.5) * unit(t.patternJitter) * 0.35;
          vx[i] = Math.cos(turn); vy[i] = Math.sin(turn);
          x[i] = x[i]! + vx[i]! * step * 0.9; y[i] = y[i]! + vy[i]! * step * 0.9;
          const oldAge = age[i]!; age[i] = age[i]! + dt;
          segment(ax, ay, x[i]!, y[i]!, thickness * (1 - age[i]! / lifetime) + 0.12, 0.8, (generation[i]! + 1) / 3);
          const splitAge = lifetime * (0.65 - unit(t.reactionRate) * 0.4);
          if (generation[i]! < 2 && oldAge < splitAge && age[i]! >= splitAge) {
            const child = age.findIndex((value) => value >= lifetime);
            if (child >= 0) birth(child, x[i]!, y[i]!, turn + (i % 2 ? 1 : -1) * (0.45 + unit(t.patternJitter)), generation[i]! + 1);
          }
        }
      } else {
        const lobes = Math.round(2 + unit(t.patternDensity) * 5);
        for (let i = 0; i < count; i++) {
          const theta = phase + i * Math.PI;
          const along = c.radius * (Math.cos(theta) + Math.cos(theta * lobes) * unit(t.patternJitter) * 0.55);
          const lateral = c.radius * (Math.sin(theta) - Math.sin(theta * lobes) * unit(t.patternJitter) * 0.55);
          const bx = c.x + ux * along + nx * lateral, by = c.y + uy * along + ny * lateral;
          if (first) { x[i] = bx; y[i] = by; }
          segment(x[i]!, y[i]!, bx, by, thickness, 0.9, i);
          x[i] = bx; y[i] = by;
        }
        if (c.index % 7 === 0) emit({ x: (x[0]! + x[1]!) / 2, y: (y[0]! + y[1]!) / 2,
          radiusX: c.radius * 0.35, radiusY: c.radius * 0.12, angle: c.direction + phase, opacity: 0.6, mix: 0.5, shape: "ring" });
      }
      previousX = c.x; previousY = c.y;
    },
  };
}
