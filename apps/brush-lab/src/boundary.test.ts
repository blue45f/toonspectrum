import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 경계 게이트(스펙 §18). `src/**` 소스를 읽어 금지 import·전역 참조를 검사한다.
 * - 전체: apps/(web|admin-web|api|character-lab), `@/`, mixbox, canvaskit import 부재
 * - 테스트가 아닌 파일: `node:` import 부재(엔진·레인·벤치·앱은 브라우저에서 동작)
 * - 전체: 라이선스상 금지된 이름(mixbox·lygia) 문자열 부재(주석·템플릿 리터럴 안의 출처 표기 포함 — 아래 BANNED_NAMES)
 * - engine/**: `@toonstudio/`, react, ../lanes|../bench|../app|../platform 참조 부재,
 *   document/window/navigator/requestAnimationFrame/performance/Math.random/Date.now 참조 부재
 *   (`globalThis.`·`self.` 경유 접근 포함), zod는 presets/program-schema.ts·wet/params.ts만
 * - 탐지기 자체 검증: 금지 전역·금지 이름 탐지기가 실제로 위반을 잡는지(구멍이 없는지) 표본으로 확인한다.
 */

const SRC_ROOT = path.dirname(fileURLToPath(import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mts|cts)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** 주석을 제거한다(규칙 설명 주석이 검사에 걸리지 않게). 문자열 안의 `//`는 보존하지 않아도 무방하다. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null = re.exec(source);
  while (m) {
    const spec = m[1] ?? m[2];
    if (spec) specs.push(spec);
    m = re.exec(source);
  }
  return specs;
}

const files = walk(SRC_ROOT).map((full) => ({
  full,
  rel: path.relative(SRC_ROOT, full).split(path.sep).join("/"),
  source: readFileSync(full, "utf8"),
}));

const isTest = (rel: string): boolean => /\.(test|spec)\.(ts|tsx|mts|cts)$/.test(rel);
const isEngine = (rel: string): boolean => rel.startsWith("engine/");
const ZOD_ALLOWED = new Set(["engine/presets/program-schema.ts", "engine/wet/params.ts"]);
const FORBIDDEN_GLOBALS = ["document", "window", "navigator", "requestAnimationFrame", "performance", "Math.random", "Date.now"];

/**
 * 주석을 제거한 코드에서 금지 전역을 쓴 이름 목록.
 * 전역 사용 형태만 잡는다: `document.x`, `document(`, `document[`, `document?.x`, `typeof document`.
 * 속성 선언(`document:`)·멤버 접근(`ctx.document`)·문자열 안의 이름(`"performance-now"`)은 엔진 자체 식별자라 허용한다.
 * `globalThis.`·`self.` 경유 접근은 멤버 접근 예외를 우회하는 길이라 따로 잡는다(`globalThis.crypto`는 허용 대상).
 */
function forbiddenGlobalUses(code: string): string[] {
  const found: string[] = [];
  for (const g of FORBIDDEN_GLOBALS) {
    const name = g.replace(".", "\\.");
    const use = new RegExp(`(^|[^\\w.$'"\`])${name}(?=\\s*(?:[.(\\[]|\\?\\.))`);
    const typeOf = new RegExp(`typeof\\s+${name}(?![\\w$])`);
    const viaGlobalObject = new RegExp(`\\b(?:globalThis|self)\\s*(?:\\?\\.|\\.|\\?\\.\\[\\s*["'\`]|\\[\\s*["'\`])\\s*${name}(?![\\w$])`);
    if (use.test(code) || typeOf.test(code) || viaGlobalObject.test(code)) found.push(g);
  }
  return found;
}

