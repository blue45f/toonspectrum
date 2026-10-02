/**
 * 모듈 경계 자가 강제(스펙 §2). src/**를 fs로 스캔한다. import 수집은 TS 파서(여러 줄 import/export도 수집), 나머지 위생 검사는 정규식.
 * - `@/` alias·`.mts/.cts`·타 앱 경로·src 밖 상대 경로 금지
 * - `@babylonjs/` import는 render/**만, side-effect import는 render/babylon/babylon-side-effects.ts 한 곳
 * - contracts/·shared/·testing/는 순수(zod·상대 경로), 도메인 디렉터리는 contracts/shared/같은 디렉터리만
 *   (도메인은 `src/<영역>/`와 `src/domains/<영역>/` 두 배치를 모두 같은 영역으로 본다)
 * - `*.browser.ts`·render/babylon/**는 테스트가 import하지 않는다(null-engine-harness 예외)
 * - render/babylon-character-engine 동적 import는 app/composition.ts 한 곳(엔진 모듈이 디스크에 있을 때 필수)
 * - Math.random·any·@ts-ignore·eslint-disable 금지, node:/vitest는 테스트 파일만, DOM 테스트는 jsdom 프라그마
 *
 * 앱 설정(`pnpm --filter @toonstudio/character-lab test`)과 루트 설정(`pnpm exec vitest run apps/character-lab/...`)
 * 양쪽에서 돌아야 하므로 src 위치는 `import.meta.dirname` → file: URL → `process.cwd()` 기준 탐색 순으로 구한다
 * (vitest 4.1에서 테스트 모듈의 `import.meta.url`이 file 스킴이 아닐 수 있다).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/** 이 파일이 있는 src 디렉터리의 절대 경로. 찾지 못하면 throw(무음으로 빈 스캔을 통과시키지 않는다). */
function resolveSrcRoot(): string {
  const SENTINEL = path.join("contracts", "index.ts");
  const metaDirname: unknown = import.meta.dirname;
  if (typeof metaDirname === "string" && existsSync(path.join(metaDirname, SENTINEL))) return metaDirname;
  const metaUrl: unknown = import.meta.url;
  if (typeof metaUrl === "string" && metaUrl.startsWith("file:")) {
    const fromUrl = path.dirname(fileURLToPath(metaUrl));
    if (existsSync(path.join(fromUrl, SENTINEL))) return fromUrl;
  }
  for (const candidate of [path.resolve(process.cwd(), "apps", "character-lab", "src"), path.resolve(process.cwd(), "src")]) {
    if (existsSync(path.join(candidate, SENTINEL))) return candidate;
  }
  throw new Error(`apps/character-lab/src 위치를 찾지 못했습니다(cwd=${process.cwd()}, import.meta.url=${String(metaUrl)}).`);
}

const SRC_ROOT = resolveSrcRoot();

const DOMAIN_DIRS = ["state", "presets", "humanoid", "outfit", "physics", "animation", "paint", "export", "authored", "vision"] as const;
/** `src/domains/<영역>/` 배치(디스크 기준: humanoid·outfit·physics·authored·vision) */
const DOMAINS_PARENT = "domains";
const PURE_DIRS = ["contracts", "shared", "testing"] as const;
const DOMAIN_EXTERNALS: Readonly<Record<string, readonly string[]>> = {
  physics: ["@dimforge/rapier3d-deterministic-compat"],
  vision: ["@mediapipe/tasks-vision"],
  export: ["ag-psd"],
  state: [],
  presets: [],
  humanoid: [],
  outfit: [],
  animation: [],
  paint: [],
  authored: [],
};
const COMMON_EXTERNALS = ["zod", "react"];
const CROSS_APP_PATTERN = /apps\/(?:web|admin-web|api|brush-lab)\b|\/brush-lab\//u;
const ENGINE_ENTRY = "render/babylon-character-engine";
const SIDE_EFFECT_FILE = "render/babylon/babylon-side-effects.ts";
const NULL_HARNESS = "render/testing/null-engine-harness";
/** testing/ 모의가 쓸 수 있는 app/shell 모듈(Provider·런타임 조립기) */
const TESTING_APP_IMPORTS: ReadonlySet<string> = new Set(["app/shell/lab-store-context", "app/shell/lab-runtime"]);

