import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 경계 게이트(스펙 §18). `src/**` 소스를 읽어 금지 import·전역 참조를 검사한다.
 * - 전체: apps/(web|admin-web|api|character-lab), `@/`, mixbox, canvaskit import 부재
 * - 테스트가 아닌 파일: `node:` import 부재(엔진·레인·벤치·앱은 브라우저에서 동작)
 * - engine/**: `@toonstudio/`, react, ../lanes|../bench|../app|../platform 참조 부재,
 *   document/window/navigator/requestAnimationFrame/Math.random/Date.now 참조 부재,
 *   zod는 presets/program-schema.ts·wet/params.ts만
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
const FORBIDDEN_GLOBALS = ["document", "window", "navigator", "requestAnimationFrame", "Math.random", "Date.now"];

describe("src 경계", () => {
  it("소스 파일이 수집된다", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.rel === "engine/index.ts")).toBe(true);
  });

  it("다른 앱·@/·mixbox·canvaskit import가 없다", () => {
    const violations: string[] = [];
    for (const f of files) {
      for (const spec of importSpecifiers(f.source)) {
        if (/apps\/(web|admin-web|api|character-lab)/.test(spec)) violations.push(`${f.rel}: ${spec}`);
        if (spec.startsWith("@/")) violations.push(`${f.rel}: ${spec}`);
        if (/mixbox|canvaskit/i.test(spec)) violations.push(`${f.rel}: ${spec}`);
      }
      if (/mixbox/i.test(stripComments(f.source)) && !f.rel.endsWith("boundary.test.ts")) {
        violations.push(`${f.rel}: mixbox 문자열`);
      }
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

  it("engine/**(테스트 제외)는 DOM 전역·Math.random·Date.now를 참조하지 않는다", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!isEngine(f.rel) || isTest(f.rel)) continue;
      const code = stripComments(f.source);
      for (const g of FORBIDDEN_GLOBALS) {
        const name = g.replace(".", "\\.");
        // 전역 사용 형태만 잡는다: `document.x`, `document(`, `document[`, `typeof document`.
        // 속성 선언(`document:`)·멤버 접근(`ctx.document`)은 엔진 자체 식별자라 허용한다.
        const use = new RegExp(`(^|[^\\w.$'"\`])${name}(?=\\s*[.(\\[])`);
        const typeOf = new RegExp(`typeof\\s+${name}(?![\\w$])`);
        if (use.test(code) || typeOf.test(code)) violations.push(`${f.rel}: ${g}`);
      }
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
