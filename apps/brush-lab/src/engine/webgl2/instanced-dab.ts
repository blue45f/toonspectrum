import { DAB_BYTES, DAB_FLOATS } from "../core/dab-layout";
import { InvalidStateError, LaneUnavailableError, SumiError } from "../core/errors";
import { BLEND_MODE_ID, edgeCurveLength, FILTER_MODE_ID, isIdentityEdgeCurve, MAX_CANVAS_PX, MAX_DABS_PER_BATCH, packEdgeCurve, PAPER_TEXTURE_SIZE, TIP_ATLAS_LEVELS, TIP_ATLAS_TILE, tipAtlasLevelSize } from "../gpu/layout";
import { buildTipAtlasLevels, buildTipChainsForProgram, encodePaperTexture } from "../gpu/pipeline-compute";
import { instancedUnsupportedReason } from "../gpu/pipeline-instanced";
import { PAPER_FIELD_SIZE, paperFor } from "../raster/reference-renderer";

import { BLIT_FRAGMENT_GLSL, BLIT_VERTEX_GLSL, DAB_FRAGMENT_GLSL, DAB_VERTEX_GLSL } from "./shaders";

import type { DabBatch } from "../core/dab-layout";
import type { Clock, LabImage } from "../core/types";
import type { BrushProgram } from "../presets/program-schema";

/**
 * WebGL2 인스턴스 dab 런타임(명시 선택 비교 레인).
 * - 쿼드 인스턴싱(`vertexAttribDivisor`), dab 64 B 레이아웃을 vec4×3 + uvec4 attribute로 전달, 프레임당 `drawArraysInstanced` 1회.
 * - 획 누적은 RGBA16F FBO에 하드웨어 over 블렌드(ONE, ONE_MINUS_SRC_ALPHA) — compute 레인과 같은 수식, f16 저장.
 * - 문서는 RGBA16F 핑퐁 FBO(bake 풀스크린 패스), present는 RGBA8 FBO(encode) 또는 캔버스 기본 프레임버퍼.
 * 포기(명시): 결정성은 드라이버 프리미티브 순서에 의존(같은 장치면 안정), 습식·smudge·임파스토 없음(beginStroke가 거부),
 * GPU 타이머 없음(`gl.finish()` 후 시계 차이 = performance-now).
 * GL 상수는 모의 컨텍스트에서도 쓸 수 있게 숫자 표(`GL`)로 둔다.
 */
export const GL = {
  TEXTURE_2D: 0x0de1,
  TEXTURE0: 0x84c0,
  RGBA: 0x1908,
  RED: 0x1903,
  RGBA8: 0x8058,
  RGBA16F: 0x881a,
  R32F: 0x822e,
  FLOAT: 0x1406,
  UNSIGNED_BYTE: 0x1401,
  UNSIGNED_INT: 0x1405,
  ARRAY_BUFFER: 0x8892,
  DYNAMIC_DRAW: 0x88e8,
  TRIANGLES: 0x0004,
  FRAMEBUFFER: 0x8d40,
  COLOR_ATTACHMENT0: 0x8ce0,
  FRAMEBUFFER_COMPLETE: 0x8cd5,
  COLOR_BUFFER_BIT: 0x4000,
  BLEND: 0x0be2,
  ONE: 1,
  ONE_MINUS_SRC_ALPHA: 0x0303,
  FUNC_ADD: 0x8006,
  VERTEX_SHADER: 0x8b31,
  FRAGMENT_SHADER: 0x8b30,
  COMPILE_STATUS: 0x8b81,
  LINK_STATUS: 0x8b82,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  NEAREST: 0x2600,
  LINEAR: 0x2601,
  NEAREST_MIPMAP_NEAREST: 0x2700,
  REPEAT: 0x2901,
  CLAMP_TO_EDGE: 0x812f,
  TEXTURE_MAX_LEVEL: 0x813d,
  UNPACK_ALIGNMENT: 0x0cf5,
} as const;

/** RGBA16F 렌더 타깃에 필요한 확장. */
export const WEBGL2_REQUIRED_EXTENSION = "EXT_color_buffer_float";

