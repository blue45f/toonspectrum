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
import { STUDIO_LIVING_INK_WHITE_GOUACHE_EXTINCTION } from "./studio-living-ink-field";

import type { StudioLivingInkDisplayMode } from "./studio-living-ink-gpu-protocol";

export const STUDIO_LIVING_INK_WGSL_SHADER_REVISION = "wgsl-field-v3-paper-resolve" as const;

/** Field uniform slot count (f32/u32 words). The GPU buffer is `4 × this` bytes. */
export const STUDIO_LIVING_INK_WGSL_UNIFORM_WORDS = 40 as const;

/**
 * Display-resolve mode code, shared with the GLSL runtime's `displayMode` uniform. The numbers are
 * the contract between the two backends — the WGSL resolve reproduces the same branch ladder
 * (`> 3.5` flow, `> 2.5` water, `0.5 … 1.5` mobile-only, `> 1.5` fixed-only) that
 * `DISPLAY_FRAGMENT` in `studio-living-ink-webgl2-runtime.ts` reads.
 */
export function studioLivingInkWgslDisplayModeCode(mode: StudioLivingInkDisplayMode): number {
  if (mode === "mobile-pigment") return 1;
  if (mode === "fixed-pigment") return 2;
  if (mode === "water") return 3;
  if (mode === "flow") return 4;
  return 0;
}

/**
 * Display-resolve tunables. These are the same uniforms the GLSL `display` program receives; they
 * are packed here so the paper, granulation and edge-deposition model cannot drift between the two
 * backends by being re-derived inside one shader's text.
 */
export interface StudioLivingInkDisplayUniformInput {
  readonly displayWidth: number;
  readonly displayHeight: number;
  /** `beerLambertDensity * 2.2` for composite, `1.5` for every isolated channel view. */
  readonly densityStrength: number;
  readonly paperFiber: number;
  readonly paperTooth: number;
  readonly granulation: number;
  /** `edgeDarkening * 2.2`, matching the GLSL uniform upload. */
  readonly edgeAmount: number;
  readonly wetSheen: number;
  readonly vignette: number;
  /** `config.seed % 4093`, exactly as the GLSL runtime derives it. */
  readonly seed: number;
  readonly displayMode: number;
}

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
  readonly dryingEdgeDeposition: number;
  /**
   * Per-channel pigment diffusion blend for this step, from `studioLivingInkPigmentDiffusionRates`
   * — the same TS helper the GLSL pigment program uploads, so the two backends cannot drift into
   * two different bleed rates.
   */
  readonly pigmentDiffusion: readonly [number, number, number, number];
  /** True while a `fix` with `scope: "selection"` is settling, matching the GLSL exchange uniform. */
  readonly fixSelectionEnabled: boolean;
  readonly display: StudioLivingInkDisplayUniformInput;
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
  words[22] = input.display.displayWidth;
  words[23] = input.display.displayHeight;
  data[24] = input.display.densityStrength;
  data[25] = input.display.paperFiber;
  data[26] = input.display.paperTooth;
  data[27] = input.display.granulation;
  data[28] = input.display.edgeAmount;
  data[29] = input.display.wetSheen;
  data[30] = input.display.vignette;
  data[31] = input.display.seed;
  data[32] = input.display.displayMode;
  data[33] = Math.min(1, Math.max(0, input.dryingEdgeDeposition));
  data[34] = input.pigmentDiffusion[0];
  data[35] = input.pigmentDiffusion[1];
  data[36] = input.pigmentDiffusion[2];
  data[37] = input.pigmentDiffusion[3];
  data[38] = input.fixSelectionEnabled ? 1 : 0;
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
  displayWidth: u32,
  displayHeight: u32,
  densityStrength: f32,
  fiberAmount: f32,
  toothAmount: f32,
  granulationAmount: f32,
  edgeAmount: f32,
  wetSheenAmount: f32,
  vignetteAmount: f32,
  seed: f32,
  displayMode: f32,
  edgeDeposition: f32,
  diffusionR: f32,
  diffusionG: f32,
  diffusionB: f32,
  diffusionW: f32,
  fixSelectionEnabled: f32,
  pad0: f32,
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
 * WGSL reserved words that read like ordinary variable names, and are therefore the ones a shader
 * author actually reaches for. (`struct Splat { from: vec2f, … }` is the one that got written.)
 *
 * This list exists because of how such a mistake fails. `createShaderModule` does not throw;
 * `createComputePipeline` does not throw either — it returns a pipeline object that is merely
 * *invalid*, so every dispatch using it is silently dropped. The runtime then computes nothing,
 * the display resolve still paints paper, and the frame looks plausible. Downstream, the WebGPU
 * factory's fallback stamps `backend: "webgpu-offscreen-half-float"` onto a WebGL2 runtime, so even
 * the backend-identity gate reads as if WGSL ran. Two shipped shaders were dead this way and the
 * whole visual gate agreed with itself.
 *
 * The full WGSL reserved list is much longer; this is the subset that collides with plausible
 * identifiers in this file's vocabulary. Add to it rather than removing from it.
 */
export const STUDIO_LIVING_INK_WGSL_RESERVED_IDENTIFIERS: readonly string[] = Object.freeze([
  "as", "auto", "await", "become", "cast", "catch", "class", "crate", "delete", "do", "enum",
  "explicit", "export", "extern", "external", "filter", "final", "from", "get", "goto", "handle",
  "impl", "implements", "import", "inline", "interface", "layout", "match", "meta", "mod", "module",
  "move", "mut", "namespace", "new", "nil", "null", "of", "operator", "package", "partition", "pass",
  "precise", "precision", "priv", "protected", "pub", "public", "readonly", "ref", "regardless",
  "register", "require", "resource", "restrict", "self", "set", "shared", "sizeof", "smooth",
  "static", "std", "super", "target", "template", "this", "throw", "trait", "try", "type", "typedef",
  "typeof", "union", "unless", "unsafe", "use", "using", "varying", "virtual", "void", "where",
  "while", "writeonly", "yield",
]);

