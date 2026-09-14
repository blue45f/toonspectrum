import { depositBrushStudioV6ArtistryMotif } from "./brush-studio-v6-artistry-motifs";
import type { BrushStudioV6ArtistryModel } from "./brush-studio-v6-artistry-catalog";
import type { BrushStudioV6MaterialProgram } from "./brush-studio-v6-material-engine";
import type { BrushTopologyContact, BrushTopologyPrimitive, BrushTopologyStroke } from "./brush-studio-v6-topology-engine";

const TAU = Math.PI * 2;
const MAX_PRIMITIVES: Readonly<Record<BrushStudioV6ArtistryModel, number>> = Object.freeze({
  braid: 6, chain: 3, pearls: 4, zipper: 4, fern: 7, blossom: 17,
  fur: 32, rake: 32, stipple: 32, contour: 13, scales: 40, embroidery: 8,
});
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const unit = (value: number): number => clamp(value, 0, 1);
function noise(a: number, b: number, seed: number): number {
  let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Fixed geometry budgets and distance clocks: no assets, timers, network or canvas readback. */
export function createBrushStudioV6ArtistryStroke(
  program: BrushStudioV6MaterialProgram, model: BrushStudioV6ArtistryModel, sampleStep: number,
): BrushTopologyStroke {
  const t = program.tuning, size = clamp(t.size, 1, 240), seed = program.seed | 0;
  const step = clamp(sampleStep, 0.01, 96), density = unit(t.patternDensity), variation = unit(t.patternJitter);
  const cycle = size * clamp(t.patternScale, 0.1, 4);
  const repeat = Math.max(step * 2, cycle * (0.28 + (1 - density) * 0.52));
  const continuous = ["braid", "rake", "contour"].includes(model);
  const x = new Float64Array(32), y = new Float64Array(32);
  let initialized = false, previousX = 0, previousY = 0, frameAngle = 0, lastMotif = -1;
  const reset = (): void => { initialized = false; lastMotif = -1; x.fill(0); y.fill(0); };

  return {
    maxPrimitivesPerDab: MAX_PRIMITIVES[model], retainedStateBytes: x.byteLength + y.byteLength + 40, reset,
    deposit(c: BrushTopologyContact, emit): void {
      if (![c.x, c.y, c.radius, c.pressure, c.direction, c.index].every(Number.isFinite)) return;
      if (c.pressure <= 0) { reset(); return; }
      if (c.discontinuity) reset();
      const first = !initialized;
      if (first) { previousX = c.x; previousY = c.y; frameAngle = c.direction; }
      // Circular interpolation avoids a 360-degree spin at the -pi/pi boundary.
      const delta = Math.atan2(Math.sin(c.direction - frameAngle), Math.cos(c.direction - frameAngle));
      frameAngle += delta * (1 - Math.exp(-step / Math.max(0.35, size * 0.035)));
      const ux = Math.cos(frameAngle), uy = Math.sin(frameAngle), nx = -uy, ny = ux;
      const r = clamp(c.radius, 0.01, size * 2);
      const width = Math.max(0.14, size * (0.003 + unit(c.pressure) * 0.009));
      const point = (along: number, lateral: number): readonly [number, number] =>
        [c.x + ux * along + nx * lateral, c.y + uy * along + ny * lateral];
      const line = (ax: number, ay: number, bx: number, by: number, w: number, mix = 0, opacity = 1): void => {
        let distance = Math.hypot(bx - ax, by - ay);
        if (!Number.isFinite(distance) || distance > size * 6) { ax = bx; ay = by; distance = 0; }
        const thickness = Math.max(0.12, w);
        emit({ x: (ax + bx) / 2, y: (ay + by) / 2, radiusX: distance / 2 + thickness,
          radiusY: thickness, angle: distance > 1e-9 ? Math.atan2(by - ay, bx - ax) : frameAngle,
          opacity: unit(opacity), mix: unit(mix), shape: "capsule" });
      };
      const localLine = (a: number, b: number, d: number, e: number, w: number, mix = 0, opacity = 1): void => {
        const p = point(a, b), q = point(d, e); line(p[0], p[1], q[0], q[1], w, mix, opacity);
      };
      const oval = (a: number, b: number, rx: number, ry: number, turn = 0, mix = 0, shape: BrushTopologyPrimitive["shape"] = "ellipse", opacity = 1): void => {
        const p = point(a, b);
        emit({ x: p[0], y: p[1], radiusX: Math.max(0.12, rx), radiusY: Math.max(0.12, ry),
          angle: frameAngle + turn, opacity: unit(opacity), mix: unit(mix), shape });
      };
      const connect = (lane: number, a: number, b: number, w: number, mix = 0, opacity = 1): void => {
        const p = point(a, b);
        line(first ? p[0] : x[lane]!, first ? p[1] : y[lane]!, p[0], p[1], w, mix, opacity);
        x[lane] = p[0]; y[lane] = p[1];
      };
      const phase = c.index * step / Math.max(0.1, cycle) * TAU + noise(0, 17, seed) * TAU;
      const motif = Math.floor((c.index * step + 1e-8) / repeat);
      const freshMotif = motif !== lastMotif;
      if (freshMotif) lastMotif = motif;
      if (model === "braid") {
        for (const front of [false, true]) for (let lane = 0; lane < 3; lane++) {
          const angle = phase + lane * TAU / 3;
          if ((Math.cos(angle) >= 0) !== front) continue;
          const a = Math.cos(angle) * r * variation * 0.25, b = Math.sin(angle) * r * 0.78;
          const w = Math.max(width, r * (0.06 + unit(t.relief) * 0.14));
          connect(lane, a, b, w, lane / 2, front ? 1 : 0.58);
          connect(lane + 3, a, b - w * 0.25, width * 0.55, 1 - lane / 2, 0.65);
        }
      } else if (model === "rake") {
        const count = Math.round(clamp(t.bristleStrands / 4, 2, 32));
        for (let lane = 0; lane < count; lane++) {
          const offset = lane / (count - 1) * 2 - 1;
          connect(lane, noise(lane, 23, seed) * r * 0.15,
            offset * r * (0.55 + unit(t.friction) * c.pressure),
            width * (0.4 + unit(t.viscosity)), lane / (count - 1), 0.9);
        }
      } else if (model === "contour") {
        const count = Math.round(3 + density * 9);
        for (let lane = 0; lane < count; lane++) {
          const offset = lane / (count - 1) * 2 - 1;
          const wave = Math.sin(phase + lane * 0.38) * variation * r * 0.18;
          connect(lane, 0, offset * r + wave, width * 0.7, lane / (count - 1));
        }
        if (freshMotif) localLine(-r * 0.2, -r, r * 0.2, r, width * 0.55, 0.35, 0.65);
      } else {
        if (["chain", "pearls", "fern"].includes(model)) line(previousX, previousY, c.x, c.y, width * 0.65, 0.35);
        if (model === "zipper" || model === "embroidery") {
          connect(0, 0, -r * 0.8, width, 0.1); connect(1, 0, r * 0.8, width, 0.85);
        }
        depositBrushStudioV6ArtistryMotif({ model, t, size, seed, density, variation, repeat,
          r, width, index: c.index, motif, freshMotif, localLine, oval });
      }
      if (!c.directional && continuous) { initialized = false; return; }
      initialized = true; previousX = c.x; previousY = c.y;
    },
  };
}
