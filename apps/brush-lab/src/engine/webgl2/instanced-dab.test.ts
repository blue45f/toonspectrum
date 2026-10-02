import { describe, expect, it } from "vitest";

import { DabBatch } from "../core/dab-layout";
import { InvalidStateError, LaneUnavailableError, SumiError } from "../core/errors";
import { normalizeProgram } from "../presets/program-schema";

import { GL, Webgl2InstancedRuntime, WEBGL2_REQUIRED_EXTENSION } from "./instanced-dab";
import { BLIT_FRAGMENT_GLSL, DAB_FRAGMENT_GLSL, DAB_VERTEX_GLSL, GLSL_VERSION, WEBGL2_SHADERS } from "./shaders";
import { createMockWebgl2 } from "./testing/mock-webgl2";

import type { DabInstance } from "../core/types";

const program = normalizeProgram({ id: "gl-dry", name: "dry", family: "pencil", description: "" });

function dab(x: number, y: number): DabInstance {
  return {
    x, y, rx: 3, ry: 3, angle: 0, hardness: 0.8, flow: 0.5, shapeExp: 2, r: 0, g: 0, b: 0, a: 1,
    tipKind: "round", seed: 1, grain: 0, wet: 0, pigmentMass: 0.5,
    erase: false, smudge: false, dualTip: false, lockAlpha: false, impasto: false, deposition: "dry-stamp",
  };
}

function batchOf(n: number): DabBatch {
  const b = new DabBatch(Math.max(1, n));
  for (let i = 0; i < n; i += 1) b.push(dab(8 + i, 8));
  return b;
}

