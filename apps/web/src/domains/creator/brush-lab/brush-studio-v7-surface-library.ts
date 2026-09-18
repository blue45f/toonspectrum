export interface BrushStudioV7SurfaceDescriptor {
  readonly id: string; readonly label: string;
  readonly family: "paper" | "canvas" | "prepared" | "organic" | "mineral";
  readonly description: string; readonly nominalAbsorbency: number; readonly nominalAnisotropy: number;
}
export interface BrushStudioV7SurfaceContact {
  readonly tooth: number; readonly localAbsorbency: number;
  readonly fiberAngle: number; readonly anisotropy: number;
}
const TAU = Math.PI * 2;
const unit = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
function field(x: number, y: number, seed: number, scaleX: number, scaleY: number, salt: number): number {
  const px = x / scaleX, py = y / scaleY; const ix = Math.floor(px), iy = Math.floor(py);
  const tx = px - ix, ty = py - iy; const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const top = hash(ix, iy, seed ^ salt) * (1 - sx) + hash(ix + 1, iy, seed ^ salt) * sx;
  const bottom = hash(ix, iy + 1, seed ^ salt) * (1 - sx) + hash(ix + 1, iy + 1, seed ^ salt) * sx;
  return top * (1 - sy) + bottom * sy;
}
const ridge = (value: number): number => 1 - Math.abs(value * 2 - 1);
const contact = (tooth: number, absorbency: number, fiberAngle = 0, anisotropy = 0): BrushStudioV7SurfaceContact =>
  Object.freeze({ tooth: unit(tooth), localAbsorbency: unit(absorbency), fiberAngle, anisotropy: unit(anisotropy) });
