/**
 * Pure WGSL field-pass library for the WebGPU wet-media runtime.
 *
 * Single source for compute kernels: deposit, Stam (1999) stable-fluid transport, incompressible
 * pressure projection, vorticity confinement, wet-gated pigment chromatography, fixation and the
 * Beer–Lambert display resolve.
 *
 * Two invariants keep this file honest:
 *
 * 1. Every discrete operator below is the WGSL transcription of the certified GLSL ES 3.00 kernels
 *    in `studio-living-ink-webgl2-runtime.ts` (VELOCITY/CURL/VORTICITY/DIVERGENCE/PRESSURE/GRADIENT
 *    /WET/PIGMENT fragments). WebGPU and WebGL2 must not diverge into two different fluids.
 * 2. Every tunable is uploaded as a uniform computed by the exported TS helpers — never re-derived
 *    only inside shader text — so the CPU reference solver at the bottom of this file is a real
 *    oracle for the same numbers rather than a second, drifting implementation.
 *
 * Velocity lives on a deliberately coarse grid (1/2…1/8 of the pigment field, see
 * `studioLivingInkCoarseVelocityGrid`) in uv units per second, exactly like the WebGL2 path. Coarse
 * velocity is what makes 22 Jacobi iterations affordable inside the frame budget; pigment, water
 * and paper stay at full resolution because that is where the hand sees the mark.
 */

import {
  STUDIO_LIVING_INK_FLUID_DEFAULTS,
  studioLivingInkCoarseVelocityGrid,
  studioLivingInkEvaporationMultiplier,
  studioLivingInkVelocityDamping,
  studioLivingInkVorticityStrength,
} from "./studio-living-ink-execution-protocol";

export const STUDIO_LIVING_INK_WGSL_SHADER_REVISION = "wgsl-field-v2" as const;

/** Field uniform slot count (f32/u32 words). The GPU buffer is `4 × this` bytes. */
export const STUDIO_LIVING_INK_WGSL_UNIFORM_WORDS = 24 as const;

export interface StudioLivingInkFieldUniformInput {
  readonly width: number;
  readonly height: number;
  readonly coarseWidth: number;
  readonly coarseHeight: number;
  readonly dt: number;
  readonly bleed: number;
  readonly dryRate: number;
  readonly chroma: readonly [number, number, number];
  readonly chromaticSeparation: number;
  readonly beerDensity: number;
  readonly fixTransfer: number;
  readonly flow: number;
  readonly vorticity: number;
  readonly capillaryCreep: number;
  readonly fixing: boolean;
}

/**
 * Packs `FieldUniforms` exactly as the WGSL struct below declares it. Runtime and tests share this
 * writer so a slot can never drift between the packer and the shader.
 */
export function writeStudioLivingInkFieldUniforms(
  input: StudioLivingInkFieldUniformInput,
): Float32Array {
  const data = new Float32Array(STUDIO_LIVING_INK_WGSL_UNIFORM_WORDS);
  const words = new Uint32Array(data.buffer);
  words[0] = input.width;
  words[1] = input.height;
  data[2] = input.dt;
  data[3] = input.bleed;
  data[4] = input.dryRate;
  data[5] = input.chroma[0];
  data[6] = input.chroma[1];
  data[7] = input.chroma[2];
  data[8] = input.beerDensity;
  data[9] = input.fixTransfer;
  words[10] = input.coarseWidth;
  words[11] = input.coarseHeight;
  data[12] = studioLivingInkVelocityDamping(input.flow, input.dt, input.fixing);
  data[13] = studioLivingInkVorticityStrength(input.vorticity);
  data[14] = STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityWetGate.minimum;
  data[15] = STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityWetGate.maximum;
  data[16] = STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentWetGate.minimum;
  data[17] = STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentWetGate.maximum;
  data[18] = studioLivingInkEvaporationMultiplier(input.dryRate, input.dt, input.fixing);
  data[19] = Math.min(1, Math.max(0, input.capillaryCreep));
  data[20] = STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityClamp;
  data[21] = Math.min(1, Math.max(0, input.chromaticSeparation));
  return data;
}

/** Common storage layout: rgba32float cells, row-major, workgroup 8x8. */
export const STUDIO_LIVING_INK_WGSL_COMMON = /* wgsl */ `
struct FieldUniforms {
  width: u32,
  height: u32,
  dt: f32,
  bleed: f32,
  dryRate: f32,
  chromaR: f32,
  chromaG: f32,
  chromaB: f32,
  beerDensity: f32,
  fixTransfer: f32,
  coarseWidth: u32,
  coarseHeight: u32,
  velocityDamping: f32,
  vorticityStrength: f32,
  velocityWetGateMin: f32,
  velocityWetGateMax: f32,
  pigmentWetGateMin: f32,
  pigmentWetGateMax: f32,
  evaporation: f32,
  capillaryCreep: f32,
  velocityClamp: f32,
  chromaticSeparation: f32,
  pad0: f32,
  pad1: f32,
}

@group(0) @binding(0) var<uniform> u: FieldUniforms;

fn ink_index(x: u32, y: u32, w: u32) -> u32 { return y * w + x; }
fn ink_left(x: u32) -> u32 { return select(x - 1u, x, x == 0u); }
fn ink_right(x: u32, w: u32) -> u32 { return select(x + 1u, x, x + 1u >= w); }
`;

/**
 * Formats a TS constant as a WGSL `f32` literal. Interpolating a bare number would emit `3` (an
 * AbstractInt) or, worse, `3.5.0` if a caller appended `.0` by hand — both are compile errors the
 * Node suite cannot catch, because it never runs a WGSL compiler.
 */
function wgslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

/**
 * Emits a clamp-to-edge bilinear sampler over one storage binding. This is the WGSL equivalent of
 * `texture(sampler2D, uv)` with GL_CLAMP_TO_EDGE + GL_LINEAR, which is what the GLSL kernels use.
 */
function bilinearSampler(
  name: string,
  buffer: string,
  widthExpression: string,
  heightExpression: string,
): string {
  return /* wgsl */ `
fn ${name}(p: vec2f) -> vec4f {
  let cw = ${widthExpression};
  let ch = ${heightExpression};
  let fw = f32(cw);
  let fh = f32(ch);
  let px = clamp(p.x * fw - 0.5, 0.0, fw - 1.0);
  let py = clamp(p.y * fh - 0.5, 0.0, fh - 1.0);
  let x0 = u32(floor(px));
  let y0 = u32(floor(py));
  let x1 = min(x0 + 1u, cw - 1u);
  let y1 = min(y0 + 1u, ch - 1u);
  let fx = px - floor(px);
  let fy = py - floor(py);
  let a = ${buffer}[y0 * cw + x0];
  let b = ${buffer}[y0 * cw + x1];
  let c = ${buffer}[y1 * cw + x0];
  let d = ${buffer}[y1 * cw + x1];
  return mix(mix(a, b, fx), mix(c, d, fx), fy);
}
`;
}