describe("webgl2 GLSL 정적 검사", () => {
  it("ES 3.00 헤더·precision·attribute 4개·flat varying·out 선언", () => {
    for (const [name, src] of Object.entries(WEBGL2_SHADERS)) {
      expect(src.startsWith(GLSL_VERSION), name).toBe(true);
      expect(src, name).toMatch(/precision highp float;/);
      expect(src, name).not.toMatch(/texture2D\(|gl_FragColor/);
      expect(src, name).not.toMatch(/undefined|NaN/);
    }
    for (let loc = 0; loc < 4; loc += 1) expect(DAB_VERTEX_GLSL).toContain(`layout(location = ${loc}) in`);
    expect(DAB_VERTEX_GLSL).toContain("in uvec4 a3");
    expect((DAB_VERTEX_GLSL.match(/flat out/g) ?? []).length).toBe(4);
    expect((DAB_FRAGMENT_GLSL.match(/flat in/g) ?? []).length).toBe(4);
    expect(DAB_FRAGMENT_GLSL).toContain("out vec4 o_color;");
    expect(BLIT_FRAGMENT_GLSL).toContain("out vec4 o_color;");
  });

  it("WGSL과 같은 상수·함수 이름(미러)을 쓴다", () => {
    expect(DAB_FRAGMENT_GLSL).toContain("const uint FLAG_ERASE = 65536u;");
    expect(DAB_FRAGMENT_GLSL).toContain("const uint DEP_AIRBRUSH = 1u;");
    for (const fn of ["hash_u32", "hash_noise_2d", "superellipse_coverage", "dab_extent_px", "shade_dab", "tip_sample", "paper_sample", "edge_curve"]) {
      expect(DAB_FRAGMENT_GLSL, fn).toMatch(new RegExp(`\\b${fn}\\(`));
    }
    for (const fn of ["blend_stroke", "encode_present", "linear_to_srgb"]) expect(BLIT_FRAGMENT_GLSL, fn).toMatch(new RegExp(`\\b${fn}\\(`));
    expect(DAB_FRAGMENT_GLSL).not.toMatch(/\bmeta\b|\bactive\b/);
  });
});

describe("Webgl2InstancedRuntime(모의 컨텍스트)", () => {
  it("확장이 없으면 feature-missing", () => {
    const mock = createMockWebgl2({ extensions: [] });
    expect(() => Webgl2InstancedRuntime.create(mock.gl, { width: 32, height: 32, clock: null })).toThrow(LaneUnavailableError);
    expect(mock.extensionsAsked).toEqual([WEBGL2_REQUIRED_EXTENSION]);
  });

  it("셰이더 컴파일 실패는 glsl-compile-error로 표면화한다", () => {
    const mock = createMockWebgl2({ failCompileContaining: "shade_dab" });
    const err = (() => {
      try {
        Webgl2InstancedRuntime.create(mock.gl, { width: 32, height: 32, clock: null });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(SumiError);
    expect((err as SumiError).code).toBe("glsl-compile-error");
  });

  it("프로그램 2개·VAO attribute 4개(divisor 1)·RGBA16F/RGBA8 타깃을 만들고 초기 clear한다", () => {
    const mock = createMockWebgl2();
    const rt = Webgl2InstancedRuntime.create(mock.gl, { width: 40, height: 24, clock: null });
    expect(mock.programs).toBe(2);
    expect(mock.shaders.length).toBe(4);
    expect(mock.calls.filter((c) => c === "vertexAttribDivisor").length).toBe(4);
    expect(mock.calls.filter((c) => c === "vertexAttribIPointer").length).toBe(1);
    expect(mock.texImages.filter((t) => t.width === 40 && t.height === 24).length).toBe(4);
    expect(mock.calls.filter((c) => c === "clear").length).toBe(4);
    expect(rt.runtimeState).toBe("ready");
    rt.dispose();
    expect(mock.calls.filter((c) => c === "deleteFramebuffer").length).toBe(4);
    expect(() => rt.beginStroke(program)).toThrow(InvalidStateError);
  });

  it("프레임당 drawArraysInstanced 1회(인스턴스 = dab 수) + encode blit, endStroke는 bake·encode", () => {
    const mock = createMockWebgl2();
    let t = 0;
    const rt = Webgl2InstancedRuntime.create(mock.gl, { width: 64, height: 64, clock: { now: () => (t += 1) } });
    rt.beginStroke(program);
    expect(mock.texImages.some((x) => x.width === 512 && x.height === 64)).toBe(true);
    const r1 = rt.submitBatch(batchOf(7));
    const r2 = rt.submitBatch(batchOf(3));
    expect(mock.drawArraysInstanced.map((d) => d.instances)).toEqual([7, 3]);
    expect(mock.drawArraysInstanced.every((d) => d.mode === GL.TRIANGLES && d.count === 6)).toBe(true);
    expect(r1).toMatchObject({ frameIndex: 0, dabCount: 7, submitCount: 1, drawCount: 2 });
    expect(r2.frameIndex).toBe(1);
    expect(mock.bufferSubData.map((b) => b.bytes)).toEqual([7 * 64, 3 * 64]);
    const drawsBefore = mock.drawArrays.length;
    const receipt = rt.endStroke();
    expect(mock.drawArrays.length - drawsBefore).toBe(2);
    expect(receipt).toMatchObject({ dabCount: 10, submitCount: 3, frames: 2, timingSource: "performance-now" });
    expect(receipt.gpuTimeMs).not.toBeNull();
    expect(mock.calls).toContain("finish");
    const img = rt.readbackImage();
    expect(img).toMatchObject({ width: 64, height: 64 });
    expect(rt.readbackLinear().length).toBe(64 * 64 * 4);
    expect(mock.uniforms.get("u_canvas")).toEqual([64, 64]);
    expect(mock.uniforms.get("u_tip_levels")).toBe(7);
  });

  it("빈 배치는 draw 없이 encode만, 미지원 프로그램은 not-implemented", () => {
    const mock = createMockWebgl2();
    const rt = Webgl2InstancedRuntime.create(mock.gl, { width: 16, height: 16, clock: null });
    rt.beginStroke(program);
    const r = rt.submitBatch(new DabBatch(1));
    expect(r).toMatchObject({ dabCount: 0, submitCount: 1, drawCount: 1 });
    expect(mock.drawArraysInstanced.length).toBe(0);
    rt.endStroke();
    const smudge = normalizeProgram({ id: "s", name: "s", family: "smudge", description: "", deposition: { model: "smudge" } });
    expect(() => rt.beginStroke(smudge)).toThrow(LaneUnavailableError);
    const wet = normalizeProgram({ id: "w", name: "w", family: "watercolor", description: "", deposition: { model: "wet-flow" }, wet: {} });
    expect(() => rt.beginStroke(wet)).toThrow(LaneUnavailableError);
    expect(rt.runtimeState).toBe("ready");
  });
});