/**
 * Identifiers a WGSL source declares: `let`/`var`/`const` bindings, function names, function
 * parameters and struct members. Deliberately a lexical scan rather than a parser — it only has to
 * be good enough to catch a reserved word in a declaration position.
 */
export function listStudioLivingInkWgslDeclaredIdentifiers(source: string): readonly string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/\b(?:let|var|const)\s*(?:<[^>]*>)?\s*([A-Za-z_]\w*)/g)) {
    names.add(match[1]!);
  }
  for (const match of source.matchAll(/\bfn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
    names.add(match[1]!);
    for (const parameter of match[2]!.split(",")) {
      const name = /(?:^|\)\s*)\s*(?:@builtin\([^)]*\)\s*)?([A-Za-z_]\w*)\s*:/.exec(parameter.trim());
      if (name) names.add(name[1]!);
    }
  }
  for (const match of source.matchAll(/^\s{2,}([A-Za-z_]\w*)\s*:\s*[A-Za-z_]/gm)) {
    names.add(match[1]!);
  }
  return Object.freeze([...names]);
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

/**
 * Capsule deposit, transcribed from `SPLAT_FRAGMENT` in `studio-living-ink-webgl2-runtime.ts`.
 *
 * The GLSL kernel measures distances in aspect-corrected uv, i.e. in units of `1 / fieldHeight`,
 * which is exactly the cell space this compute pass works in — so the segment projection, the
 * `mix(startRadius, radius, along)` taper, the `exp(-falloff * d²/r²)` profile and the
 * max-versus-add blend port across one for one. A single dab is the degenerate case where `from`
 * equals `to`; nothing here special-cases it, exactly as in GLSL.
 */
export const STUDIO_LIVING_INK_WGSL_SPLAT = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
struct Splat {
  startPoint: vec2f,
  endPoint: vec2f,
  startRadius: f32,
  radius: f32,
  falloff: f32,
  radialVector: f32,
  startAmount: vec4f,
  endAmount: vec4f,
  maximumBlend: f32,
  selectionEnabled: f32,
  pad0: f32,
  pad1: f32,
}
@group(0) @binding(1) var<storage, read_write> field: array<vec4f>;
@group(0) @binding(2) var<uniform> splat: Splat;
@group(0) @binding(3) var<storage, read> selection: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let i = gid.y * u.width + gid.x;
  let point = vec2f(f32(gid.x) + 0.5, f32(gid.y) + 0.5);
  let segment = splat.endPoint - splat.startPoint;
  let along = clamp(
    dot(point - splat.startPoint, segment) / max(dot(segment, segment), 1e-9),
    0.0,
    1.0,
  );
  let delta = point - (splat.startPoint + segment * along);
  let localRadius = mix(splat.startRadius, splat.radius, along);
  let localAmount = mix(splat.startAmount, splat.endAmount, along);
  let normalizedDistance = dot(delta, delta) / max(localRadius * localRadius, 1e-9);
  // Falloff-aware cutoff: exp(-14) is below one part in a million of the peak, so the profile is
  // indistinguishable from the un-truncated GLSL one at every falloff the runtime uses (0.9 … 3.25).
  if (splat.falloff * normalizedDistance > 14.0) { return; }
  let gaussian = exp(-splat.falloff * normalizedDistance);
  let mask = mix(1.0, clamp(selection[i].x, 0.0, 1.0), splat.selectionEnabled);
  let radialDirection = normalize(delta + vec2f(1e-7));
  var deposited = localAmount * gaussian * mask;
  if (splat.radialVector > 0.5) {
    deposited = vec4f(radialDirection * localAmount.x, 0.0, 0.0) * gaussian * mask;
  }
  let source = field[i];
  field[i] = select(source + deposited, max(source, deposited), splat.maximumBlend > 0.5);
}
`;

/** Selection-masked clear: `source * (1 - coverage)`, the WGSL twin of `CLEAR_MASKED_FRAGMENT`. */
export const STUDIO_LIVING_INK_WGSL_CLEAR_MASKED = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read_write> field: array<vec4f>;
@group(0) @binding(2) var<storage, read> selection: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let i = gid.y * u.width + gid.x;
  let keep = 1.0 - clamp(selection[i].x, 0.0, 1.0);
  field[i] = field[i] * keep;
}
`;

/**
 * Selection-masked clear for the coarse velocity/pressure grid.
 *
 * The selection mask is authored at pigment resolution and there is only ever one of it, so a
 * coarse cell has to *resample* it rather than index it: the bilinear read below is the compute
 * twin of what the GLSL runtime gets for free, where `CLEAR_MASKED_FRAGMENT` draws into a coarse
 * framebuffer while sampling a fine, `GL_LINEAR` selection texture at the coarse fragment's uv.
 * Indexing `selection[i]` with a coarse index instead would read a fine cell from the top-left
 * eighth of the field — a mask silently sampled in the wrong place, which is exactly the kind of
 * plausible-looking wrong that this file's history is made of.
 *
 * Coverage is a partial-alpha mask, so `keep` is a continuous `1 - coverage` here as well: a
 * half-selected coarse cell keeps half its momentum, matching the fine-grid twin above.
 */
export const STUDIO_LIVING_INK_WGSL_CLEAR_MASKED_COARSE = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read_write> field: array<vec4f>;
@group(0) @binding(2) var<storage, read> selection: array<vec4f>;
${bilinearSampler("sampleSelection", "selection", "u.width", "u.height")}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.coarseWidth || gid.y >= u.coarseHeight) { return; }
  let i = gid.y * u.coarseWidth + gid.x;
  let uv = vec2f(
    (f32(gid.x) + 0.5) / f32(u.coarseWidth),
    (f32(gid.y) + 0.5) / f32(u.coarseHeight),
  );
  let keep = 1.0 - clamp(sampleSelection(uv).x, 0.0, 1.0);
  field[i] = field[i] * keep;
}
`;

/** Additive merge of the per-stroke capsule-union deposit into the mobile pigment well. */
export const STUDIO_LIVING_INK_WGSL_MERGE_DEPOSIT = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read_write> base: array<vec4f>;
@group(0) @binding(2) var<storage, read> deposit: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let i = gid.y * u.width + gid.x;
  base[i] = max(base[i], vec4f(0.0)) + max(deposit[i], vec4f(0.0));
}
`;