export const STUDIO_LIVING_INK_WGSL_CLEAR = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read_write> field: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let i = gid.y * u.width + gid.x;
  field[i] = vec4f(0.0);
}
`;

/** Same as clear, dispatched over the coarse velocity/pressure grid. */
export const STUDIO_LIVING_INK_WGSL_CLEAR_COARSE = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read_write> field: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.coarseWidth || gid.y >= u.coarseHeight) { return; }
  let i = gid.y * u.coarseWidth + gid.x;
  field[i] = vec4f(0.0);
}
`;

export const STUDIO_LIVING_INK_WGSL_SPLAT = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
struct Splat {
  x: f32,
  y: f32,
  radius: f32,
  amount: f32,
  r: f32,
  g: f32,
  b: f32,
  w: f32,
}
@group(0) @binding(1) var<storage, read_write> field: array<vec4f>;
@group(0) @binding(2) var<uniform> splat: Splat;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let i = gid.y * u.width + gid.x;
  let dx = f32(gid.x) + 0.5 - splat.x;
  let dy = f32(gid.y) + 0.5 - splat.y;
  let r2 = splat.radius * splat.radius;
  let d2 = dx * dx + dy * dy;
  if (d2 > r2 * 4.0) { return; }
  let w = exp(-d2 / max(r2, 1e-4)) * splat.amount;
  var p = field[i];
  p = p + vec4f(splat.r, splat.g, splat.b, splat.w) * w;
  field[i] = p;
}
`;

/**
 * Stroke momentum injection on the coarse velocity grid. `splat.x/y` stay in fine cell coordinates
 * so the caller never has to know the coarse scale; `splat.r/g` carry the uv-per-second impulse.
 */
export const STUDIO_LIVING_INK_WGSL_SPLAT_VELOCITY = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
struct Splat {
  x: f32,
  y: f32,
  radius: f32,
  amount: f32,
  r: f32,
  g: f32,
  b: f32,
  w: f32,
}
@group(0) @binding(1) var<storage, read_write> velocity: array<vec4f>;
@group(0) @binding(2) var<uniform> splat: Splat;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.coarseWidth || gid.y >= u.coarseHeight) { return; }
  let i = gid.y * u.coarseWidth + gid.x;
  let uv = vec2f(
    (f32(gid.x) + 0.5) / f32(u.coarseWidth),
    (f32(gid.y) + 0.5) / f32(u.coarseHeight),
  );
  let center = vec2f(splat.x / f32(u.width), splat.y / f32(u.height));
  let radiusUv = max(splat.radius, 1.0) / f32(u.width);
  let delta = uv - center;
  let d2 = dot(delta, delta);
  let r2 = radiusUv * radiusUv;
  if (d2 > r2 * 4.0) { return; }
  let w = exp(-d2 / max(r2, 1e-8)) * splat.amount;
  let moved = velocity[i].xy + vec2f(splat.r, splat.g) * w;
  velocity[i] = vec4f(
    clamp(moved, vec2f(-u.velocityClamp), vec2f(u.velocityClamp)),
    0.0,
    1.0,
  );
}
`;

/** Stam semi-Lagrangian self-advection of the coarse velocity field, gated by local wetness. */
export const STUDIO_LIVING_INK_WGSL_ADVECT_VELOCITY = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var<storage, read> wet: array<vec4f>;
${bilinearSampler("sampleVelocity", "src", "u.coarseWidth", "u.coarseHeight")}
${bilinearSampler("sampleWet", "wet", "u.width", "u.height")}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.coarseWidth || gid.y >= u.coarseHeight) { return; }
  let i = gid.y * u.coarseWidth + gid.x;
  let uv = vec2f(
    (f32(gid.x) + 0.5) / f32(u.coarseWidth),
    (f32(gid.y) + 0.5) / f32(u.coarseHeight),
  );
  let current = src[i].xy;
  let origin = clamp(uv - current * u.dt, vec2f(0.0), vec2f(1.0));
  let transported = sampleVelocity(origin).xy;
  let wetness = sampleWet(uv).x;
  let wetGate = smoothstep(u.velocityWetGateMin, u.velocityWetGateMax, wetness);
  let moved = transported * u.velocityDamping * wetGate;
  dst[i] = vec4f(
    clamp(moved, vec2f(-u.velocityClamp), vec2f(u.velocityClamp)),
    0.0,
    1.0,
  );
}
`;

/** 2D curl (scalar vorticity) of the coarse velocity field. */
export const STUDIO_LIVING_INK_WGSL_CURL = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> velocity: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> curl: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.coarseWidth || gid.y >= u.coarseHeight) { return; }
  let w = u.coarseWidth;
  let x = gid.x;
  let y = gid.y;
  let i = ink_index(x, y, w);
  let xm = ink_left(x);
  let xp = ink_right(x, w);
  let ym = ink_left(y);
  let yp = ink_right(y, u.coarseHeight);
  let leftY = velocity[ink_index(xm, y, w)].y;
  let rightY = velocity[ink_index(xp, y, w)].y;
  let lowerX = velocity[ink_index(x, ym, w)].x;
  let upperX = velocity[ink_index(x, yp, w)].x;
  curl[i] = vec4f(0.5 * ((rightY - leftY) - (upperX - lowerX)), 0.0, 0.0, 1.0);
}
`;

/**
 * Vorticity confinement (Fedkiw et al. 2001): push velocity back up the |curl| ridge so the
 * semi-Lagrangian step stops eating small eddies. Without this pass a wash dissolves into a blur —
 * this is the single most important kernel for "the ink is alive".
 */
export const STUDIO_LIVING_INK_WGSL_VORTICITY = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> velocity: array<vec4f>;
@group(0) @binding(2) var<storage, read> curl: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> dst: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.coarseWidth || gid.y >= u.coarseHeight) { return; }
  let w = u.coarseWidth;
  let x = gid.x;
  let y = gid.y;
  let i = ink_index(x, y, w);
  let xm = ink_left(x);
  let xp = ink_right(x, w);
  let ym = ink_left(y);
  let yp = ink_right(y, u.coarseHeight);
  let centerCurl = curl[i].x;
  let left = abs(curl[ink_index(xm, y, w)].x);
  let right = abs(curl[ink_index(xp, y, w)].x);
  let lower = abs(curl[ink_index(x, ym, w)].x);
  let upper = abs(curl[ink_index(x, yp, w)].x);
  var ridge = vec2f(upper - lower, right - left);
  ridge = ridge / max(length(ridge), 1e-5);
  let force = vec2f(ridge.x, -ridge.y) * centerCurl * u.vorticityStrength;
  let moved = velocity[i].xy + force * u.dt;
  dst[i] = vec4f(
    clamp(moved, vec2f(-u.velocityClamp), vec2f(u.velocityClamp)),
    0.0,
    1.0,
  );
}
`;

/**
 * Divergence of the coarse velocity field. It is written into `.y` of the pressure cell and `.x`
 * (pressure) is reset, so the Jacobi ping-pong below carries its own right-hand side.
 */
export const STUDIO_LIVING_INK_WGSL_DIVERGENCE = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> velocity: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> pressure: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.coarseWidth || gid.y >= u.coarseHeight) { return; }
  let w = u.coarseWidth;
  let x = gid.x;
  let y = gid.y;
  let i = ink_index(x, y, w);
  let left = velocity[ink_index(ink_left(x), y, w)].x;
  let right = velocity[ink_index(ink_right(x, w), y, w)].x;
  let lower = velocity[ink_index(x, ink_left(y), w)].y;
  let upper = velocity[ink_index(x, ink_right(y, u.coarseHeight), w)].y;
  pressure[i] = vec4f(0.0, 0.5 * (right - left + upper - lower), 0.0, 1.0);
}
`;

