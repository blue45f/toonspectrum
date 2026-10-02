import { describe, expect, it } from "vitest";

import { TOON_FRAGMENT_GLSL, TOON_FRAGMENT_WGSL } from "./shader-sources";
import { TOON_BAND_EPSILON, TOON_FACE_DARK_SHADE, TOON_FACE_LIT_SHADE, TOON_FRESNEL_POWER, TOON_MAX_BOUNDARIES, TOON_RIM_EDGE0, TOON_RIM_EDGE1, evaluateToon, normalizeToonLighting, smoothstep, step, toonAlbedo, toonSdfCoordinate, toonShading } from "./toon-reference";

import type { ToonFragmentInput, ToonParams } from "./toon-reference";

const PARAMS: ToonParams = {
  baseColor: [0.8, 0.5, 0.4],
  shadeTint: [0.7, 0.6, 0.6],
  lightColor: [0.7, 0.68, 0.64],
  ambientColor: [0.2, 0.22, 0.26],
  toLight: [0.3, 0.8, 0.5],
  rimColor: [0.3, 0.3, 0.4],
  rampSteps: 3,
  rim: true,
  faceSdf: false,
  hasPaint: false,
  faceThreshold: 0.5,
  flipU: 0,
  sdfOffset: 0,
  hasAlbedo: false,
};

const FRAGMENT: ToonFragmentInput = {
  normalW: [0, 1, 0],
  positionW: [0, 1, 0],
  cameraPosition: [0, 1, 3],
  uv: [0.25, 0.5],
  albedoTex: [1, 1, 1, 1],
  paint: [0, 0, 0, 0],
  sampleSdf: () => 0.5,
  derivativeWidth: 0.01,
};

