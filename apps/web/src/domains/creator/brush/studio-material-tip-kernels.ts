/**
 * Original material morphology programs. These are different coverage constructions, not
 * ordinal-seeded copies of a round stamp. They compile to portable R8 fields at build time; selection reads the baked atlas.
 *
 * Names describe the mark, not an unimplemented fluid/optical simulation: diffusion, impasto
 * and spectral mixing remain the responsibility of their existing dedicated Studio engines.
 */
import {
  studioProceduralTipCache,
  studioMaterialIdentitySeed,
  STUDIO_PROCEDURAL_TIP_MAX_SIZE,
  type StudioTipCoverageField,
} from "./studio-procedural-tip-rasterizer";

export const STUDIO_MATERIAL_TIP_PROGRAMS = [
  "capillary-dendrite", "cellular-foam", "pigment-floc", "lithography-reticulation",
  "porous-charcoal", "graphite-platelets", "felt-fiber-bundle", "split-reed",
  "engraving-burin", "silverpoint-crossgrain", "chalk-fracture", "wax-resist",
  "linen-scumble", "gouache-craquelure", "stipple-etch", "dry-bristle-comb",
  "opal-facet", "mica-flakes", "diffraction-spike", "circuit-trace",
  "contour-isoline", "aurora-curtain", "coral-polyp", "fern-frond",
  "ginkgo-fan", "maple-leaf", "rose-rosette", "dandelion-seedhead",
  "herringbone-twill", "guilloche-rosette", "fish-scale", "sequin-paillettes",
  "sakura-petal", "bamboo-joint", "feather-quill", "lightning-fork",
  "zipper-teeth", "cobblestone-joints", "knit-cable", "wave-seigaiha",
] as const;
export type StudioMaterialTipProgram = (typeof STUDIO_MATERIAL_TIP_PROGRAMS)[number];
const PROGRAMS: ReadonlySet<string> = new Set(STUDIO_MATERIAL_TIP_PROGRAMS);
const TAU = Math.PI * 2;

export function isStudioMaterialTipProgram(value: unknown): value is StudioMaterialTipProgram {
  return typeof value === "string" && PROGRAMS.has(value);
}


function unit(x: number, y: number, seed: number): number {
  let hash = Math.imul(x ^ seed, 0x45d9f3b) ^ Math.imul(y, 0x27d4eb2d);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  return ((hash ^ (hash >>> 13)) >>> 0) / 0x1_0000_0000;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function fade(value: number): number {
  return value * value * (3 - 2 * value);
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const tx = fade(x - ix);
  const ty = fade(y - iy);
  const a = unit(ix, iy, seed);
  const b = unit(ix + 1, iy, seed);
  const c = unit(ix, iy + 1, seed);
  const d = unit(ix + 1, iy + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function turbulence(x: number, y: number, seed: number): number {
  return (noise(x, y, seed) + noise(x * 2.07 + 3.1, y * 2.07, seed + 11) * 0.5
    + noise(x * 4.13, y * 4.13 - 1.7, seed + 29) * 0.25) / 1.75;
}

/** Soft signed-distance coverage; area integration retains narrower-than-one-texel features. */
function edge(distance: number, feather = 0.016): number {
  return fade(clamp01(0.5 - distance / feather));
}

function line(x: number, y: number, ax: number, ay: number, bx: number, by: number, width: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const t = denominator > 0 ? clamp01(((x - ax) * dx + (y - ay) * dy) / denominator) : 0;
  return edge(Math.hypot(x - ax - dx * t, y - ay - dy * t) - width);
}

function ellipse(x: number, y: number, rx: number, ry: number): number {
  return edge((Math.hypot(x / rx, y / ry) - 1) * Math.min(rx, ry));
}

function ring(radius: number, target: number, width: number): number {
  return edge(Math.abs(radius - target) - width);
}

/** Nearest/second-nearest jittered sites and stable cell pigment, without per-texel allocation. */
function cellular(x: number, y: number, seed: number, out: Float64Array): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let first = Infinity;
  let second = Infinity;
  let tone = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const sx = ix + ox;
      const sy = iy + oy;
      // Keep sites in the central 50% so a 3x3 neighbourhood contains both nearest sites.
      const dx = x - sx - 0.25 - unit(sx, sy, seed) * 0.5;
      const dy = y - sy - 0.25 - unit(sx, sy, seed + 47) * 0.5;
      const distance = dx * dx + dy * dy;
      if (distance < first) {
        second = first;
        first = distance;
        tone = unit(sx, sy, seed + 101);
      } else if (distance < second) {
        second = distance;
      }
    }
  }
  out[0] = Math.sqrt(first);
  out[1] = Math.sqrt(second);
  out[2] = tone;
}

