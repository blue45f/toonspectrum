export interface BrushStudioV7BackrunLobe {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angle: number;
  readonly opacity: number;
  readonly mix: number;
}

export interface BrushStudioV7SedimentMark {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angle: number;
  readonly opacity: number;
  readonly mix: number;
}

export interface BrushStudioV7BristleBundleSample {
  readonly split: number;
  readonly merge: number;
  readonly splayGain: number;
  readonly widthGain: number;
  readonly branchOffset: number;
  readonly branchOpacity: number;
}

const TAU = Math.PI * 2;
const unit = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

function hashNoise(x: number, y: number, seed: number): number {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function sampleBrushStudioV7BackrunLobes(input: {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly direction: number;
  readonly index: number;
  readonly seed: number;
  readonly wetness: number;
  readonly diffusion: number;
  readonly absorbency: number;
  readonly evaporation: number;
  readonly advection: number;
  readonly fiberAngle: number;
  readonly anisotropy: number;
  readonly tooth: number;
}): readonly BrushStudioV7BackrunLobe[] {
  if (input.index % 3 !== 0) return [];
  const dryingFront = unit(input.wetness * (0.3 + input.evaporation * 0.7)
    * (1.08 - input.absorbency * 0.38));
  if (dryingFront < 0.08) return [];
  const count = 2 + Math.round(unit(input.diffusion) * 2);
  const result: BrushStudioV7BackrunLobe[] = [];
  for (let lane = 0; lane < count; lane++) {
    const random = hashNoise(input.index, lane, input.seed ^ 0x4241434b);
    const side = lane % 2 === 0 ? -1 : 1;
    const fiberPull = Math.sin(input.fiberAngle - input.direction) * unit(input.anisotropy) * 0.48;
    const boundaryAngle = input.direction + side * Math.PI / 2
      + (random - 0.5) * (0.45 + input.advection * 0.8) + fiberPull;
    const distance = input.radius * (0.78 + input.diffusion * 0.62 + random * 0.32);
    const radius = input.radius * (0.12 + input.diffusion * 0.18)
      * (0.72 + random * 0.56) * (0.8 + input.tooth * 0.35);
    result.push(Object.freeze({
      x: input.x + Math.cos(boundaryAngle) * distance,
      y: input.y + Math.sin(boundaryAngle) * distance,
      radiusX: Math.max(0.2, radius * (1 + input.anisotropy * 0.85)),
      radiusY: Math.max(0.16, radius * (0.52 + (1 - input.anisotropy) * 0.24)),
      angle: input.fiberAngle + (random - 0.5) * 0.42,
      opacity: unit(dryingFront * (0.16 + input.diffusion * 0.2) * (0.75 + random * 0.5)),
      mix: unit(0.16 + input.tooth * 0.18 + random * 0.18),
    }));
  }
  return Object.freeze(result);
}

export function sampleBrushStudioV7Sediment(input: {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly index: number;
  readonly seed: number;
  readonly granulation: number;
  readonly absorbency: number;
  readonly tooth: number;
  readonly fiberAngle: number;
  readonly anisotropy: number;
}): readonly BrushStudioV7SedimentMark[] {
  const granulation = unit(input.granulation);
  if (granulation < 0.08 || input.index % 2 !== 0) return [];
  const valleyLoad = unit((0.3 + input.tooth * 0.7) * (0.45 + input.absorbency * 0.55));
  const count = 2 + Math.round(granulation * 3);
  const result: BrushStudioV7SedimentMark[] = [];
  for (let lane = 0; lane < count; lane++) {
    const angleNoise = hashNoise(input.index, lane, input.seed ^ 0x53454449);
    const distanceNoise = hashNoise(input.index, lane, input.seed ^ 0x4d454e54);
    const turn = angleNoise * TAU;
    const distance = Math.sqrt(distanceNoise) * input.radius * 0.82;
    const radius = Math.max(0.18, input.radius * (0.025 + granulation * 0.055)
      * (0.65 + hashNoise(lane, input.index, input.seed) * 0.7));
    result.push(Object.freeze({
      x: input.x + Math.cos(turn) * distance,
      y: input.y + Math.sin(turn) * distance,
      radiusX: radius * (1 + input.anisotropy * 0.9),
      radiusY: radius * (0.42 + (1 - input.anisotropy) * 0.28),
      angle: input.fiberAngle + (angleNoise - 0.5) * 0.35,
      opacity: unit(granulation * valleyLoad * (0.32 + distanceNoise * 0.46)),
      mix: unit(0.04 + input.tooth * 0.18 + angleNoise * 0.12),
    }));
  }
  return Object.freeze(result);
}

export function sampleBrushStudioV7BristleBundle(input: {
  readonly lane: number;
  readonly laneCount: number;
  readonly pathLength: number;
  readonly size: number;
  readonly seed: number;
  readonly pressure: number;
  readonly friction: number;
  readonly viscosity: number;
}): BrushStudioV7BristleBundleSample {
  const cluster = Math.floor(input.lane / Math.max(2, Math.round(input.laneCount / 12)));
  const phase = hashNoise(cluster, input.lane, input.seed ^ 0x42524953) * TAU;
  const wavelength = Math.max(6, input.size * (0.58 + hashNoise(cluster, 7, input.seed) * 0.8));
  const wave = Math.sin(input.pathLength / wavelength * TAU + phase) * 0.5 + 0.5;
  const edge = Math.abs(input.lane / Math.max(1, input.laneCount - 1) - 0.5) * 2;
  const split = unit((wave - 0.38) * 1.8) * unit(0.34 + input.friction * 0.62)
    * unit(0.62 + edge * 0.58) * unit(1.12 - input.pressure * 0.42);
  const merge = unit((0.58 - wave) * 1.7) * unit(0.32 + input.viscosity * 0.62)
    * unit(0.45 + input.pressure * 0.7);
  return Object.freeze({
    split,
    merge,
    splayGain: Math.max(0.68, 1 + split * 0.52 - merge * 0.24),
    widthGain: Math.max(0.72, 1 - split * 0.25 + merge * 0.34),
    branchOffset: (hashNoise(input.lane, cluster, input.seed ^ 0x53504c54) - 0.5)
      * input.size * split * 0.12,
    branchOpacity: unit(split * (0.38 + (1 - input.pressure) * 0.36)),
  });
}

export function sampleBrushStudioV7VectorField(
  id: string,
  x: number,
  y: number,
  seed: number,
  scale: number,
  jitter: number,
): number {
  const cell = Math.max(3, 18 * Math.max(0.1, scale));
  const nx = x / cell;
  const ny = y / cell;
  const wobble = (hashNoise(Math.floor(nx), Math.floor(ny), seed) - 0.5) * jitter * 0.6;
  if (id === "pattern-vector-vortex") {
    const cx = (Math.floor(nx / 5) * 5 + 2.5) * cell;
    const cy = (Math.floor(ny / 5) * 5 + 2.5) * cell;
    return Math.atan2(y - cy, x - cx) + Math.PI / 2 + wobble;
  }
  if (id === "pattern-vector-contour") {
    return Math.atan2(Math.sin(nx * 0.7) * 0.9, 1) + Math.cos(ny * 0.52) * 0.32 + wobble;
  }
  if (id === "pattern-textile-twill") {
    const row = Math.floor(ny);
    return Math.PI / 4 + ((row & 3) - 1.5) * 0.045 + wobble * 0.35;
  }
  if (id === "pattern-textile-satin") {
    const warp = Math.abs(Math.sin(nx * Math.PI));
    return warp > 0.28 ? Math.PI / 2 + wobble * 0.24 : wobble * 0.18;
  }
  return Math.sin(nx * 0.64 + seed * 0.00001) * 0.46
    + Math.cos(ny * 0.51 - seed * 0.000013) * 0.34 + wobble;
}

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16);
}

export function shadeBrushStudioV7ReliefColor(
  hex: string,
  angle: number,
  height: number,
  gloss: number,
): string {
  if (!/^#[0-9a-f]{6}$/iu.test(hex) || height <= 0) return hex;
  const lightAngle = -Math.PI * 0.28;
  const facing = Math.cos(angle - lightAngle);
  const highlight = Math.max(0, facing) * unit(height) * (0.08 + unit(gloss) * 0.24);
  const shadow = Math.max(0, -facing) * unit(height) * (0.06 + (1 - unit(gloss)) * 0.11);
  const amount = highlight - shadow;
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.min(0.34, Math.abs(amount));
  const values = [1, 3, 5].map((offset) => Math.round(channel(hex, offset) * (1 - weight) + target * weight));
  return `#${values.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}