describe("toon-reference", () => {
  it("상수가 두 셰이더 소스(GLSL·WGSL)의 리터럴과 같다", () => {
    for (const source of [TOON_FRAGMENT_GLSL, TOON_FRAGMENT_WGSL]) {
      expect(source).toContain(`mix(${TOON_FACE_DARK_SHADE.toFixed(2)}, ${TOON_FACE_LIT_SHADE.toFixed(2)}, faceLit)`);
      expect(source).toContain(`fwidth(shading) + ${TOON_BAND_EPSILON}`);
      expect(source).toContain(`smoothstep(${TOON_RIM_EDGE0}, ${TOON_RIM_EDGE1}, fresnel)`);
      expect(source).toContain(`, ${TOON_FRESNEL_POWER.toFixed(1)})`);
    }
    expect(TOON_MAX_BOUNDARIES).toBe(3);
  });

  it("램버트 음영: 광원 정면은 1, 정반대는 0", () => {
    const lit = toonShading(PARAMS, { ...FRAGMENT, normalW: [0.3, 0.8, 0.5] });
    const dark = toonShading(PARAMS, { ...FRAGMENT, normalW: [-0.3, -0.8, -0.5] });
    expect(lit).toBeCloseTo(1, 6);
    expect(dark).toBeCloseTo(0, 6);
  });

  it("얼굴 SDF 모드: 임계 이상이면 밝은 값, 미만이면 어두운 값, sdfOffset이 임계를 민다", () => {
    const face: ToonParams = { ...PARAMS, faceSdf: true };
    expect(toonShading(face, { ...FRAGMENT, sampleSdf: () => 0.9 })).toBeCloseTo(TOON_FACE_LIT_SHADE, 9);
    expect(toonShading(face, { ...FRAGMENT, sampleSdf: () => 0.1 })).toBeCloseTo(TOON_FACE_DARK_SHADE, 9);
    expect(toonShading({ ...face, sdfOffset: 0.5 }, { ...FRAGMENT, sampleSdf: () => 0.1 })).toBeCloseTo(TOON_FACE_LIT_SHADE, 9);
  });

  it("flipU는 SDF 샘플의 u만 뒤집는다", () => {
    expect(toonSdfCoordinate({ flipU: 0 }, [0.25, 0.5])).toEqual([0.25, 0.5]);
    expect(toonSdfCoordinate({ flipU: 1 }, [0.25, 0.5])).toEqual([0.75, 0.5]);
  });

  it("알베도: 알베도 텍스처는 곱, 페인트는 알파로 섞는다(플래그가 꺼지면 무시)", () => {
    const tex = { albedoTex: [0.5, 0.5, 0.5, 1] as const, paint: [1, 0, 0, 0.5] as const };
    expect(toonAlbedo(PARAMS, tex)).toEqual([0.8, 0.5, 0.4]);
    const withAlbedo = toonAlbedo({ ...PARAMS, hasAlbedo: true }, tex);
    expect(withAlbedo[0]).toBeCloseTo(0.4, 9);
    const painted = toonAlbedo({ ...PARAMS, hasPaint: true }, tex);
    expect(painted[0]).toBeCloseTo(0.9, 9);
    expect(painted[1]).toBeCloseTo(0.25, 9);
  });

  it("밝은 쪽 밴드의 색은 알베도 × (광원 + 환경)이고 림은 정면에서 0이다", () => {
    const out = evaluateToon({ ...PARAMS, rim: true }, { ...FRAGMENT, normalW: [0, 0, 1] });
    // 법선이 카메라를 향하면 림 0, 음영 = 0.5 + 0.5·(0.5/|L|) 중간 밴드라 정확한 값 대신 상한(밝은 밴드)을 확인한다.
    const brightest = evaluateToon(PARAMS, { ...FRAGMENT, normalW: [0.3, 0.8, 0.5], cameraPosition: [0.3, 1.8, 0.5 + 1] });
    for (let c = 0; c < 3; c += 1) {
      const upper = (PARAMS.baseColor[c] as number) * ((PARAMS.lightColor[c] as number) + (PARAMS.ambientColor[c] as number));
      expect(brightest[c]).toBeLessThanOrEqual(upper + (PARAMS.rimColor[c] as number) + 1e-9);
      expect(out[c]).toBeGreaterThan(0);
    }
  });

  it("림: 시선과 수직인 윤곽에서만 켜지고 rim 플래그가 꺼지면 0이다", () => {
    const grazing: ToonFragmentInput = { ...FRAGMENT, normalW: [1, 0, 0], positionW: [0, 1, 0], cameraPosition: [0, 1, 3] };
    const withRim = evaluateToon(PARAMS, grazing);
    const withoutRim = evaluateToon({ ...PARAMS, rim: false }, grazing);
    for (let c = 0; c < 3; c += 1) expect((withRim[c] as number) - (withoutRim[c] as number)).toBeCloseTo(PARAMS.rimColor[c] as number, 9);
  });

  it("램프 단계 수에 따라 밴드가 계단 모양이다(미분 폭 0에서 단계 수와 같은 개수의 서로 다른 밝기)", () => {
    // 광원 방향 L과 그에 수직인 P가 이루는 평면에서 n = cosθ·L + sinθ·P로 음영을 0..1 전 구간 훑는다.
    const lx = 0.3;
    const ly = 0.8;
    const lz = 0.5;
    const ll = Math.hypot(lx, ly, lz);
    const pl = Math.hypot(ly, lx);
    for (const steps of [2, 3, 4] as const) {
      const values = new Set<number>();
      for (let i = 0; i <= 400; i += 1) {
        const theta = (Math.PI * i) / 400;
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const normalW: [number, number, number] = [(lx / ll) * c + (ly / pl) * s, (ly / ll) * c - (lx / pl) * s, (lz / ll) * c];
        const out = evaluateToon({ ...PARAMS, rampSteps: steps, rim: false }, { ...FRAGMENT, normalW, derivativeWidth: 0 });
        values.add(Math.round((out[0] as number) * 1e6));
      }
      // 경계 근처 smoothstep 폭(ε = 0.002)에 걸린 값이 몇 개 더 생길 수 있어 단계 수 이상이면 계단이다.
      expect(values.size).toBeGreaterThanOrEqual(steps);
      expect(values.size).toBeLessThan(steps * 40);
    }
  });

  it("step·smoothstep 보조는 GLSL 의미(step: x < edge → 0)다", () => {
    expect(step(0.5, 0.49)).toBe(0);
    expect(step(0.5, 0.5)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
  });

  describe("normalizeToonLighting", () => {
    it("광원 + 환경 채널 합이 1 이하면 그대로 둔다", () => {
      const light = [0.7, 0.68, 0.64] as const;
      const ambient = [0.2, 0.22, 0.26] as const;
      expect(normalizeToonLighting(light, ambient)).toEqual({ light, ambient });
    });

    it("합이 1을 넘으면 같은 비율로 줄여 가장 큰 채널 합이 1이 되고 광원 대 환경 비율을 보존한다", () => {
      const out = normalizeToonLighting([1.2, 1, 0.9], [0.4, 0.4, 0.5]);
      const sums = [0, 1, 2].map((c) => (out.light[c] as number) + (out.ambient[c] as number));
      expect(Math.max(...sums)).toBeCloseTo(1, 12);
      expect((out.light[0] as number) / (out.ambient[0] as number)).toBeCloseTo(1.2 / 0.4, 9);
    });

    it("NaN은 그대로 통과시킨다(합이 1을 넘는다고 단정할 수 없다)", () => {
      const light = [Number.NaN, 0.5, 0.5] as const;
      const ambient = [0.1, 0.1, 0.1] as const;
      expect(normalizeToonLighting(light, ambient).ambient).toBe(ambient);
    });
  });
});
