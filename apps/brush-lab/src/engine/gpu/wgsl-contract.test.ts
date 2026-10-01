import { describe, expect, it } from "vitest";

import { DAB_WGSL_STRUCT_FIELDS } from "../core/dab-layout";
import { IMPASTO_MIN_MASS } from "../raster/fine-raster";
import { IMPASTO_SPECULAR } from "../raster/reference-renderer";
import { IMPASTO_SHININESS } from "../wet/impasto";
import { WET_CH, WET_CHANNELS as WET_STATE_CHANNELS } from "../wet/state";

import {
  BINDING_WGSL_NAMES,
  BINDINGS,
  COMPUTE_ENTRY_ORDER,
  ENTRY_POINTS,
  GPU_TILE_SIZE,
  IMPASTO_DAB_MEMBERS,
  IMPASTO_ENTRIES,
  INDIRECT_MEMBERS,
  INDIRECT_WRITER_ENTRIES,
  INST_PARAMS_SCALARS,
  INSTANCED_BINDINGS,
  INSTANCED_BLIT_BINDINGS,
  PARAMS_SCALARS,
  PRESENT_BINDINGS,
  TABLE_ARRAY_MEMBERS,
  TABLE_HEADER_MEMBERS,
  WET_CHANNELS,
  WGSL_FORBIDDEN_IDENTIFIERS,
  WGSL_MIRROR_FUNCTIONS,
  WORKGROUP_1D,
} from "./layout";
import { BIN_COUNT_WGSL } from "./wgsl/bin-count.wgsl";
import { BIN_SCAN_WGSL } from "./wgsl/bin-scan.wgsl";
import { BIN_SCATTER_WGSL } from "./wgsl/bin-scatter.wgsl";
import { COMMON_TYPES_WGSL, COMMON_WGSL } from "./wgsl/common.wgsl";
import { COMPOSITE_WGSL } from "./wgsl/composite.wgsl";
import { FINE_RASTER_WGSL } from "./wgsl/fine-raster.wgsl";
import { IMPASTO_WGSL } from "./wgsl/impasto.wgsl";
import { INSTANCED_BLIT_WGSL, INSTANCED_DAB_WGSL } from "./wgsl/instanced-dab.wgsl";
import { PRESENT_WGSL } from "./wgsl/present.wgsl";
import { WET_STEP_WGSL } from "./wgsl/wet-step.wgsl";

import type { EntryPointName } from "./layout";

/**
 * WGSL 정적 계약 검사(GPU 없는 Node). 컴파일은 브라우저 프로브가 하고, 여기서는 layout.ts 단일 원천과의
 * 드리프트(바인딩·워크그룹·진입점·struct 순서·미러 함수·예약어·원자 사용)를 잡는다.
 */
const COMPUTE_MODULES: { name: string; code: string; entries: EntryPointName[] }[] = [
  { name: "bin-count", code: BIN_COUNT_WGSL, entries: ["binCount"] },
  { name: "bin-scan", code: BIN_SCAN_WGSL, entries: ["scanBlocks", "scanBlockSums", "scanAdd", "writeIndirect"] },
  { name: "bin-scatter", code: BIN_SCATTER_WGSL, entries: ["scatter"] },
  { name: "fine-raster", code: FINE_RASTER_WGSL, entries: ["smudgeCarry", "fineRaster"] },
  { name: "wet-step", code: WET_STEP_WGSL, entries: ["wetStep", "wetExpand", "wetCommit", "bakeWet"] },
  { name: "composite", code: COMPOSITE_WGSL, entries: ["compositeDirty", "compositeAll", "bakeStroke"] },
  { name: "impasto", code: IMPASTO_WGSL, entries: ["impastoMove", "impastoApply"] },
];
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

  it("습식 채널 상수가 wet/state.ts WET_CH와 같다", () => {
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
});