/**
 * 라이선스상 유입 금지 이름(대소문자 무시). 문서(labs-brush-engine-references §4-1)가 약속한 "mixbox·lygia 문자열 검색"이다.
 * `raw`는 주석까지 포함한 원문을 검사할 파일인가(아니면 주석 제외 소스만).
 * - mixbox(CC BY-NC): 일반 소스에는 "쓰지 않는다"는 부정 서술 주석(`pigment/kubelka-munk.ts`)이 있어 주석 제외 소스를 본다.
 *   단 WGSL 문자열 모듈(`*.wgsl.ts`)은 템플릿 리터럴 안의 `//` 주석까지 본다.
 * - lygia(Prosperity, 상업 이용 불가): 붙여 넣은 셰이더의 `#include "lygia/..."`나 출처·라이선스 주석은 템플릿 리터럴 안
 *   `//`로 남는데 `stripComments`가 그것을 지우므로, 어느 파일이든 주석 포함 원문을 본다(이 이름은 어디에도 쓰지 않는다).
 */
const BANNED_NAMES: readonly { name: string; raw: (rel: string) => boolean }[] = [
  { name: "mixbox", raw: (rel) => rel.endsWith(".wgsl.ts") },
  { name: "lygia", raw: () => true },
];

/** 파일 하나가 쓴 금지 이름 목록(대소문자 무시). */
function bannedNameUses(rel: string, source: string): string[] {
  const code = stripComments(source);
  return BANNED_NAMES.filter(({ name, raw }) => new RegExp(name, "i").test(raw(rel) ? source : code)).map(({ name }) => name);
}