/** Jacobi relaxation of ∇²p = ∇·v. Pressure in `.x`, its divergence source carried in `.y`. */
export const STUDIO_LIVING_INK_WGSL_JACOBI = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.coarseWidth || gid.y >= u.coarseHeight) { return; }
  let w = u.coarseWidth;
  let x = gid.x;
  let y = gid.y;
  let i = ink_index(x, y, w);
  let c = src[i];
  let l = src[ink_index(ink_left(x), y, w)].x;
  let r = src[ink_index(ink_right(x, w), y, w)].x;
  let d = src[ink_index(x, ink_left(y), w)].x;
  let uup = src[ink_index(x, ink_right(y, u.coarseHeight), w)].x;
  let next = (l + r + d + uup - c.y) * 0.25;
  dst[i] = vec4f(next, c.y, 0.0, 1.0);
}
`;

/** Subtract ∇p to make the velocity field incompressible. */
export const STUDIO_LIVING_INK_WGSL_GRADIENT = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> velocity: array<vec4f>;
@group(0) @binding(2) var<storage, read> pressure: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> dst: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.coarseWidth || gid.y >= u.coarseHeight) { return; }
  let w = u.coarseWidth;
  let x = gid.x;
  let y = gid.y;
  let i = ink_index(x, y, w);
  let left = pressure[ink_index(ink_left(x), y, w)].x;
  let right = pressure[ink_index(ink_right(x, w), y, w)].x;
  let lower = pressure[ink_index(x, ink_left(y), w)].x;
  let upper = pressure[ink_index(x, ink_right(y, u.coarseHeight), w)].x;
  let moved = velocity[i].xy - 0.5 * vec2f(right - left, upper - lower);
  dst[i] = vec4f(
    clamp(moved, vec2f(-u.velocityClamp), vec2f(u.velocityClamp)),
    0.0,
    1.0,
  );
}
`;

/** Surface water: advection by the wash, capillary creep front, and evaporation. */
export const STUDIO_LIVING_INK_WGSL_WET = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var<storage, read> velocity: array<vec4f>;
${bilinearSampler("sampleWet", "src", "u.width", "u.height")}
${bilinearSampler("sampleVelocity", "velocity", "u.coarseWidth", "u.coarseHeight")}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let i = gid.y * u.width + gid.x;
  let texel = vec2f(1.0 / f32(u.width), 1.0 / f32(u.height));
  let uv = vec2f((f32(gid.x) + 0.5) * texel.x, (f32(gid.y) + 0.5) * texel.y);
  let v = sampleVelocity(uv).xy;
  let origin = clamp(
    uv - v * u.dt * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.wetAdvectionScale)},
    vec2f(0.0),
    vec2f(1.0),
  );
  let center = sampleWet(origin).x;
  let reach = texel * (1.0 + u.capillaryCreep * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.creepReachGain)});
  let far = reach * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.creepFarReach)};
  let neighborhood = 0.25 * (
    sampleWet(origin + vec2f(reach.x, 0.0)).x
    + sampleWet(origin - vec2f(reach.x, 0.0)).x
    + sampleWet(origin + vec2f(0.0, reach.y)).x
    + sampleWet(origin - vec2f(0.0, reach.y)).x
  );
  let frontier = max(
    max(sampleWet(origin + vec2f(far.x, 0.0)).x, sampleWet(origin - vec2f(far.x, 0.0)).x),
    max(sampleWet(origin + vec2f(0.0, far.y)).x, sampleWet(origin - vec2f(0.0, far.y)).x),
  );
  let frontAdvance = max(0.0, frontier - center)
    * u.capillaryCreep * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.frontAdvanceGain)};
  let blend = clamp(
    u.capillaryCreep * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.creepBlendGain)},
    0.0,
    ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.creepBlendCeiling)},
  );
  let capillary = mix(center, neighborhood, blend) + frontAdvance;
  dst[i] = vec4f(
    clamp(capillary * u.evaporation, 0.0, ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.wetCeiling)}),
    0.0,
    0.0,
    1.0,
  );
}
`;

/**
 * Semi-Lagrangian pigment transport with channel-asymmetric chromatography sampling. Mobility is a
 * smoothstep on wetness, so pigment on dry paper is frozen in place rather than slowly smeared.
 */
export const STUDIO_LIVING_INK_WGSL_ADVECT_PIGMENT = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var<storage, read> wet: array<vec4f>;
@group(0) @binding(4) var<storage, read> velocity: array<vec4f>;
${bilinearSampler("samplePigment", "src", "u.width", "u.height")}
${bilinearSampler("sampleWet", "wet", "u.width", "u.height")}
${bilinearSampler("sampleVelocity", "velocity", "u.coarseWidth", "u.coarseHeight")}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let i = gid.y * u.width + gid.x;
  let current = src[i];
  let mobility = smoothstep(u.pigmentWetGateMin, u.pigmentWetGateMax, wet[i].x);
  if (mobility < 0.001) { dst[i] = current; return; }
  let texel = vec2f(1.0 / f32(u.width), 1.0 / f32(u.height));
  let uv = vec2f((f32(gid.x) + 0.5) * texel.x, (f32(gid.y) + 0.5) * texel.y);
  let v = sampleVelocity(uv).xy;
  let wetGradient = 0.5 * vec2f(
    sampleWet(uv + vec2f(texel.x, 0.0)).x - sampleWet(uv - vec2f(texel.x, 0.0)).x,
    sampleWet(uv + vec2f(0.0, texel.y)).x - sampleWet(uv - vec2f(0.0, texel.y)).x,
  );
  let towardWetCenter = normalize(wetGradient + vec2f(1e-6));
  let capillaryBacktrace = towardWetCenter * texel
    * (${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentCapillaryBase)}
      + u.capillaryCreep * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentCapillaryGain)})
    * mobility;
  let baseOrigin = clamp(
    uv - v * u.dt * mobility + capillaryBacktrace,
    vec2f(0.0),
    vec2f(1.0),
  );
  let separation = normalize(v + wetGradient * 4.0 + vec2f(1e-5));
  let chromaShift = separation * texel * u.chromaticSeparation * mobility * u.dt
    * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.chromaShiftScale)};
  let red = samplePigment(clamp(baseOrigin - chromaShift * u.chromaR, vec2f(0.0), vec2f(1.0))).x;
  let green = samplePigment(clamp(
    baseOrigin - chromaShift * u.chromaG * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.chromaGreenShiftScale)},
    vec2f(0.0),
    vec2f(1.0),
  )).y;
  let blue = samplePigment(clamp(
    baseOrigin + chromaShift * u.chromaB * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.chromaBlueShiftScale)},
    vec2f(0.0),
    vec2f(1.0),
  )).z;
  let white = samplePigment(baseOrigin).w;
  let transported = vec4f(red, green, blue, white);
  // A rate, not a replacement: replacing the whole cell each tick bleaches the water path.
  let transportBlend = clamp(
    mobility * u.dt * (${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentTransportBase)}
      + u.bleed * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentTransportBleedGain)}),
    0.0,
    ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentTransportCeiling)},
  );
  dst[i] = mix(current, transported, transportBlend);
}
`;