describe("WGSL 계약: 바인딩·struct", () => {
  it("compute 모듈의 @group/@binding이 BINDINGS와 정확히 일치한다(불필요 바인딩 없음)", () => {
    const expected = (Object.keys(BINDINGS) as (keyof typeof BINDINGS)[])
      .map((n) => `${BINDINGS[n].group}:${BINDINGS[n].binding}:${BINDING_WGSL_NAMES[n]}`)
      .sort();
    for (const m of COMPUTE_MODULES) {
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

  it("compute 스테이지 storage 버퍼는 8개 이하(기본 한도 8)이고 dabs는 read-only다", () => {
    const storage = Object.values(BINDINGS).filter((b) => b.kind === "storage-read" || b.kind === "storage-rw").length;
    expect(storage).toBeLessThanOrEqual(8);
    expect(COMMON_WGSL).toContain("var<storage, read> dabs: array<Dab>");
    expect(COMMON_WGSL).not.toMatch(/var<storage, read_write> dabs/);
  });

  it("간접 인자(indirect_args, group 2)는 INDIRECT_WRITER_ENTRIES의 본문에서만 쓴다(INDIRECT/쓰기 storage usage scope 분리)", () => {
    const writers = new Set(INDIRECT_WRITER_ENTRIES.map((e) => ENTRY_POINTS[e]));
    for (const m of COMPUTE_MODULES) {
      const code = stripComments(m.code);
      const bodies = new Map<string, string>();
      for (const e of m.entries) bodies.set(ENTRY_POINTS[e], functionBody(code, ENTRY_POINTS[e]));
      const uses = [...bodies].filter(([, body]) => /\bindirect_args\b/.test(body)).map(([name]) => name);
      expect(uses.sort(), m.name).toEqual(m.entries.map((e) => ENTRY_POINTS[e]).filter((n) => writers.has(n as never) && /\bindirect_args\b/.test(bodies.get(n) ?? "")).sort());
      // 진입점 밖(공용 헬퍼·다른 함수)에서는 쓰지 않는다: 선언·struct를 제외한 모든 사용이 쓰기 진입점 본문 안에 있어야 한다.
      let rest = code;
      for (const body of bodies.values()) rest = rest.replace(body, "");
      const residual = rest.replace(/@group\(2\)\s*@binding\(0\)\s*var<storage, read_write>\s+indirect_args: IndirectArgs;/, "");
      expect(residual, m.name).not.toMatch(/\bindirect_args\b/);
    }
    const all = COMPUTE_MODULES.flatMap((m) => m.entries.map((e) => ENTRY_POINTS[e]));
    for (const w of writers) expect(all).toContain(w);
    expect(BINDINGS.indirect).toEqual({ group: 2, binding: 0, kind: "storage-rw" });
  });

  it("임파스토 레코드(impasto_dab, group 2 동적 uniform)는 IMPASTO_ENTRIES 본문에서만 쓴다", () => {
    const impastoNames = new Set(IMPASTO_ENTRIES.map((e) => ENTRY_POINTS[e]));
    for (const m of COMPUTE_MODULES) {
      const code = stripComments(m.code);
      const helperBodies = ["height_slot", "height_index", "height_raw", "height_store", "impasto_dab_shade", "in_window", "in_canvas", "region_width", "region_height"];
      const entryBodies = m.entries.map((e) => functionBody(code, ENTRY_POINTS[e]));
      const used = m.entries.map((e) => ENTRY_POINTS[e]).filter((n) => /\bimpasto_dab\b/.test(functionBody(code, n)));
      if (m.name === "impasto") {
        expect(used.sort()).toEqual([...impastoNames].sort());
        expect(helperBodies.every((h) => functionBody(code, h).length > 0), "임파스토 헬퍼 정의").toBe(true);
      } else {
        expect(used, m.name).toEqual([]);
        // 선언·struct 밖에서 다른 모듈은 impasto_dab을 참조하지 않는다.
        let rest = code;
        for (const body of entryBodies) rest = rest.replace(body, "");
        rest = rest.replace(/@group\(2\)\s*@binding\(1\)\s*var<uniform>\s+impasto_dab: ImpastoDab;/, "");
        expect(rest, m.name).not.toMatch(/\bimpasto_dab\b/);
      }
    }
    expect(BINDINGS.impastoDab).toEqual({ group: 2, binding: 1, kind: "uniform-dynamic" });
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

  it("struct Params 필드 순서 = PARAMS_SCALARS(+패딩) + edge_curve", () => {
    const fields = structFields(COMMON_WGSL, "Params");
    const scalars = PARAMS_SCALARS.map(([n]) => n);
    expect(fields.slice(0, scalars.length)).toEqual(scalars);
    expect(fields[fields.length - 1]).toBe("edge_curve");
    const pad = fields.slice(scalars.length, -1);
    expect(pad.every((p) => p.startsWith("pad_"))).toBe(true);
    expect((scalars.length + pad.length) % 4).toBe(0);
    const inst = structFields(INSTANCED_DAB_WGSL, "InstParams");
    expect(inst).toEqual([...INST_PARAMS_SCALARS.map(([n]) => n), "edge_curve"]);
  });

  it("struct TileTable 멤버 순서 = TABLE_HEADER_MEMBERS + TABLE_ARRAY_MEMBERS", () => {
    const fields = structFields(COMMON_WGSL, "TileTable");
    expect(fields).toEqual([...TABLE_HEADER_MEMBERS.map(([n]) => n), ...TABLE_ARRAY_MEMBERS.map(([n]) => n)]);
  });

  it("struct IndirectArgs 멤버 순서 = INDIRECT_MEMBERS", () => {
    expect(structFields(COMMON_WGSL, "IndirectArgs")).toEqual(INDIRECT_MEMBERS.map(([n]) => n));
  });

  it("struct ImpastoDab 멤버 순서 = IMPASTO_DAB_MEMBERS(이름·타입)", () => {
    expect(structFields(COMMON_WGSL, "ImpastoDab")).toEqual(IMPASTO_DAB_MEMBERS.map(([n]) => n));
    const m = /struct\s+ImpastoDab\s*\{([^}]*)\}/.exec(COMMON_WGSL);
    const types = splitTopLevel(m?.[1] ?? "").map((f) => f.split(":")[1]?.trim());
    expect(types).toEqual(IMPASTO_DAB_MEMBERS.map(([, t]) => t));
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
});

/** `const NAME: f32 = <literal>;`의 리터럴을 f32로 읽는다. */
function f32Const(code: string, name: string): number | null {
  const m = new RegExp(`const\\s+${name}\\s*:\\s*f32\\s*=\\s*([-+0-9.eE]+)\\s*;`).exec(code);
  return m ? Math.fround(Number(m[1])) : null;
}

describe("WGSL 계약: 임파스토 조명(Blinn-Phong 가산)·침착 mask·grain 미러", () => {
  it("광택 상수 IMPASTO_SHININESS·IMPASTO_SPECULAR·IMPASTO_MIN_MASS가 CPU export 값으로 삽입된다", () => {
    expect(f32Const(COMMON_TYPES_WGSL, "IMPASTO_SHININESS")).toBe(Math.fround(IMPASTO_SHININESS));
    expect(f32Const(COMMON_TYPES_WGSL, "IMPASTO_SPECULAR")).toBe(Math.fround(IMPASTO_SPECULAR));
    expect(f32Const(COMMON_TYPES_WGSL, "IMPASTO_MIN_MASS")).toBe(Math.fround(IMPASTO_MIN_MASS));
  });

  it("조명 함수가 정의되고 식이 CPU displayDocument와 같은 항으로 이뤄진다", () => {
    const code = stripComments(COMMON_WGSL);
    for (const fn of ["impasto_light_dir", "impasto_shade", "impasto_factor", "impasto_half_vector", "impasto_specular_flat", "impasto_specular", "impasto_display"]) {
      expect(functionBody(code, fn).length, fn).toBeGreaterThan(0);
    }
    // 램버트 배율: 평탄면 1, 상한 1.5.
    expect(functionBody(code, "impasto_factor")).toMatch(/min\(1\.5,\s*impasto_shade\(gx, gy\)\s*\/\s*flat\)/);
    // 정사 시점 half vector H = normalize(L + (0,0,1)).
    expect(functionBody(code, "impasto_half_vector")).toMatch(/vec3<f32>\(l\.x, l\.y, l\.z \+ 1\.0\)/);
    // 평탄면 하이라이트는 (H.z)^shininess, 표시 시점에 빼서 평탄면 변화를 0으로 만든다.
    expect(functionBody(code, "impasto_specular_flat")).toMatch(/pow\(max\(0\.0, h\.z\), IMPASTO_SHININESS\)/);
    expect(functionBody(code, "impasto_specular")).toMatch(/pow\(min\(1\.0, ndh\), IMPASTO_SHININESS\)/);
    const display = functionBody(code, "impasto_display");
    expect(display).toMatch(/wet_height_at\(gx, gy\) <= 0\.0\) \{ return c; \}/);
    expect(display).toMatch(/IMPASTO_SPECULAR \* max\(0\.0, impasto_specular\(gx, gy\) - impasto_specular_flat\(\)\) \* c\.a/);
    expect(display).toMatch(/clamp\(c\.rgb \* factor \+ vec3<f32>\(highlight\), vec3<f32>\(0\.0\), vec3<f32>\(c\.a\)\)/);
  });

  it("조명은 composite가 has_height일 때만 표시 시점에 적용하고 bake_wet·bake_stroke는 문서에 굽지 않는다", () => {
    const composite = stripComments(COMPOSITE_WGSL);
    expect(functionBody(composite, "composite_pixel")).toMatch(/has_height != 0u\) \{ c = impasto_display\(c, i32\(px\), i32\(py\)\); \}/);
    const wetBody = stripComments(WET_STEP_WGSL).slice(stripComments(COMMON_WGSL).length);
    expect(wetBody).not.toMatch(/impasto_display/);
    expect(functionBody(stripComments(COMPOSITE_WGSL), ENTRY_POINTS.bakeStroke)).not.toMatch(/impasto_display/);
  });

  it("임파스토 침착·밀기가 CPU와 같은 mask·grain 곱을 쓴다(cov·mask·push / cov·mask·grain·flow·max(최소 질량, 안료 질량))", () => {
    const code = stripComments(IMPASTO_WGSL);
    expect(functionBody(code, ENTRY_POINTS.impastoMove)).toMatch(/c\.cov \* c\.mask \* impasto_dab\.push/);
    expect(functionBody(code, ENTRY_POINTS.impastoApply)).toMatch(
      /c\.cov \* c\.mask \* c\.grain \* d\.flow \* max\(IMPASTO_MIN_MASS, dab_pigment_mass\(d\)\)/,
    );
    // dab별 shade는 타일 래스터와 같은 dab_coverage(커버리지·마스크·그레인) 한 곳에서 온다.
    expect(functionBody(code, "impasto_dab_shade")).toMatch(/dab_coverage\(/);
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

  it("textureStore는 composite 모듈에만 있고 fine-raster는 획 풀에 1회 기록한다", () => {
    for (const m of COMPUTE_MODULES) {
      const body = stripComments(m.code).slice(stripComments(COMMON_WGSL).length);
      if (m.name === "composite") expect(body).toMatch(/textureStore\(present_tex/);
      else expect(body, m.name).not.toMatch(/textureStore/);
    }
    const raster = stripComments(FINE_RASTER_WGSL).slice(stripComments(COMMON_WGSL).length);
    expect((raster.match(/stroke_pool\[stroke_i\]\s*=/g) ?? []).length).toBe(1);
  });

  it("habit: 원자 타입은 u32만 쓴다(WebGPU 원자 제약)", () => {
    for (const m of COMPUTE_MODULES) {
      const atomics = stripComments(m.code).match(/atomic<\w+>/g) ?? [];
      for (const a of atomics) expect(a, m.name).toBe("atomic<u32>");
    }
  });
});