export const BRUSH_STUDIO_V7_ADVANCED_SURFACES: readonly BrushStudioV7SurfaceDescriptor[] = Object.freeze([
  { id: "surface-v7-hotpress", label: "Hot-press Satin", family: "paper", description: "매끈한 수채지 위 미세 압착 섬유와 낮은 이빨", nominalAbsorbency: 0.42, nominalAnisotropy: 0.18 },
  { id: "surface-v7-rough-watercolor", label: "Rough Watercolor", family: "paper", description: "큰 골과 작은 광물성 요철이 중첩된 거친 수채지", nominalAbsorbency: 0.82, nominalAnisotropy: 0.2 },
  { id: "surface-v7-laid-paper", label: "Laid Paper", family: "paper", description: "제지망의 촘촘한 laid line과 드문 chain line", nominalAbsorbency: 0.58, nominalAnisotropy: 0.78 },
  { id: "surface-v7-washi-kozo", label: "Kozo Washi", family: "organic", description: "닥 섬유의 길고 불규칙한 결이 살아 있는 화지", nominalAbsorbency: 0.88, nominalAnisotropy: 0.86 },
  { id: "surface-v7-sanded-pastel", label: "Sanded Pastel", family: "mineral", description: "미세 연마 입자와 큰 그릿이 함께 잡히는 파스텔지", nominalAbsorbency: 0.25, nominalAnisotropy: 0.08 },
  { id: "surface-v7-vellum", label: "Vellum Skin", family: "organic", description: "촘촘한 막질 미세결과 완만한 방향성을 가진 벨럼", nominalAbsorbency: 0.24, nominalAnisotropy: 0.34 },
  { id: "surface-v7-gesso-brush", label: "Brushed Gesso", family: "prepared", description: "젯소 붓자국의 긴 릿지와 작은 응집 입자", nominalAbsorbency: 0.34, nominalAnisotropy: 0.84 },
  { id: "surface-v7-canvas-heavy", label: "Heavy Canvas", family: "canvas", description: "굵은 날실·씨실과 교차 융기가 뚜렷한 캔버스", nominalAbsorbency: 0.38, nominalAnisotropy: 0.64 },
  { id: "surface-v7-newsprint", label: "Newsprint Pulp", family: "paper", description: "흡수성이 높은 펄프 덩어리와 짧은 섬유 얼룩", nominalAbsorbency: 0.94, nominalAnisotropy: 0.22 },
  { id: "surface-v7-kraft-fiber", label: "Kraft Fiber", family: "paper", description: "길게 눕는 갈색 크라프트 섬유와 압착결", nominalAbsorbency: 0.66, nominalAnisotropy: 0.72 },
  { id: "surface-v7-woodgrain", label: "Wood Grain", family: "organic", description: "완만히 휘는 목리와 단단한 성장륜 릿지", nominalAbsorbency: 0.3, nominalAnisotropy: 0.94 },
  { id: "surface-v7-stone-grit", label: "Stone Grit", family: "mineral", description: "석분 같은 불규칙 결정 입자와 낮은 다공성", nominalAbsorbency: 0.18, nominalAnisotropy: 0.12 },
] satisfies BrushStudioV7SurfaceDescriptor[]);
const ADVANCED_IDS = new Set(BRUSH_STUDIO_V7_ADVANCED_SURFACES.map((entry) => entry.id));
export function isBrushStudioV7AdvancedSurface(id: string): boolean { return ADVANCED_IDS.has(id); }
export function brushStudioV7AdvancedSurface(id: string): BrushStudioV7SurfaceDescriptor | undefined {
  return BRUSH_STUDIO_V7_ADVANCED_SURFACES.find((entry) => entry.id === id);
}
/** Legacy tooth formulas are preserved; V7-only IDs add absorbency and fiber direction. */
export function sampleBrushStudioV7SurfaceContact(
  surface: string, x: number, y: number, seed: number,
): BrushStudioV7SurfaceContact {
  const f = (scaleX: number, scaleY: number, salt: number): number => field(x, y, seed, scaleX, scaleY, salt);
  if (surface === "surface-smooth") return contact(0.08, 0.05);
  if (surface === "surface-linen") {
    const warp = Math.pow(0.5 + Math.sin(x * TAU / 7) * 0.5, 4);
    const weft = Math.pow(0.5 + Math.sin(y * TAU / 6) * 0.5, 4);
    return contact(0.1 + Math.max(warp, weft) * 0.7 + f(1, 1, 13) * 0.2, 0.24, 0, 0.55);
  }
  if (surface === "surface-coldpress") return contact(f(9, 9, 17) * 0.75 + f(1.3, 1.3, 29) * 0.25, 0.7);
  if (surface === "surface-porous") return contact(f(14, 1.4, 37) * 0.8 + f(2, 2, 41) * 0.2, 0.9, 0, 0.72);
  if (surface === "surface-printmaking") return contact(f(3, 5, 43) * 0.55 + f(0.65, 0.65, 47) * 0.45, 0.36, 0.2, 0.22);
  if (surface === "surface-kent" || !ADVANCED_IDS.has(surface)) {
    return contact(0.15 + f(1.4, 1.4, 53) * 0.6 + f(11, 0.8, 59) * 0.2, 0.42, 0, 0.28);
  }
  if (surface === "surface-v7-hotpress") {
    const micro = f(1.15, 1.15, 101), fiber = f(18, 2.4, 103);
    return contact(0.045 + micro * 0.13 + fiber * 0.1, 0.34 + fiber * 0.16, (f(30, 30, 107) - 0.5) * 0.24, 0.18);
  }
  if (surface === "surface-v7-rough-watercolor") {
    const basin = f(13, 13, 109), mineral = ridge(f(2.1, 2.1, 113)), pits = f(0.7, 0.7, 127);
    return contact(basin * 0.56 + mineral * 0.3 + pits * 0.14, 0.64 + (1 - basin) * 0.3, (f(24, 24, 131) - 0.5) * 0.7, 0.2);
  }
  if (surface === "surface-v7-laid-paper") {
    const laid = Math.pow(0.5 + Math.sin(y * TAU / 7.5) * 0.5, 5);
    const chain = Math.pow(0.5 + Math.sin(x * TAU / 31) * 0.5, 9);
    const pulp = f(2.2, 1.2, 137);
    return contact(0.1 + laid * 0.5 + chain * 0.2 + pulp * 0.2, 0.48 + pulp * 0.22, 0, 0.78);
  }
  if (surface === "surface-v7-washi-kozo") {
    const warp = (f(35, 8, 139) - 0.5) * 7;
    const fiber = Math.pow(0.5 + Math.sin((y + warp) * TAU / 12.5) * 0.5, 10);
    const pulp = f(9, 1.1, 149), knots = ridge(f(3.6, 3.6, 151));
    return contact(0.08 + fiber * 0.52 + pulp * 0.22 + knots * 0.16, 0.7 + pulp * 0.25, (f(42, 20, 157) - 0.5) * 0.34, 0.86);
  }
  if (surface === "surface-v7-sanded-pastel") {
    const grit = f(0.52, 0.52, 163), bed = f(2.7, 2.7, 167), sparkle = Math.pow(f(0.23, 0.23, 173), 5);
    return contact(0.2 + grit * 0.42 + bed * 0.22 + sparkle * 0.35, 0.18 + bed * 0.12, 0, 0.08);
  }
  if (surface === "surface-v7-vellum") {
    const skin = f(0.82, 1.4, 179), broad = f(16, 7, 181), angle = (f(32, 32, 191) - 0.5) * 0.8;
    return contact(0.06 + skin * 0.2 + broad * 0.12, 0.16 + broad * 0.16, angle, 0.34);
  }
  if (surface === "surface-v7-gesso-brush") {
    const warp = (f(28, 9, 193) - 0.5) * 5;
    const ridgeLine = Math.pow(0.5 + Math.sin((y + warp) * TAU / 5.6) * 0.5, 6);
    const clump = ridge(f(1.8, 2.6, 197));
    return contact(0.1 + ridgeLine * 0.62 + clump * 0.24, 0.24 + clump * 0.18, 0, 0.84);
  }
  if (surface === "surface-v7-canvas-heavy") {
    const warp = Math.pow(0.5 + Math.sin(x * TAU / 11) * 0.5, 6);
    const weft = Math.pow(0.5 + Math.sin(y * TAU / 9) * 0.5, 6);
    const knot = f(1.6, 1.6, 199);
    return contact(0.08 + Math.max(warp, weft) * 0.7 + knot * 0.2, 0.26 + knot * 0.2,
      warp > weft ? Math.PI / 2 : 0, 0.64);
  }
  if (surface === "surface-v7-newsprint") {
    const pulp = f(5.5, 3.5, 211), fiber = f(1.1, 4.8, 223), pore = f(0.65, 0.65, 227);
    return contact(0.08 + pulp * 0.38 + fiber * 0.24 + pore * 0.16, 0.78 + (1 - pulp) * 0.2, (fiber - 0.5) * 1.1, 0.22);
  }
  if (surface === "surface-v7-kraft-fiber") {
    const oriented = x * 0.22 + y;
    const fiber = Math.pow(0.5 + Math.sin(oriented * TAU / 10.5) * 0.5, 8);
    const pulp = f(14, 1.5, 229), press = f(3.3, 3.3, 233);
    return contact(0.1 + fiber * 0.48 + pulp * 0.25 + press * 0.16, 0.5 + pulp * 0.28, -0.22, 0.72);
  }
  if (surface === "surface-v7-woodgrain") {
    const bend = (f(34, 18, 239) - 0.5) * 10;
    const grain = Math.pow(0.5 + Math.sin((y + bend) * TAU / 8.2) * 0.5, 5);
    const pores = Math.pow(f(1.2, 4.5, 241), 4);
    return contact(0.07 + grain * 0.62 + pores * 0.24, 0.18 + pores * 0.22, 0, 0.94);
  }
  const crystal = ridge(f(1.1, 1.1, 251)), coarse = f(5.4, 5.4, 257), speck = Math.pow(f(0.32, 0.32, 263), 6);
  return contact(0.12 + crystal * 0.38 + coarse * 0.22 + speck * 0.42, 0.1 + coarse * 0.12, 0, 0.12);
}