import { describe, expect, it } from "vitest";

import { DAB_WGSL_STRUCT_FIELDS } from "../core/dab-layout";
import { IMPASTO_MIN_MASS } from "../raster/fine-raster";
import { IMPASTO_SPECULAR } from "../raster/reference-renderer";
import { IMPASTO_SHININESS } from "../wet/impasto";
import { LBM_CX, LBM_CY, LBM_LINK_CLASS, LBM_LINK_OWNER_IS_UPSTREAM, LBM_OPP, LBM_W } from "../wet/lbm-d2q9";
import { OIL_EPS, OIL_OPACITY_K, OIL_RELOAD, OIL_SIDE_GAIN } from "../wet/oil-layer";
import { PCH } from "../wet/padded";
import { WET_PHYSICS } from "../wet/params";
import { WET_CH, WET_CHANNELS as WET_STATE_CHANNELS, WET_EXT_CH } from "../wet/state";

import {
  BASE_ENTRIES,
  BINDING_WGSL_NAMES,
  BINDINGS,
  COMPUTE_ENTRY_ORDER,
  ENTRY_POINTS,
  GPU_TILE_SIZE,
  INDIRECT_MEMBERS,
  INDIRECT_WRITER_ENTRIES,
  INST_PARAMS_SCALARS,
  INSTANCED_BINDINGS,
  INSTANCED_BLIT_BINDINGS,
  OIL_DAB_MEMBERS,
  PARAMS_SCALARS,
  PRESENT_BINDINGS,
  TABLE_ARRAY_MEMBERS,
  TABLE_HEADER_MEMBERS,
  WET_BINDING_WGSL_NAMES,
  WET_BINDINGS,
  WET_CHANNELS,
  WET_ENTRY_FAMILY,
  WET_FAMILIES,
  WET_KERNEL_MEMBERS,
  WET_WORKGROUP_STORAGE_BYTES,
  WGSL_FORBIDDEN_IDENTIFIERS,
  WGSL_MIRROR_FUNCTIONS,
  WORKGROUP_1D,
} from "./layout";
import { familyStorageBufferCount } from "./wet-bindings";
import { BAKE_STROKE_WGSL } from "./wgsl/bake-stroke.wgsl";
import { BIN_COUNT_WGSL } from "./wgsl/bin-count.wgsl";
import { BIN_SCAN_WGSL } from "./wgsl/bin-scan.wgsl";
import { BIN_SCATTER_WGSL } from "./wgsl/bin-scatter.wgsl";
import { COMMON_TYPES_WGSL, COMMON_WGSL } from "./wgsl/common.wgsl";
import { FINE_RASTER_WGSL } from "./wgsl/fine-raster.wgsl";
import { INSTANCED_BLIT_WGSL, INSTANCED_DAB_WGSL } from "./wgsl/instanced-dab.wgsl";
import { PRESENT_WGSL } from "./wgsl/present.wgsl";
import { wetBindingsOf, wetModuleHeader } from "./wgsl/wet-common.wgsl";
import { WET_COMPOSITE_WGSL } from "./wgsl/wet-composite.wgsl";
import { WET_OIL_WGSL } from "./wgsl/wet-oil.wgsl";
import { WET_WATER_WGSL } from "./wgsl/wet-water.wgsl";

import type { EntryPointName, WetBindingName, WetEntryName, WetFamilyName } from "./layout";

/**
 * WGSL 정적 계약 검사(GPU 없는 Node). 컴파일은 브라우저 프로브가 하고, 여기서는 layout.ts 단일 원천과의
 * 드리프트(바인딩·워크그룹·진입점·struct 순서·미러 함수·예약어·원자 사용·가족별 바인딩 부분집합)를 잡는다.
 */
const BASE_MODULES: { name: string; code: string; entries: EntryPointName[] }[] = [
  { name: "bin-count", code: BIN_COUNT_WGSL, entries: ["binCount"] },
  { name: "bin-scan", code: BIN_SCAN_WGSL, entries: ["scanBlocks", "scanBlockSums", "scanAdd", "writeIndirect"] },
  { name: "bin-scatter", code: BIN_SCATTER_WGSL, entries: ["scatter"] },
  { name: "fine-raster", code: FINE_RASTER_WGSL, entries: ["smudgeCarry", "fineRaster"] },
  { name: "bake-stroke", code: BAKE_STROKE_WGSL, entries: ["bakeStroke"] },
];
const WET_MODULES: { name: string; code: string; entries: WetEntryName[]; families: WetFamilyName[] }[] = [
  {
    name: "wet-water",
    code: WET_WATER_WGSL,
    entries: ["wetSnapshot", "wetEdgeDelta", "wetStepWater", "wetExpand", "wetCommit", "wetSettleCheck"],
    families: ["waterStep", "listWriter"],
  },
  {
    name: "wet-oil",
    code: WET_OIL_WGSL,
    entries: ["oilShade", "oilReduce", "oilPush", "oilCarry", "oilDeposit", "oilStore", "oilSnapshot", "oilLevel", "oilDry"],
    families: ["oilWindow", "oilLevel"],
  },
  {
    name: "wet-composite",
    code: WET_COMPOSITE_WGSL,
    entries: ["compositeDirty", "compositeAll", "compositeWet", "compositeLinear", "bakeWet", "flattenOil"],
    families: ["composite", "compositeLinear", "flatten"],
  },
];
const COMPUTE_MODULES: { name: string; code: string; entries: EntryPointName[] }[] = [...BASE_MODULES, ...WET_MODULES];
const RENDER_MODULES: { name: string; code: string }[] = [
  { name: "present", code: PRESENT_WGSL },
  { name: "instanced-dab", code: INSTANCED_DAB_WGSL },
  { name: "instanced-blit", code: INSTANCED_BLIT_WGSL },
];
const ALL_MODULES = [...COMPUTE_MODULES, ...RENDER_MODULES];

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function bindingPairs(code: string): string[] {
  const out: string[] = [];
  const re = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<[^>]*>)?\s+(\w+)/g;
  let m: RegExpExecArray | null = re.exec(code);
  while (m) {
    out.push(`${m[1]}:${m[2]}:${m[3]}`);
    m = re.exec(code);
  }
  return out.sort();
}

function entryPoints(code: string, stage: "compute" | "vertex" | "fragment"): string[] {
  const re = new RegExp(`@${stage}[^]*?fn\\s+(\\w+)\\s*\\(`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null = re.exec(code);
  while (m) {
    out.push(m[1] ?? "");
    m = re.exec(code);
  }
  return out;
}

function workgroupSizes(code: string): string[] {
  const out: string[] = [];
  const re = /@workgroup_size\(([^)]*)\)/g;
  let m: RegExpExecArray | null = re.exec(code);
  while (m) {
    out.push((m[1] ?? "").replace(/\s+/g, ""));
    m = re.exec(code);
  }
  return out;
}