/** Pigment diffusion with chromatography channel rates, gated by wet mobility. */
export const STUDIO_LIVING_INK_WGSL_PIGMENT = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var<storage, read> wet: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let w = u.width;
  let x = gid.x;
  let y = gid.y;
  let i = ink_index(x, y, w);
  // Dry paper has zero mobility: the smoothstep gate is what stops a stroke from creeping after
  // the water is gone. A raw clamp(wet) would keep bleeding at any residual moisture.
  let mobility = smoothstep(u.pigmentWetGateMin, u.pigmentWetGateMax, wet[i].x);
  let diff = min(
    ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentDiffusionCeiling)},
    u.bleed * mobility * u.dt * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentDiffusionDtScale)},
  );
  let ceiling = ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentChannelCeiling)};
  let dr = min(ceiling, diff * u.chromaR);
  let dg = min(ceiling, diff * u.chromaG);
  let db = min(ceiling, diff * u.chromaB);
  let xm = ink_left(x);
  let xp = ink_right(x, w);
  let ym = ink_left(y);
  let yp = ink_right(y, u.height);
  let c = src[i];
  let n = (src[ink_index(xm, y, w)] + src[ink_index(xp, y, w)]
    + src[ink_index(x, ym, w)] + src[ink_index(x, yp, w)]) * 0.25;
  dst[i] = vec4f(
    mix(c.x, n.x, dr),
    mix(c.y, n.y, dg),
    mix(c.z, n.z, db),
    mix(c.w, n.w, min(ceiling, diff * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentWhiteChannelGain)})),
  );
}
`;

/** Fix: transfer mobile pigment into fixed well. */
export const STUDIO_LIVING_INK_WGSL_FIX = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read_write> mobile: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> fixed: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> wet: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let i = gid.y * u.width + gid.x;
  let m = mobile[i];
  let t = clamp(u.fixTransfer, 0.0, 1.0);
  fixed[i] = fixed[i] + m * t;
  mobile[i] = m * (1.0 - t);
  wet[i] = wet[i] * (1.0 - t * 0.85);
}
`;

/** Beer–Lambert composite to rgba8unorm storage (as f32 then scaled). */
export const STUDIO_LIVING_INK_WGSL_DISPLAY = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> mobile: array<vec4f>;
@group(0) @binding(2) var<storage, read> fixed: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> outRgba: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let i = gid.y * u.width + gid.x;
  let od = (mobile[i] + fixed[i]) * u.beerDensity;
  let reflectance = exp(-od.xyz);
  let white = clamp(mobile[i].w + fixed[i].w, 0.0, 1.0);
  let rgb = mix(reflectance, vec3f(1.0), white * 0.85);
  outRgba[i] = vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

/**
 * Frame order. The six v1 passes keep their relative order; the v2 fluid passes are interleaved at
 * the position the Stable Fluids step requires (deposit → advect → confine → project → transport).
 */
export const STUDIO_LIVING_INK_WGSL_PASS_ORDER = Object.freeze([
  "clear",
  "clear-coarse",
  "splat",
  "splat-velocity",
  "advect-velocity",
  "curl",
  "vorticity",
  "divergence",
  "jacobi",
  "gradient",
  "wet",
  "advect-pigment",
  "pigment",
  "fix",
  "display",
] as const);

/** The v1 pass identifiers, still shipped and still in this relative order. */
export const STUDIO_LIVING_INK_WGSL_LEGACY_PASS_ORDER = Object.freeze([
  "clear",
  "splat",
  "jacobi",
  "pigment",
  "fix",
  "display",
] as const);

/** Passes dispatched over the coarse velocity/pressure grid rather than the pigment field. */
export const STUDIO_LIVING_INK_WGSL_COARSE_PASSES = Object.freeze([
  "clear-coarse",
  "splat-velocity",
  "advect-velocity",
  "curl",
  "vorticity",
  "divergence",
  "jacobi",
  "gradient",
] as const);

export type StudioLivingInkWgslPassId =
  (typeof STUDIO_LIVING_INK_WGSL_PASS_ORDER)[number];

const WGSL_PASS_SOURCES: Readonly<Record<StudioLivingInkWgslPassId, string>> = Object.freeze({
  clear: STUDIO_LIVING_INK_WGSL_CLEAR,
  "clear-coarse": STUDIO_LIVING_INK_WGSL_CLEAR_COARSE,
  splat: STUDIO_LIVING_INK_WGSL_SPLAT,
  "splat-velocity": STUDIO_LIVING_INK_WGSL_SPLAT_VELOCITY,
  "advect-velocity": STUDIO_LIVING_INK_WGSL_ADVECT_VELOCITY,
  curl: STUDIO_LIVING_INK_WGSL_CURL,
  vorticity: STUDIO_LIVING_INK_WGSL_VORTICITY,
  divergence: STUDIO_LIVING_INK_WGSL_DIVERGENCE,
  jacobi: STUDIO_LIVING_INK_WGSL_JACOBI,
  gradient: STUDIO_LIVING_INK_WGSL_GRADIENT,
  wet: STUDIO_LIVING_INK_WGSL_WET,
  "advect-pigment": STUDIO_LIVING_INK_WGSL_ADVECT_PIGMENT,
  pigment: STUDIO_LIVING_INK_WGSL_PIGMENT,
  fix: STUDIO_LIVING_INK_WGSL_FIX,
  display: STUDIO_LIVING_INK_WGSL_DISPLAY,
});

export function studioLivingInkWgslSourceForPass(
  pass: StudioLivingInkWgslPassId,
): string {
  return WGSL_PASS_SOURCES[pass];
}

export function studioLivingInkWgslPassIsCoarse(pass: StudioLivingInkWgslPassId): boolean {
  return (STUDIO_LIVING_INK_WGSL_COARSE_PASSES as readonly string[]).includes(pass);
}

export function listStudioLivingInkWgslPassSources(): ReadonlyArray<{
  readonly id: StudioLivingInkWgslPassId;
  readonly source: string;
  readonly entryPoint: "main";
  readonly grid: "fine" | "coarse";
}> {
  return Object.freeze(
    STUDIO_LIVING_INK_WGSL_PASS_ORDER.map((id) =>
      Object.freeze({
        id,
        source: studioLivingInkWgslSourceForPass(id),
        entryPoint: "main" as const,
        grid: studioLivingInkWgslPassIsCoarse(id) ? ("coarse" as const) : ("fine" as const),
      }),
    ),
  );
}