export interface Webgl2RuntimeConfig {
  width: number;
  height: number;
  clock: Clock | null;
  /** true면 encode 결과를 캔버스 기본 프레임버퍼에도 그린다(gl의 캔버스가 표시용일 때). */
  presentToCanvas?: boolean;
}

export interface Webgl2BatchReceipt {
  frameIndex: number;
  dabCount: number;
  /** drawArraysInstanced 호출 수(= 분할 조각 수). */
  submitCount: number;
  /** 모든 draw 호출 수(인스턴스 draw + blit). */
  drawCount: number;
  encodeMs: number | null;
}

export interface Webgl2StrokeReceipt {
  dabCount: number;
  submitCount: number;
  /** gl.finish() 후 시계 차이(획 전체, CPU 포함). 시계 없으면 null. */
  gpuTimeMs: number | null;
  timingSource: "performance-now" | "unavailable";
  frameTimesMs: number[];
  frames: number;
}

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string, label: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new SumiError("glsl-compile-error", `${label}: createShader 실패`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, GL.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new SumiError("glsl-compile-error", `${label}: ${log}`, { shaderId: label, log });
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vs: string, fs: string, label: string, uniformNames: readonly string[]): Program {
  const v = compileShader(gl, GL.VERTEX_SHADER, vs, `${label}.vs`);
  const f = compileShader(gl, GL.FRAGMENT_SHADER, fs, `${label}.fs`);
  const program = gl.createProgram();
  if (!program) throw new SumiError("glsl-compile-error", `${label}: createProgram 실패`);
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, GL.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "";
    gl.deleteProgram(program);
    throw new SumiError("glsl-compile-error", `${label}: link ${log}`, { shaderId: label, log });
  }
  gl.deleteShader(v);
  gl.deleteShader(f);
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  for (const name of uniformNames) uniforms.set(name, gl.getUniformLocation(program, name));
  return { program, uniforms };
}

const DAB_UNIFORMS = [
  "u_canvas",
  "u_tip_atlas",
  "u_paper_tex",
  "u_filter_mode",
  "u_tip_atlas_tile",
  "u_tip_levels",
  "u_paper_enabled",
  "u_paper_scale",
  "u_paper_rotation",
  "u_paper_size",
  "u_edge_curve",
  "u_edge_curve_len",
  "u_edge_curve_enabled",
] as const;
const BLIT_UNIFORMS = ["u_doc", "u_stroke", "u_opacity", "u_stroke_pass", "u_blend", "u_encode", "u_premultiply"] as const;

export class Webgl2InstancedRuntime {
  readonly width: number;
  readonly height: number;
  private readonly gl: WebGL2RenderingContext;
  private readonly clock: Clock | null;
  private readonly presentToCanvas: boolean;
  private readonly dab: Program;
  private readonly blit: Program;
  private readonly vbo: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly tipTex: WebGLTexture;
  private readonly paperTex: WebGLTexture;
  private readonly strokeTex: WebGLTexture;
  private readonly docTex: [WebGLTexture, WebGLTexture];
  private readonly presentTex: WebGLTexture;
  private readonly strokeFbo: WebGLFramebuffer;
  private readonly docFbo: [WebGLFramebuffer, WebGLFramebuffer];
  private readonly presentFbo: WebGLFramebuffer;
  private docIndex: 0 | 1 = 0;
  private state: "ready" | "in-stroke" | "disposed" = "ready";
  private program: BrushProgram | null = null;
  private frameIndex = 0;
  private strokeDabs = 0;
  private strokeSubmits = 0;
  private frameTimes: number[] = [];
  private strokeT0 = 0;
  private tipKeyLoaded: string | null = null;
  private paperKeyLoaded: string | null = null;
  /** 통계용 draw 호출 수. */
  draws = 0;

