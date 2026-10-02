/**
 * NodeMaterial 툰(베타) NullEngine 테스트: 그래프 구성·`build()` 코드 생성(GLSL·WGSL)·uniform 입력 이름·`ToonParams` 의미 일치(그래프 해석기 vs CPU 기준)·해제.
 * 셰이더 컴파일·렌더 결과는 NullEngine이 검증하지 못한다 → docs/parity/render.md "브라우저 미검증"(SwiftShader 소프트웨어 렌더러 실측만 있음).
 */
import { afterEach, describe, expect, it } from "vitest";

import { evaluateGraph } from "./testing/node-graph-interpreter";
import { NODE_SHADER_LANGUAGE, NODE_TOON_INPUTS, createBareNullScene, createNodeToon, nodeLanguageFor } from "./testing/null-engine-harness";
import { evaluateToon } from "./toon-reference";

import type { BareNullScene, NodeToon } from "./testing/null-engine-harness";
import type { ToonFragmentInput, ToonParams } from "./toon-reference";
import type { NodeMaterialConnectionPoint } from "@babylonjs/core/Materials/Node/nodeMaterialBlockConnectionPoint.js";

let fixtures: BareNullScene[] = [];

afterEach(() => {
  for (const fixture of fixtures) fixture.dispose();
  fixtures = [];
});

function bare(webGPU = false): BareNullScene {
  const fixture = createBareNullScene(webGPU ? { isWebGPU: true } : {});
  fixtures.push(fixture);
  return fixture;
}