/* ------------------------------------------------------------------------------------------------
 * CPU reference solver
 *
 * A deterministic, allocation-stable mirror of the kernels above, sharing the exact uniform helpers
 * (`studioLivingInkVelocityDamping`, `studioLivingInkVorticityStrength`, …) rather than re-deriving
 * constants. It is the oracle for tests/visual/living-ink-fluid-quality.test.ts — headless WebGPU is
 * not available in the Node suite — and the numeric model a planner can consult without a device.
 * ---------------------------------------------------------------------------------------------- */

export interface StudioLivingInkFluidReferenceField {
  readonly width: number;
  readonly height: number;
  readonly coarseWidth: number;
  readonly coarseHeight: number;
  readonly coarseScale: number;
  /** Coarse, interleaved (x, y) in uv units per second. */
  readonly velocity: Float32Array;
  readonly velocityScratch: Float32Array;
  readonly pressure: Float32Array;
  readonly pressureScratch: Float32Array;
  readonly divergence: Float32Array;
  readonly curl: Float32Array;
  /** Fine surface water. */
  readonly wet: Float32Array;
  readonly wetScratch: Float32Array;
  /** Fine pigment, interleaved RGBA optical density (a = opaque-white coverage). */
  readonly pigment: Float32Array;
  readonly pigmentScratch: Float32Array;
}

export interface StudioLivingInkFluidReferenceOptions {
  readonly width: number;
  readonly height: number;
  readonly coarseBase?: number;
}

export function createStudioLivingInkFluidReference(
  options: StudioLivingInkFluidReferenceOptions,
): StudioLivingInkFluidReferenceField {
  const width = Math.max(2, Math.floor(options.width));
  const height = Math.max(2, Math.floor(options.height));
  const coarse = studioLivingInkCoarseVelocityGrid(width, height, options.coarseBase ?? 128);
  const fine = width * height;
  const coarseCells = coarse.width * coarse.height;
  return Object.freeze({
    width,
    height,
    coarseWidth: coarse.width,
    coarseHeight: coarse.height,
    coarseScale: coarse.scale,
    velocity: new Float32Array(coarseCells * 2),
    velocityScratch: new Float32Array(coarseCells * 2),
    pressure: new Float32Array(coarseCells),
    pressureScratch: new Float32Array(coarseCells),
    divergence: new Float32Array(coarseCells),
    curl: new Float32Array(coarseCells),
    wet: new Float32Array(fine),
    wetScratch: new Float32Array(fine),
    pigment: new Float32Array(fine * 4),
    pigmentScratch: new Float32Array(fine * 4),
  });
}

export interface StudioLivingInkFluidReferenceStepParams {
  readonly dt: number;
  readonly flow: number;
  readonly bleed: number;
  readonly dryRate: number;
  readonly chromaticSeparation: number;
  readonly vorticity: number;
  readonly capillaryCreep: number;
  readonly pressureIterations: number;
  readonly fixing?: boolean;
  /**
   * Lab switches. Production always runs every pass; these exist so a quality gate can isolate one
   * mechanism and measure what it is actually worth (confinement vs. none, chromatographic
   * diffusion vs. chromatographic drift).
   */
  readonly confinement?: boolean;
  readonly transport?: boolean;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const t = clampNumber((value - edge0) / Math.max(1e-8, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clampIndex(value: number, size: number): number {
  return Math.min(size - 1, Math.max(0, value));
}

function sampleScalarBilinear(
  data: Float32Array,
  width: number,
  height: number,
  uvx: number,
  uvy: number,
): number {
  const px = clampNumber(uvx * width - 0.5, 0, width - 1);
  const py = clampNumber(uvy * height - 0.5, 0, height - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = px - x0;
  const fy = py - y0;
  const a = data[y0 * width + x0] ?? 0;
  const b = data[y0 * width + x1] ?? 0;
  const c = data[y1 * width + x0] ?? 0;
  const d = data[y1 * width + x1] ?? 0;
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

function sampleVec2Bilinear(
  data: Float32Array,
  width: number,
  height: number,
  uvx: number,
  uvy: number,
  out: [number, number],
): [number, number] {
  const px = clampNumber(uvx * width - 0.5, 0, width - 1);
  const py = clampNumber(uvy * height - 0.5, 0, height - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = px - x0;
  const fy = py - y0;
  for (let channel = 0; channel < 2; channel += 1) {
    const a = data[(y0 * width + x0) * 2 + channel] ?? 0;
    const b = data[(y0 * width + x1) * 2 + channel] ?? 0;
    const c = data[(y1 * width + x0) * 2 + channel] ?? 0;
    const d = data[(y1 * width + x1) * 2 + channel] ?? 0;
    out[channel] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  return out;
}

function sampleRgbaChannelBilinear(
  data: Float32Array,
  width: number,
  height: number,
  uvx: number,
  uvy: number,
  channel: number,
): number {
  const px = clampNumber(uvx * width - 0.5, 0, width - 1);
  const py = clampNumber(uvy * height - 0.5, 0, height - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = px - x0;
  const fy = py - y0;
  const a = data[(y0 * width + x0) * 4 + channel] ?? 0;
  const b = data[(y0 * width + x1) * 4 + channel] ?? 0;
  const c = data[(y1 * width + x0) * 4 + channel] ?? 0;
  const d = data[(y1 * width + x1) * 4 + channel] ?? 0;
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** L2 norm of ∇·v over the coarse grid — the incompressibility residual. */
export function studioLivingInkReferenceDivergenceL2(
  field: StudioLivingInkFluidReferenceField,
): number {
  const { coarseWidth: w, coarseHeight: h, velocity } = field;
  let total = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const left = velocity[(y * w + clampIndex(x - 1, w)) * 2] ?? 0;
      const right = velocity[(y * w + clampIndex(x + 1, w)) * 2] ?? 0;
      const lower = velocity[(clampIndex(y - 1, h) * w + x) * 2 + 1] ?? 0;
      const upper = velocity[(clampIndex(y + 1, h) * w + x) * 2 + 1] ?? 0;
      const divergence = 0.5 * (right - left + upper - lower);
      total += divergence * divergence;
    }
  }
  return Math.sqrt(total);
}

/** Enstrophy ∑ω² — how much rotational energy the wash still carries. */
export function studioLivingInkReferenceEnstrophy(
  field: StudioLivingInkFluidReferenceField,
): number {
  const { coarseWidth: w, coarseHeight: h, velocity } = field;
  let total = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const leftY = velocity[(y * w + clampIndex(x - 1, w)) * 2 + 1] ?? 0;
      const rightY = velocity[(y * w + clampIndex(x + 1, w)) * 2 + 1] ?? 0;
      const lowerX = velocity[(clampIndex(y - 1, h) * w + x) * 2] ?? 0;
      const upperX = velocity[(clampIndex(y + 1, h) * w + x) * 2] ?? 0;
      const curl = 0.5 * ((rightY - leftY) - (upperX - lowerX));
      total += curl * curl;
    }
  }
  return total;
}

/** Angular momentum about the field centre — the visible "is it still spinning" quantity. */
export function studioLivingInkReferenceAngularMomentum(
  field: StudioLivingInkFluidReferenceField,
): number {
  const { coarseWidth: w, coarseHeight: h, velocity } = field;
  const centerX = (w - 1) / 2;
  const centerY = (h - 1) / 2;
  let total = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const rx = x - centerX;
      const ry = y - centerY;
      total += rx * (velocity[(y * w + x) * 2 + 1] ?? 0) - ry * (velocity[(y * w + x) * 2] ?? 0);
    }
  }
  return total;
}

/** Divergence → Jacobi → gradient subtract. Returns the residual before and after. */
export function projectStudioLivingInkReference(
  field: StudioLivingInkFluidReferenceField,
  iterations: number,
): Readonly<{ before: number; after: number }> {
  const { coarseWidth: w, coarseHeight: h, velocity, pressure, pressureScratch, divergence } = field;
  const before = studioLivingInkReferenceDivergenceL2(field);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const left = velocity[(y * w + clampIndex(x - 1, w)) * 2] ?? 0;
      const right = velocity[(y * w + clampIndex(x + 1, w)) * 2] ?? 0;
      const lower = velocity[(clampIndex(y - 1, h) * w + x) * 2 + 1] ?? 0;
      const upper = velocity[(clampIndex(y + 1, h) * w + x) * 2 + 1] ?? 0;
      divergence[y * w + x] = 0.5 * (right - left + upper - lower);
      pressure[y * w + x] = 0;
    }
  }
  let source = pressure;
  let target = pressureScratch;
  const sweeps = Math.max(0, Math.floor(iterations));
  for (let iteration = 0; iteration < sweeps; iteration += 1) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const l = source[y * w + clampIndex(x - 1, w)] ?? 0;
        const r = source[y * w + clampIndex(x + 1, w)] ?? 0;
        const d = source[clampIndex(y - 1, h) * w + x] ?? 0;
        const uu = source[clampIndex(y + 1, h) * w + x] ?? 0;
        target[y * w + x] = (l + r + d + uu - (divergence[y * w + x] ?? 0)) * 0.25;
      }
    }
    const swap = source;
    source = target;
    target = swap;
  }
  if (source !== pressure) pressure.set(source);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const left = pressure[y * w + clampIndex(x - 1, w)] ?? 0;
      const right = pressure[y * w + clampIndex(x + 1, w)] ?? 0;
      const lower = pressure[clampIndex(y - 1, h) * w + x] ?? 0;
      const upper = pressure[clampIndex(y + 1, h) * w + x] ?? 0;
      const index = (y * w + x) * 2;
      const clamp = STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityClamp;
      velocity[index] = clampNumber(
        (velocity[index] ?? 0) - 0.5 * (right - left),
        -clamp,
        clamp,
      );
      velocity[index + 1] = clampNumber(
        (velocity[index + 1] ?? 0) - 0.5 * (upper - lower),
        -clamp,
        clamp,
      );
    }
  }
  return Object.freeze({ before, after: studioLivingInkReferenceDivergenceL2(field) });
}

