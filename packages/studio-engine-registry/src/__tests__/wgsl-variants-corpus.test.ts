import { describe, expect, it } from "vitest";

import { composeWgslVariant, identityWgslLut3 } from "../wgsl-variants";

import type { ComposedWgslVariant, WgslFilterOpSpec } from "../wgsl-variants";

/**
 * WGSL variant corpus emitter (V12 lane 5 WESL 재개 게이트 2단계).
 *
 * 브라우저 검증(wgsl-variants-browser.test.ts)이 컴파일 게이트로 삼는 생성기
 * 출력 공간 — 단일 연산 5 + 순서 있는 2연산 25 + 5연산 풀체인 1 + 파라미터
 * 구조 변형 4, variantKey dedup 후 35개 — 을 **디스크 코퍼스**
 * (tests/corpus/wgsl-variants/<variantKey>.wgsl + manifest.json)로 방출한다.
 * Naga(네이티브) validation 매트릭스
 * (crates/studio-engine-vello/tests/wgsl_variant_validation.rs)가 이 코퍼스를
 * 전수 파싱·검증하므로, 여기의 드리프트 게이트가 "코퍼스 = 생성기 현재 출력"
 * 을 보장해야 네이티브 실측이 브라우저 실측과 같은 대상을 본다.
 *
 * 골든 규약(tests/visual/* 코퍼스 패턴 준수): 커밋된 파일과 생성기 출력이
 * 다르면 실패하고, REGEN_WGSL_VARIANT_CORPUS=1 로 재생성한다.
 *
 * WGSL 소스와 variantKey 는 연산 시퀀스+파라미터 "구조"만의 함수다(값은
 * uniform/LUT 바인딩) — 따라서 LUT 스테이지는 항등 LUT 로 열거해도 브라우저
 * 코퍼스와 소스·키가 동일하다.
 */

// ---------------------------------------------------------------------------
// node 내장 모듈 접근 — 이 패키지 tsconfig 는 @types/node 를 포함하지 않으므로
// (types 필드 없음 + 패키지 devDep 없음), 정적 `node:*` import 는 타입 해석이
// 안 된다. 브라우저 프로브 테스트와 동일하게 변수 지정자 동적 import + 최소
// 구조 타입으로 접근한다(tsconfig/package.json 은 이 레인의 무접촉 대상).
// ---------------------------------------------------------------------------

const dynamicImport = (specifier: string): Promise<unknown> =>
  import(/* @vite-ignore */ specifier);

interface NodeFsPromisesModule {
  mkdir(path: URL, options: { recursive: boolean }): Promise<unknown>;
  readdir(path: URL): Promise<string[]>;
  readFile(path: URL, encoding: "utf8"): Promise<string>;
  writeFile(path: URL, data: string): Promise<void>;
  rm(path: URL): Promise<void>;
}

const loadFs = async (): Promise<NodeFsPromisesModule> =>
  (await dynamicImport("node:fs/promises")) as NodeFsPromisesModule;

const REGEN =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.REGEN_WGSL_VARIANT_CORPUS === "1";

const CORPUS_DIR_URL = new URL(
  "../../../../tests/corpus/wgsl-variants/",
  import.meta.url,
);
const MANIFEST_NAME = "manifest.json";

// ---------------------------------------------------------------------------
// Variant corpus — 브라우저 프로브(wgsl-variants-browser.test.ts)와 동일한
// 결정적 열거. 구조 공간이 대상이므로 파라미터 값은 대표값 하나면 충분하다.
// ---------------------------------------------------------------------------

function sampleSpec(kind: "bc" | "hsl" | "lv" | "cv" | "cb"): WgslFilterOpSpec {
  switch (kind) {
    case "bc":
      return { op: "brightness-contrast", brightness: 0.2, contrast: 15 };
    case "hsl":
      return { op: "hsl", hue: 30, saturation: 0.4, luminance: 0.05 };
    case "lv":
      return { op: "levels", lut: identityWgslLut3() };
    case "cv":
      return { op: "curves", lut: identityWgslLut3() };
    case "cb":
      return {
        op: "color-balance",
        shadows: [15, 0, -5],
        midtones: [0, 8, 0],
        highlights: [20, 8, -10],
      };
  }
}

const KINDS = ["bc", "hsl", "lv", "cv", "cb"] as const;
const EXPECTED_VARIANT_COUNT = 35;

function variantCorpus(): ComposedWgslVariant[] {
  const chains: WgslFilterOpSpec[][] = [];
  for (const kind of KINDS) chains.push([sampleSpec(kind)]);
  for (const first of KINDS) {
    for (const second of KINDS) {
      chains.push([sampleSpec(first), sampleSpec(second)]);
    }
  }
  // 지원 5연산 전부를 한 패스로 융합한 풀체인(브라우저 프로브의 대표 variant).
  chains.push(KINDS.map((kind) => sampleSpec(kind)));
  // 파라미터 구조 변형 — 같은 연산이라도 구조가 다르면 별도 variant 키다.
  chains.push([{ op: "brightness-contrast", brightness: 0.2 }]);
  chains.push([{ op: "brightness-contrast", contrast: 15 }]);
  chains.push([{ op: "hsl", hue: 30 }]);
  chains.push([{ op: "color-balance", midtones: [0, 8, 0] }]);

  const byKey = new Map<string, ComposedWgslVariant>();
  for (const chain of chains) {
    const variant = composeWgslVariant(chain);
    if (!byKey.has(variant.variantKey)) byKey.set(variant.variantKey, variant);
  }
  return [...byKey.values()];
}

