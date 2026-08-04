/**
 * Pure WGSL field-pass library for Living Ink WebGPU runtime.
 * Single source for compute kernels: deposit, Stam fluids, pigment, fix, Beer–Lambert display.
 */

export const STUDIO_LIVING_INK_WGSL_SHADER_REVISION = "wgsl-field-v1" as const;

/** Common storage layout: rgba32float pixels, row-major, workgroup 8x8. */
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
  pad0: f32,
  pad1: f32,
}

@group(0) @binding(0) var<uniform> u: FieldUniforms;
`;

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

/** Jacobi-ish relaxation on R channel of pressure (stored in .x). */
export const STUDIO_LIVING_INK_WGSL_JACOBI = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let x = gid.x;
  let y = gid.y;
  let i = y * u.width + x;
  let xm = select(x - 1u, x, x == 0u);
  let xp = select(x + 1u, x, x + 1u >= u.width);
  let ym = select(y - 1u, y, y == 0u);
  let yp = select(y + 1u, y, y + 1u >= u.height);
  let c = src[i];
  let l = src[y * u.width + xm].x;
  let r = src[y * u.width + xp].x;
  let d = src[ym * u.width + x].x;
  let uup = src[yp * u.width + x].x;
  let next = (l + r + d + uup + c.y) * 0.25;
  dst[i] = vec4f(next, c.y, c.z, c.w);
}
`;

/** Pigment diffusion with chromatography channel rates. */
export const STUDIO_LIVING_INK_WGSL_PIGMENT = /* wgsl */ `
${STUDIO_LIVING_INK_WGSL_COMMON}
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var<storage, read> wet: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let x = gid.x;
  let y = gid.y;
  let i = y * u.width + x;
  let mobility = clamp(wet[i].x, 0.0, 1.0);
  let diff = min(0.28, u.bleed * mobility * u.dt * 9.0);
  let dr = min(0.92, diff * u.chromaR);
  let dg = min(0.92, diff * u.chromaG);
  let db = min(0.92, diff * u.chromaB);
  let xm = select(x - 1u, x, x == 0u);
  let xp = select(x + 1u, x, x + 1u >= u.width);
  let ym = select(y - 1u, y, y == 0u);
  let yp = select(y + 1u, y, y + 1u >= u.height);
  let c = src[i];
  let n = (src[y * u.width + xm] + src[y * u.width + xp] + src[ym * u.width + x] + src[yp * u.width + x]) * 0.25;
  dst[i] = vec4f(
    mix(c.x, n.x, dr),
    mix(c.y, n.y, dg),
    mix(c.z, n.z, db),
    mix(c.w, n.w, min(0.92, diff * 1.05)),
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

export const STUDIO_LIVING_INK_WGSL_PASS_ORDER = Object.freeze([
  "clear",
  "splat",
  "jacobi",
  "pigment",
  "fix",
  "display",
] as const);

export type StudioLivingInkWgslPassId =
  (typeof STUDIO_LIVING_INK_WGSL_PASS_ORDER)[number];

export function studioLivingInkWgslSourceForPass(
  pass: StudioLivingInkWgslPassId,
): string {
  switch (pass) {
    case "clear":
      return STUDIO_LIVING_INK_WGSL_CLEAR;
    case "splat":
      return STUDIO_LIVING_INK_WGSL_SPLAT;
    case "jacobi":
      return STUDIO_LIVING_INK_WGSL_JACOBI;
    case "pigment":
      return STUDIO_LIVING_INK_WGSL_PIGMENT;
    case "fix":
      return STUDIO_LIVING_INK_WGSL_FIX;
    case "display":
      return STUDIO_LIVING_INK_WGSL_DISPLAY;
    default: {
      const _exhaustive: never = pass;
      return _exhaustive;
    }
  }
}

export function listStudioLivingInkWgslPassSources(): ReadonlyArray<{
  readonly id: StudioLivingInkWgslPassId;
  readonly source: string;
  readonly entryPoint: "main";
}> {
  return Object.freeze(
    STUDIO_LIVING_INK_WGSL_PASS_ORDER.map((id) =>
      Object.freeze({
        id,
        source: studioLivingInkWgslSourceForPass(id),
        entryPoint: "main" as const,
      }),
    ),
  );
}