function advectVelocityReference(
  field: StudioLivingInkFluidReferenceField,
  dt: number,
  damping: number,
): void {
  const { coarseWidth: w, coarseHeight: h, velocity, velocityScratch, wet } = field;
  const { minimum, maximum } = STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityWetGate;
  const clamp = STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityClamp;
  const sampled: [number, number] = [0, 0];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const index = (y * w + x) * 2;
      const uvx = (x + 0.5) / w;
      const uvy = (y + 0.5) / h;
      const originX = clampNumber(uvx - (velocity[index] ?? 0) * dt, 0, 1);
      const originY = clampNumber(uvy - (velocity[index + 1] ?? 0) * dt, 0, 1);
      sampleVec2Bilinear(velocity, w, h, originX, originY, sampled);
      const wetness = sampleScalarBilinear(wet, field.width, field.height, uvx, uvy);
      const gate = smoothstepNumber(minimum, maximum, wetness);
      velocityScratch[index] = clampNumber(sampled[0] * damping * gate, -clamp, clamp);
      velocityScratch[index + 1] = clampNumber(sampled[1] * damping * gate, -clamp, clamp);
    }
  }
  velocity.set(velocityScratch);
}

function confineVorticityReference(
  field: StudioLivingInkFluidReferenceField,
  dt: number,
  strength: number,
): void {
  const { coarseWidth: w, coarseHeight: h, velocity, velocityScratch, curl } = field;
  const clamp = STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityClamp;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const leftY = velocity[(y * w + clampIndex(x - 1, w)) * 2 + 1] ?? 0;
      const rightY = velocity[(y * w + clampIndex(x + 1, w)) * 2 + 1] ?? 0;
      const lowerX = velocity[(clampIndex(y - 1, h) * w + x) * 2] ?? 0;
      const upperX = velocity[(clampIndex(y + 1, h) * w + x) * 2] ?? 0;
      curl[y * w + x] = 0.5 * ((rightY - leftY) - (upperX - lowerX));
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const centerCurl = curl[y * w + x] ?? 0;
      const left = Math.abs(curl[y * w + clampIndex(x - 1, w)] ?? 0);
      const right = Math.abs(curl[y * w + clampIndex(x + 1, w)] ?? 0);
      const lower = Math.abs(curl[clampIndex(y - 1, h) * w + x] ?? 0);
      const upper = Math.abs(curl[clampIndex(y + 1, h) * w + x] ?? 0);
      let ridgeX = upper - lower;
      let ridgeY = right - left;
      const length = Math.max(Math.hypot(ridgeX, ridgeY), 1e-5);
      ridgeX /= length;
      ridgeY /= length;
      const index = (y * w + x) * 2;
      velocityScratch[index] = clampNumber(
        (velocity[index] ?? 0) + ridgeX * centerCurl * strength * dt,
        -clamp,
        clamp,
      );
      velocityScratch[index + 1] = clampNumber(
        (velocity[index + 1] ?? 0) - ridgeY * centerCurl * strength * dt,
        -clamp,
        clamp,
      );
    }
  }
  velocity.set(velocityScratch);
}