interface CorpusManifest {
  harness: string;
  note: string;
  generator: string;
  enumeration: string;
  regen: string;
  variantCount: number;
  variants: Array<{
    variantKey: string;
    file: string;
    structure: string;
    ops: string[];
    usesLut: boolean;
    lutEntryCount: number;
    uniformByteLength: number;
  }>;
}

function buildManifest(corpus: readonly ComposedWgslVariant[]): CorpusManifest {
  return {
    harness:
      "packages/studio-engine-registry/src/__tests__/wgsl-variants-corpus.test.ts",
    note:
      "V12 lane 5 (WESL_SHADER_PLATFORM) 재개 게이트 2단계 — 브라우저 컴파일 게이트와 동일한 융합 WGSL variant 전수를 Naga(네이티브) validation 매트릭스(crates/studio-engine-vello/tests/wgsl_variant_validation.rs)에 공급하는 커밋 코퍼스",
    generator:
      "composeWgslVariant (packages/studio-engine-registry/src/wgsl-variants.ts)",
    enumeration:
      "single-op 5 + ordered pairs 25 + full 5-op chain 1 + parameter-structure variants 4, deduped by variantKey",
    regen: "REGEN_WGSL_VARIANT_CORPUS=1",
    variantCount: corpus.length,
    variants: corpus.map((variant) => ({
      variantKey: variant.variantKey,
      file: `${variant.variantKey}.wgsl`,
      structure: variant.structure,
      ops: variant.stages.map((stage) => stage.op),
      usesLut: variant.usesLut,
      lutEntryCount: variant.lutEntryCount,
      uniformByteLength: variant.uniformByteLength,
    })),
  };
}

function manifestText(corpus: readonly ComposedWgslVariant[]): string {
  return `${JSON.stringify(buildManifest(corpus), null, 2)}\n`;
}

describe("wgsl variant corpus — 결정적 방출과 드리프트 게이트", () => {
  it("생성기 출력 공간이 브라우저 검증과 동일한 35개 고유 variant 를 낳는다", () => {
    const corpus = variantCorpus();
    expect(corpus).toHaveLength(EXPECTED_VARIANT_COUNT);
    const keys = corpus.map((variant) => variant.variantKey);
    expect(new Set(keys).size).toBe(EXPECTED_VARIANT_COUNT);
    // variantKey 가 곧 파일명이므로 경로 안전 문자만 허용된다.
    for (const key of keys) {
      expect(key).toMatch(/^wgslfx-v1-[a-z.]+-[0-9a-f]{8}$/);
    }
  });

  it("커밋 코퍼스가 생성기 출력과 드리프트 없이 일치한다 (REGEN_WGSL_VARIANT_CORPUS=1 재생성)", async () => {
    const corpus = variantCorpus();
    const expectedFiles = new Map<string, string>(
      corpus.map((variant) => [`${variant.variantKey}.wgsl`, variant.wgsl]),
    );
    const expectedManifest = manifestText(corpus);
    const fs = await loadFs();

    if (REGEN) {
      await fs.mkdir(CORPUS_DIR_URL, { recursive: true });
      const existing = await fs.readdir(CORPUS_DIR_URL);
      // 고아 .wgsl 정리 — 재생성 후 디렉터리가 곧 정본 코퍼스가 되도록.
      for (const name of existing) {
        if (name.endsWith(".wgsl") && !expectedFiles.has(name)) {
          await fs.rm(new URL(name, CORPUS_DIR_URL));
        }
      }
      for (const [name, wgsl] of expectedFiles) {
        await fs.writeFile(new URL(name, CORPUS_DIR_URL), wgsl);
      }
      await fs.writeFile(new URL(MANIFEST_NAME, CORPUS_DIR_URL), expectedManifest);
      return;
    }

    let entries: string[];
    try {
      entries = await fs.readdir(CORPUS_DIR_URL);
    } catch {
      throw new Error(
        "tests/corpus/wgsl-variants/ 가 없다 — REGEN_WGSL_VARIANT_CORPUS=1 로 코퍼스를 생성해 커밋하라",
      );
    }
    const committed = new Set(entries.filter((name) => name.endsWith(".wgsl")));
    const missing = [...expectedFiles.keys()].filter((name) => !committed.has(name));
    const orphans = [...committed].filter((name) => !expectedFiles.has(name));
    expect(missing, `커밋 코퍼스에 없는 variant 파일: ${missing.join(", ")}`).toEqual([]);
    expect(orphans, `생성기 출력에 없는 고아 파일: ${orphans.join(", ")}`).toEqual([]);

    for (const [name, wgsl] of expectedFiles) {
      const onDisk = await fs.readFile(new URL(name, CORPUS_DIR_URL), "utf8");
      expect(onDisk, `${name} 드리프트 — REGEN_WGSL_VARIANT_CORPUS=1 로 재생성하라`).toBe(
        wgsl,
      );
    }

    expect(entries.includes(MANIFEST_NAME), `${MANIFEST_NAME} 누락`).toBe(true);
    const manifestOnDisk = await fs.readFile(
      new URL(MANIFEST_NAME, CORPUS_DIR_URL),
      "utf8",
    );
    expect(
      manifestOnDisk,
      `${MANIFEST_NAME} 드리프트 — REGEN_WGSL_VARIANT_CORPUS=1 로 재생성하라`,
    ).toBe(expectedManifest);
  });
});