  private constructor(gl: WebGL2RenderingContext, cfg: Webgl2RuntimeConfig, dab: Program, blit: Program) {
    this.gl = gl;
    this.clock = cfg.clock;
    this.width = cfg.width;
    this.height = cfg.height;
    this.presentToCanvas = cfg.presentToCanvas ?? false;
    this.dab = dab;
    this.blit = blit;
    const make = <T>(v: T | null, what: string): T => {
      if (!v) throw new SumiError("webgl2-resource", `${what} 생성 실패`);
      return v;
    };
    this.vbo = make(gl.createBuffer(), "VBO");
    this.vao = make(gl.createVertexArray(), "VAO");
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(GL.ARRAY_BUFFER, this.vbo);
    gl.bufferData(GL.ARRAY_BUFFER, MAX_DABS_PER_BATCH * DAB_BYTES, GL.DYNAMIC_DRAW);
    for (let loc = 0; loc < 3; loc += 1) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, GL.FLOAT, false, DAB_BYTES, loc * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.enableVertexAttribArray(3);
    gl.vertexAttribIPointer(3, 4, GL.UNSIGNED_INT, DAB_BYTES, 48);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
    this.tipTex = make(gl.createTexture(), "tip texture");
    gl.bindTexture(GL.TEXTURE_2D, this.tipTex);
    gl.texStorage2D(GL.TEXTURE_2D, TIP_ATLAS_LEVELS, GL.R32F, TIP_ATLAS_TILE * 8, TIP_ATLAS_TILE);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAX_LEVEL, TIP_ATLAS_LEVELS - 1);
    this.paperTex = make(gl.createTexture(), "paper texture");
    gl.bindTexture(GL.TEXTURE_2D, this.paperTex);
    gl.texStorage2D(GL.TEXTURE_2D, 1, GL.RGBA8, PAPER_TEXTURE_SIZE, PAPER_TEXTURE_SIZE);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.REPEAT);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.REPEAT);
    const target = (format: number, what: string): [WebGLTexture, WebGLFramebuffer] => {
      const tex = make(gl.createTexture(), what);
      gl.bindTexture(GL.TEXTURE_2D, tex);
      gl.texStorage2D(GL.TEXTURE_2D, 1, format, cfg.width, cfg.height);
      gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
      gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
      gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
      gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
      const fbo = make(gl.createFramebuffer(), `${what} FBO`);
      gl.bindFramebuffer(GL.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, tex, 0);
      const status = gl.checkFramebufferStatus(GL.FRAMEBUFFER);
      if (status !== GL.FRAMEBUFFER_COMPLETE) {
        throw new LaneUnavailableError("feature-missing", `${what} 프레임버퍼 불완전(status ${status}) — ${WEBGL2_REQUIRED_EXTENSION} 미지원`);
      }
      return [tex, fbo];
    };
    const [strokeTex, strokeFbo] = target(GL.RGBA16F, "stroke");
    const [docA, docFboA] = target(GL.RGBA16F, "doc-a");
    const [docB, docFboB] = target(GL.RGBA16F, "doc-b");
    const [presentTex, presentFbo] = target(GL.RGBA8, "present");
    this.strokeTex = strokeTex;
    this.strokeFbo = strokeFbo;
    this.docTex = [docA, docB];
    this.docFbo = [docFboA, docFboB];
    this.presentTex = presentTex;
    this.presentFbo = presentFbo;
    gl.bindFramebuffer(GL.FRAMEBUFFER, null);
    this.clearAll();
  }

  /** 확장·셰이더를 검사하고 자원을 만든다. 확장 부재 → LaneUnavailableError(feature-missing). */
  static create(gl: WebGL2RenderingContext, cfg: Webgl2RuntimeConfig): Webgl2InstancedRuntime {
    if (!Number.isInteger(cfg.width) || !Number.isInteger(cfg.height) || cfg.width <= 0 || cfg.height <= 0) {
      throw new RangeError(`canvas size must be positive integers, got ${cfg.width}×${cfg.height}`);
    }
    if (cfg.width > MAX_CANVAS_PX || cfg.height > MAX_CANVAS_PX) {
      throw new LaneUnavailableError("limit-exceeded", `캔버스 ${cfg.width}×${cfg.height}는 상한 ${MAX_CANVAS_PX}²를 넘는다`);
    }
    if (!gl.getExtension(WEBGL2_REQUIRED_EXTENSION)) {
      throw new LaneUnavailableError("feature-missing", `${WEBGL2_REQUIRED_EXTENSION}이 없어 RGBA16F 획 타깃을 만들 수 없다`, {
        extension: WEBGL2_REQUIRED_EXTENSION,
      });
    }
    const dab = linkProgram(gl, DAB_VERTEX_GLSL, DAB_FRAGMENT_GLSL, "sumi-webgl2-dab", DAB_UNIFORMS);
    const blit = linkProgram(gl, BLIT_VERTEX_GLSL, BLIT_FRAGMENT_GLSL, "sumi-webgl2-blit", BLIT_UNIFORMS);
    return new Webgl2InstancedRuntime(gl, cfg, dab, blit);
  }

  get runtimeState(): "ready" | "in-stroke" | "disposed" {
    return this.state;
  }

  private assertUsable(): void {
    if (this.state === "disposed") throw new InvalidStateError("Webgl2InstancedRuntime: dispose 뒤에 호출됐다");
  }

  private clearTarget(fbo: WebGLFramebuffer | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(GL.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(GL.COLOR_BUFFER_BIT);
  }

  private clearAll(): void {
    this.clearTarget(this.strokeFbo);
    this.clearTarget(this.docFbo[0]);
    this.clearTarget(this.docFbo[1]);
    this.clearTarget(this.presentFbo);
    this.gl.bindFramebuffer(GL.FRAMEBUFFER, null);
  }

  private bindTextures(program: Program, names: readonly [string, WebGLTexture][]): void {
    const gl = this.gl;
    names.forEach(([name, tex], unit) => {
      gl.activeTexture(GL.TEXTURE0 + unit);
      gl.bindTexture(GL.TEXTURE_2D, tex);
      gl.uniform1i(program.uniforms.get(name) ?? null, unit);
    });
  }

  /** blit 패스 1회(bake 또는 encode). */
  private blitPass(target: WebGLFramebuffer | null, docIndex: 0 | 1, opts: { strokePass: 0 | 1; encode: 0 | 1; premultiply: 0 | 1 }): void {
    const gl = this.gl;
    const program = this.program;
    gl.bindFramebuffer(GL.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(GL.BLEND);
    gl.useProgram(this.blit.program);
    this.bindTextures(this.blit, [
      ["u_doc", this.docTex[docIndex]],
      ["u_stroke", this.strokeTex],
    ]);
    gl.uniform1f(this.blit.uniforms.get("u_opacity") ?? null, program?.deposition.opacity ?? 1);
    gl.uniform1f(this.blit.uniforms.get("u_stroke_pass") ?? null, opts.strokePass);
    gl.uniform1i(this.blit.uniforms.get("u_blend") ?? null, program ? BLEND_MODE_ID[program.deposition.blend] : 0);
    gl.uniform1i(this.blit.uniforms.get("u_encode") ?? null, opts.encode);
    gl.uniform1i(this.blit.uniforms.get("u_premultiply") ?? null, opts.premultiply);
    gl.bindVertexArray(null);
    gl.drawArrays(GL.TRIANGLES, 0, 3);
    this.draws += 1;
  }

  private encodeAndPresent(strokePass: 0 | 1): void {
    this.blitPass(this.presentFbo, this.docIndex, { strokePass, encode: 1, premultiply: 0 });
    if (this.presentToCanvas) this.blitPass(null, this.docIndex, { strokePass, encode: 1, premultiply: 1 });
    this.gl.bindFramebuffer(GL.FRAMEBUFFER, null);
  }

  /** 획 시작. 미지원 프로그램(smudge·습식·임파스토)은 LaneUnavailableError(not-implemented). */
  beginStroke(program: BrushProgram): void {
    this.assertUsable();
    if (this.state === "in-stroke") throw new InvalidStateError("이전 획이 endStroke되지 않았다");
    const reason = instancedUnsupportedReason(program);
    if (reason) throw new LaneUnavailableError("not-implemented", reason, { laneId: "webgl2-instanced", presetId: program.id });
    this.program = program;
    this.uploadAssets(program);
    this.setDabUniforms(program);
    this.clearTarget(this.strokeFbo);
    this.gl.bindFramebuffer(GL.FRAMEBUFFER, null);
    this.frameIndex = 0;
    this.strokeDabs = 0;
    this.strokeSubmits = 0;
    this.frameTimes = [];
    this.strokeT0 = this.clock?.now() ?? 0;
    this.state = "in-stroke";
  }

  private uploadAssets(program: BrushProgram): void {
    const gl = this.gl;
    const tipKey = `${program.tip.kind}|${program.tip.seed}|${JSON.stringify(program.tip.params)}|${program.deposition.dual ? `${program.deposition.dual.kind}|${program.deposition.dual.seed}|${JSON.stringify(program.deposition.dual.params)}` : "-"}`;
    if (this.tipKeyLoaded !== tipKey) {
      const levels = buildTipAtlasLevels(buildTipChainsForProgram(program));
      gl.bindTexture(GL.TEXTURE_2D, this.tipTex);
      gl.pixelStorei(GL.UNPACK_ALIGNMENT, 4);
      levels.forEach((data, level) => {
        const { width, height } = tipAtlasLevelSize(level);
        gl.texSubImage2D(GL.TEXTURE_2D, level, 0, 0, width, height, GL.RED, GL.FLOAT, data);
      });
      this.tipKeyLoaded = tipKey;
    }
    if (program.paper.enabled) {
      const key = `${program.paper.seed}|${program.paper.roughness}|${program.paper.absorbency}`;
      if (this.paperKeyLoaded !== key) {
        const data = encodePaperTexture(paperFor(program.paper));
        gl.bindTexture(GL.TEXTURE_2D, this.paperTex);
        gl.pixelStorei(GL.UNPACK_ALIGNMENT, 4);
        gl.texSubImage2D(GL.TEXTURE_2D, 0, 0, 0, PAPER_FIELD_SIZE, PAPER_FIELD_SIZE, GL.RGBA, GL.UNSIGNED_BYTE, data);
        this.paperKeyLoaded = key;
      }
    }
  }

  private setDabUniforms(program: BrushProgram): void {
    const gl = this.gl;
    const u = this.dab.uniforms;
    gl.useProgram(this.dab.program);
    gl.uniform2f(u.get("u_canvas") ?? null, this.width, this.height);
    gl.uniform1i(u.get("u_filter_mode") ?? null, FILTER_MODE_ID[program.paper.filter]);
    gl.uniform1i(u.get("u_tip_atlas_tile") ?? null, TIP_ATLAS_TILE);
    gl.uniform1i(u.get("u_tip_levels") ?? null, TIP_ATLAS_LEVELS);
    gl.uniform1i(u.get("u_paper_enabled") ?? null, program.paper.enabled ? 1 : 0);
    gl.uniform1f(u.get("u_paper_scale") ?? null, program.paper.scale > 0 ? program.paper.scale : 1);
    gl.uniform1f(u.get("u_paper_rotation") ?? null, program.paper.rotationRad);
    gl.uniform1f(u.get("u_paper_size") ?? null, PAPER_TEXTURE_SIZE);
    gl.uniform1fv(u.get("u_edge_curve") ?? null, packEdgeCurve(program.edge.curve));
    gl.uniform1i(u.get("u_edge_curve_len") ?? null, edgeCurveLength(program.edge.curve));
    gl.uniform1i(u.get("u_edge_curve_enabled") ?? null, isIdentityEdgeCurve(program.edge.curve) ? 0 : 1);
  }

  /** 프레임당 1회: drawArraysInstanced 1회(분할 시 조각당 1회) + encode. */
  submitBatch(batch: DabBatch): Webgl2BatchReceipt {
    this.assertUsable();
    if (this.state !== "in-stroke") throw new InvalidStateError("beginStroke 전에 호출됐다");
    const gl = this.gl;
    const t0 = this.clock?.now() ?? null;
    const drawsBefore = this.draws;
    const total = batch.count;
    const chunks = Math.max(1, Math.ceil(total / MAX_DABS_PER_BATCH));
    let instancedDraws = 0;
    for (let c = 0; c < chunks; c += 1) {
      const start = c * MAX_DABS_PER_BATCH;
      const count = Math.min(MAX_DABS_PER_BATCH, total - start);
      if (count <= 0) continue;
      gl.bindBuffer(GL.ARRAY_BUFFER, this.vbo);
      gl.bufferSubData(GL.ARRAY_BUFFER, 0, batch.data, start * DAB_FLOATS, count * DAB_FLOATS);
      gl.bindFramebuffer(GL.FRAMEBUFFER, this.strokeFbo);
      gl.viewport(0, 0, this.width, this.height);
      gl.enable(GL.BLEND);
      gl.blendEquation(GL.FUNC_ADD);
      gl.blendFunc(GL.ONE, GL.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.dab.program);
      this.bindTextures(this.dab, [
        ["u_tip_atlas", this.tipTex],
        ["u_paper_tex", this.paperTex],
      ]);
      gl.bindVertexArray(this.vao);
      gl.drawArraysInstanced(GL.TRIANGLES, 0, 6, count);
      gl.bindVertexArray(null);
      this.draws += 1;
      instancedDraws += 1;
    }
    this.encodeAndPresent(1);
    const frameIndex = this.frameIndex;
    this.frameIndex += 1;
    this.strokeDabs += total;
    this.strokeSubmits += Math.max(1, instancedDraws);
    const encodeMs = t0 !== null && this.clock ? this.clock.now() - t0 : null;
    this.frameTimes.push(encodeMs ?? 0);
    return { frameIndex, dabCount: total, submitCount: Math.max(1, instancedDraws), drawCount: this.draws - drawsBefore, encodeMs };
  }

  /** bake(핑퐁) → 획 clear → encode(stroke_pass 0) → gl.finish(). */
  endStroke(): Webgl2StrokeReceipt {
    this.assertUsable();
    if (this.state !== "in-stroke" || !this.program) throw new InvalidStateError("beginStroke 전에 호출됐다");
    const next: 0 | 1 = this.docIndex === 0 ? 1 : 0;
    this.blitPass(this.docFbo[next], this.docIndex, { strokePass: 1, encode: 0, premultiply: 0 });
    this.docIndex = next;
    this.clearTarget(this.strokeFbo);
    this.encodeAndPresent(0);
    this.gl.finish();
    const elapsed = this.clock ? this.clock.now() - this.strokeT0 : null;
    const receipt: Webgl2StrokeReceipt = {
      dabCount: this.strokeDabs,
      submitCount: this.strokeSubmits + 1,
      gpuTimeMs: elapsed,
      timingSource: elapsed === null ? "unavailable" : "performance-now",
      frameTimesMs: this.frameTimes.slice(),
      frames: this.frameIndex,
    };
    this.program = null;
    this.state = "ready";
    return receipt;
  }

  /** present FBO → LabImage(readPixels는 아래→위 순서라 행을 뒤집는다). */
  readbackImage(): LabImage {
    this.assertUsable();
    const gl = this.gl;
    const { width, height } = this;
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.presentFbo);
    const raw = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, GL.RGBA, GL.UNSIGNED_BYTE, raw);
    gl.bindFramebuffer(GL.FRAMEBUFFER, null);
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      data.set(raw.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
    }
    return { width, height, data };
  }

  /** 문서(RGBA16F) → f32(readPixels FLOAT, 행 뒤집기). */
  readbackLinear(): Float32Array {
    this.assertUsable();
    const gl = this.gl;
    const { width, height } = this;
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.docFbo[this.docIndex]);
    const raw = new Float32Array(width * height * 4);
    gl.readPixels(0, 0, width, height, GL.RGBA, GL.FLOAT, raw);
    gl.bindFramebuffer(GL.FRAMEBUFFER, null);
    const out = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      out.set(raw.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
    }
    return out;
  }

  dispose(): void {
    if (this.state === "disposed") return;
    this.state = "disposed";
    const gl = this.gl;
    gl.deleteProgram(this.dab.program);
    gl.deleteProgram(this.blit.program);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    for (const t of [this.tipTex, this.paperTex, this.strokeTex, this.docTex[0], this.docTex[1], this.presentTex]) gl.deleteTexture(t);
    for (const f of [this.strokeFbo, this.docFbo[0], this.docFbo[1], this.presentFbo]) gl.deleteFramebuffer(f);
  }
}