function stepWetReference(
  field: StudioLivingInkFluidReferenceField,
  dt: number,
  creep: number,
  evaporation: number,
): void {
  const { width, height, wet, wetScratch, velocity, coarseWidth, coarseHeight } = field;
  const defaults = STUDIO_LIVING_INK_FLUID_DEFAULTS;
  const texelX = 1 / width;
  const texelY = 1 / height;
  const reachX = texelX * (1 + creep * defaults.creepReachGain);
  const reachY = texelY * (1 + creep * defaults.creepReachGain);
  const farX = reachX * defaults.creepFarReach;
  const farY = reachY * defaults.creepFarReach;
  const blend = clampNumber(creep * defaults.creepBlendGain, 0, defaults.creepBlendCeiling);
  const sampled: [number, number] = [0, 0];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const uvx = (x + 0.5) * texelX;
      const uvy = (y + 0.5) * texelY;
      sampleVec2Bilinear(velocity, coarseWidth, coarseHeight, uvx, uvy, sampled);
      const originX = clampNumber(uvx - sampled[0] * dt * defaults.wetAdvectionScale, 0, 1);
      const originY = clampNumber(uvy - sampled[1] * dt * defaults.wetAdvectionScale, 0, 1);
      const center = sampleScalarBilinear(wet, width, height, originX, originY);
      const east = sampleScalarBilinear(wet, width, height, originX + reachX, originY);
      const west = sampleScalarBilinear(wet, width, height, originX - reachX, originY);
      const north = sampleScalarBilinear(wet, width, height, originX, originY + reachY);
      const south = sampleScalarBilinear(wet, width, height, originX, originY - reachY);
      const neighborhood = 0.25 * (east + west + north + south);
      const frontier = Math.max(
        Math.max(
          sampleScalarBilinear(wet, width, height, originX + farX, originY),
          sampleScalarBilinear(wet, width, height, originX - farX, originY),
        ),
        Math.max(
          sampleScalarBilinear(wet, width, height, originX, originY + farY),
          sampleScalarBilinear(wet, width, height, originX, originY - farY),
        ),
      );
      const frontAdvance = Math.max(0, frontier - center) * creep * defaults.frontAdvanceGain;
      const capillary = center + (neighborhood - center) * blend + frontAdvance;
      wetScratch[y * width + x] = clampNumber(capillary * evaporation, 0, defaults.wetCeiling);
    }
  }
  wet.set(wetScratch);
}

function advectPigmentReference(
  field: StudioLivingInkFluidReferenceField,
  params: StudioLivingInkFluidReferenceStepParams,
  chroma: readonly [number, number, number],
): void {
  const { width, height, pigment, pigmentScratch, wet, velocity, coarseWidth, coarseHeight } = field;
  const defaults = STUDIO_LIVING_INK_FLUID_DEFAULTS;
  const texelX = 1 / width;
  const texelY = 1 / height;
  const separation = clampNumber(params.chromaticSeparation, 0, 1);
  const sampled: [number, number] = [0, 0];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = y * width + x;
      const base = cell * 4;
      const mobility = smoothstepNumber(
        defaults.pigmentWetGate.minimum,
        defaults.pigmentWetGate.maximum,
        wet[cell] ?? 0,
      );
      if (mobility < 0.001) {
        for (let channel = 0; channel < 4; channel += 1) {
          pigmentScratch[base + channel] = pigment[base + channel] ?? 0;
        }
        continue;
      }
      const uvx = (x + 0.5) * texelX;
      const uvy = (y + 0.5) * texelY;
      sampleVec2Bilinear(velocity, coarseWidth, coarseHeight, uvx, uvy, sampled);
      const wetGradientX = 0.5 * (
        sampleScalarBilinear(wet, width, height, uvx + texelX, uvy)
        - sampleScalarBilinear(wet, width, height, uvx - texelX, uvy)
      );
      const wetGradientY = 0.5 * (
        sampleScalarBilinear(wet, width, height, uvx, uvy + texelY)
        - sampleScalarBilinear(wet, width, height, uvx, uvy - texelY)
      );
      const gradientLength = Math.max(1e-8, Math.hypot(wetGradientX + 1e-6, wetGradientY + 1e-6));
      const capillary = (defaults.pigmentCapillaryBase + params.capillaryCreep * defaults.pigmentCapillaryGain)
        * mobility;
      const originX = clampNumber(
        uvx - sampled[0] * params.dt * mobility + ((wetGradientX + 1e-6) / gradientLength) * texelX * capillary,
        0,
        1,
      );
      const originY = clampNumber(
        uvy - sampled[1] * params.dt * mobility + ((wetGradientY + 1e-6) / gradientLength) * texelY * capillary,
        0,
        1,
      );
      const separationX = sampled[0] + wetGradientX * 4 + 1e-5;
      const separationY = sampled[1] + wetGradientY * 4 + 1e-5;
      const separationLength = Math.max(1e-8, Math.hypot(separationX, separationY));
      const shift = separation * mobility * params.dt * defaults.chromaShiftScale;
      const shiftX = (separationX / separationLength) * texelX * shift;
      const shiftY = (separationY / separationLength) * texelY * shift;
      const red = sampleRgbaChannelBilinear(
        pigment,
        width,
        height,
        clampNumber(originX - shiftX * chroma[0], 0, 1),
        clampNumber(originY - shiftY * chroma[0], 0, 1),
        0,
      );
      const green = sampleRgbaChannelBilinear(
        pigment,
        width,
        height,
        clampNumber(originX - shiftX * chroma[1] * defaults.chromaGreenShiftScale, 0, 1),
        clampNumber(originY - shiftY * chroma[1] * defaults.chromaGreenShiftScale, 0, 1),
        1,
      );
      const blue = sampleRgbaChannelBilinear(
        pigment,
        width,
        height,
        clampNumber(originX + shiftX * chroma[2] * defaults.chromaBlueShiftScale, 0, 1),
        clampNumber(originY + shiftY * chroma[2] * defaults.chromaBlueShiftScale, 0, 1),
        2,
      );
      const white = sampleRgbaChannelBilinear(pigment, width, height, originX, originY, 3);
      const transportBlend = clampNumber(
        mobility * params.dt
          * (defaults.pigmentTransportBase + params.bleed * defaults.pigmentTransportBleedGain),
        0,
        defaults.pigmentTransportCeiling,
      );
      const transported = [red, green, blue, white];
      for (let channel = 0; channel < 4; channel += 1) {
        const current = pigment[base + channel] ?? 0;
        pigmentScratch[base + channel] = current
          + ((transported[channel] ?? 0) - current) * transportBlend;
      }
    }
  }
  pigment.set(pigmentScratch);
}

function diffusePigmentReference(
  field: StudioLivingInkFluidReferenceField,
  params: StudioLivingInkFluidReferenceStepParams,
  chroma: readonly [number, number, number],
): void {
  const { width, height, pigment, pigmentScratch, wet } = field;
  const defaults = STUDIO_LIVING_INK_FLUID_DEFAULTS;
  const rates = [chroma[0], chroma[1], chroma[2], defaults.pigmentWhiteChannelGain];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = y * width + x;
      const base = cell * 4;
      const mobility = smoothstepNumber(
        defaults.pigmentWetGate.minimum,
        defaults.pigmentWetGate.maximum,
        wet[cell] ?? 0,
      );
      const diffusion = Math.min(
        defaults.pigmentDiffusionCeiling,
        params.bleed * mobility * params.dt * defaults.pigmentDiffusionDtScale,
      );
      const west = (y * width + clampIndex(x - 1, width)) * 4;
      const east = (y * width + clampIndex(x + 1, width)) * 4;
      const south = (clampIndex(y - 1, height) * width + x) * 4;
      const north = (clampIndex(y + 1, height) * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const rate = Math.min(defaults.pigmentChannelCeiling, diffusion * (rates[channel] ?? 1));
        const neighbours = 0.25 * (
          (pigment[west + channel] ?? 0)
          + (pigment[east + channel] ?? 0)
          + (pigment[south + channel] ?? 0)
          + (pigment[north + channel] ?? 0)
        );
        const current = pigment[base + channel] ?? 0;
        pigmentScratch[base + channel] = current + (neighbours - current) * rate;
      }
    }
  }
  pigment.set(pigmentScratch);
}