/** 결정적 난수(mulberry32) — Math.random 금지 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Triple = readonly [number, number, number];

function randomParams(rand: () => number): ToonParams {
  const color = (scale = 1): Triple => [rand() * scale, rand() * scale, rand() * scale];
  return {
    baseColor: color(),
    shadeTint: color(),
    lightColor: color(1.2),
    ambientColor: color(0.5),
    toLight: [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 0.9],
    rimColor: color(),
    rampSteps: ([2, 3, 4] as const)[Math.floor(rand() * 3)] ?? 3,
    rim: rand() > 0.5,
    faceSdf: rand() > 0.5,
    hasPaint: rand() > 0.5,
    faceThreshold: 0.2 + rand() * 0.6,
    flipU: rand() > 0.5 ? 1 : 0,
    sdfOffset: rand() * 0.4 - 0.2,
    hasAlbedo: rand() > 0.5,
  };
}

function randomFragment(rand: () => number): ToonFragmentInput {
  const sdf = (u: number, v: number): number => 0.5 + 0.5 * Math.sin(u * 7 + v * 3);
  return {
    normalW: [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1.1],
    positionW: [rand() * 2 - 1, rand() * 2, rand() * 2 - 1],
    cameraPosition: [rand() * 4 - 2, rand() * 2, 3 + rand()],
    uv: [rand(), rand()],
    albedoTex: [rand(), rand(), rand(), rand()],
    paint: [rand(), rand(), rand(), rand()],
    sampleSdf: sdf,
    derivativeWidth: rand() * 0.05,
  };
}

function fragmentOutput(toon: NodeToon): NodeMaterialConnectionPoint {
  const block = toon.material.getBlockByName("fragmentOutput");
  if (!block) throw new Error("fragmentOutput 블록이 없습니다.");
  const rgb = (block as unknown as { rgb: NodeMaterialConnectionPoint }).rgb.connectedPoint;
  if (!rgb) throw new Error("fragmentOutput.rgb가 연결되지 않았습니다.");
  return rgb;
}

describe("NodeMaterial 툰 베타(NullEngine)", () => {
  it("그래프를 만들고 GLSL로 빌드한다(블록 100개 이상, 코드 생성 완료)", async () => {
    const { scene } = bare();
    const toon = createNodeToon(scene, nodeLanguageFor(false), "node-toon:test");
    await toon.ready;
    expect(toon.language).toBe(NODE_SHADER_LANGUAGE.glsl);
    expect(toon.blockCount).toBeGreaterThanOrEqual(100);
    const code = toon.material.compiledShaders;
    expect(code).toContain("void main(");
    for (const name of ["baseColor", "shadeTint", "lightColor", "ambientColor", "toLight", "rimColor", "rampSteps"]) expect(code).toContain(name);
    expect(code).toMatch(/smoothstep\(/u);
    expect(code).toMatch(/dFdx|dFdy/u);
    expect(code).toMatch(/texture\(|texture2D\(/u);
  });

  it("WGSL로도 빌드한다(WebGPU 엔진 가장 — 실제 WGSL 컴파일은 브라우저 미검증)", async () => {
    const { scene } = bare(true);
    const toon = createNodeToon(scene, nodeLanguageFor(true), "node-toon:wgsl");
    await toon.ready;
    expect(toon.language).toBe(NODE_SHADER_LANGUAGE.wgsl);
    const code = toon.material.compiledShaders;
    expect(code).toMatch(/fn main\(|@vertex|@fragment/u);
    expect(code).toMatch(/dpdx|dpdy/u);
    expect(code).toContain("smoothstep(");
  });

  it("언어 선택: WebGPU만 WGSL이다", () => {
    expect(nodeLanguageFor(true)).toBe(NODE_SHADER_LANGUAGE.wgsl);
    expect(nodeLanguageFor(false)).toBe(NODE_SHADER_LANGUAGE.glsl);
  });

  it("uniform 입력 이름이 ToonParams 필드와 같고 모두 그래프에 있다", async () => {
    const { scene } = bare();
    const toon = createNodeToon(scene, nodeLanguageFor(false), "node-toon:inputs");
    await toon.ready;
    expect([...NODE_TOON_INPUTS]).toEqual(["baseColor", "shadeTint", "lightColor", "ambientColor", "toLight", "rimColor", "rampSteps", "rimFlag", "faceSdfFlag", "hasPaintFlag", "faceThreshold", "flipUFlag", "sdfOffset", "hasAlbedoFlag"]);
    for (const name of NODE_TOON_INPUTS) expect(toon.material.getBlockByName(name)?.getClassName(), name).toBe("InputBlock");
  });

  it("그래프 해석 결과가 CPU 기준 구현(evaluateToon)과 같다(무작위 300 프래그먼트, 시드 고정)", async () => {
    const { scene } = bare();
    const toon = createNodeToon(scene, nodeLanguageFor(false), "node-toon:equivalence");
    await toon.ready;
    const output = fragmentOutput(toon);
    const rand = seeded(20261001);
    let maxError = 0;
    for (let i = 0; i < 300; i += 1) {
      const params = randomParams(rand);
      const fragment = randomFragment(rand);
      toon.setParams(params);
      const graph = evaluateGraph(output, {
        uv: fragment.uv,
        cameraPosition: fragment.cameraPosition,
        transforms: { worldPosition: fragment.positionW, worldNormal: fragment.normalW },
        samplers: {
          albedoTexture: () => fragment.albedoTex,
          paintTexture: () => fragment.paint,
          sdfTexture: (u, v) => [fragment.sampleSdf(u, v), 0, 0, 1],
        },
        // fwidth = |dx| + |dy|: 합이 derivativeWidth가 되도록 나눠 넣는다.
        derivative: () => ({ dx: fragment.derivativeWidth * 0.6, dy: -fragment.derivativeWidth * 0.4 }),
      });
      const expected = evaluateToon(params, fragment);
      const actual = graph as readonly number[];
      for (let c = 0; c < 3; c += 1) maxError = Math.max(maxError, Math.abs((actual[c] as number) - (expected[c] as number)));
    }
    // 램프 경계에서 `<` 비교가 부동소수 오차로 갈릴 수 있어 허용 오차를 1e-9로 둔다(실측 최대 오차는 1e-15 수준).
    expect(maxError).toBeLessThan(1e-9);
  });

  it("그래프 해석: 얼굴 SDF·페인트·알베도 분기가 모두 켜진 경우도 기준과 같다", async () => {
    const { scene } = bare();
    const toon = createNodeToon(scene, nodeLanguageFor(false), "node-toon:branches");
    await toon.ready;
    const output = fragmentOutput(toon);
    const params: ToonParams = {
      baseColor: [0.8, 0.6, 0.5],
      shadeTint: [0.86, 0.6, 0.58],
      lightColor: [0.7, 0.68, 0.64],
      ambientColor: [0.2, 0.22, 0.26],
      toLight: [0.3, 0.8, 0.5],
      rimColor: [0.35, 0.35, 0.4],
      rampSteps: 4,
      rim: true,
      faceSdf: true,
      hasPaint: true,
      faceThreshold: 0.4,
      flipU: 1,
      sdfOffset: 0.1,
      hasAlbedo: true,
    };
    const fragment: ToonFragmentInput = {
      normalW: [0.1, 0.3, 1],
      positionW: [0, 1.5, 0],
      cameraPosition: [0.2, 1.4, 2.5],
      uv: [0.3, 0.6],
      albedoTex: [0.9, 0.7, 0.6, 1],
      paint: [0.2, 0.4, 0.9, 0.5],
      sampleSdf: (u, v) => (u > 0.5 ? 0.9 : 0.1) + v * 0,
      derivativeWidth: 0.02,
    };
    toon.setParams(params);
    const graph = evaluateGraph(output, {
      uv: fragment.uv,
      cameraPosition: fragment.cameraPosition,
      transforms: { worldPosition: fragment.positionW, worldNormal: fragment.normalW },
      samplers: { albedoTexture: () => fragment.albedoTex, paintTexture: () => fragment.paint, sdfTexture: (u, v) => [fragment.sampleSdf(u, v), 0, 0, 1] },
      derivative: () => ({ dx: 0.012, dy: -0.008 }),
    }) as readonly number[];
    const expected = evaluateToon(params, fragment);
    for (let c = 0; c < 3; c += 1) expect(graph[c]).toBeCloseTo(expected[c] as number, 9);
  });

  it("텍스처는 2D Texture만 받고 아니면 한글 오류를 낸다", async () => {
    const { scene } = bare();
    const toon = createNodeToon(scene, nodeLanguageFor(false), "node-toon:textures");
    await toon.ready;
    const notTexture = { getClassName: () => "CubeTexture" } as unknown as Parameters<NodeToon["setTextures"]>[0]["albedo"];
    expect(() => toon.setTextures({ albedo: notTexture, paint: notTexture, sdf: notTexture })).toThrow("2D Texture여야 합니다");
  });

  it("dispose는 장면에서 재질을 제거한다(누수 없음)", async () => {
    const { scene } = bare();
    const before = scene.materials.length;
    const toon = createNodeToon(scene, nodeLanguageFor(false), "node-toon:dispose");
    await toon.ready;
    expect(scene.materials.length).toBe(before + 1);
    toon.dispose();
    expect(scene.materials.length).toBe(before);
  });
});