/**
 * Stroke momentum injection on the coarse velocity grid. `splat.x/y` stay in fine cell coordinates
 * so the caller never has to know the coarse scale; `splat.r/g` carry the uv-per-second impulse.
 */
export const STUDIO_LIVING_INK_WGSL_SPLAT_VELOCITY = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
struct Splat {
  startPoint: vec2f,
  endPoint: vec2f,
  startRadius: f32,
  radius: f32,
  falloff: f32,
  radialVector: f32,
  startAmount: vec4f,
  endAmount: vec4f,
  maximumBlend: f32,
  selectionEnabled: f32,
  pad0: f32,
  pad1: f32,
}
@group(0) @binding(1) var<storage, read_write> velocity: array<vec4f>;
@group(0) @binding(2) var<uniform> splat: Splat;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.coarseWidth || gid.y >= u.coarseHeight) { return; }
  let i = gid.y * u.coarseWidth + gid.x;
  // Impulse geometry is authored in fine cells so the caller never has to know the coarse scale.
  let point = vec2f(
    (f32(gid.x) + 0.5) / f32(u.coarseWidth) * f32(u.width),
    (f32(gid.y) + 0.5) / f32(u.coarseHeight) * f32(u.height),
  );
  let segment = splat.endPoint - splat.startPoint;
  let along = clamp(
    dot(point - splat.startPoint, segment) / max(dot(segment, segment), 1e-9),
    0.0,
    1.0,
  );
  let delta = point - (splat.startPoint + segment * along);
  let localRadius = mix(splat.startRadius, splat.radius, along);
  let localAmount = mix(splat.startAmount, splat.endAmount, along);
  let normalizedDistance = dot(delta, delta) / max(localRadius * localRadius, 1e-9);
  if (splat.falloff * normalizedDistance > 14.0) { return; }
  let gaussian = exp(-splat.falloff * normalizedDistance);
  let radialDirection = normalize(delta + vec2f(1e-7));
  var impulse = localAmount.xy * gaussian;
  if (splat.radialVector > 0.5) {
    impulse = radialDirection * localAmount.x * gaussian;
  }
  let moved = velocity[i].xy + impulse;
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

/**
 * Surface water: advection by the wash, an anisotropic capillary creep front, and evaporation.
 * Transcribed from `WET_FRAGMENT`.
 *
 * The creep stencil is deliberately *not* a four-neighbour Laplacian. Paper fibres run in a
 * slowly-varying direction, so the front reaches further along the fibre than across it; an
 * axis-aligned stencil instead produces the square/diamond spreading that reads as grid artefact
 * rather than as paper, and it also under-expands the wash along the fibre axis.
 */
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
  // Slowly varying paper fibres make capillary spread elongated but continuous. Sampling a fibre
  // axis plus its perpendicular avoids grid diamonds and exposes real paper-direction response.
  let fieldSize = vec2f(f32(u.width), f32(u.height));
  let fibreCell = floor(uv * fieldSize / 28.0);
  let fibreNoise = fract(sin(dot(fibreCell + vec2f(u.seed), vec2f(41.73, 97.11))) * 43758.5453);
  let fibreAngle = (fibreNoise - 0.5) * 1.4 + 0.34;
  let fibre = vec2f(cos(fibreAngle), sin(fibreAngle));
  let perpendicular = vec2f(-fibre.y, fibre.x);
  let parallelReach = fibre * texel * (1.0 + u.capillaryCreep * (3.0 + 3.0 * u.fiberAmount));
  let perpendicularReach = perpendicular * texel * (1.0 + u.capillaryCreep * 1.6);
  let farParallelReach = parallelReach * 1.4;
  let farPerpendicularReach = perpendicularReach * 1.25;
  let parallelWeight = 0.5 + u.fiberAmount * 0.22;
  let perpendicularWeight = 1.0 - parallelWeight;
  let neighborhood = parallelWeight * 0.5 * (
    sampleWet(origin + parallelReach).x + sampleWet(origin - parallelReach).x
  ) + perpendicularWeight * 0.5 * (
    sampleWet(origin + perpendicularReach).x + sampleWet(origin - perpendicularReach).x
  );
  // Porous paper advances a continuous capillary front. A bounded maximum-principle source grows
  // the wet boundary without stamping circles or creating the square/diamond diffusion of a
  // four-neighbour Laplacian.
  let frontierSource = max(
    max(sampleWet(origin + farParallelReach).x, sampleWet(origin - farParallelReach).x),
    max(
      sampleWet(origin + farPerpendicularReach).x,
      sampleWet(origin - farPerpendicularReach).x,
    ),
  );
  let frontAdvance = max(0.0, frontierSource - center)
    * u.capillaryCreep
    * (${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.frontAdvanceGain)} + u.fiberAmount * 0.045);
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
 * Pigment transport, transcribed from `PIGMENT_FRAGMENT`.
 *
 * One kernel, as in GLSL: semi-Lagrangian advection with channel-asymmetric chromatography
 * sampling, axial+diagonal diffusion at TS-computed rates, drying-front edge pooling, saturated
 * centre dilution, the Deegan compressibility correction, and a dt-scaled transport blend. Mobility
 * is a smoothstep on wetness, so pigment on dry paper is frozen in place rather than slowly
 * smeared.
 *
 * Splitting this into an "advect" pass plus a "diffuse" pass — which is what this file used to do —
 * is not a refactor of the same physics: the transport blend at the end is a *rate*, and applying
 * it twice per tick, once per half-kernel, moves a different amount of pigment than the certified
 * runtime does.
 */