/**
 * One fixed simulation tick, in the same pass order the GPU runtime dispatches:
 * advect velocity → curl/confinement → projection → water → pigment transport → pigment diffusion.
 */
export function stepStudioLivingInkFluidReference(
  field: StudioLivingInkFluidReferenceField,
  params: StudioLivingInkFluidReferenceStepParams,
): Readonly<{ divergenceBefore: number; divergenceAfter: number }> {
  const fixing = params.fixing === true;
  const chroma = studioLivingInkReferenceChroma(params.chromaticSeparation);
  advectVelocityReference(
    field,
    params.dt,
    studioLivingInkVelocityDamping(params.flow, params.dt, fixing),
  );
  if (params.confinement !== false) {
    confineVorticityReference(
      field,
      params.dt,
      studioLivingInkVorticityStrength(params.vorticity),
    );
  }
  const projection = projectStudioLivingInkReference(field, params.pressureIterations);
  stepWetReference(
    field,
    params.dt,
    clampNumber(params.capillaryCreep, 0, 1),
    studioLivingInkEvaporationMultiplier(params.dryRate, params.dt, fixing),
  );
  if (params.transport !== false) advectPigmentReference(field, params, chroma);
  diffusePigmentReference(field, params, chroma);
  return Object.freeze({
    divergenceBefore: projection.before,
    divergenceAfter: projection.after,
  });
}

/**
 * InkWash §06 chromatography multipliers, duplicated here as a dependency-free local so the shader
 * library does not import the CPU field module (which would create a cycle through the runtime).
 * `studio-living-ink-field.ts` owns the canonical coefficients and its unit test pins this parity.
 */
export function studioLivingInkReferenceChroma(
  chromaticSeparation: number,
): readonly [number, number, number] {
  const chroma = clampNumber(chromaticSeparation, 0, 1);
  return Object.freeze([
    1 + 0.85 * chroma,
    1 + 0.15 * chroma,
    Math.max(0.25, 1 - 0.65 * chroma),
  ]);
}

/** Gaussian deposit into the reference field, mirroring the `splat` kernel. */
export function depositStudioLivingInkReference(
  field: StudioLivingInkFluidReferenceField,
  mark: Readonly<{
    x: number;
    y: number;
    radius: number;
    amount: number;
    color?: readonly [number, number, number];
    wet?: number;
  }>,
): void {
  const { width, height, pigment, wet } = field;
  const radius = Math.max(0.5, mark.radius);
  const r2 = radius * radius;
  const color = mark.color ?? [0.15, 0.12, 0.1];
  const water = mark.wet ?? 0;
  const left = Math.max(0, Math.floor(mark.x - radius * 2));
  const right = Math.min(width - 1, Math.ceil(mark.x + radius * 2));
  const bottom = Math.max(0, Math.floor(mark.y - radius * 2));
  const top = Math.min(height - 1, Math.ceil(mark.y + radius * 2));
  for (let y = bottom; y <= top; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = x + 0.5 - mark.x;
      const dy = y + 0.5 - mark.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 * 4) continue;
      const weight = Math.exp(-d2 / Math.max(r2, 1e-4)) * mark.amount;
      const cell = y * width + x;
      pigment[cell * 4] = (pigment[cell * 4] ?? 0) + color[0] * weight;
      pigment[cell * 4 + 1] = (pigment[cell * 4 + 1] ?? 0) + color[1] * weight;
      pigment[cell * 4 + 2] = (pigment[cell * 4 + 2] ?? 0) + color[2] * weight;
      wet[cell] = (wet[cell] ?? 0) + water * weight;
    }
  }
}

/**
 * Injects an outward capillary impulse — the deliberately *divergent* field a dwell water mark
 * creates (the GLSL deposit shader's `radialVector` splat, and what a wet brush physically does
 * when it adds water to paper). Pressure projection removes divergence by construction, so this is
 * the initial condition a gate needs in order to notice that over-solving the Poisson equation
 * suppresses the capillary outflow and leaves the pigment piled in the middle of the dab.
 */
export function seedStudioLivingInkReferenceRadialImpulse(
  field: StudioLivingInkFluidReferenceField,
  strength: number,
): void {
  const { coarseWidth: w, coarseHeight: h, velocity } = field;
  const centerX = (w - 1) / 2;
  const centerY = (h - 1) / 2;
  const radius = Math.max(1.5, Math.min(w, h) * 0.12);
  const clamp = STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityClamp;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.max(1e-3, Math.hypot(dx, dy));
      const falloff = Math.exp(-(distance * distance) / (radius * radius));
      const index = (y * w + x) * 2;
      velocity[index] = clampNumber((dx / distance) * strength * falloff, -clamp, clamp);
      velocity[index + 1] = clampNumber((dy / distance) * strength * falloff, -clamp, clamp);
    }
  }
}

/**
 * Mean pigment density over an annulus about the field centre, in the same core/rim geometry the
 * browser probe uses for `isolatedBloomRimMinusCenterDarkness`.
 */
export function studioLivingInkReferenceAnnulusDensity(
  field: StudioLivingInkFluidReferenceField,
  minimumRadius: number,
  maximumRadius: number,
): number {
  const { width, height, pigment } = field;
  const centerX = width / 2;
  const centerY = height / 2;
  let total = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      if (distance < minimumRadius || distance >= maximumRadius) continue;
      const cell = (y * width + x) * 4;
      total += (pigment[cell] ?? 0) + (pigment[cell + 1] ?? 0) + (pigment[cell + 2] ?? 0);
      count += 1;
    }
  }
  return total / Math.max(1, count);
}

/** Injects a rigid-body vortex into the coarse velocity field (quality-gate initial condition). */
export function seedStudioLivingInkReferenceVortex(
  field: StudioLivingInkFluidReferenceField,
  strength: number,
): void {
  const { coarseWidth: w, coarseHeight: h, velocity } = field;
  const centerX = (w - 1) / 2;
  const centerY = (h - 1) / 2;
  const radius = Math.max(1, Math.min(w, h) * 0.35);
  const clamp = STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityClamp;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.hypot(dx, dy);
      const falloff = Math.exp(-(distance * distance) / (2 * radius * radius));
      const index = (y * w + x) * 2;
      velocity[index] = clampNumber(-dy * strength * falloff, -clamp, clamp);
      velocity[index + 1] = clampNumber(dx * strength * falloff, -clamp, clamp);
    }
  }
}