interface ImportRef {
  readonly specifier: string;
  readonly kind: "static" | "dynamic" | "side-effect";
}

interface SourceFile {
  /** src 기준 posix 상대 경로 */
  readonly rel: string;
  readonly raw: string;
  /** 주석을 제거한 코드 */
  readonly code: string;
  readonly imports: readonly ImportRef[];
  readonly isTest: boolean;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:\\])\/\/.*$/gmu, "$1");
}

function stripStrings(code: string): string {
  return code.replace(/`(?:\\[\s\S]|[^`\\])*`/gu, "``").replace(/"(?:\\.|[^"\\\n])*"/gu, '""').replace(/'(?:\\.|[^'\\\n])*'/gu, "''");
}

/**
 * TypeScript 파서로 import 지점을 수집한다. 정규식은 여러 줄 `import {\n A,\n B,\n} from "…"`·`export { … } from`·
 * 공백 없는 표기를 놓쳐 경계 게이트를 무력화하므로 쓰지 않는다(주석·문자열 안의 문구도 파서가 걸러 준다).
 * - 정적: `import … from`, `import type … from`, `export … from`, `import x = require("…")`
 * - side-effect: `import "…"`(import 절 없음)
 * - 동적: `import("…")`, 타입 위치의 `import("…").T`
 */
function collectImports(source: string, fileName: string): ImportRef[] {
  const ast = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false);
  const refs: ImportRef[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      refs.push({ specifier: node.moduleSpecifier.text, kind: node.importClause ? "static" : "side-effect" });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      refs.push({ specifier: node.moduleSpecifier.text, kind: "static" });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteralLike(node.moduleReference.expression)) {
      refs.push({ specifier: node.moduleReference.expression.text, kind: "static" });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteralLike(argument)) refs.push({ specifier: argument.text, kind: "dynamic" });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      refs.push({ specifier: node.argument.literal.text, kind: "dynamic" });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return refs;
}

/** src 기준 상대 경로와 원문으로 SourceFile을 만든다(실제 스캔과 합성 소스 테스트가 같은 경로를 쓴다). */
function makeSourceFile(rel: string, raw: string): SourceFile {
  const code = stripComments(raw);
  return { rel, raw, code, imports: collectImports(raw, rel), isTest: /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(rel) };
}

function loadSources(): SourceFile[] {
  const files = walk(SRC_ROOT).filter((file) => /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u.test(file));
  return files
    .map((file) => makeSourceFile(path.relative(SRC_ROOT, file).split(path.sep).join("/"), readFileSync(file, "utf8")))
    .sort((a, b) => a.rel.localeCompare(b.rel));
}

/** 첫 경로 조각. `../contracts`처럼 디렉터리 배럴로 해석된 경로(슬래시 없음)는 그 자체가 디렉터리다. */
function topDir(rel: string): string {
  const slash = rel.indexOf("/");
  return slash === -1 ? rel : rel.slice(0, slash);
}

/**
 * 파일이 속한 도메인 영역 이름. `state/x.ts` → "state", `domains/physics/x.ts` → "physics".
 * 도메인이 아니면 null(app·contracts·shared·testing·render, `domains/` 바로 아래 파일 포함).
 */
function domainOf(rel: string): string | null {
  const segments = rel.split("/");
  const head = segments[0] ?? "";
  if (head === DOMAINS_PARENT) {
    const area = segments.length > 2 ? (segments[1] ?? "") : "";
    return (DOMAIN_DIRS as readonly string[]).includes(area) ? area : null;
  }
  return (DOMAIN_DIRS as readonly string[]).includes(head) ? head : null;
}

function bareSpecifier(specifier: string): string {
  return specifier.replace(/\?[a-z]+$/u, "");
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/** 상대 import를 src 기준 경로로 푼다. src 밖이면 null. */
function resolveRelative(fromRel: string, specifier: string): string | null {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), bareSpecifier(specifier)));
  if (resolved.startsWith("../") || resolved === "..") return null;
  return resolved;
}

function isBrowserModule(resolvedRel: string): boolean {
  return /\.browser(?:\.tsx?)?$/u.test(resolvedRel) || resolvedRel.startsWith("render/babylon/");
}

const sources = loadSources();
const byRel = new Map(sources.map((file) => [file.rel, file]));

function violations(check: (file: SourceFile) => string[]): string[] {
  return sources.flatMap((file) => check(file).map((message) => `${file.rel}: ${message}`));
}

/** `@babylonjs/` import가 src/render/** 밖에 있으면 위반 */
function babylonOutsideRenderViolations(file: SourceFile): string[] {
  return file.imports
    .filter((ref) => ref.specifier.startsWith("@babylonjs/") && topDir(file.rel) !== "render")
    .map((ref) => `render 밖 @babylonjs import: ${ref.specifier}`);
}

/** 도메인 디렉터리(src/<영역>·src/domains/<영역>)의 import 경계 위반 */
function domainBoundaryViolations(file: SourceFile): string[] {
  const dir = domainOf(file.rel);
  if (dir === null) return [];
  return file.imports.flatMap((ref) => {
    const spec = ref.specifier;
    if (file.isTest && (spec === "vitest" || spec.startsWith("node:") || spec === "@testing-library/react")) return [];
    if (!isRelative(spec)) {
      const bare = bareSpecifier(spec);
      const allowed = [...COMMON_EXTERNALS, ...(DOMAIN_EXTERNALS[dir] ?? [])];
      return allowed.some((name) => bare === name || bare.startsWith(`${name}/`)) ? [] : [`허용되지 않은 외부 import: ${spec}`];
    }
    const resolved = resolveRelative(file.rel, spec) ?? "";
    const target = topDir(resolved);
    if (domainOf(resolved) === dir || target === "contracts" || target === "shared") return [];
    if (file.isTest && target === "testing") return [];
    if (resolved === "app/shell/lab-store-context") return [];
    return [`도메인 교차 import: ${spec}`];
  });
}

describe("architecture: 파일·경로 규칙", () => {
  it("src를 스캔했다(core 파일 포함)", () => {
    expect(byRel.has("contracts/index.ts")).toBe(true);
    expect(byRel.has("app/shell/CharacterLabApp.tsx")).toBe(true);
  });

  it("`.mts`/`.cts`/JS 파일을 두지 않는다", () => {
    expect(sources.filter((file) => !/\.tsx?$/u.test(file.rel)).map((file) => file.rel)).toEqual([]);
  });

  it("`@/` alias를 쓰지 않는다", () => {
    expect(violations((file) => file.imports.filter((ref) => ref.specifier.startsWith("@/")).map((ref) => `@/ alias: ${ref.specifier}`))).toEqual([]);
  });

  it("다른 앱 경로·src 밖 상대 경로를 import하지 않는다", () => {
    expect(
      violations((file) =>
        file.imports.flatMap((ref) => {
          if (CROSS_APP_PATTERN.test(ref.specifier)) return [`타 앱 경로: ${ref.specifier}`];
          if (isRelative(ref.specifier) && resolveRelative(file.rel, ref.specifier) === null) return [`src 밖 상대 경로: ${ref.specifier}`];
          return [];
        }),
      ),
    ).toEqual([]);
  });
});

describe("architecture: Babylon 격리", () => {
  it("`@babylonjs/` import는 src/render/** 에만 있다", () => {
    expect(violations(babylonOutsideRenderViolations)).toEqual([]);
  });

  it("side-effect import는 babylon-side-effects.ts 한 곳(CSS 제외)", () => {
    expect(
      violations((file) =>
        file.imports
          .filter((ref) => ref.kind === "side-effect")
          .flatMap((ref) => {
            if (ref.specifier.endsWith(".css") && topDir(file.rel) === "app") return [];
            if (file.rel === SIDE_EFFECT_FILE && ref.specifier.startsWith("@babylonjs/")) return [];
            return [`side-effect import: ${ref.specifier}`];
          }),
      ),
    ).toEqual([]);
  });

  it("render/babylon-character-engine 동적 import는 app/composition.ts 한 곳이고 정적 import는 render 밖에 없다", () => {
    const dynamicSites = sources.filter(
      (file) => topDir(file.rel) !== "render" && file.imports.some((ref) => ref.kind === "dynamic" && (resolveRelative(file.rel, ref.specifier) ?? "") === ENGINE_ENTRY),
    );
    // 엔진 모듈(render 작업자)이 디스크에 있으면 composition.ts가 반드시 동적 import로 꽂아야 하고,
    // 아직 없으면(typecheck가 TS2307로 막으므로) 어느 파일도 import하지 않아야 한다.
    const engineEntryExists = byRel.has(`${ENGINE_ENTRY}.ts`);
    expect(dynamicSites.map((file) => file.rel)).toEqual(engineEntryExists ? ["app/composition.ts"] : []);
    expect(
      violations((file) =>
        topDir(file.rel) === "render"
          ? []
          : file.imports
              .filter((ref) => ref.kind === "static" && (resolveRelative(file.rel, ref.specifier) ?? "") === ENGINE_ENTRY)
              .map((ref) => `정적 엔진 import: ${ref.specifier}`),
      ),
    ).toEqual([]);
  });

  it("app/shell/panels/ 의 패널 파일은 전부 app/composition.ts가 import해 조립한다(미조립 패널 방지)", () => {
    const composition = byRel.get("app/composition.ts");
    expect(composition).toBeDefined();
    const panelNames = sources
      .filter((file) => !file.isTest && /^app\/shell\/panels\/[A-Za-z]+\.tsx$/u.test(file.rel))
      .map((file) => path.posix.basename(file.rel, ".tsx"));
    expect(panelNames.length).toBeGreaterThan(0);
    const imported = new Set((composition?.imports ?? []).filter((ref) => ref.kind === "static").map((ref) => ref.specifier));
    expect(panelNames.filter((name) => !imported.has(`./shell/panels/${name}`))).toEqual([]);
  });

  it("app/** 는 render/babylon/** 내부를 import하지 않는다", () => {
    expect(
      violations((file) =>
        topDir(file.rel) !== "app"
          ? []
          : file.imports
              .filter((ref) => isRelative(ref.specifier) && (resolveRelative(file.rel, ref.specifier) ?? "").startsWith("render/babylon/"))
              .map((ref) => `render 내부 import: ${ref.specifier}`),
      ),
    ).toEqual([]);
  });
});

describe("architecture: 순수 디렉터리·도메인 경계", () => {
  it("contracts/·shared/·testing/는 zod(+testing은 react·ag-psd 스텁·lab-store-context·lab-runtime)와 상대 경로만 import한다", () => {
    expect(
      violations((file) => {
        const dir = topDir(file.rel);
        if (!(PURE_DIRS as readonly string[]).includes(dir)) return [];
        return file.imports.flatMap((ref) => {
          const spec = ref.specifier;
          if (file.isTest && (spec === "vitest" || spec.startsWith("node:") || spec === "@testing-library/react")) return [];
          if (spec === "zod") return [];
          if (dir === "testing" && spec === "react") return [];
          // ag-psd Node 테스트 스텁(initializeCanvas 주입)은 testing/psd-canvas-stub.ts 한 곳만 허용
          if (file.rel === "testing/psd-canvas-stub.ts" && spec === "ag-psd") return [];
          if (!isRelative(spec)) return [`허용되지 않은 외부 import: ${spec}`];
          const resolved = resolveRelative(file.rel, spec) ?? "";
          const target = topDir(resolved);
          if (dir === "contracts" && (target === "contracts" || target === "shared")) return [];
          if (dir === "shared" && target === "shared") return [];
          if (dir === "testing" && (target === "testing" || target === "contracts" || target === "shared" || TESTING_APP_IMPORTS.has(resolved))) return [];
          // contracts/·shared/의 테스트는 testing/ fixture(레시피·manifest·GLB)를 쓸 수 있다
          if (file.isTest && target === "testing") return [];
          return [`순수 디렉터리 밖 import: ${spec}`];
        });
      }),
    ).toEqual([]);
  });

  it("도메인 디렉터리(src/<영역>·src/domains/<영역>)는 contracts/shared/같은 영역(+테스트는 testing, lab-store-context)만 import한다", () => {
    expect(violations(domainBoundaryViolations)).toEqual([]);
  });

  it("src/domains/ 바로 아래에는 파일을 두지 않고 영역 디렉터리만 둔다", () => {
    expect(
      sources
        .filter((file) => topDir(file.rel) === DOMAINS_PARENT && domainOf(file.rel) === null)
        .map((file) => file.rel),
    ).toEqual([]);
  });

  it("render/** 는 contracts/shared/render(+export/raster-convert, 테스트·render/testing은 testing)만 import한다", () => {
    expect(
      violations((file) => {
        if (topDir(file.rel) !== "render") return [];
        // render/testing/**는 NullEngine 하네스·fixture 같은 테스트 보조 모듈이라 테스트와 같이 core testing/ fixture(minimal-glb 등)를 쓸 수 있다.
        const testSupport = file.isTest || file.rel.startsWith("render/testing/");
        return file.imports.flatMap((ref) => {
          const spec = ref.specifier;
          if (file.isTest && (spec === "vitest" || spec.startsWith("node:"))) return [];
          if (!isRelative(spec)) {
            return spec.startsWith("@babylonjs/") || spec === "zod" || spec === "react" ? [] : [`허용되지 않은 외부 import: ${spec}`];
          }
          const resolved = resolveRelative(file.rel, spec) ?? "";
          const target = topDir(resolved);
          if (target === "render" || target === "contracts" || target === "shared") return [];
          if (testSupport && target === "testing") return [];
          if (resolved === "export/raster-convert") return [];
          if (resolved === "app/shell/lab-store-context") return [];
          return [`render 밖 import: ${spec}`];
        });
      }),
    ).toEqual([]);
  });
});

describe("architecture: 브라우저 전용 모듈·테스트", () => {
  it("테스트 파일은 *.browser 모듈과 render/babylon/** 를 import하지 않는다(null-engine-harness 경유만)", () => {
    expect(
      violations((file) =>
        !file.isTest
          ? []
          : file.imports.flatMap((ref) => {
              if (!isRelative(ref.specifier)) return [];
              const resolved = resolveRelative(file.rel, ref.specifier) ?? "";
              if (resolved === NULL_HARNESS) return [];
              return isBrowserModule(resolved) ? [`테스트의 브라우저 모듈 import: ${ref.specifier}`] : [];
            }),
      ),
    ).toEqual([]);
  });

  it("Node 모듈(비-browser, app 밖)은 *.browser 모듈을 정적 import하지 않는다", () => {
    expect(
      violations((file) => {
        const dir = topDir(file.rel);
        // render 작업자 제출 후 보정(2026-10-01): 엔진 진입점(청크 경계)은 정의상 render/babylon/** 를 정적 import하는 유일한 Node 파일이다.
        if (dir === "app" || isBrowserModule(file.rel) || file.rel === `${NULL_HARNESS}.ts` || file.rel === `${ENGINE_ENTRY}.ts`) return [];
        return file.imports.flatMap((ref) => {
          if (ref.kind !== "static" || !isRelative(ref.specifier)) return [];
          const resolved = resolveRelative(file.rel, ref.specifier) ?? "";
          return isBrowserModule(resolved) ? [`브라우저 모듈 정적 import: ${ref.specifier}`] : [];
        });
      }),
    ).toEqual([]);
  });

  it("DOM 테스트(@testing-library/react)는 첫 줄에 jsdom 프라그마가 있다", () => {
    expect(
      violations((file) =>
        file.isTest && file.imports.some((ref) => ref.specifier === "@testing-library/react") && !file.raw.startsWith("// @vitest-environment jsdom")
          ? ["jsdom 프라그마 없음"]
          : [],
      ),
    ).toEqual([]);
  });

  it("node:·vitest import는 테스트 파일에만 있다", () => {
    expect(
      violations((file) =>
        file.isTest
          ? []
          : file.imports.filter((ref) => ref.specifier.startsWith("node:") || ref.specifier === "vitest").map((ref) => `테스트 밖 import: ${ref.specifier}`),
      ),
    ).toEqual([]);
  });
});

/** 이 파일은 검사 패턴을 소스로 담고 있으므로 위생 검사 대상에서 자기 자신만 뺀다. */
const SELF_REL = "architecture.test.ts";
/**
 * `any` 타입 사용 위치: `: any`, `as any`, `<any>`/`<string, any>`, `(any)`, `extends any`.
 * 식별자·객체 키로 쓰인 `any`(`let any`, `{ any: true }`)는 타입이 아니므로 잡지 않는다.
 */
const ANY_TYPE_PATTERN = /(?:[:<,(]\s*|\b(?:as|extends)\s+)any(?![\w$:])/u;

describe("architecture: 결정성·타입 위생", () => {
  it("Math.random을 쓰지 않는다(테스트 포함)", () => {
    expect(violations((file) => (file.rel !== SELF_REL && /Math\.random/u.test(file.code) ? ["Math.random 사용"] : []))).toEqual([]);
  });

  it("`any` 타입을 쓰지 않는다", () => {
    expect(violations((file) => (file.rel !== SELF_REL && ANY_TYPE_PATTERN.test(stripStrings(file.code)) ? ["any 타입 사용"] : []))).toEqual([]);
  });

  it("@ts-ignore·@ts-nocheck·eslint-disable을 쓰지 않는다", () => {
    expect(violations((file) => (file.rel !== SELF_REL && /@ts-ignore|@ts-nocheck|eslint-disable/u.test(file.raw) ? ["ignore 주석 사용"] : []))).toEqual([]);
  });
});

describe("architecture: import 수집기·경계 게이트 회귀(여러 줄 import/export)", () => {
  /** 한 줄이 따옴표로 시작하는 문자열 배열을 합쳐 합성 소스를 만든다(이 파일 자신의 줄 시작 검사에 걸리지 않게). */
  const lines = (...rows: string[]): string => rows.join("\n");
  const collected = (rel: string, source: string): string[] => makeSourceFile(rel, source).imports.map((ref) => `${ref.kind}:${ref.specifier}`).sort();

  it("collectImports는 여러 줄 import·export from·import type·side-effect·동적 import를 모두 수집한다", () => {
    const source = lines(
      'import {',
      '  Engine,',
      '  Scene,',
      '} from "@babylonjs/core";',
      'import type {',
      '  A,',
      '  B,',
      '} from "./a";',
      'import Default, {',
      '  named,',
      '} from "./b";',
      'import * as ns from "./c";',
      'export {',
      '  x,',
      '  y,',
      '} from "./d";',
      'export * from "./e";',
      'export type {',
      '  T,',
      '} from "./f";',
      'import "./side";',
      'import{compact}from"./g";',
      'export const lazy = () => import("./h");',
    );
    expect(collected("app/zz.ts", source)).toEqual(
      [
        "static:@babylonjs/core",
        "static:./a",
        "static:./b",
        "static:./c",
        "static:./d",
        "static:./e",
        "static:./f",
        "side-effect:./side",
        "static:./g",
        "dynamic:./h",
      ].sort(),
    );
  });

  it("주석·문자열 안의 import 문구는 수집하지 않는다", () => {
    const source = lines('// import { a } from "../humanoid/x";', "/*", 'import "side-effect-in-comment";', "*/", 'export const s = "import { b } from \\"y\\"";');
    expect(collected("app/zz.ts", source)).toEqual([]);
  });

  it("render 밖의 여러 줄 `@babylonjs` import를 Babylon 격리 게이트가 위반으로 잡는다", () => {
    const multiLine = makeSourceFile("app/zz.ts", lines('import {', '  Engine,', '  Scene,', '} from "@babylonjs/core";'));
    expect(babylonOutsideRenderViolations(multiLine)).toEqual(["render 밖 @babylonjs import: @babylonjs/core"]);
    // 같은 내용을 한 줄로 써도, 여러 줄 `export … from`으로 우회해도 잡는다
    expect(babylonOutsideRenderViolations(makeSourceFile("app/zz.ts", 'import { Engine } from "@babylonjs/core";'))).toHaveLength(1);
    expect(babylonOutsideRenderViolations(makeSourceFile("app/zz.ts", lines('export {', '  Engine,', '} from "@babylonjs/core";')))).toHaveLength(1);
    // render 안은 허용
    expect(babylonOutsideRenderViolations(makeSourceFile("render/babylon/zz.ts", lines('import {', '  Engine,', '} from "@babylonjs/core";')))).toEqual([]);
  });

  it("다른 도메인을 가져오는 여러 줄 import를 도메인 경계 게이트가 위반으로 잡는다", () => {
    const cross = makeSourceFile("domains/outfit/zz.ts", lines('import {', '  a,', '  b,', '} from "../humanoid/x";'));
    expect(domainBoundaryViolations(cross)).toEqual(["도메인 교차 import: ../humanoid/x"]);
    const crossFlat = makeSourceFile("animation/zz.ts", lines('export {', '  a,', '} from "../paint/x";'));
    expect(domainBoundaryViolations(crossFlat)).toEqual(["도메인 교차 import: ../paint/x"]);
    // 같은 영역·contracts·shared는 여러 줄이어도 통과
    const allowed = makeSourceFile("domains/outfit/zz.ts", lines('import {', '  a,', '} from "./y";', 'import {', '  b,', '} from "../../contracts";', 'import {', '  c,', '} from "../../shared/math";'));
    expect(domainBoundaryViolations(allowed)).toEqual([]);
  });

  it("실제 소스의 여러 줄 import/export 닫는 줄(`} from \"…\"`)이 모두 수집돼 있다(수집기가 실소스에서 눈먼 곳이 없다)", () => {
    let multiLineFiles = 0;
    const missed: string[] = [];
    for (const file of sources) {
      const specifiers = new Set(file.imports.map((ref) => ref.specifier));
      let hasMultiLine = false;
      for (const match of file.code.matchAll(/^\}\s*from\s*["']([^"']+)["']/gmu)) {
        hasMultiLine = true;
        if (!specifiers.has(match[1] as string)) missed.push(`${file.rel}: ${match[1] as string}`);
      }
      if (hasMultiLine) multiLineFiles += 1;
    }
    // 여러 줄 import가 실제로 존재하므로(없으면 이 검사가 공회전) 최소 1개 이상 확인했는지도 고정한다.
    expect(multiLineFiles).toBeGreaterThan(0);
    expect(missed).toEqual([]);
  });
});