export const STUDIO_LIVING_INK_WGSL_PIGMENT = /* wgsl */ `
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
  let texel = vec2f(1.0 / f32(u.width), 1.0 / f32(u.height));
  let uv = vec2f((f32(gid.x) + 0.5) * texel.x, (f32(gid.y) + 0.5) * texel.y);
  let wetness = sampleWet(uv).x;
  // Dry paper has zero mobility: the smoothstep gate is what stops a stroke from creeping after
  // the water is gone. A raw clamp(wet) would keep bleeding at any residual moisture.
  let mobility = smoothstep(u.pigmentWetGateMin, u.pigmentWetGateMax, wetness);
  if (mobility < 0.001) { dst[i] = current; return; }
  let v = sampleVelocity(uv).xy;
  let wetLeft = sampleWet(uv - vec2f(texel.x, 0.0)).x;
  let wetRight = sampleWet(uv + vec2f(texel.x, 0.0)).x;
  let wetLower = sampleWet(uv - vec2f(0.0, texel.y)).x;
  let wetUpper = sampleWet(uv + vec2f(0.0, texel.y)).x;
  let wetGradient = 0.5 * vec2f(wetRight - wetLeft, wetUpper - wetLower);
  let towardWetCenter = normalize(wetGradient + vec2f(1e-6));
  let capillaryReach = ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentCapillaryBase)}
    + u.capillaryCreep * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentCapillaryGain)};
  let capillaryBacktrace = towardWetCenter * texel * capillaryReach * mobility;
  let baseOrigin = clamp(
    uv - v * u.dt * mobility + capillaryBacktrace,
    vec2f(0.0),
    vec2f(1.0),
  );
  // InkWash §06 chemistry: channel-asymmetric advection samples + TS-uploaded diffusion rates so
  // wet edges chromatograph into a dark core with a cool halo rather than a monochrome blur.
  let separation = clamp(u.chromaticSeparation, 0.0, 1.0);
  let chroma = vec3f(u.chromaR, u.chromaG, u.chromaB);
  let separationDirection = normalize(v + wetGradient * 4.0 + vec2f(1e-5));
  let chromaShift = separationDirection * texel * separation * mobility * u.dt
    * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.chromaShiftScale)};
  let red = samplePigment(clamp(baseOrigin - chromaShift * chroma.x, vec2f(0.0), vec2f(1.0))).x;
  let green = samplePigment(clamp(
    baseOrigin - chromaShift * chroma.y * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.chromaGreenShiftScale)},
    vec2f(0.0),
    vec2f(1.0),
  )).y;
  let blue = samplePigment(clamp(
    baseOrigin + chromaShift * chroma.z * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.chromaBlueShiftScale)},
    vec2f(0.0),
    vec2f(1.0),
  )).z;
  let white = samplePigment(baseOrigin).w;
  let transported = vec4f(red, green, blue, white);
  let axialTexel = texel * (1.0 + u.bleed * 3.8);
  let diagonalTexel = axialTexel * 0.70710678;
  let axialNeighbors = 0.25 * (
    samplePigment(baseOrigin + vec2f(axialTexel.x, 0.0))
    + samplePigment(baseOrigin - vec2f(axialTexel.x, 0.0))
    + samplePigment(baseOrigin + vec2f(0.0, axialTexel.y))
    + samplePigment(baseOrigin - vec2f(0.0, axialTexel.y))
  );
  let diagonalNeighbors = 0.25 * (
    samplePigment(baseOrigin + diagonalTexel)
    + samplePigment(baseOrigin + vec2f(diagonalTexel.x, -diagonalTexel.y))
    + samplePigment(baseOrigin + vec2f(-diagonalTexel.x, diagonalTexel.y))
    + samplePigment(baseOrigin - diagonalTexel)
  );
  let neighbors = mix(axialNeighbors, diagonalNeighbors, 0.5);
  // Rates are precomputed at mobility=1 by studioLivingInkPigmentDiffusionRates and scaled by local
  // wet mobility here, so dry paper stays frozen. Both runtimes clear the brush footprint before
  // the tick loop, so the scrub-tip rate never applies during simulation and only the quiet rate
  // is uploaded.
  let separatedDiffusion = clamp(
    vec4f(u.diffusionR, u.diffusionG, u.diffusionB, u.diffusionW) * mobility,
    vec4f(0.0),
    vec4f(${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentChannelCeiling)}),
  );
  var evolved = mix(transported, neighbors, separatedDiffusion);
  let wetGradientStrength = length(wetGradient);
  let evaporationFront = smoothstep(0.004, 0.095, wetness)
    * (1.0 - smoothstep(0.18, 0.62, wetness));
  let edgePool = u.edgeDeposition * evaporationFront
    * (1.0 + clamp(wetGradientStrength * 18.0, 0.0, 1.8));
  evolved = vec4f(evolved.xyz * (1.0 + edgePool * u.dt * 2.4), evolved.w);
  let saturatedWashCenter = smoothstep(0.26, 0.7, wetness);
  evolved = vec4f(evolved.xyz * (1.0 - u.bleed * saturatedWashCenter * u.dt * 0.42), evolved.w);
  // Deegan transport (the "coffee ring") — why a dwell mark must empty its own centre.
  // capillaryBacktrace above already carries pigment down the wetness gradient: water leaving the
  // puddle to replace what evaporates at the pinned front drags its suspended pigment outward.
  // But pigment here is an *areal density*, and semi-Lagrangian advection transports a sampled
  // value, which silently drops the compressibility term of the conservation law
  //   dc/dt = -c * div(u).
  // For a radial dwell flow div(u) > 0 everywhere inside the front (the same annulus of water
  // spreads over a larger circumference), so omitting it is exactly what leaves the darkest
  // pigment sitting dead centre and reads as an ink dot instead of a wash. The velocity solver
  // cannot supply this term either: an evaporation-driven flux is divergent by construction —
  // mass leaves the film as vapour, not sideways — and pressure projection deletes precisely that
  // component. So it belongs here, on the pigment field.
  //
  // div(d) = A * div(n)      geometric spreading — the interior thins as the ring of water covers
  //                          a longer circumference. This is the term that stops a dwell mark from
  //                          reading as a dot.
  //        + grad(A) . n     deceleration — transport weakens as the film thins toward the front,
  //                          so pigment piles into the drying edge (the hard rim).
  // The curvature bound is not cosmetic: the wet pass advances its front with a stencil several
  // texels wide, so a front curvature tighter than roughly twice that reach is not represented in
  // the wetness field at all — measuring it there returns paper grain, not surface shape.
  let wetLaplacian = wetLeft + wetRight + wetLower + wetUpper - 4.0 * wetness;
  let frontNormalStep = towardWetCenter * texel;
  let wetSecondDerivativeAlongNormal =
    sampleWet(clamp(uv + frontNormalStep, vec2f(0.0), vec2f(1.0))).x
    + sampleWet(clamp(uv - frontNormalStep, vec2f(0.0), vec2f(1.0))).x
    - 2.0 * wetness;
  let resolvedFrontCurvature = 0.08;
  let frontCurvature = clamp(
    (wetLaplacian - wetSecondDerivativeAlongNormal) / max(wetGradientStrength, 1e-5),
    -resolvedFrontCurvature,
    resolvedFrontCurvature,
  );
  let mobilityRamp = clamp((wetness - 0.015) / 0.445, 0.0, 1.0);
  let mobilitySlope = 6.0 * mobilityRamp * (1.0 - mobilityRamp) / 0.445;
  let displacementDivergence = capillaryReach
    * (mobility * frontCurvature + mobilitySlope * wetGradientStrength);
  evolved = vec4f(evolved.xyz * clamp(1.0 + displacementDivergence, 0.8, 1.3), evolved.w);
  // Advection is a rate over the fixed step. Replacing most of the pigment field every tick
  // bleaches the water path and piles all colour at the two ends of a stroke.
  let transportBlend = clamp(
    mobility * u.dt * (${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentTransportBase)}
      + u.bleed * ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentTransportBleedGain)}),
    0.0,
    ${wgslFloat(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentTransportCeiling)},
  );
  dst[i] = mix(current, evolved, transportBlend);
}
`;