describe("src 경계", () => {
  it("소스 파일이 수집된다", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.rel === "engine/index.ts")).toBe(true);
  });

  it("다른 앱·@/·canvaskit import와 mixbox·lygia 문자열이 없다", () => {
    const violations: string[] = [];
    for (const f of files) {
      for (const spec of importSpecifiers(f.source)) {
        if (/apps\/(web|admin-web|api|character-lab)/.test(spec)) violations.push(`${f.rel}: ${spec}`);
        if (spec.startsWith("@/")) violations.push(`${f.rel}: ${spec}`);
        if (/mixbox|canvaskit/i.test(spec)) violations.push(`${f.rel}: ${spec}`);
      }
      // 이 파일은 금지 이름을 표본으로 담고 있어 제외한다.
      if (f.rel === "boundary.test.ts") continue;
      for (const name of bannedNameUses(f.rel, f.source)) violations.push(`${f.rel}: ${name} 문자열`);
    }
    expect(violations).toEqual([]);
  });

  it("테스트가 아닌 소스는 node: 모듈을 import하지 않는다", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (isTest(f.rel)) continue;
      for (const spec of importSpecifiers(f.source)) {
        if (spec.startsWith("node:")) violations.push(`${f.rel}: ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("engine/**는 @toonstudio/·react·레인·벤치·앱·플랫폼을 import하지 않는다", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!isEngine(f.rel)) continue;
      for (const spec of importSpecifiers(f.source)) {
        if (spec.startsWith("@toonstudio/")) violations.push(`${f.rel}: ${spec}`);
        if (spec === "react" || spec.startsWith("react/") || spec === "react-dom") violations.push(`${f.rel}: ${spec}`);
        if (/(^|\/)\.\.\/(lanes|bench|app|platform)(\/|$)/.test(spec)) violations.push(`${f.rel}: ${spec}`);
        if (spec === "zod" && !ZOD_ALLOWED.has(f.rel)) violations.push(`${f.rel}: zod`);
        if (spec.startsWith("node:")) violations.push(`${f.rel}: ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("engine/**(테스트 제외)는 DOM 전역·performance·Math.random·Date.now를 참조하지 않는다", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!isEngine(f.rel) || isTest(f.rel)) continue;
      for (const g of forbiddenGlobalUses(stripComments(f.source))) violations.push(`${f.rel}: ${g}`);
    }
    expect(violations).toEqual([]);
  });

  it("engine/gpu 밖의 엔진 모듈은 gpu/·webgl2/·wasm/을 import하지 않는다(승격 단위 격리)", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!isEngine(f.rel)) continue;
      if (/^engine\/(gpu|webgl2|wasm)\//.test(f.rel)) continue;
      for (const spec of importSpecifiers(f.source)) {
        if (/(^|\/)(gpu|webgl2|wasm)(\/|$)/.test(spec) && spec.startsWith(".")) {
          // 정적 대조 테스트(dab-layout.test)는 WGSL 상수를 읽어도 된다.
          if (isTest(f.rel)) continue;
          violations.push(`${f.rel}: ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("경계 탐지기 자체 검증(구멍 방지)", () => {
  it.each([
    ["performance.now() 호출", "export const t = () => performance.now();", ["performance"]],
    ["typeof performance", 'const ok = typeof performance !== "undefined";', ["performance"]],
    ["performance?.now()", "const t = performance?.now() ?? 0;", ["performance"]],
    ["globalThis.performance 경유", "const t = globalThis.performance.now();", ["performance"]],
    ["self['performance'] 경유", "const t = self['performance'].now();", ["performance"]],
    ["globalThis.document 경유", "const el = globalThis.document.body;", ["document"]],
    ["Date.now", "const t = Date.now();", ["Date.now"]],
    ["Math.random", "const r = Math.random();", ["Math.random"]],
    ["requestAnimationFrame 호출", "requestAnimationFrame(tick);", ["requestAnimationFrame"]],
  ])("금지 전역을 잡는다: %s", (_name, code, expected) => {
    expect(forbiddenGlobalUses(code)).toEqual(expected);
  });

  it.each([
    ["문자열 리터럴 performance-now", 'export const SOURCE = "performance-now";'],
    ["문자열 high-performance", 'powerPreference: "high-performance"'],
    ["멤버 접근 clock.performance.now()", "const t = ctx.clock.performance.now();"],
    ["속성 선언 performance:", "const opts = { performance: 1 };"],
    ["이름이 이어진 식별자 performanceNow()", "const t = performanceNow();"],
    ["허용된 globalThis.crypto", "const subtle = globalThis.crypto?.subtle;"],
    ["엔진 자체 식별자 ctx.document", "const doc = ctx.document;"],
  ])("엔진 자체 식별자·문자열은 잡지 않는다: %s", (_name, code) => {
    expect(forbiddenGlobalUses(code)).toEqual([]);
  });

  it("lygia: import·#include 문자열과 WGSL 템플릿 리터럴 안 출처 주석을 잡는다(대소문자 무시)", () => {
    const include = 'export const FOO_WGSL = `\n#include "lygia/color/mix.wgsl"\nfn f() {}`;';
    expect(bannedNameUses("engine/gpu/wgsl/foo.wgsl.ts", include)).toEqual(["lygia"]);
    // WGSL의 `//` 주석은 stripComments가 지우므로 원문 검사여야 잡힌다.
    const credit = "export const BAR_WGSL = `\n// from LYGIA (Prosperity License)\nfn f() {}`;";
    expect(bannedNameUses("engine/gpu/wgsl/bar.wgsl.ts", credit)).toEqual(["lygia"]);
    expect(bannedNameUses("engine/webgl2/glsl-bar.ts", credit)).toEqual(["lygia"]);
    expect(bannedNameUses("engine/core/x.ts", 'const mix = require("lygia/color/mix");')).toEqual(["lygia"]);
    expect(bannedNameUses("engine/core/ok.ts", "export const x = 1;")).toEqual([]);
  });

  it("mixbox: 코드·문자열은 잡고, 일반 소스의 부정 서술 주석은 허용하되 WGSL 문자열 모듈은 안의 주석까지 잡는다", () => {
    expect(bannedNameUses("engine/core/x.ts", 'const mix = require("mixbox");')).toEqual(["mixbox"]);
    expect(bannedNameUses("engine/pigment/kubelka-munk.ts", "// mixbox(CC BY-NC) 코드를 포함하지 않는다.\nexport const x = 1;")).toEqual([]);
    expect(bannedNameUses("engine/gpu/wgsl/baz.wgsl.ts", "export const BAZ_WGSL = `\n// mixbox 수식\n`;")).toEqual(["mixbox"]);
  });
});
