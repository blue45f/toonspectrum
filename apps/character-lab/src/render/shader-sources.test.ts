import { describe, expect, it } from "vitest";

import {
  CHARACTER_SHADER_BASE_UNIFORMS,
  CHARACTER_SHADER_SOURCES,
  CHARACTER_VERTEX_INCLUDES,
  DEPTH_UNIFORMS,
  FLAT_SAMPLERS,
  FLAT_UNIFORMS,
  FRAGMENT_SHADER_NAMES,
  ID_UNIFORMS,
  TOON_SAMPLERS,
  TOON_UNIFORMS,
  listShaderIncludes,
} from "./shader-sources";

describe("shader-sources", () => {
  it("정점 셰이더는 GLSL·WGSL이 같은 include 순서를 쓴다(스키닝·morph·instances)", () => {
    const glsl = listShaderIncludes(CHARACTER_SHADER_SOURCES.vertex.glsl);
    const wgsl = listShaderIncludes(CHARACTER_SHADER_SOURCES.vertex.wgsl);
    expect(glsl).toEqual(wgsl.filter((name) => name !== "sceneUboDeclaration" && name !== "meshUboDeclaration"));
    expect(glsl).toEqual(CHARACTER_VERTEX_INCLUDES);
    for (const required of ["bonesDeclaration", "bonesVertex", "morphTargetsVertexGlobalDeclaration", "morphTargetsVertexDeclaration", "morphTargetsVertexGlobal", "morphTargetsVertex", "instancesDeclaration", "instancesVertex"]) {
      expect(glsl).toContain(required);
    }
    expect(wgsl.slice(0, 2)).toEqual(["sceneUboDeclaration", "meshUboDeclaration"]);
  });

  it("정점 셰이더는 view 행렬로 뷰 깊이(vViewZ)를 내보내고 기본 uniform 목록에 view가 있다", () => {
    expect(CHARACTER_SHADER_BASE_UNIFORMS).toContain("view");
    expect(CHARACTER_SHADER_SOURCES.vertex.glsl).toContain("uniform mat4 view;");
    expect(CHARACTER_SHADER_SOURCES.vertex.glsl).toContain("vViewZ = -(view * worldPos).z;");
    expect(CHARACTER_SHADER_SOURCES.vertex.wgsl).toContain("vertexOutputs.vViewZ = -(scene.view * worldPos).z;");
  });

  it("WGSL은 vertexInputs/fragmentOutputs 규약을, GLSL은 gl_* 규약을 쓴다", () => {
    for (const key of ["toon", "flat", "normal", "id", "depth"] as const) {
      const pair = CHARACTER_SHADER_SOURCES[key];
      expect(pair.wgsl).toContain("fragmentOutputs.color");
      expect(pair.wgsl).toContain("@fragment");
      expect(pair.wgsl).not.toContain("gl_FragColor");
      expect(pair.glsl).toContain("gl_FragColor");
      expect(pair.glsl).not.toContain("fragmentInputs");
      // 모든 프래그먼트는 공통 정점 셰이더의 varying 4개를 같은 순서로 선언한다.
      expect(pair.glsl).toContain("varying float vViewZ;");
      expect(pair.wgsl).toContain("varying vViewZ: f32;");
    }
    expect(CHARACTER_SHADER_SOURCES.vertex.wgsl).toContain("vertexOutputs.position");
    expect(CHARACTER_SHADER_SOURCES.vertex.glsl).toContain("gl_Position");
  });

  it("프래그먼트 uniform·sampler 선언이 옵션 목록과 일치한다(양쪽 언어)", () => {
    const toon = CHARACTER_SHADER_SOURCES.toon;
    for (const name of TOON_UNIFORMS) {
      expect(toon.glsl).toMatch(new RegExp(`uniform (vec3|vec4) ${name};`, "u"));
      expect(toon.wgsl).toMatch(new RegExp(`uniform ${name}: vec[34]f;`, "u"));
    }
    for (const name of TOON_SAMPLERS) {
      expect(toon.glsl).toContain(`uniform sampler2D ${name};`);
      expect(toon.wgsl).toContain(`var ${name}: texture_2d<f32>;`);
      expect(toon.wgsl).toContain(`var ${name}Sampler: sampler;`);
    }
    const flat = CHARACTER_SHADER_SOURCES.flat;
    for (const name of FLAT_UNIFORMS) {
      expect(flat.glsl).toMatch(new RegExp(`uniform (vec3|vec4) ${name};`, "u"));
      expect(flat.wgsl).toMatch(new RegExp(`uniform ${name}: vec[34]f;`, "u"));
    }
    for (const name of FLAT_SAMPLERS) {
      expect(flat.glsl).toContain(`uniform sampler2D ${name};`);
      expect(flat.wgsl).toContain(`var ${name}: texture_2d<f32>;`);
    }
    for (const name of ID_UNIFORMS) {
      expect(CHARACTER_SHADER_SOURCES.id.glsl).toContain(`uniform vec4 ${name};`);
      expect(CHARACTER_SHADER_SOURCES.id.wgsl).toContain(`uniform ${name}: vec4f;`);
    }
    for (const name of DEPTH_UNIFORMS) {
      expect(CHARACTER_SHADER_SOURCES.depth.glsl).toContain(`uniform vec4 ${name};`);
      expect(CHARACTER_SHADER_SOURCES.depth.wgsl).toContain(`uniform ${name}: vec4f;`);
    }
    expect(Object.keys(FRAGMENT_SHADER_NAMES).sort()).toEqual(["depth", "flat", "id", "normal", "toon"]);
  });

  it("WGSL 텍스처 샘플은 분기 밖(균일 제어 흐름)에 있다", () => {
    for (const key of ["toon", "flat"] as const) {
      const wgsl = CHARACTER_SHADER_SOURCES[key].wgsl;
      for (const line of wgsl.split("\n")) {
        if (line.includes("textureSample(")) expect(line.trimStart().startsWith("let ")).toBe(true);
      }
      expect(wgsl).not.toMatch(/if \([^)]*\) \{[^}]*textureSample/u);
    }
  });

  it("툰 램프는 fwidth 밴드 AA와 rampSteps 클램프를 쓰고 알베도 텍스처는 faceParams.w로 켠다", () => {
    expect(CHARACTER_SHADER_SOURCES.toon.glsl).toContain("fwidth(shading)");
    expect(CHARACTER_SHADER_SOURCES.toon.wgsl).toContain("fwidth(shading)");
    expect(CHARACTER_SHADER_SOURCES.toon.glsl).toContain("max(2.0, toonParams.x)");
    expect(CHARACTER_SHADER_SOURCES.toon.glsl).toContain("step(0.5, faceParams.w)");
    expect(CHARACTER_SHADER_SOURCES.flat.wgsl).toContain("step(0.5, uniforms.faceParams.w)");
  });

  it("깊이 패스는 readback.packDepthRgba8과 같은 255/256 패킹 식을 쓴다", () => {
    for (const source of [CHARACTER_SHADER_SOURCES.depth.glsl, CHARACTER_SHADER_SOURCES.depth.wgsl]) {
      expect(source).toContain("d * 255.0");
      expect(source).toContain("f1 * 256.0");
      expect(source).toContain("f2 * 256.0");
      expect(source).toContain("f3 * 256.0");
      expect(source).toContain("/ 255.0");
      expect(source).toContain("depthRange.x");
    }
  });
});