/**
 * Fix: settle mobile pigment into the immutable fixed well. Transcribed from `EXCHANGE_FRAGMENT`.
 *
 * White gouache is not a fourth pigment channel in the fixed well — it is *bleaching*. The deposit
 * converts the existing fixed density to transmittance, mixes it toward paper white by its
 * Beer-Lambert coverage, and converts back; the fixed alpha then decays instead of accumulating.
 * A naive `fixed += mobile * t` (which is what this kernel used to be) leaves the white as a
 * permanent alpha in the fixed well, so the display's white-coverage term saturates and every
 * subsequent dark stroke over that white is invisible — measured as a dark-over-white density gain
 * of 0.02 where the certified runtime gains 113.6.
 */
export const STUDIO_LIVING_INK_WGSL_FIX = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read_write> mobile: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> fixedWell: array<vec4f>;
@group(0) @binding(3) var<storage, read> selection: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let i = gid.y * u.width + gid.x;
  let m = max(mobile[i], vec4f(0.0));
  let fixedPigment = max(fixedWell[i], vec4f(0.0));
  let coverage = mix(1.0, clamp(selection[i].x, 0.0, 1.0), u.fixSelectionEnabled);
  let accepted = clamp(u.fixTransfer * coverage, 0.0, 1.0);
  let darkDeposit = m.xyz * accepted;
  let whiteDeposit = m.w * accepted;
  let previousTransmittance = exp(-fixedPigment.xyz);
  let bleachCoverage = 1.0
    - exp(-${wgslFloat(STUDIO_LIVING_INK_WHITE_GOUACHE_EXTINCTION)} * whiteDeposit);
  let bleached = mix(previousTransmittance, vec3f(1.0), clamp(bleachCoverage, 0.0, 1.0));
  let fixedDensity = -log(clamp(bleached, vec3f(1e-5), vec3f(1.0))) + darkDeposit;
  fixedWell[i] = vec4f(fixedDensity, fixedPigment.w * (1.0 - accepted));
  mobile[i] = m * (1.0 - accepted);
}
`;

/**
 * Watercolour display resolve — the WGSL transcription of `DISPLAY_FRAGMENT` in
 * `studio-living-ink-webgl2-runtime.ts`, statement for statement.
 *
 * This pass is the picture. Everything above it computes a field; this is where the field becomes
 * paper with ink on it, and it is where the two backends most obviously must not diverge: a bare
 * `exp(-density)` resolve produces a technically correct, visually dead image — pure white paper,
 * ink an order of magnitude too faint, no granulation, no drying-front deposition, no capillary
 * plume. So none of the numbers below are re-invented. Every constant, gate and kernel weight is
 * lifted from the certified GLSL program, including the eight-tap rotated plume, the three
 * deterministic capillary lobes, the drying-front edge concentration and the near-black floor's
 * companion white-gouache extinction.
 *
 * It runs on the *display* grid, not the field grid, because the paper model is authored in display
 * pixels (`pixel = uv * displayResolution`) while pigment and water are sampled through
 * clamp-to-edge bilinear taps in field uv — the same split the fragment shader gets for free from
 * `gl_FragCoord` plus `sampler2D`.
 */
export const STUDIO_LIVING_INK_WGSL_DISPLAY = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> mobile: array<vec4f>;
@group(0) @binding(2) var<storage, read> fixedWell: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> outRgba: array<vec4f>;
@group(0) @binding(4) var<storage, read> wet: array<vec4f>;
@group(0) @binding(5) var<storage, read> velocity: array<vec4f>;
${bilinearSampler("sampleMobile", "mobile", "u.width", "u.height")}
${bilinearSampler("sampleFixed", "fixedWell", "u.width", "u.height")}
${bilinearSampler("sampleWet", "wet", "u.width", "u.height")}
${bilinearSampler("sampleVelocity", "velocity", "u.coarseWidth", "u.coarseHeight")}

fn randomCell(cell: vec2f) -> f32 {
  return fract(sin(dot(cell + vec2f(u.seed), vec2f(91.17, 17.31))) * 43758.5453);
}

fn smoothNoise(p: vec2f) -> f32 {
  let cell = floor(p);
  var local = fract(p);
  local = local * local * (3.0 - 2.0 * local);
  let a = randomCell(cell);
  let b = randomCell(cell + vec2f(1.0, 0.0));
  let c = randomCell(cell + vec2f(0.0, 1.0));
  let d = randomCell(cell + vec2f(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

fn layeredFiber(start: vec2f) -> f32 {
  var result = 0.0;
  var amplitude = 0.55;
  var p = start;
  for (var octave = 0; octave < 4; octave = octave + 1) {
    result = result + amplitude * smoothNoise(p);
    p = p * 2.03 + vec2f(11.7, 3.9);
    amplitude = amplitude * 0.48;
  }
  return result;
}

fn mobilePigment(p: vec2f) -> vec4f {
  if (u.displayMode > 1.5) { return vec4f(0.0); }
  return max(sampleMobile(p), vec4f(0.0));
}

fn fixedPigmentAt(p: vec2f) -> vec4f {
  if (u.displayMode > 0.5 && u.displayMode < 1.5) { return vec4f(0.0); }
  return max(sampleFixed(p), vec4f(0.0));
}

fn clampUv(p: vec2f) -> vec2f {
  return clamp(p, vec2f(0.0), vec2f(1.0));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.displayWidth || gid.y >= u.displayHeight) { return; }
  let i = gid.y * u.displayWidth + gid.x;
  let uv = vec2f(
    (f32(gid.x) + 0.5) / f32(u.displayWidth),
    (f32(gid.y) + 0.5) / f32(u.displayHeight),
  );
  let fineTexel = vec2f(1.0 / f32(u.width), 1.0 / f32(u.height));
  var wetness = max(0.0, sampleWet(uv).x);
  if (u.displayMode > 3.5) {
    let v = sampleVelocity(uv).xy;
    outRgba[i] = vec4f(
      clamp(vec3f(0.5 + v.x * 0.35, 0.5 + v.y * 0.35, length(v)), vec3f(0.0), vec3f(1.0)),
      1.0,
    );
    return;
  }
  if (u.displayMode > 2.5) {
    outRgba[i] = vec4f(vec3f(clamp(wetness, 0.0, 1.0)), 1.0);
    return;
  }
  var mobileContribution = mobilePigment(uv);
  let fixedContribution = fixedPigmentAt(uv);
  var combined = fixedContribution + mobileContribution;
  if (u.displayMode < 0.5 && wetness > 0.01) {
    // Reconstruct the capillary plume from the authoritative mobile field at display time. The
    // rotated eight-tap kernel follows the local paper direction, avoiding both square Gaussian
    // blur and the circular dab joints of a stamp renderer.
    let fieldPixel = uv / fineTexel;
    let plumeAngle = (smoothNoise(fieldPixel * 0.021 + vec2f(23.0, 71.0)) - 0.5) * 1.7;
    let axis = vec2f(cos(plumeAngle), sin(plumeAngle));
    let crossAxis = vec2f(-axis.y, axis.x);
    let plumeRadius = (4.0 + smoothstep(0.025, 0.7, wetness) * 27.0)
      * mix(0.8, 1.2, smoothNoise(fieldPixel * 0.057 + vec2f(3.0, 47.0)));
    var plumeWarp = vec2f(
      smoothNoise(fieldPixel * 0.039 + vec2f(79.0, 13.0)) - 0.5,
      smoothNoise(fieldPixel * 0.043 + vec2f(17.0, 101.0)) - 0.5,
    ) * fineTexel * plumeRadius * 0.42;
    // A real wet edge does not expand as a mirror-symmetric lens. Two low-frequency curls plus a
    // bounded vertical paper drift place three deterministic, overlapping capillary lobes. The
    // frequencies stay well below dab spacing, so this changes the wash silhouette without adding
    // isolated dots, noisy scallops or frame-to-frame randomness.
    let lobeWaveA = sin(fieldPixel.x * 0.071 + fieldPixel.y * 0.019 + u.seed * 0.017);
    let lobeWaveB = sin(fieldPixel.x * 0.033 - fieldPixel.y * 0.027 + u.seed * 0.031 + 1.7);
    // Negated against GLSL: the drift is the one *deliberate* direction in this kernel (a wash
    // creeping down the page), and GLSL authors it in WebGL uv where +y points up. The surrounding
    // noise terms are symmetric so their sign is immaterial, but this one is the picture.
    let verticalDrift = -(0.14 + lobeWaveA * 0.17 + lobeWaveB * 0.09);
    plumeWarp = plumeWarp + vec2f(
      fineTexel.x * plumeRadius * lobeWaveB * 0.08,
      fineTexel.y * plumeRadius * verticalDrift,
    );
    let plumeUv = clampUv(uv + plumeWarp);
    let a = axis * fineTexel * plumeRadius;
    let b = crossAxis * fineTexel * plumeRadius * 0.96;
    let diagonalA = (a + b) * 0.70710678;
    let diagonalB = (a - b) * 0.70710678;
    let mobileCenter = mobileContribution;
    let nearPlume = 0.125 * (
      sampleMobile(clampUv(plumeUv + a * 0.48))
      + sampleMobile(clampUv(plumeUv - a * 0.48))
      + sampleMobile(clampUv(plumeUv + b * 0.48))
      + sampleMobile(clampUv(plumeUv - b * 0.48))
      + sampleMobile(clampUv(plumeUv + diagonalA * 0.58))
      + sampleMobile(clampUv(plumeUv - diagonalA * 0.58))
      + sampleMobile(clampUv(plumeUv + diagonalB * 0.58))
      + sampleMobile(clampUv(plumeUv - diagonalB * 0.58))
    );
    let farPlume = 0.25 * (
      sampleMobile(clampUv(plumeUv + a))
      + sampleMobile(clampUv(plumeUv - a))
      + sampleMobile(clampUv(plumeUv + b))
      + sampleMobile(clampUv(plumeUv - b))
    );
    let lobeOffsetA = fineTexel * plumeRadius
      * vec2f(0.34 + lobeWaveB * 0.08, -0.18 + lobeWaveA * 0.1);
    let lobeOffsetB = fineTexel * plumeRadius
      * vec2f(-0.23 + lobeWaveA * 0.07, 0.31 + lobeWaveB * 0.08);
    let lobeOffsetC = fineTexel * plumeRadius
      * vec2f(0.08 + lobeWaveB * 0.05, 0.48 + lobeWaveA * 0.06);
    let lobePlume =
      sampleMobile(clampUv(plumeUv + lobeOffsetA)) * 0.42
      + sampleMobile(clampUv(plumeUv + lobeOffsetB)) * 0.34
      + sampleMobile(clampUv(plumeUv + lobeOffsetC)) * 0.24;
    // Smooth energy reconstruction removes the star/ridge faceting of a peak/max kernel. Paper
    // granulation is applied afterwards, so texture remains organic without encoding tap geometry.
    let lobeGain = 0.73 + lobeWaveA * 0.1 + lobeWaveB * 0.06;
    var plume = max(
      mobileCenter * 0.9,
      nearPlume * 2.76 + farPlume * 1.02 + lobePlume * lobeGain,
    );
    // Preserve the physical channel separation after broad plume reconstruction. Two bounded
    // channel-biased lobe probes keep the fringe spatial (rather than merely tinting the wash)
    // without producing a synthetic rainbow edge.
    let chromaCurl = normalize(axis * 0.82 + crossAxis * 0.57)
      * fineTexel * plumeRadius * (0.15 + u.chromaticSeparation * 0.5);
    let redLobe = sampleMobile(clampUv(plumeUv + lobeOffsetA + chromaCurl)).x;
    let blueLobe = sampleMobile(clampUv(plumeUv + lobeOffsetB - chromaCurl)).z;
    plume.x = plume.x + redLobe * u.chromaticSeparation * 1.05;
    plume.z = plume.z + blueLobe * u.chromaticSeparation * 1.05;
    let plumeGate = smoothstep(0.018, 0.58, wetness) * 0.9;
    mobileContribution = mix(mobileCenter, plume, plumeGate);
    let saturatedCenterDilution = smoothstep(0.3, 1.1, wetness) * 0.64;
    mobileContribution = vec4f(
      mobileContribution.xyz * (1.0 - saturatedCenterDilution),
      mobileContribution.w,
    );
    // Water may continue changing the paper and mobile pigment after Fix, but it must never
    // bleach the immutable fixed well. Compose fixed pigment only after every wet-dependent
    // plume and dilution operation has finished.
    combined = fixedContribution + mobileContribution;
  }
  if (u.displayMode > 0.5) { wetness = 0.0; }
  let centerDensity = dot(combined.xyz, vec3f(0.333333));
  let mobileCenterDensity = dot(mobileContribution.xyz, vec3f(0.333333));
  let mobileLeft = dot(mobilePigment(uv - vec2f(fineTexel.x, 0.0)).xyz, vec3f(0.333333));
  let mobileRight = dot(mobilePigment(uv + vec2f(fineTexel.x, 0.0)).xyz, vec3f(0.333333));
  let mobileLower = dot(mobilePigment(uv - vec2f(0.0, fineTexel.y)).xyz, vec3f(0.333333));
  let mobileUpper = dot(mobilePigment(uv + vec2f(0.0, fineTexel.y)).xyz, vec3f(0.333333));
  let mobilePigmentEdge = length(vec2f(
    mobileRight - mobileLeft,
    mobileUpper - mobileLower,
  ));
  let fixedLeft = dot(fixedPigmentAt(uv - vec2f(fineTexel.x, 0.0)).xyz, vec3f(0.333333));
  let fixedRight = dot(fixedPigmentAt(uv + vec2f(fineTexel.x, 0.0)).xyz, vec3f(0.333333));
  let fixedLower = dot(fixedPigmentAt(uv - vec2f(0.0, fineTexel.y)).xyz, vec3f(0.333333));
  let fixedUpper = dot(fixedPigmentAt(uv + vec2f(0.0, fineTexel.y)).xyz, vec3f(0.333333));
  let fixedPigmentEdge = length(vec2f(fixedRight - fixedLeft, fixedUpper - fixedLower));
  let pixel = uv * vec2f(f32(u.displayWidth), f32(u.displayHeight));
  let fiber = layeredFiber(pixel * vec2f(0.035, 0.085));
  let tooth = smoothNoise(pixel * 0.31 + vec2f(7.3, 19.1));
  let grain = layeredFiber(pixel * 0.105 + vec2f(41.0, 13.0));
  let coarseTooth = layeredFiber(pixel * vec2f(0.017, 0.026) + vec2f(5.7, 31.0));
  let microTooth = randomCell(floor(pixel * 0.92));
  var paper = vec3f(0.965, 0.956, 0.932);
  // Two-scale directional paper is visible on an empty page and therefore measurable instead of
  // being a pigment-only cosmetic effect. The amplitudes stay below one display code value when
  // users turn both material controls down to zero.
  paper = paper - vec3f((fiber - 0.5) * 0.12 * u.fiberAmount);
  paper = paper - vec3f((tooth - 0.5) * 0.085 * u.toothAmount);
  paper = paper - vec3f((coarseTooth - 0.5) * 0.05 * (0.35 + u.fiberAmount * 0.65));
  paper = paper - vec3f((microTooth - 0.5) * 0.05 * u.toothAmount);
  var fixedOpticalDensity = fixedContribution.xyz * u.densityStrength;
  var mobileOpticalDensity = mobileContribution.xyz * u.densityStrength;
  let granulationGate = smoothstep(0.005, 0.24, centerDensity)
    * (1.0 - smoothstep(0.38, 1.15, centerDensity) * 0.74);
  let sediment = (grain - 0.5) * 2.0 + (tooth - 0.5) * 0.7;
  let granulationMultiplier = 1.0
    + sediment * u.granulationAmount * 2.15 * granulationGate;
  fixedOpticalDensity = fixedOpticalDensity * granulationMultiplier;
  mobileOpticalDensity = mobileOpticalDensity * granulationMultiplier;
  let wetGradient = length(vec2f(
    sampleWet(clampUv(uv + vec2f(fineTexel.x, 0.0))).x
      - sampleWet(clampUv(uv - vec2f(fineTexel.x, 0.0))).x,
    sampleWet(clampUv(uv + vec2f(0.0, fineTexel.y))).x
      - sampleWet(clampUv(uv - vec2f(0.0, fineTexel.y))).x,
  ));
  let dryingFront = smoothstep(0.006, 0.12, wetness)
    * (1.0 - smoothstep(0.2, 0.62, wetness));
  // The dry baseline remains part of both media wells. Drying-front concentration is mobile-only:
  // clear water can move or settle unfixed pigment but cannot change already fixed optical density.
  fixedOpticalDensity = fixedOpticalDensity * (1.0 + fixedPigmentEdge * u.edgeAmount * 0.65);
  mobileOpticalDensity = mobileOpticalDensity * (1.0
    + mobilePigmentEdge * u.edgeAmount * (0.65 + dryingFront * 4.2)
    + dryingFront * mobileCenterDensity * u.edgeAmount * (0.9 + wetGradient * 7.0));
  let opticalDensity = fixedOpticalDensity + mobileOpticalDensity;
  var color = paper * exp(-opticalDensity);
  let mobileWhiteCoverage = 1.0 - exp(-combined.w * ${wgslFloat(STUDIO_LIVING_INK_WHITE_GOUACHE_EXTINCTION)});
  let gouache = vec3f(0.986, 0.982, 0.968);
  color = mix(color, gouache, clamp(mobileWhiteCoverage, 0.0, 1.0));
  let wetGate = smoothstep(0.015, 0.62, wetness);
  // Clear water itself is subtle. Strong colour comes from transported pigment, preventing the
  // opaque blue/grey bar that appears when a wetness mask is mistaken for paint.
  color = color * (1.0 - wetGate * vec3f(0.018, 0.016, 0.012));
  color = color + vec3f(0.035, 0.042, 0.052) * u.wetSheenAmount
    * wetGate * clamp(wetGradient * 6.0, 0.0, 1.0);
  let centered = uv - vec2f(0.5);
  color = color * (1.0 - dot(centered, centered) * u.vignetteAmount);
  outRgba[i] = vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

/**
 * Frame order. The six v1 passes keep their relative order; the v2 fluid passes are interleaved at
 * the position the Stable Fluids step requires (deposit → advect → confine → project → transport).
 */
export const STUDIO_LIVING_INK_WGSL_PASS_ORDER = Object.freeze([
  "clear",
  "clear-coarse",
  "clear-masked",
  "clear-masked-coarse",
  "splat",
  "merge-deposit",
  "splat-velocity",
  "advect-velocity",
  "curl",
  "vorticity",
  "divergence",
  "jacobi",
  "gradient",
  "wet",
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
  "clear-masked-coarse",
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
  "clear-masked": STUDIO_LIVING_INK_WGSL_CLEAR_MASKED,
  "clear-masked-coarse": STUDIO_LIVING_INK_WGSL_CLEAR_MASKED_COARSE,
  splat: STUDIO_LIVING_INK_WGSL_SPLAT,
  "merge-deposit": STUDIO_LIVING_INK_WGSL_MERGE_DEPOSIT,
  "splat-velocity": STUDIO_LIVING_INK_WGSL_SPLAT_VELOCITY,
  "advect-velocity": STUDIO_LIVING_INK_WGSL_ADVECT_VELOCITY,
  curl: STUDIO_LIVING_INK_WGSL_CURL,
  vorticity: STUDIO_LIVING_INK_WGSL_VORTICITY,
  divergence: STUDIO_LIVING_INK_WGSL_DIVERGENCE,
  jacobi: STUDIO_LIVING_INK_WGSL_JACOBI,
  gradient: STUDIO_LIVING_INK_WGSL_GRADIENT,
  wet: STUDIO_LIVING_INK_WGSL_WET,
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

export type StudioLivingInkWgslPassGrid = "fine" | "coarse" | "display";

/**
 * Dispatch grid for a pass. The display resolve is the one kernel that is neither: it is authored
 * in display pixels because the paper model is, while it samples pigment and water in field uv.
 */
export function studioLivingInkWgslPassGrid(
  pass: StudioLivingInkWgslPassId,
): StudioLivingInkWgslPassGrid {
  if (pass === "display") return "display";
  return studioLivingInkWgslPassIsCoarse(pass) ? "coarse" : "fine";
}

export function listStudioLivingInkWgslPassSources(): ReadonlyArray<{
  readonly id: StudioLivingInkWgslPassId;
  readonly source: string;
  readonly entryPoint: "main";
  readonly grid: StudioLivingInkWgslPassGrid;
}> {
  return Object.freeze(
    STUDIO_LIVING_INK_WGSL_PASS_ORDER.map((id) =>
      Object.freeze({
        id,
        source: studioLivingInkWgslSourceForPass(id),
        entryPoint: "main" as const,
        grid: studioLivingInkWgslPassGrid(id),
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
