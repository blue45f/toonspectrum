/**
 * Babylon import 정책(render/**): 서브패스 import만, 실제 파일 존재, DOM 전용 모듈 위치, side-effect 단일 지점, 직렬화 청크 분리.
 * 앱 전역 경계(`@babylonjs` 위치·side-effect 위치)는 `src/architecture.test.ts`가 강제하고, 여기서는 render 내부 규칙을 본다.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

interface Import {
  readonly specifier: string;
  readonly kind: "static" | "side-effect" | "dynamic";
}

interface Source {
  /** render 기준 posix 상대 경로 */
  readonly rel: string;
  readonly imports: readonly Import[];
}

function resolveRenderRoot(): string {
  const metaDirname: unknown = import.meta.dirname;
  if (typeof metaDirname === "string" && existsSync(path.join(metaDirname, "babylon", "babylon-side-effects.ts"))) return metaDirname;
  for (const candidate of [path.resolve(process.cwd(), "apps", "character-lab", "src", "render"), path.resolve(process.cwd(), "src", "render")]) {
    if (existsSync(path.join(candidate, "babylon", "babylon-side-effects.ts"))) return candidate;
  }
  throw new Error(`apps/character-lab/src/render 위치를 찾지 못했습니다(cwd=${process.cwd()}).`);
}

const RENDER_ROOT = resolveRenderRoot();
const APP_ROOT = path.resolve(RENDER_ROOT, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:\\])\/\/.*$/gmu, "$1");
}

function collect(code: string): Import[] {
  const out: Import[] = [];
  for (const match of code.matchAll(/^\s*import\s+["']([^"']+)["']/gmu)) out.push({ specifier: match[1] as string, kind: "side-effect" });
  for (const match of code.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'"\n]*?\s+from\s+)["']([^"']+)["']/gu)) out.push({ specifier: match[1] as string, kind: "static" });
  for (const match of code.matchAll(/import\(\s*["']([^"']+)["']\s*\)/gu)) out.push({ specifier: match[1] as string, kind: "dynamic" });
  return out;
}

const sources: Source[] = walk(RENDER_ROOT)
  .filter((file) => file.endsWith(".ts") && !/\.test\.ts$/u.test(file))
  .map((file) => ({ rel: path.relative(RENDER_ROOT, file).split(path.sep).join("/"), imports: collect(stripComments(readFileSync(file, "utf8"))) }))
  .sort((a, b) => a.rel.localeCompare(b.rel));

const babylonImports = sources.flatMap((source) => source.imports.filter((entry) => entry.specifier.startsWith("@babylonjs/")).map((entry) => ({ ...entry, rel: source.rel })));

describe("Babylon import 정책(render)", () => {
  it("render 소스를 스캔했다(어댑터 모듈·테스트 하네스 포함)", () => {
    expect(sources.some((source) => source.rel === "babylon/character-engine.ts")).toBe(true);
    expect(sources.some((source) => source.rel === "testing/null-engine-harness.ts")).toBe(true);
    expect(babylonImports.length).toBeGreaterThan(80);
  });

  it("`@babylonjs/core` 배럴 import 금지: 서브패스(`…/core/<경로>.js`)만 쓴다", () => {
    const offenders = babylonImports.filter((entry) => !/^@babylonjs\/(?:core|loaders|serializers)\/.+\.js$/u.test(entry.specifier)).map((entry) => `${entry.rel}: ${entry.specifier}`);
    expect(offenders).toEqual([]);
  });

  it("모든 Babylon import가 설치된 패키지의 실제 파일을 가리킨다(오탈자·없는 side-effect 모듈 방지)", () => {
    const missing = [...new Set(babylonImports.map((entry) => entry.specifier))].filter((specifier) => !existsSync(path.join(APP_ROOT, "node_modules", specifier))).sort();
    expect(missing).toEqual([]);
  });

  it("side-effect import는 babylon-side-effects.ts 한 곳이고 같은 모듈을 두 번 import하지 않는다", () => {
    const sideEffects = babylonImports.filter((entry) => entry.kind === "side-effect");
    expect(new Set(sideEffects.map((entry) => entry.rel))).toEqual(new Set(["babylon/babylon-side-effects.ts"]));
    const specifiers = sideEffects.map((entry) => entry.specifier);
    expect(new Set(specifiers).size).toBe(specifiers.length);
    expect(sideEffects.length).toBeGreaterThan(40);
  });

  it("DOM 의존 엔진 모듈(engine·webgpuEngine)은 engine-factory.ts에만 있고 screenshot·dynamicTexture는 어디에도 없다", () => {
    const domModules = babylonImports.filter((entry) => /Engines\/(?:engine|webgpuEngine)\.js$/u.test(entry.specifier));
    expect(new Set(domModules.map((entry) => entry.rel))).toEqual(new Set(["babylon/engine-factory.ts"]));
    expect(babylonImports.filter((entry) => /screenshotTools|dynamicTexture/u.test(entry.specifier))).toEqual([]);
  });

  it("NullEngine은 테스트 하네스에서만 import한다", () => {
    const nullEngine = babylonImports.filter((entry) => entry.specifier.endsWith("Engines/nullEngine.js"));
    expect(new Set(nullEngine.map((entry) => entry.rel))).toEqual(new Set(["testing/null-engine-harness.ts"]));
  });

  it("engine-factory는 진입점(babylon-character-engine.ts)만 import하고, Node 하네스·엔진 본체는 import하지 않는다", () => {
    const importers = sources.filter((source) => source.imports.some((entry) => /(?:^|\/)engine-factory$/u.test(entry.specifier))).map((source) => source.rel);
    expect(importers).toEqual(["babylon-character-engine.ts"]);
  });

  it("serializers는 동적 import(청크 분리)로만 쓰고 loaders는 side-effect 한 곳 + 로더 모듈 한 곳이다", () => {
    const serializers = babylonImports.filter((entry) => entry.specifier.startsWith("@babylonjs/serializers/"));
    expect(serializers.map((entry) => [entry.rel, entry.kind])).toEqual([["babylon/glb-exporter.ts", "dynamic"]]);
    const loaders = babylonImports.filter((entry) => entry.specifier.startsWith("@babylonjs/loaders/"));
    expect(new Set(loaders.map((entry) => entry.rel))).toEqual(new Set(["babylon/babylon-side-effects.ts", "babylon/package-loader.ts"]));
  });
});