function periodicDistance(value: number): number {
  return Math.abs(value - Math.round(value));
}

/**
 * Build an independent material field. The mutable scratch is private to one synchronous
 * compiler invocation; no field shares random state or a scratch buffer with another material.
 */
export function createStudioMaterialTipField(
  program: StudioMaterialTipProgram,
  seed = studioMaterialIdentitySeed(program),
): StudioTipCoverageField {
  if (!isStudioMaterialTipProgram(program)) throw new RangeError("Unknown material tip program.");
  const stableSeed = Number.isFinite(seed) ? seed >>> 0 : studioMaterialIdentitySeed(program);
  const cell = new Float64Array(3);
  const phase = unit(13, 7, stableSeed) * TAU;
  return (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1 || Math.abs(y) > 1) return 0;
    const r = Math.hypot(x, y);
    const disc = edge(r - 0.94, 0.07);
    switch (program) {
      case "capillary-dendrite": {
        // Branch skeleton with side capillaries: connected ribs, not isotropic noise dots.
        let result = line(x, y, 0, 0.88, -0.08, -0.83, 0.033);
        for (let branch = 0; branch < 7; branch++) {
          const sign = branch % 2 ? -1 : 1;
          const by = 0.64 - branch * 0.2;
          const bx = sign * (0.62 - Math.abs(by) * 0.23);
          result = Math.max(result, line(x, y, -0.04, by, bx, by - 0.31, 0.019));
          result = Math.max(result, line(x, y, bx * 0.6, by - 0.18, bx * 0.83, by - 0.39, 0.009));
        }
        return result * disc * (0.5 + noise(x * 23, y * 23, stableSeed) * 0.5);
      }
      case "cellular-foam": {
        cellular(x * 4.7 + 10, y * 4.7 + 10, stableSeed, cell);
        const walls = edge((cell[1]! - cell[0]!) - 0.10, 0.09);
        const junctions = edge(0.59 - cell[0]!, 0.14);
        return Math.max(walls * 0.8, junctions) * disc;
      }
      case "pigment-floc": {
        const macro = turbulence(x * 2.8 + 5, y * 2.8, stableSeed);
        cellular(x * 11 + 20, y * 11 + 20, stableSeed + 23, cell);
        const grain = edge(cell[0]! - (0.12 + macro * 0.38), 0.14);
        return grain * (0.28 + macro * 0.72) * edge(r - 0.82 - (macro - 0.5) * 0.23, 0.11);
      }
      case "lithography-reticulation": {
        const pool = turbulence(x * 5.4 + 10, y * 5.4 + 10, stableSeed);
        const islands = edge(0.48 - pool, 0.17);
        const perimeter = ring(pool, 0.47, 0.037) * 0.74;
        return Math.max(islands * 0.8, perimeter) * disc;
      }
      case "porous-charcoal": {
        cellular(x * 8 + 20, y * 15 + 20, stableSeed, cell);
        const pore = edge(0.20 + cell[2]! * 0.1 - cell[0]!, 0.09);
        const dust = 0.40 + noise(x * 37, y * 37, stableSeed + 9) * 0.6;
        const silhouette = edge(Math.max(Math.abs(x) * 1.2, Math.abs(y) * 0.94) - 0.84
          + (noise(x * 11, y * 11, stableSeed) - 0.5) * 0.14, 0.03);
        return pore * dust * silhouette;
      }
      case "graphite-platelets": {
        const gx = x * 9 + y * 3;
        const gy = y * 17;
        const row = Math.floor(gy);
        const lx = gx + (row % 2) * 0.5;
        const dx = periodicDistance(lx);
        const dy = periodicDistance(gy);
        const plate = edge(dx + dy * 1.7 - 0.46, 0.10);
        const shine = 0.36 + unit(Math.floor(lx), row, stableSeed) * 0.64;
        return plate * shine * disc;
      }
      case "felt-fiber-bundle": {
        cellular(x * 13 + 20, y * 13 + 20, stableSeed, cell);
        const fiber = edge(cell[0]! - 0.28, 0.10);
        const core = edge(cell[0]! - 0.13, 0.07);
        return (fiber * 0.46 + core * 0.54) * edge(r - 0.79, 0.10);
      }
      case "split-reed": {
        const point = 0.56 - (y + 0.83) * 0.14;
        const body = edge(Math.abs(x + y * 0.12) - point)
          * edge(Math.abs(y) - 0.85);
        const slit = edge(0.037 - Math.abs(x + y * 0.12), 0.02);
        const split = edge(Math.abs(x + y * 0.12) - 0.17 - (0.85 - y) * 0.18);
        return body * slit * (1 - split * clamp01((y - 0.20) * 2));
      }
      case "engraving-burin": {
        const diamond = edge(Math.abs(x) * 0.62 + Math.abs(y) * 1.6 - 0.79);
        const face = x * 0.55 + y;
        const ridge = ring(face, 0.05, 0.036);
        return diamond * Math.max(ridge, face < 0.05 ? 0.42 : 0.94);
      }
      case "silverpoint-crossgrain": {
        const a = periodicDistance((x + y * 0.3) * 10);
        const b = periodicDistance((y - x * 0.2) * 14);
        const marks = Math.max(edge(a - 0.095, 0.11) * 0.86, edge(b - 0.05, 0.06) * 0.35);
        return marks * edge(Math.hypot(x * 0.93, y * 1.4) - 0.85, 0.12);
      }
      case "chalk-fracture": {
        cellular(x * 5 + 10, y * 5 + 10, stableSeed, cell);
        const crack = edge(0.06 - (cell[1]! - cell[0]!), 0.07);
        const silhouette = edge(Math.abs(x) * 0.78 + Math.abs(y) * 0.56 - 0.86, 0.06);
        return silhouette * crack * (0.5 + noise(x * 35, y * 35, stableSeed) * 0.5);
      }
      case "wax-resist": {
        const flow = turbulence(x * 3.8 + 2, y * 3.8 - 2, stableSeed);
        const wax = edge(0.49 - flow, 0.12);
        const grooves = edge(periodicDistance((y + flow * 0.17) * 19) - 0.12, 0.13);
        return wax * (0.55 + 0.45 * grooves) * disc;
      }
      case "linen-scumble": {
        const row = Math.floor(y * 9);
        const column = Math.floor(x * 9);
        const warp = edge(periodicDistance(x * 9) - 0.11, 0.12);
        const weft = edge(periodicDistance(y * 9) - 0.095, 0.12);
        const over = (row + column) % 2 === 0;
        return Math.max(warp * (over ? 1 : 0.45), weft * (over ? 0.38 : 0.9)) * disc;
      }
      case "gouache-craquelure": {
        // A shrinking film fractures into broad lamellae, unlike the chalk's Voronoi pores.
        // Longitudinal fissures remain aligned through overlapping deposits rather than averaging
        // into another round opaque stroke. Short branch cracks stop inside each paint plate.
        const warp = y + Math.sin(x * 3.2 + phase) * 0.018;
        const fissure = Math.min(Math.abs(warp + 0.31), Math.abs(warp - 0.19));
        const film = edge(0.06 - fissure, 0.026);
        const branchX = periodicDistance((x + y * 0.32) * 2.2);
        const branches = 1 - edge(branchX - 0.025, 0.025)
          * edge(Math.abs(warp + 0.04) - 0.19, 0.04);
        const plateTone = warp < -0.31 ? 0.7 : warp > 0.19 ? 0.92 : 0.83;
        return film * branches * plateTone
          * edge(Math.max(Math.abs(x) * 0.97, Math.abs(y) * 1.12) - 0.86, 0.035);
      }
      case "stipple-etch": {
        cellular(x * 11 + 20, y * 11 + 20, stableSeed, cell);
        const speck = edge(cell[0]! - 0.07 - cell[2]! * 0.1, 0.075);
        return speck * disc;
      }
      case "dry-bristle-comb": {
        const bend = Math.sin(y * 2.7 + phase) * 0.048;
        const strand = periodicDistance((x + bend) * 12);
        const fiber = edge(strand - 0.105, 0.09);
        const broken = edge(0.29 - noise(x * 21, y * 7 + 4, stableSeed), 0.13);
        return fiber * broken * edge(Math.hypot(x, y * 0.84) - 0.86, 0.09);
      }
      case "opal-facet": {
        const angle = Math.atan2(y, x);
        const sectors = (angle + Math.PI) / TAU * 7;
        const wedge = periodicDistance(sectors);
        const outer = 0.79 + Math.cos(angle * 7) * 0.11;
        const facet = edge(r - outer) * edge(0.17 - r);
        return facet * (0.24 + edge(wedge - 0.36, 0.11) * 0.50 + ring(r, 0.52, 0.016) * 0.26);
      }
      case "mica-flakes": {
        cellular(x * 5 + 10, y * 7 + 10, stableSeed, cell);
        const platelet = edge(cell[0]! - 0.29, 0.055) * edge(0.07 - (cell[1]! - cell[0]!));
        const strata = 0.35 + 0.65 * edge(periodicDistance((x + y * 0.4) * 16) - 0.21, 0.09);
        return platelet * strata * disc;
      }
      case "diffraction-spike": {
        const cross = Math.max(Math.exp(-Math.abs(x) * 100) * Math.exp(-Math.abs(y) * 2.9),
          Math.exp(-Math.abs(y) * 100) * Math.exp(-Math.abs(x) * 2.9));
        const diagonals = Math.max(Math.exp(-Math.abs(x - y) * 95), Math.exp(-Math.abs(x + y) * 95))
          * Math.exp(-r * 5.3) * 0.55;
        return clamp01(cross + diagonals + Math.exp(-r * r * 160) + Math.exp(-r * 9) * 0.18) * disc;
      }
      case "circuit-trace": {
        let result = 0;
        for (let lane = 0; lane < 4; lane++) {
          const start = -0.73 + lane * 0.43;
          const bendY = -0.48 + lane * 0.26;
          const end = start + 0.20;
          result = Math.max(result,
            line(x, y, start, 0.83, start, bendY, 0.015),
            line(x, y, start, bendY, end, bendY - 0.2, 0.015),
            line(x, y, end, bendY - 0.2, end, -0.77, 0.015),
            ring(Math.hypot(x - end, y + 0.77), 0.049, 0.015));
        }
        return result;
      }
      case "contour-isoline": {
        const terrain = turbulence(x * 2.4 + 10, y * 2.4 + 10, stableSeed);
        const height = terrain + (x * x + y * y) * 0.14;
        return edge(periodicDistance(height * 13) - 0.067, 0.08) * disc;
      }
      case "aurora-curtain": {
        const fold = Math.sin(x * 4.8 + phase) * 0.26 + Math.sin(x * 11.7) * 0.055;
        const yLocal = y - fold;
        const curtain = Math.exp(-Math.pow((yLocal + 0.15) * 3, 2));
        const threads = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.cos(x * 91 + y * 1.7), 3);
        return curtain * threads * edge(Math.abs(x) - 0.89, 0.13)
          * (0.48 + ring(yLocal, -0.35, 0.04) * 0.52);
      }
      case "coral-polyp": {
        const angle = Math.atan2(y, x);
        const folded = Math.abs(Math.sin(angle * 5));
        const arms = edge(folded * r - 0.072, 0.04) * edge(r - 0.78, 0.08);
        const pores = ring(Math.hypot(x, y), 0.20, 0.038);
        const scallops = ring(r, 0.62 + Math.cos(angle * 10) * 0.15, 0.042);
        return Math.max(arms * (0.6 + noise(x * 25, y * 25, stableSeed) * 0.4), pores, scallops) * disc;
      }
      case "fern-frond": {
        let result = line(x, y, 0, 0.91, 0.06, -0.89, 0.015);
        for (let leaf = 0; leaf < 9; leaf++) {
          const cy = 0.65 - leaf * 0.18;
          const length = 0.41 * Math.sin((leaf + 1) / 10 * Math.PI);
          for (let side = -1; side <= 1; side += 2) {
            const lx = x * side - length * 0.51;
            const ly = y - cy + x * side * 0.53;
            result = Math.max(result, ellipse(lx, ly, length * 0.61, 0.049));
          }
        }
        return result;
      }
      case "ginkgo-fan": {
        const originY = 0.73;
        const angle = Math.atan2(x, originY - y);
        const radius = Math.hypot(x, y - originY);
        const scallop = 0.052 * Math.cos(angle * 18) + 0.03 * Math.cos(angle * 31);
        const body = edge(Math.abs(angle) - 0.80) * edge(radius - 1.40 - scallop)
          * edge(0.25 - radius, 0.05);
        const veins = edge(periodicDistance(angle * 9 + radius * 0.18) - 0.056, 0.08);
        const notch = 1 - edge(Math.abs(x) - 0.036) * edge(y + 0.43);
        return Math.max(body * notch * (0.62 + veins * 0.38), line(x, y, 0, 0.65, 0, 0.95, 0.016)) * disc;
      }
      case "maple-leaf": {
        const angle = Math.atan2(x, -y);
        const lobes = 0.56 + 0.25 * Math.cos(angle * 5);
        const serration = 0.025 * Math.cos(angle * 29);
        const body = edge(r - lobes - serration, 0.025);
        const veins = edge(Math.abs(Math.sin(angle * 5)) * r - 0.014, 0.02);
        return Math.max(body * (0.64 + veins * 0.36), line(x, y, 0, 0.1, 0, 0.94, 0.02));
      }
      case "rose-rosette": {
        const angle = Math.atan2(y, x);
        const petals = 0.63 + Math.sin(angle * 5 + r * 11) * 0.18;
        const outline = edge(r - petals, 0.07);
        const folds = ring(Math.sin(angle * 5 + r * 15), 0, 0.12);
        return outline * (0.3 + 0.7 * folds) * disc;
      }
      case "dandelion-seedhead": {
        const angle = Math.atan2(y, x);
        const spokes = edge(Math.abs(Math.sin(angle * 12)) * r - 0.009, 0.015)
          * edge(r - 0.76) * edge(0.12 - r);
        const angleCell = Math.round(angle / TAU * 24) / 24 * TAU;
        const tx = x - Math.cos(angleCell) * 0.76;
        const ty = y - Math.sin(angleCell) * 0.76;
        const halo = ring(Math.hypot(tx, ty), 0.10, 0.012);
        return Math.max(spokes * 0.75, halo, edge(r - 0.11));
      }
      case "herringbone-twill": {
        const row = Math.floor(y * 7);
        const parity = ((row % 2) + 2) % 2;
        const diagonal = x * 8 + (parity ? -1 : 1) * y * 7;
        const thread = edge(periodicDistance(diagonal) - 0.13, 0.10);
        const seam = edge(0.055 - periodicDistance(y * 7), 0.07);
        return thread * seam * edge(Math.max(Math.abs(x), Math.abs(y)) - 0.92, 0.04);
      }
      case "guilloche-rosette": {
        const angle = Math.atan2(y, x);
        let result = 0;
        for (let loop = 0; loop < 5; loop++) {
          const path = 0.54 + Math.sin(angle * 9 + loop * TAU / 5) * 0.29;
          result = Math.max(result, ring(r, path, 0.009));
        }
        return result * disc;
      }
      case "fish-scale": {
        const gy = (y + 1) * 3.6;
        const row = Math.floor(gy);
        const gx = (x + 1) * 3.6 + (row % 2) * 0.5;
        const localX = gx - Math.floor(gx) - 0.5;
        const localY = gy - row - 0.12;
        const arc = ring(Math.hypot(localX, localY), 0.61, 0.032);
        const ribs = edge(periodicDistance(Math.atan2(localY, localX) * 3) - 0.08, 0.10) * 0.25;
        return Math.max(arc, ribs * edge(Math.hypot(localX, localY) - 0.6)) * disc;
      }
      case "sakura-petal": {
        const body = ellipse(x, y + 0.04, 0.49 * (1 - y * 0.34), 0.81);
        const notch = 1 - edge(Math.abs(x) - (-y - 0.49) * 0.38, 0.018) * edge(y + 0.49);
        const vein = line(x, y, 0, 0.70, -0.015, -0.44, 0.013);
        return body * notch * (0.5 + 0.5 * Math.max(vein, clamp01((x + 0.5) * 0.9)));
      }
      case "bamboo-joint": {
        const stalk = edge(Math.abs(x) - 0.22) * edge(Math.abs(y) - 0.87);
        const node = ellipse(x, y + 0.17, 0.28, 0.056);
        const fiber = edge(periodicDistance(x * 23 + Math.sin(y * 3) * 0.1) - 0.08, 0.07);
        const leafA = ellipse((x - 0.40) * 0.7 + (y + 0.45) * 0.7, (y + 0.45) * 0.7 - (x - 0.40) * 0.7, 0.35, 0.06);
        const leafB = ellipse((x + 0.38) * 0.8 - (y + 0.38) * 0.6, (y + 0.38) * 0.8 + (x + 0.38) * 0.6, 0.31, 0.055);
        return Math.max(stalk * (0.45 + fiber * 0.35), node, leafA, leafB);
      }
      case "feather-quill": {
        const spine = line(x, y, -0.06, 0.92, 0.08, -0.88, 0.02);
        const axis = x - 0.05 + y * 0.065;
        const envelope = ellipse(axis, y + 0.12, 0.48, 0.68);
        const barbs = edge(periodicDistance((y + Math.abs(axis) * 0.7) * 15) - 0.13, 0.09);
        return Math.max(spine, envelope * barbs * (0.6 + 0.4 * (1 - Math.abs(axis))));
      }
      case "lightning-fork": {
        const main = Math.max(line(x,y,0.3,-0.88,-0.14,-0.22,0.036),
          line(x,y,-0.14,-0.22,0.17,-0.3,0.036), line(x,y,0.17,-0.3,-0.32,0.85,0.024));
        const fork = Math.max(line(x,y,-0.05,0.12,0.42,0.22,0.016),
          line(x,y,0.42,0.22,0.65,0.66,0.01), line(x,y,-0.1,-0.28,-0.55,-0.12,0.012));
        return Math.max(main, fork * 0.72);
      }
      case "zipper-teeth": {
        const pitch = 0.23;
        const right = x >= 0;
        const row = Math.floor((y + 1) / pitch + (right ? 0.5 : 0));
        const cy = (row + 0.5 - (right ? 0.5 : 0)) * pitch - 1;
        const tooth = edge(Math.max(Math.abs(x) - 0.48, Math.abs(y - cy) - 0.065))
          * edge(0.05 - Math.abs(x));
        const tape = edge(Math.abs(Math.abs(x) - 0.60) - 0.028);
        return Math.max(tooth, tape * 0.58) * edge(Math.abs(y) - 0.89);
      }
      case "cobblestone-joints": {
        cellular(x * 3.3 + 10, y * 3.3 + 10, stableSeed, cell);
        const mortar = edge((cell[1]! - cell[0]!) - 0.075, 0.07);
        const bevel = edge((cell[1]! - cell[0]!) - 0.17, 0.07) * 0.32;
        return Math.max(mortar, bevel) * edge(Math.max(Math.abs(x),Math.abs(y)) - 0.91, 0.05);
      }
      case "knit-cable": {
        const wave = Math.sin(y * Math.PI * 2.4) * 0.30;
        const a = edge(Math.abs(x - wave) - 0.07, 0.03);
        const b = edge(Math.abs(x + wave) - 0.07, 0.03);
        const front = Math.cos(y * Math.PI * 2.4) > 0;
        const weave = Math.max(a * (front ? 1 : 0.45), b * (front ? 0.45 : 1));
        const fiber = 0.68 + 0.32 * noise(x * 51, y * 23, stableSeed);
        return weave * fiber * edge(Math.abs(y) - 0.9, 0.05);
      }
      case "wave-seigaiha": {
        const gy = (y + 1) * 2.5;
        const row = Math.floor(gy);
        const gx = (x + 1) * 2.5 + ((row % 2) + 2) % 2 * 0.5;
        const lx = gx - Math.floor(gx) - 0.5;
        const ly = gy - row;
        const radius = Math.hypot(lx, ly);
        let waves = 0;
        for (let band = 1; band <= 4; band++) waves = Math.max(waves, ring(radius, band * 0.22, 0.025));
        return waves * edge(Math.max(Math.abs(x), Math.abs(y)) - 0.92, 0.04);
      }
      case "sequin-paillettes": {
        const gy = (y + 1) * 3.2;
        const row = Math.floor(gy);
        const gx = (x + 1) * 3.2 + (row % 2) * 0.5;
        const lx = gx - Math.floor(gx) - 0.5;
        const ly = gy - row - 0.5;
        const radius = Math.hypot(lx, ly);
        const disclet = edge(radius - 0.43, 0.07) * edge(0.105 - radius, 0.04);
        const relief = 0.3 + clamp01(0.5 + (lx - ly) * 0.8) * 0.55;
        return Math.max(disclet * relief, ring(radius, 0.4, 0.022)) * disc;
      }
    }
  };
}

/** R8 snapshots are stable, deterministic and detached from the shared bounded compiler cache. */
export function materializeStudioMaterialTipBytes(
  program: StudioMaterialTipProgram,
  size = STUDIO_PROCEDURAL_TIP_MAX_SIZE,
  seed = studioMaterialIdentitySeed(program),
): Uint8Array {
  if (!isStudioMaterialTipProgram(program)) throw new RangeError("Unknown material tip program.");
  const stableSeed = Number.isFinite(seed) ? seed >>> 0 : studioMaterialIdentitySeed(program);
  return studioProceduralTipCache.get(
    `material-morphology-v1:${program}:${stableSeed}`,
    size,
    createStudioMaterialTipField(program, stableSeed),
    4,
  );
}

export { studioMaterialIdentitySeed } from "./studio-procedural-tip-rasterizer";