/** struct 본문을 최상위 쉼표로만 나눈다(`array<u32, 16384>`·`array<vec4<f32>, 16>` 안의 쉼표는 보존). */
function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "<") depth += 1;
    else if (ch === ">") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** `fn name(...) { ... }`의 본문(중괄호 균형)을 돌려준다. 없으면 빈 문자열. */
function functionBody(code: string, name: string): string {
  const start = code.search(new RegExp(`fn\\s+${name}\\s*\\(`));
  if (start < 0) return "";
  const open = code.indexOf("{", code.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    else if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  return "";
}

function structFields(code: string, name: string): string[] {
  const m = new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`).exec(code);
  if (!m) return [];
  return splitTopLevel(m[1] ?? "").map((s) => s.split(":")[0]?.trim() ?? "");
}

function structTypes(code: string, name: string): string[] {
  const m = new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`).exec(code);
  return splitTopLevel(m?.[1] ?? "").map((s) => s.split(":")[1]?.trim() ?? "");
}

/** 모듈의 모든 함수 이름. */
function definedFunctions(code: string): string[] {
  const out: string[] = [];
  const re = /fn\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null = re.exec(code);
  while (m) {
    out.push(m[1] ?? "");
    m = re.exec(code);
  }
  return out;
}

/** 진입점이 (호출 그래프를 따라) 도달하는 함수 본문 전체. */
function reachableBody(code: string, entry: string): string {
  const defined = new Set(definedFunctions(code));
  const seen = new Set<string>();
  const queue = [entry];
  let out = "";
  while (queue.length > 0) {
    const name = queue.pop() ?? "";
    if (seen.has(name)) continue;
    seen.add(name);
    const body = functionBody(code, name);
    out += `${body}\n`;
    const re = /\b(\w+)\s*\(/g;
    let m: RegExpExecArray | null = re.exec(body.slice(body.indexOf("{")));
    while (m) {
      const callee = m[1] ?? "";
      if (defined.has(callee) && !seen.has(callee)) queue.push(callee);
      m = re.exec(body.slice(body.indexOf("{")));
    }
  }
  return out;
}

describe("WGSL 계약: 템플릿 삽입", () => {
  it("모든 모듈에 삽입 실패 흔적(undefined/NaN/[object)이 없고 중괄호가 균형이다", () => {
    for (const m of ALL_MODULES) {
      expect(m.code, m.name).not.toMatch(/undefined|NaN|\[object/);
      const opens = (m.code.match(/\{/g) ?? []).length;
      const closes = (m.code.match(/\}/g) ?? []).length;
      expect(opens, `${m.name} braces`).toBe(closes);
      expect(m.code.length).toBeGreaterThan(500);
    }
  });

  it("상수가 layout.ts 값으로 삽입된다", () => {
    expect(COMMON_TYPES_WGSL).toContain(`const TILE_SIZE: u32 = ${GPU_TILE_SIZE}u;`);
    expect(COMMON_TYPES_WGSL).toContain(`const WORKGROUP_1D: u32 = ${WORKGROUP_1D}u;`);
    expect(COMMON_TYPES_WGSL).toContain(`const WET_CHANNELS: u32 = ${WET_CHANNELS}u;`);
    expect(WET_CHANNELS).toBe(WET_STATE_CHANNELS);
  });

  it("습식 코어 채널 상수가 wet/state.ts WET_CH와 같다", () => {
    const expectChannel = (ident: string, ch: number): void => {
      expect(COMMON_TYPES_WGSL).toContain(`const ${ident}: u32 = ${ch}u;`);
    };
    expectChannel("WET_CH_WATER", WET_CH.water);
    expectChannel("WET_CH_VX", WET_CH.velocityX);
    expectChannel("WET_CH_VY", WET_CH.velocityY);
    expectChannel("WET_CH_PIG_R", WET_CH.pigmentR);
    expectChannel("WET_CH_PIG_MASS", WET_CH.pigmentMass);
    expectChannel("WET_CH_HEIGHT", WET_CH.height);
    expectChannel("WET_CH_FIX_R", WET_CH.fixedR);
    expectChannel("WET_CH_FIX_MASS", WET_CH.fixedMass);
  });

  it("확장 풀·스냅샷 채널 상수가 wet/state.ts WET_EXT_CH·wet/padded.ts PCH와 같다", () => {
    const header = wetModuleHeader(["waterStep"]);
    const u32 = (ident: string, v: number): void => {
      expect(header, ident).toContain(`const ${ident}: u32 = ${v}u;`);
    };
    u32("EXT_F0", WET_EXT_CH.lbm0);
    u32("EXT_RHO", WET_EXT_CH.rho);
    u32("EXT_CAP", WET_EXT_CH.capillary);
    u32("EXT_CURE", WET_EXT_CH.cure);
    u32("EXT_HARD_R", WET_EXT_CH.hardR);
    u32("EXT_HARD_MASS", WET_EXT_CH.hardMass);
    u32("EXT_OIL_R", WET_EXT_CH.oilR);
    u32("EXT_OIL_WET", WET_EXT_CH.oilWet);
    u32("EXT_OIL_BASE", WET_EXT_CH.oilBase);
    u32("EXT_BLUR", WET_EXT_CH.wetBlur);
    u32("PCH_F0", PCH.f0);
    u32("PCH_RHO", PCH.rho);
    u32("PCH_WS", PCH.ws);
    u32("PCH_S", PCH.s);
    u32("PCH_G0", PCH.g0);
    u32("PCH_UX", PCH.ux);
    u32("PCH_UY", PCH.uy);
    u32("PCH_DELTA", PCH.delta);
    u32("PCH_B", PCH.b);
  });

  it("WET_PHYSICS·D2Q9 상수가 CPU 단일 원천 값으로 삽입된다", () => {
    const header = wetModuleHeader(["waterStep"]);
    const f32 = (ident: string, v: number): void => {
      const m = new RegExp(`const\\s+${ident}\\s*:\\s*f32\\s*=\\s*([-+0-9.eE]+)\\s*;`).exec(header);
      expect(m, ident).not.toBeNull();
      expect(Math.fround(Number(m?.[1])), ident).toBe(Math.fround(v));
    };
    f32("U_MAX", WET_PHYSICS.uMax);
    f32("RHO_FULL", WET_PHYSICS.rhoFull);
    f32("RHO_MIN", WET_PHYSICS.rhoMin);
    f32("WATER_EPS", WET_PHYSICS.waterEps);
    f32("SURFACE_CAP", WET_PHYSICS.surfaceCap);
    f32("KAPPA_MAX", WET_PHYSICS.kappaMax);
    f32("FIBER_INV_L", 1 / WET_PHYSICS.fiberLengthPx);
    f32("FIBER_INV_W", 1 / WET_PHYSICS.fiberWidthPx);
    f32("BLUR_KEEP_WET", WET_PHYSICS.wetBlurKeepWet);
    f32("BLUR_KEEP_DRY", WET_PHYSICS.wetBlurKeepDry);
    f32("BLUR_FULL", WET_PHYSICS.wetBlurFull);
    f32("BLUR_WAKE", WET_PHYSICS.wetBlurWake);
    f32("ACCEL_MAX", WET_PHYSICS.accelMax);
    f32("FACE_OUT_MAX", WET_PHYSICS.faceOutMax);
    f32("DIAG_OUT_MAX", WET_PHYSICS.diagOutMax);
    f32("THIN_BOOST", WET_PHYSICS.thinBoost);
    f32("DEPTH_REF", WET_PHYSICS.depthRef);
    f32("DRY_BRUSH_DEPTH", WET_PHYSICS.dryBrushDepth);
    f32("PIN_SPEED_REF", WET_PHYSICS.pinSpeedRef);
    f32("PIN_STATIC", WET_PHYSICS.pinStaticFraction);
    f32("CAPACITY_BASE", WET_PHYSICS.capacityBase);
    f32("CAPACITY_SPAN", WET_PHYSICS.capacitySpan);
    f32("OIL_EPS", OIL_EPS);
    f32("OIL_OPACITY_K", OIL_OPACITY_K);
    f32("OIL_RELOAD", OIL_RELOAD);
    f32("OIL_SIDE_GAIN", OIL_SIDE_GAIN);
    const arr = (ident: string): string[] => {
      const m = new RegExp(`const\\s+${ident}\\s*=\\s*array<\\w+,\\s*9>\\(([^)]*)\\)`).exec(header);
      return (m?.[1] ?? "").split(",").map((t) => t.trim());
    };
    expect(arr("LBM_CX").map(Number)).toEqual([...LBM_CX]);
    expect(arr("LBM_CY").map(Number)).toEqual([...LBM_CY]);
    expect(arr("LBM_OPP").map((t) => Number(t.replace("u", "")))).toEqual([...LBM_OPP]);
    expect(arr("LBM_CLASS").map((t) => Number(t.replace("u", "")))).toEqual([...LBM_LINK_CLASS]);
    expect(arr("LBM_UPSTREAM").map((t) => Number(t.replace("u", "")))).toEqual(LBM_LINK_OWNER_IS_UPSTREAM.map((b) => (b ? 1 : 0)));
    expect(arr("LBM_W").map((t) => Math.fround(Number(t)))).toEqual(LBM_W.map((w) => Math.fround(w)));
    // 곱셈 3회 거듭제곱의 지수는 CPU FIBER_ANGLE_POWER = 6이다.
    expect(header).toContain("const FIBER_ANGLE_POWER_CHECK: u32 = 6u;");
  });

  it("det_sin/det_cos는 wet/det-math.ts와 같은 11차 테일러 계수·범위 축소를 쓴다(sin/cos 내장 함수 금지)", () => {
    const body = functionBody(stripComments(COMMON_TYPES_WGSL), "det_sin");
    expect(body).toMatch(/floor\(x \/ [\d.]+ \+ 0\.5\)/);
    const coeffs = [-1 / 6, 1 / 120, -1 / 5040, 1 / 362880, -1 / 39916800].map((c) => String(c));
    for (const c of coeffs) expect(body, c).toContain(c);
    expect(body).not.toMatch(/\bsin\(|\bcos\(/);
    expect(functionBody(stripComments(COMMON_TYPES_WGSL), "det_cos")).toMatch(/det_sin\(x \+ /);
  });
});

describe("WGSL 계약: 바인딩·struct", () => {
  it("기본 compute 모듈의 @group/@binding이 BINDINGS와 정확히 일치한다(불필요 바인딩 없음)", () => {
    const expected = (Object.keys(BINDINGS) as (keyof typeof BINDINGS)[])
      .map((n) => `${BINDINGS[n].group}:${BINDINGS[n].binding}:${BINDING_WGSL_NAMES[n]}`)
      .sort();
    for (const m of BASE_MODULES) {
      expect(bindingPairs(stripComments(m.code)), m.name).toEqual(expected);
    }
    // 같은 group 안에서 binding 번호가 겹치지 않는다.
    const seen = new Set<string>();
    for (const n of Object.keys(BINDINGS) as (keyof typeof BINDINGS)[]) {
      const key = `${BINDINGS[n].group}:${BINDINGS[n].binding}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("습식 compute 모듈의 @group/@binding이 담은 가족(WET_FAMILIES)의 바인딩 합집합과 정확히 일치한다", () => {
    for (const m of WET_MODULES) {
      const names = wetBindingsOf(m.families);
      const expected = names.map((n) => `${groupOf(n)}:${bindingOf(n)}:${WET_BINDING_WGSL_NAMES[n]}`).sort();
      expect(bindingPairs(stripComments(m.code)), m.name).toEqual(expected);
    }
  });

  it("습식 바인딩 번호가 group 안에서 겹치지 않고 group 3(확장 풀·스냅샷·종이·커널·스크래치·표시)을 쓴다", () => {
    const names = Object.keys(WET_BINDING_WGSL_NAMES) as WetBindingName[];
    const seen = new Set<string>();
    for (const n of names) {
      const key = `${groupOf(n)}:${bindingOf(n)}`;
      expect(seen.has(key), `${n} ${key}`).toBe(false);
      seen.add(key);
    }
    expect(names.filter((n) => groupOf(n) === 3).sort()).toEqual(["displayLinear", "oilScratch", "paperWet", "wetExt", "wetKernel", "wetSnap"]);
    // 기본 표와 이름·번호가 겹치는 바인딩은 같은 값이다(WGSL 헬퍼 공유).
    for (const n of ["params", "dabs", "table", "strokePool", "wetPool", "document", "tipAtlas", "paperTex", "linSampler", "presentTex", "indirect"] as const) {
      expect(`${groupOf(n)}:${bindingOf(n)}`, n).toBe(`${BINDINGS[n].group}:${BINDINGS[n].binding}`);
    }
  });

  it("모든 습식 가족의 compute storage 버퍼는 8개 이하(기본 한도 8)이고 간접 인자는 listWriter에만 있다", () => {
    for (const family of Object.keys(WET_FAMILIES) as WetFamilyName[]) {
      expect(familyStorageBufferCount(family), family).toBeLessThanOrEqual(8);
      const hasIndirect = (WET_FAMILIES[family] as readonly string[]).includes("indirect");
      expect(hasIndirect, family).toBe(family === "listWriter");
    }
    const baseStorage = Object.values(BINDINGS).filter((b) => b.kind === "storage-read" || b.kind === "storage-rw").length;
    expect(baseStorage).toBeLessThanOrEqual(8);
    expect(COMMON_WGSL).toContain("var<storage, read> dabs: array<Dab>");
    expect(COMMON_WGSL).not.toMatch(/var<storage, read_write> dabs/);
    // 확장 풀·스냅샷·스크래치·종이는 기본 가족에 없다(바인딩 8개 한계 때문에 습식 가족의 별도 레이아웃에만 있다).
    for (const n of ["wetExt", "wetSnap", "paperWet", "oilScratch"] as const) expect(n in BINDINGS).toBe(false);
  });

  it("모든 진입점은 자기 가족의 바인딩만 호출 그래프 안에서 쓴다(바인딩 ⊆ 가족)", () => {
    for (const m of WET_MODULES) {
      const code = stripComments(m.code);
      const all = Object.keys(WET_BINDING_WGSL_NAMES) as WetBindingName[];
      for (const entry of m.entries) {
        const family = WET_ENTRY_FAMILY[entry];
        const allowed = new Set(WET_FAMILIES[family] as readonly WetBindingName[]);
        const body = reachableBody(code, ENTRY_POINTS[entry]);
        expect(body.length, `${m.name}:${entry}`).toBeGreaterThan(0);
        for (const n of all) {
          const used = new RegExp(`\\b${WET_BINDING_WGSL_NAMES[n]}\\b`).test(body);
          if (used) expect(allowed.has(n), `${m.name}:${ENTRY_POINTS[entry]}이(가) 가족 ${family}에 없는 바인딩 ${n}을 쓴다`).toBe(true);
        }
      }
    }
  });

  it("간접 인자(indirect_args, group 2)는 INDIRECT_WRITER_ENTRIES의 호출 그래프에서만 쓴다(INDIRECT/쓰기 storage usage scope 분리)", () => {
    const writers = new Set(INDIRECT_WRITER_ENTRIES.map((e) => ENTRY_POINTS[e]));
    for (const m of COMPUTE_MODULES) {
      const code = stripComments(m.code);
      for (const e of m.entries) {
        const name = ENTRY_POINTS[e];
        const uses = /\bindirect_args\b/.test(reachableBody(code, name));
        expect(uses, `${m.name}:${name}`).toBe(writers.has(name as never));
      }
    }
    const all = COMPUTE_MODULES.flatMap((m) => m.entries.map((e) => ENTRY_POINTS[e]));
    for (const w of writers) expect(all).toContain(w);
    expect(BINDINGS.indirect).toEqual({ group: 2, binding: 0, kind: "storage-rw" });
  });

  it("유화 dab 레코드(oil_dab, group 2 동적 uniform)는 oilWindow 가족 진입점에서만 쓴다", () => {
    const oilWindowEntries = new Set(WET_MODULES.flatMap((m) => m.entries).filter((e) => WET_ENTRY_FAMILY[e] === "oilWindow").map((e) => ENTRY_POINTS[e]));
    for (const m of COMPUTE_MODULES) {
      const code = stripComments(m.code);
      for (const e of m.entries) {
        const name = ENTRY_POINTS[e];
        const uses = /\boil_dab\b/.test(reachableBody(code, name));
        if (oilWindowEntries.has(name as never)) {
          // 셰이드·합계·밀기·붓 색·침착·되쓰기가 모두 레코드를 읽는다(창·방향·벌).
          expect(uses, name).toBe(true);
        } else expect(uses, `${m.name}:${name}`).toBe(false);
      }
    }
  });

  it("present·instanced 모듈은 자기 바인딩 표만 쓴다", () => {
    expect(bindingPairs(stripComments(PRESENT_WGSL))).toEqual(
      [PRESENT_BINDINGS.source, PRESENT_BINDINGS.sampler].map((b) => `${b.group}:${b.binding}:${b.name}`).sort(),
    );
    expect(bindingPairs(stripComments(INSTANCED_DAB_WGSL))).toEqual(
      Object.values(INSTANCED_BINDINGS).map((b) => `${b.group}:${b.binding}:${b.name}`).sort(),
    );
    expect(bindingPairs(stripComments(INSTANCED_BLIT_WGSL))).toEqual(
      Object.values(INSTANCED_BLIT_BINDINGS).map((b) => `${b.group}:${b.binding}:${b.name}`).sort(),
    );
  });

  it("struct Dab 필드 순서 = DAB_WGSL_STRUCT_FIELDS", () => {
    expect(structFields(COMMON_TYPES_WGSL, "Dab")).toEqual([...DAB_WGSL_STRUCT_FIELDS]);
  });

  it("struct Params 필드 순서 = PARAMS_SCALARS(+패딩) + edge_curve (기본·습식 머리말 모두)", () => {
    for (const src of [COMMON_WGSL, wetModuleHeader(["waterStep"]), wetModuleHeader(["composite"])]) {
      const fields = structFields(src, "Params");
      const scalars = PARAMS_SCALARS.map(([n]) => n);
      expect(fields.slice(0, scalars.length)).toEqual(scalars);
      expect(fields[fields.length - 1]).toBe("edge_curve");
      const pad = fields.slice(scalars.length, -1);
      expect(pad.every((p) => p.startsWith("pad_"))).toBe(true);
      expect((scalars.length + pad.length) % 4).toBe(0);
    }
    const inst = structFields(INSTANCED_DAB_WGSL, "InstParams");
    expect(inst).toEqual([...INST_PARAMS_SCALARS.map(([n]) => n), "edge_curve"]);
  });

  it("struct TileTable 멤버 순서 = TABLE_HEADER_MEMBERS + TABLE_ARRAY_MEMBERS", () => {
    const expected = [...TABLE_HEADER_MEMBERS.map(([n]) => n), ...TABLE_ARRAY_MEMBERS.map(([n]) => n)];
    expect(structFields(COMMON_WGSL, "TileTable")).toEqual(expected);
    expect(structFields(wetModuleHeader(["waterStep"]), "TileTable")).toEqual(expected);
  });

  it("struct IndirectArgs 멤버 순서 = INDIRECT_MEMBERS", () => {
    expect(structFields(COMMON_WGSL, "IndirectArgs")).toEqual(INDIRECT_MEMBERS.map(([n]) => n));
    expect(structFields(wetModuleHeader(["listWriter"]), "IndirectArgs")).toEqual(INDIRECT_MEMBERS.map(([n]) => n));
  });

  it("struct WetKernel 멤버 순서·타입 = WET_KERNEL_MEMBERS(+16 B 패딩)", () => {
    const header = wetModuleHeader(["waterStep"]);
    const fields = structFields(header, "WetKernel");
    expect(fields.slice(0, WET_KERNEL_MEMBERS.length)).toEqual(WET_KERNEL_MEMBERS.map(([n]) => n));
    expect(structTypes(header, "WetKernel").slice(0, WET_KERNEL_MEMBERS.length)).toEqual(WET_KERNEL_MEMBERS.map(([, t]) => t));
    expect(fields.slice(WET_KERNEL_MEMBERS.length).every((p) => p.startsWith("pad_"))).toBe(true);
    expect(fields.length % 4).toBe(0);
  });

  it("struct OilDab 멤버 순서·타입 = OIL_DAB_MEMBERS", () => {
    const header = wetModuleHeader(["oilWindow"]);
    expect(structFields(header, "OilDab")).toEqual(OIL_DAB_MEMBERS.map(([n]) => n));
    expect(structTypes(header, "OilDab")).toEqual(OIL_DAB_MEMBERS.map(([, t]) => t));
  });
});

describe("WGSL 계약: 진입점·워크그룹", () => {
  it("compute 진입점 이름이 ENTRY_POINTS와 1:1이고 COMPUTE_ENTRY_ORDER를 모두 덮는다", () => {
    const all = new Set<string>();
    for (const m of COMPUTE_MODULES) {
      const found = entryPoints(stripComments(m.code), "compute");
      expect(found, m.name).toEqual(m.entries.map((e) => ENTRY_POINTS[e]));
      for (const e of found) {
        expect(all.has(e), `duplicate entry ${e}`).toBe(false);
        all.add(e);
      }
    }
    expect([...all].sort()).toEqual(COMPUTE_ENTRY_ORDER.map((e) => ENTRY_POINTS[e]).sort());
    expect(entryPoints(stripComments(PRESENT_WGSL), "vertex")).toEqual([ENTRY_POINTS.presentVs]);
    expect(entryPoints(stripComments(PRESENT_WGSL), "fragment")).toEqual([ENTRY_POINTS.presentFs]);
    expect(entryPoints(stripComments(INSTANCED_DAB_WGSL), "vertex")).toEqual([ENTRY_POINTS.instancedVs]);
    expect(entryPoints(stripComments(INSTANCED_DAB_WGSL), "fragment")).toEqual([ENTRY_POINTS.instancedFs]);
    expect(entryPoints(stripComments(INSTANCED_BLIT_WGSL), "fragment")).toEqual([
      ENTRY_POINTS.instancedBakeFs,
      ENTRY_POINTS.instancedEncodeFs,
    ]);
  });

  it("모든 compute 진입점은 기본 가족(BASE_ENTRIES) 또는 습식 가족(WET_ENTRY_FAMILY) 중 정확히 한쪽에 속한다", () => {
    const base = new Set<string>(BASE_ENTRIES);
    const wet = new Set<string>(Object.keys(WET_ENTRY_FAMILY));
    for (const e of COMPUTE_ENTRY_ORDER) expect(base.has(e) !== wet.has(e), e).toBe(true);
    expect(base.size + wet.size).toBe(COMPUTE_ENTRY_ORDER.length);
  });

  it("진입점은 snake_case다", () => {
    for (const name of Object.values(ENTRY_POINTS)) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("워크그룹 크기는 256(1D) 또는 (16,16,1)(타일) 또는 1(단일)만 쓴다", () => {
    const allowed = new Set([`${WORKGROUP_1D}`, `${GPU_TILE_SIZE},${GPU_TILE_SIZE},1`, "1"]);
    for (const m of COMPUTE_MODULES) {
      const sizes = workgroupSizes(stripComments(m.code));
      expect(sizes.length, m.name).toBe(m.entries.length);
      for (const s of sizes) expect(allowed.has(s), `${m.name}: ${s}`).toBe(true);
    }
    expect(workgroupSizes(FINE_RASTER_WGSL)).toEqual([`${WORKGROUP_1D}`, `${GPU_TILE_SIZE},${GPU_TILE_SIZE},1`]);
    expect(workgroupSizes(BIN_SCATTER_WGSL)).toEqual([`${WORKGROUP_1D}`]);
  });

  it("활성 목록 확정(wet_commit)·정착 검사는 단일 워크그룹 계열이고 타일 커널은 (16,16,1)이다", () => {
    const code = stripComments(WET_WATER_WGSL);
    const sizeOf = (name: string): string => /@workgroup_size\(([^)]*)\)\s*fn\s+/.exec(code.slice(code.lastIndexOf("@compute", code.indexOf(`fn ${name}(`))))?.[1]?.replace(/\s+/g, "") ?? "";
    expect(sizeOf("wet_commit")).toBe(`${WORKGROUP_1D}`);
    expect(sizeOf("wet_settle_check")).toBe("1");
    for (const n of ["wet_snapshot", "wet_edge_delta", "wet_step_water", "wet_expand"]) expect(sizeOf(n), n).toBe(`${GPU_TILE_SIZE},${GPU_TILE_SIZE},1`);
    // 공유 메모리: 종이 파생 18×18 배열 6종 + 슬롯 맵이 기본 한도(16 KiB) 안이다.
    const shared = [...code.matchAll(/var<workgroup>\s+\w+:\s*array<(\w+),\s*(\d+)>/g)].reduce((a, m) => a + Number(m[2]) * 4, 0);
    expect(shared).toBeLessThanOrEqual(WET_WORKGROUP_STORAGE_BYTES);
  });
});

/** `const NAME: f32 = <literal>;`의 리터럴을 f32로 읽는다. */
function f32Const(code: string, name: string): number | null {
  const m = new RegExp(`const\\s+${name}\\s*:\\s*f32\\s*=\\s*([-+0-9.eE]+)\\s*;`).exec(code);
  return m ? Math.fround(Number(m[1])) : null;
}

describe("WGSL 계약: 수채 물 스텝(결정성·gather 전용)", () => {
  const code = stripComments(WET_WATER_WGSL);

  it("물 스텝 결과 경로는 pow·sin·cos 내장 함수를 쓰지 않는다(곱셈·det_sin/det_cos만)", () => {
    const body = code.slice(stripComments(wetModuleHeader(["waterStep", "listWriter"])).length);
    expect(body).not.toMatch(/\bpow\(|\bsin\(|\bcos\(/);
    expect(body).toMatch(/det_cos\(dir\)/);
    expect(body).toMatch(/det_sin\(dir\)/);
    // 종이 파생 κ: |cos φ|^6 = (dot²)³ 곱셈 3회.
    expect(functionBody(code, "paper_cell")).toMatch(/d2 \* d2 \* d2/);
  });

  it("스냅샷·에지 Δ·물 스텝 본문에는 활성 목록·슬롯을 바꾸는 원자 연산이 없다(타일 순서 무관·자기 셀 쓰기)", () => {
    for (const name of ["wet_snapshot", "wet_edge_delta", "wet_step_water"]) {
      const body = reachableBody(code, name);
      expect(body, name).not.toMatch(/atomicAdd|atomicCompareExchange|atomicMax|atomicMin|atomicSub|atomicExchange/);
      expect(body, name).not.toMatch(/wet_slots\[[^\]]*\]\s*=|atomicStore\(&table\.wet_slots/);
    }
    // step은 workgroup 원자(keep 합류)와 live_next 기록만 한다.
    const step = reachableBody(code, "wet_step_water");
    expect(step).toMatch(/atomicOr\(&wg_keep/);
    expect(step).toMatch(/atomicStore\(&table\.wet_live_next\[tile\]/);
  });

  it("이웃 읽기는 스냅샷(sa)에서 하고 풀에는 자기 셀(lane)만 쓴다", () => {
    const body = reachableBody(code, "wet_step_water");
    const poolWrites = [...body.matchAll(/wet_(?:pool|ext)\[([^[\]]*)\]\s*=/g)];
    expect(poolWrites.length).toBeGreaterThan(20);
    for (const w of poolWrites) expect(w[1], w[0]).toMatch(/slot, [A-Za-z0-9_ +]+, lane\)/);
    // 이웃 슬롯은 3×3 맵에서만 얻는다.
    expect(functionBody(code, "pad_slot")).toMatch(/wg_slots\[/);
  });

  it("벽 규칙: 이웃 타일은 격자 안 + 활성(live) + 슬롯 할당이어야 유효하다", () => {
    const header = stripComments(wetModuleHeader(["waterStep"]));
    const body = functionBody(header, "live_slot_at_tile");
    expect(body).toMatch(/tx >= i32\(params\.tiles_x\)/);
    expect(body).toMatch(/table\.wet_live\[t\] == 0u/);
    expect(body).toMatch(/s == SLOT_RESERVED/);
  });

  it("step의 10단계(블러·LBM·가속·속도·충돌·모세관·표면층·증발·안료·침착·경화)가 CPU stepTile 순서로 있다", () => {
    const raw = WET_WATER_WGSL;
    let at = -1;
    for (const marker of ["(0) 젖음 블러", "(1) LBM", "(2) 체적 가속", "(3) 속도", "(4) 충돌", "(5) 모세관층", "(6) 표면층", "(7) 증발", "(8) 안료", "(9) 침착", "(10) 경화"]) {
      const next = raw.indexOf(marker);
      expect(next, marker).toBeGreaterThan(at);
      at = next;
    }
  });

  it("wet_commit은 단일 워크그룹 고정 순서 스캔으로 활성 타일을 압축하고 간접 인자를 쓴다", () => {
    const body = functionBody(code, ENTRY_POINTS.wetCommit);
    expect(body).toMatch(/workgroup_exclusive_scan\(flag, lane\)/);
    expect(body).toMatch(/indirect_args\.wet_live = /);
    expect(body).not.toMatch(/atomicAdd/);
  });

  it("wet_expand는 4면 + 4모서리(대각) 이웃을 활성화한다(CPU expandActive)", () => {
    const body = functionBody(code, ENTRY_POINTS.wetExpand);
    for (const bit of ["1u", "2u", "4u", "8u", "16u", "32u", "64u", "128u"]) expect(body, bit).toContain(`bits | ${bit}`);
    expect(body).toMatch(/WET_EPS/);
  });
});

describe("WGSL 계약: 유화 dab 순서 처리·서브스텝", () => {
  const code = stripComments(WET_OIL_WGSL);

  it("셰이드는 shadeDabPixel과 같은 dab_coverage 한 곳에서 오고 amount·dep·weight가 CPU 식(cm·push / cm·grain·flow·mass)이다", () => {
    expect(functionBody(code, "oil_dab_shade")).toMatch(/dab_coverage\(/);
    const shade = functionBody(code, ENTRY_POINTS.oilShade);
    expect(shade).toMatch(/let cm = cv\.cov \* cv\.mask;/);
    expect(shade).toMatch(/amount = cm \* wet_kernel\.oil_push;/);
    expect(shade).toMatch(/dep_v = cm \* cv\.grain \* d\.flow \* mass;/);
    expect(shade).toMatch(/max\(IMPASTO_MIN_MASS, dab_pigment_mass\(d\)\)/);
    expect(shade).toMatch(/OIL_SIDE_GAIN \* lat/);
  });

  it("밀기는 gather(자기 셀 쓰기)이고 이웃 순서 (−1,0)·(+1,0)·(0,−1)·(0,+1)·KM 혼색·창 안 목표만 쓴다", () => {
    const body = functionBody(code, ENTRY_POINTS.oilPush);
    expect(body).toMatch(/if \(k == 0u\) \{ sx = wx - 1; \}/);
    expect(body).toMatch(/if \(k == 1u\) \{ sx = wx \+ 1; \}/);
    expect(body).toMatch(/if \(k == 2u\) \{ sy = wy - 1; \}/);
    expect(body).toMatch(/if \(k == 3u\) \{ sy = wy \+ 1; \}/);
    expect(body).toMatch(/km_mix\(vec3<f32>\(cr, cg, cb\), qc, t\)/);
    expect(body).not.toMatch(/atomic/);
    // 읽기 벌(src)과 쓰기 벌(dst)이 다르다(창 전체를 한 번에 읽고 한 번에 쓴다).
    expect(body).toMatch(/let dst = 1u - src;/);
    expect(functionBody(code, "push_out")).toMatch(/nx >= ww \|\| ny >= wh/);
  });

  it("붓 색 갱신은 단일 워크그룹 고정 트리 리덕션이고 첫 dab은 dab 색을 싣는다", () => {
    const body = functionBody(code, ENTRY_POINTS.oilCarry);
    expect(body).toMatch(/for \(var s = 128u; s > 0u; s = s >> 1u\)/);
    expect(body).toMatch(/OIL_RELOAD/);
    expect(body).toMatch(/oil_scratch\[3u\] == 0\.0/);
    expect(functionBody(code, ENTRY_POINTS.oilReduce)).toMatch(/oil_scratch\[13u\] = red_b\[0\]/);
  });

  it("레벨링은 이웃 순서 W·E·N·S, 항복 높이·1/4 한도, 건조는 모든 할당 타일에서 정착 종료 후 건너뛴다", () => {
    const level = functionBody(code, ENTRY_POINTS.oilLevel);
    expect(level).toMatch(/0\.25 \* m/);
    expect(level).toMatch(/0\.25 \* mq/);
    expect(level).toMatch(/- yield_h/);
    const dry = functionBody(code, ENTRY_POINTS.oilDry);
    expect(dry).toMatch(/table\.wet_settle_done != 0u/);
    expect(dry).toMatch(/wet_active_tiles\[wid\.x\]/);
  });

  it("셰이더가 any(dab가 닿는 셀)가 없으면 밀기·침착·되쓰기를 건너뛴다(CPU `if (!any) continue`)", () => {
    for (const e of [ENTRY_POINTS.oilPush, ENTRY_POINTS.oilDeposit, ENTRY_POINTS.oilStore]) {
      expect(functionBody(code, e), e).toMatch(/oil_scratch\[13u\] <= 0\.0\) \{ return; \}/);
    }
    // oil_carry는 barrier가 뒤따르므로 이른 return 대신 any_hit으로 감싼다(균일 제어 흐름).
    expect(functionBody(code, ENTRY_POINTS.oilCarry)).toMatch(/let any_hit = oil_scratch\[13u\] > 0\.0;/);
  });
});

describe("WGSL 계약: 래스터 계약 3건(wetOnly·안료 질량×grainResp·임파스토 dab 제외)", () => {
  const code = stripComments(FINE_RASTER_WGSL);
  const raster = functionBody(code, ENTRY_POINTS.fineRaster);

  it("wet-flow + 습식 상태이면 획 레이어에 쓰지 않는다(wetOnly), 습식 상태가 없으면 종전처럼 쓴다", () => {
    expect(raster).toMatch(/let wet_only = wet_on && dep == DEP_WET_FLOW;/);
    expect(raster).toMatch(/if \(!wet_only\) \{ acc = sh\.src \+ acc \* \(1\.0 - sh\.src\.a\); \}/);
    expect(raster).toMatch(/let wet_on = params\.wet_enabled != 0u;/);
  });

  it("안료 질량은 pigmentMass·cov·mask·grainResp이고 물은 wet·cov 그대로다", () => {
    expect(raster).toMatch(/let mass = dab_pigment_mass\(d\) \* sh\.cov \* sh\.mask \* sh\.grain;/);
    expect(raster).toMatch(/wet_pool\[iw\] = wet_pool\[iw\] \+ d\.wet \* sh\.cov;/);
  });

  it("임파스토 dab는 타일 래스터에서 건너뛴다(색·부피는 유화 층이 처리)", () => {
    expect(raster).toMatch(/if \(dab_has_flag\(d, FLAG_IMPASTO\)\) \{ continue; \}/);
  });

  it("종이 그레인은 필터 없는 f32 텍스처를 textureLoad 4탭으로 직접 쌍선형 보간한다(하드웨어 필터 가중치·8비트 양자화 없음)", () => {
    const common = stripComments(COMMON_WGSL);
    const sample = functionBody(common, "paper_sample_spec");
    expect(sample).not.toMatch(/textureSample/);
    expect(common).toMatch(/fn paper_texel_at\(i: i32, j: i32\) -> vec4<f32> \{\s*return textureLoad\(paper_tex, vec2<i32>\(paper_wrap\(i\), paper_wrap\(j\)\), 0\);/);
    // CPU sampleChannel: 텍셀 중심 기준(−0.5), 4탭 wrap, 가로 → 세로 보간.
    expect(sample).toMatch(/let fx = tx - 0\.5;/);
    for (const tap of ["x0, y0", "x0 \\+ 1, y0", "x0, y0 \\+ 1", "x0 \\+ 1, y0 \\+ 1"]) expect(sample).toMatch(new RegExp(`paper_texel_at\\(${tap}\\)`));
    // 모든 컴퓨트 모듈이 종이 샘플링에 하드웨어 샘플러를 쓰지 않는다.
    for (const m of COMPUTE_MODULES) expect(stripComments(m.code), m.name).not.toMatch(/textureSampleLevel\(paper_tex/);
  });

  it("dab 각도·종이 회전은 내장 sin/cos(WebGPU 허용 오차 2^-11) 대신 rot_cs(det_sin/det_cos, 각도 0은 정확히 (1, 0))를 쓴다", () => {
    const common = stripComments(COMMON_WGSL);
    expect(functionBody(common, "rot_cs")).toMatch(/if \(a == 0\.0\) \{ return vec2<f32>\(1\.0, 0\.0\); \}\s*return vec2<f32>\(det_cos\(a\), det_sin\(a\)\);/);
    for (const name of ["normalized_distance", "paper_sample_spec", "dab_coverage"]) expect(functionBody(common, name), name).toMatch(/rot_cs\(/);
    // 어떤 모듈에도 내장 sin/cos 호출이 없다(det_sin·det_cos·rot_cs만).
    for (const m of [...COMPUTE_MODULES, { name: "instanced-dab", code: INSTANCED_DAB_WGSL }]) {
      expect(stripComments(m.code), m.name).not.toMatch(/(?<![A-Za-z0-9_])(sin|cos)\(/);
    }
  });

  it("습식 풀 인덱스에 parity가 없다(코어 풀 1벌)", () => {
    expect(code).not.toMatch(/parity/);
    expect(stripComments(COMMON_WGSL)).toMatch(/fn wet_index\(slot: u32, ch: u32, local: u32\)/);
  });
});

describe("WGSL 계약: 표시 합성 순서·임파스토 조명·평탄화", () => {
  const compositeCode = stripComments(WET_COMPOSITE_WGSL);
  const layer = compositeCode;

  it("광택 상수 IMPASTO_SHININESS·IMPASTO_SPECULAR·IMPASTO_MIN_MASS가 CPU export 값으로 삽입된다", () => {
    expect(f32Const(COMMON_TYPES_WGSL, "IMPASTO_SHININESS")).toBe(Math.fround(IMPASTO_SHININESS));
    expect(f32Const(COMMON_TYPES_WGSL, "IMPASTO_SPECULAR")).toBe(Math.fround(IMPASTO_SPECULAR));
    expect(f32Const(COMMON_TYPES_WGSL, "IMPASTO_MIN_MASS")).toBe(Math.fround(IMPASTO_MIN_MASS));
  });

  it("조명 함수가 정의되고 식이 CPU displayDocument와 같은 항으로 이뤄진다", () => {
    for (const fn of ["impasto_light_dir", "impasto_shade", "impasto_factor", "impasto_half_vector", "impasto_specular_flat", "impasto_specular", "impasto_display"]) {
      expect(functionBody(layer, fn).length, fn).toBeGreaterThan(0);
    }
    expect(functionBody(layer, "impasto_factor")).toMatch(/min\(1\.5,\s*impasto_shade\(gx, gy\)\s*\/\s*flat\)/);
    expect(functionBody(layer, "impasto_half_vector")).toMatch(/vec3<f32>\(l\.x, l\.y, l\.z \+ 1\.0\)/);
    expect(functionBody(layer, "impasto_specular_flat")).toMatch(/pow\(max\(0\.0, h\.z\), IMPASTO_SHININESS\)/);
    expect(functionBody(layer, "impasto_specular")).toMatch(/pow\(min\(1\.0, ndh\), IMPASTO_SHININESS\)/);
    const display = functionBody(layer, "impasto_display");
    expect(display).toMatch(/wet_height_at\(gx, gy\) <= 0\.0\) \{ return c; \}/);
    expect(display).toMatch(/IMPASTO_SPECULAR \* max\(0\.0, impasto_specular\(gx, gy\) - impasto_specular_flat\(\)\) \* c\.a/);
    expect(display).toMatch(/clamp\(c\.rgb \* factor \+ vec3<f32>\(highlight\), vec3<f32>\(0\.0\), vec3<f32>\(c\.a\)\)/);
  });

  it("표시 합성은 문서(+획 레이어) → 수채 층 → 유화 층 → 릴리프 조명 순서이고 문서에는 굽지 않는다", () => {
    const display = functionBody(layer, "display_pixel");
    const water = display.indexOf("water_layer_apply");
    const oil = display.indexOf("oil_layer_apply");
    const relief = display.indexOf("impasto_display");
    expect(water).toBeGreaterThan(-1);
    expect(oil).toBeGreaterThan(water);
    expect(relief).toBeGreaterThan(oil);
    expect(display).toMatch(/params\.wet_water_layer != 0u/);
    expect(display).toMatch(/params\.wet_oil_layer != 0u/);
    expect(display).toMatch(/params\.has_height != 0u/);
    // composite_*는 display_color(= blend 뒤 display_pixel)만 거치고 document_px에는 쓰지 않는다.
    for (const e of [ENTRY_POINTS.compositeDirty, ENTRY_POINTS.compositeAll, ENTRY_POINTS.compositeWet, ENTRY_POINTS.compositeLinear]) {
      const body = reachableBody(layer, e);
      expect(body, e).toMatch(/display_pixel\(/);
      expect(body, e).not.toMatch(/document_px\[[^\]]*\]\s*=/);
    }
    // bake_stroke·평탄화 이외의 커널은 조명을 문서에 굽지 않는다.
    expect(functionBody(stripComments(BAKE_STROKE_WGSL), ENTRY_POINTS.bakeStroke)).not.toMatch(/impasto_display|water_layer|oil_layer/);
    for (const e of [ENTRY_POINTS.bakeWet, ENTRY_POINTS.flattenOil]) expect(functionBody(layer, e), e).not.toMatch(/impasto_display/);
  });

  it("수채 층 합성은 질량 가중 평균 색·alpha = 1 − exp(−3·mass)·km이면 바탕과 KM 혼색이다", () => {
    const body = functionBody(layer, "water_layer_apply");
    expect(body).toMatch(/1\.0 - exp\(-mass \* BAKE_MASS_TO_ALPHA\)/);
    expect(body).toMatch(/params\.wet_render_km != 0u && c\.a > 0\.0/);
    expect(body).toMatch(/km_mix\(c\.rgb \/ c\.a, col, alpha\)/);
    // 질량 = (부유 + 침착) + 경화(hard) — hard(ext 13..16)도 합성·굽기 대상이다.
    expect(functionBody(layer, "water_layer_mass")).toMatch(/EXT_HARD_MASS/);
  });

  it("유화 층 합성은 α = kV/(1 + kV), V = H − B(OIL_EPS 이하는 건너뜀)이고 평탄화는 B = H·m = 0·C = 0이다", () => {
    expect(functionBody(layer, "oil_layer_apply")).toMatch(/\(OIL_OPACITY_K \* v\) \/ \(1\.0 \+ OIL_OPACITY_K \* v\)/);
    const flatten = functionBody(layer, ENTRY_POINTS.flattenOil);
    expect(flatten).toMatch(/oil_layer_volume\(slot, local\) <= OIL_EPS\) \{ return; \}/);
    expect(flatten).toMatch(/EXT_OIL_BASE, local\)\] = pool_at\(slot, WET_CH_HEIGHT, local\)/);
    expect(flatten).toMatch(/EXT_OIL_WET, local\)\] = 0\.0/);
  });

  it("수채 굽기(bake_wet)는 안료 12채널(부유·침착·경화 hard)을 비운다", () => {
    const body = functionBody(layer, ENTRY_POINTS.bakeWet);
    expect(body).toMatch(/WET_CH_PIG_R \+ ch/);
    expect(body).toMatch(/WET_CH_FIX_R \+ ch/);
    expect(body).toMatch(/EXT_HARD_R \+ ch/);
    expect(body).toMatch(/ch < 4u/);
  });

  it("textureStore는 composite 계열(present_tex)에만 있고 fine-raster는 획 풀에 1회 기록한다", () => {
    for (const m of COMPUTE_MODULES) {
      const body = stripComments(m.code);
      if (m.name === "wet-composite") expect(body).toMatch(/textureStore\(present_tex/);
      else expect(body, m.name).not.toMatch(/textureStore/);
    }
    const raster = stripComments(FINE_RASTER_WGSL).slice(stripComments(COMMON_WGSL).length);
    expect((raster.match(/stroke_pool\[stroke_i\]\s*=/g) ?? []).length).toBe(1);
  });
});

describe("WGSL 계약: 미러 함수·예약어·원자", () => {
  it("WGSL_MIRROR_FUNCTIONS가 모두 정의된다", () => {
    for (const fn of WGSL_MIRROR_FUNCTIONS) {
      expect(COMMON_TYPES_WGSL, fn).toMatch(new RegExp(`fn\\s+${fn}\\s*\\(`));
    }
  });

  it("WGSL 예약어(사양 표 전체: filter·meta·active·target·type …)를 식별자로 쓰지 않는다", () => {
    expect(WGSL_FORBIDDEN_IDENTIFIERS).toEqual(expect.arrayContaining(["filter", "meta", "active", "target", "type", "set", "from"]));
    for (const m of ALL_MODULES) {
      const code = stripComments(m.code);
      for (const word of WGSL_FORBIDDEN_IDENTIFIERS) {
        expect(code, `${m.name}: ${word}`).not.toMatch(new RegExp(`(^|[^\\w])${word}([^\\w]|$)`));
      }
    }
  });

  it("count 모듈만 counts에 atomicAdd하고 scatter 모듈에는 atomicAdd가 없다", () => {
    const countBody = stripComments(BIN_COUNT_WGSL).slice(stripComments(COMMON_WGSL).length);
    const scatterBody = stripComments(BIN_SCATTER_WGSL).slice(stripComments(COMMON_WGSL).length);
    expect(countBody).toMatch(/atomicAdd\(&bins\.counts/);
    expect(scatterBody).not.toMatch(/atomicAdd/);
    expect(scatterBody).toMatch(/workgroup_exclusive_scan/);
  });

  it("원자 타입은 u32만 쓴다(WebGPU 원자 제약)", () => {
    for (const m of COMPUTE_MODULES) {
      const atomics = stripComments(m.code).match(/atomic<\w+>/g) ?? [];
      for (const a of atomics) expect(a, m.name).toBe("atomic<u32>");
    }
  });

  it("scan_add는 활성 표식을 live와 live_next에 함께 세운다(다음 wet_commit이 타일을 잃지 않는다)", () => {
    const body = functionBody(stripComments(BIN_SCAN_WGSL), ENTRY_POINTS.scanAdd);
    expect(body).toMatch(/table\.wet_live\[t\] = 1u;/);
    expect(body).toMatch(/atomicStore\(&table\.wet_live_next\[t\], 1u\);/);
  });
});

function groupOf(name: WetBindingName): number {
  return WET_BINDINGS[name].group;
}

function bindingOf(name: WetBindingName): number {
  return WET_BINDINGS[name].binding;
}
