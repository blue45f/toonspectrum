/**
 * 모의 WebGL2RenderingContext 기록기(Node). 런타임이 쓰는 메서드만 구현하고 호출을 기록한다.
 * 셰이더 컴파일·링크는 성공으로, 확장은 옵션으로 제어한다. readPixels는 0으로 채운다(픽셀 검증은 브라우저 몫).
 */
export interface MockWebgl2Options {
  /** getExtension이 돌려줄 확장 이름 집합. 기본 EXT_color_buffer_float 포함. */
  extensions?: readonly string[];
  /** 컴파일 실패를 흉내 낼 셰이더 소스 부분 문자열. */
  failCompileContaining?: string;
  /** WEBGL_debug_renderer_info가 돌려줄 비마스킹 공급자·렌더러 문자열(지정하면 그 확장이 켜진다). */
  debugRenderer?: { vendor: string; renderer: string };
}

export interface MockWebgl2 {
  gl: WebGL2RenderingContext;
  calls: string[];
  drawArraysInstanced: { mode: number; first: number; count: number; instances: number }[];
  drawArrays: { mode: number; first: number; count: number }[];
  shaders: { type: number; source: string }[];
  programs: number;
  uniforms: Map<string, unknown>;
  bufferSubData: { target: number; offset: number; bytes: number }[];
  texImages: { target: number; level: number; width: number; height: number }[];
  boundFramebuffer: number | null;
  extensionsAsked: string[];
}

export function createMockWebgl2(options: MockWebgl2Options = {}): MockWebgl2 {
  const extensions = new Set(options.extensions ?? ["EXT_color_buffer_float"]);
  if (options.debugRenderer) extensions.add("WEBGL_debug_renderer_info");
  const calls: string[] = [];
  const drawArraysInstanced: MockWebgl2["drawArraysInstanced"] = [];
  const drawArrays: MockWebgl2["drawArrays"] = [];
  const shaders: MockWebgl2["shaders"] = [];
  const uniforms = new Map<string, unknown>();
  const bufferSubData: MockWebgl2["bufferSubData"] = [];
  const texImages: MockWebgl2["texImages"] = [];
  const extensionsAsked: string[] = [];
  const shaderOf = new WeakMap<object, { type: number; source: string }>();
  let nextId = 1;
  const handle = (kind: string): { id: number; kind: string } => ({ id: nextId++, kind });
  const record = (name: string): void => {
    calls.push(name);
  };
  const mock: MockWebgl2 = {
    gl: undefined as unknown as WebGL2RenderingContext,
    calls,
    drawArraysInstanced,
    drawArrays,
    shaders,
    programs: 0,
    uniforms,
    bufferSubData,
    texImages,
    boundFramebuffer: null,
    extensionsAsked,
  };
  const gl = {
    canvas: { width: 0, height: 0 },
    VERSION: 0x1f02,
    getExtension(name: string): unknown {
      record("getExtension");
      extensionsAsked.push(name);
      if (name === "WEBGL_debug_renderer_info" && extensions.has(name)) return { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 };
      return extensions.has(name) ? {} : null;
    },
    getParameter(pname: number): unknown {
      record("getParameter");
      if (pname === 0x9245) return options.debugRenderer?.vendor ?? null;
      if (pname === 0x9246) return options.debugRenderer?.renderer ?? null;
      if (pname === 0x1f02) return "WebGL 2.0 (mock)";
      return null;
    },
    createShader(type: number): object {
      record("createShader");
      const s = handle("shader");
      shaderOf.set(s, { type, source: "" });
      return s;
    },
    shaderSource(shader: object, source: string): void {
      record("shaderSource");
      const entry = shaderOf.get(shader);
      if (entry) {
        entry.source = source;
        shaders.push({ type: entry.type, source });
      }
    },
    compileShader(): void {
      record("compileShader");
    },
    getShaderParameter(shader: object): boolean {
      const entry = shaderOf.get(shader);
      if (options.failCompileContaining && entry?.source.includes(options.failCompileContaining)) return false;
      return true;
    },
    getShaderInfoLog(): string {
      return "mock compile error";
    },
    deleteShader(): void {
      record("deleteShader");
    },
    createProgram(): object {
      record("createProgram");
      mock.programs += 1;
      return handle("program");
    },
    attachShader(): void {
      record("attachShader");
    },
    linkProgram(): void {
      record("linkProgram");
    },
    getProgramParameter(): boolean {
      return true;
    },
    getProgramInfoLog(): string {
      return "";
    },
    deleteProgram(): void {
      record("deleteProgram");
    },
    useProgram(): void {
      record("useProgram");
    },
    getUniformLocation(_program: object, name: string): { name: string } {
      return { name };
    },
    uniform1f(loc: { name: string }, v: number): void {
      uniforms.set(loc.name, v);
    },
    uniform1i(loc: { name: string }, v: number): void {
      uniforms.set(loc.name, v);
    },
    uniform2f(loc: { name: string }, a: number, b: number): void {
      uniforms.set(loc.name, [a, b]);
    },
    uniform1fv(loc: { name: string }, v: Float32Array): void {
      uniforms.set(loc.name, Array.from(v));
    },
    createBuffer(): object {
      record("createBuffer");
      return handle("buffer");
    },
    bindBuffer(): void {
      record("bindBuffer");
    },
    bufferData(): void {
      record("bufferData");
    },
    bufferSubData(target: number, offset: number, data: ArrayBufferView, srcOffset?: number, length?: number): void {
      record("bufferSubData");
      const elem = (data as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;
      const bytes = length !== undefined ? length * elem : data.byteLength - (srcOffset ?? 0) * elem;
      bufferSubData.push({ target, offset, bytes });
    },
    deleteBuffer(): void {
      record("deleteBuffer");
    },
    createVertexArray(): object {
      record("createVertexArray");
      return handle("vao");
    },
    bindVertexArray(): void {
      record("bindVertexArray");
    },
    deleteVertexArray(): void {
      record("deleteVertexArray");
    },
    enableVertexAttribArray(): void {
      record("enableVertexAttribArray");
    },
    vertexAttribPointer(): void {
      record("vertexAttribPointer");
    },
    vertexAttribIPointer(): void {
      record("vertexAttribIPointer");
    },
    vertexAttribDivisor(): void {
      record("vertexAttribDivisor");
    },
    createTexture(): object {
      record("createTexture");
      return handle("texture");
    },
    bindTexture(): void {
      record("bindTexture");
    },
    activeTexture(): void {
      record("activeTexture");
    },
    texParameteri(): void {
      record("texParameteri");
    },
    texStorage2D(target: number, levels: number, _format: number, width: number, height: number): void {
      record("texStorage2D");
      texImages.push({ target, level: levels, width, height });
    },
    texSubImage2D(target: number, level: number, _x: number, _y: number, width: number, height: number): void {
      record("texSubImage2D");
      texImages.push({ target, level, width, height });
    },
    pixelStorei(): void {
      record("pixelStorei");
    },
    deleteTexture(): void {
      record("deleteTexture");
    },
    createFramebuffer(): object {
      record("createFramebuffer");
      return handle("fbo");
    },
    bindFramebuffer(_target: number, fbo: { id: number } | null): void {
      record("bindFramebuffer");
      mock.boundFramebuffer = fbo ? fbo.id : null;
    },
    framebufferTexture2D(): void {
      record("framebufferTexture2D");
    },
    checkFramebufferStatus(): number {
      return 0x8cd5;
    },
    deleteFramebuffer(): void {
      record("deleteFramebuffer");
    },
    viewport(): void {
      record("viewport");
    },
    clearColor(): void {
      record("clearColor");
    },
    clear(): void {
      record("clear");
    },
    enable(): void {
      record("enable");
    },
    disable(): void {
      record("disable");
    },
    blendFunc(): void {
      record("blendFunc");
    },
    blendEquation(): void {
      record("blendEquation");
    },
    drawArraysInstanced(mode: number, first: number, count: number, instances: number): void {
      record("drawArraysInstanced");
      drawArraysInstanced.push({ mode, first, count, instances });
    },
    drawArrays(mode: number, first: number, count: number): void {
      record("drawArrays");
      drawArrays.push({ mode, first, count });
    },
    readPixels(_x: number, _y: number, _w: number, _h: number, _f: number, _t: number, out: ArrayBufferView): void {
      record("readPixels");
      new Uint8Array(out.buffer, out.byteOffset, out.byteLength).fill(0);
    },
    finish(): void {
      record("finish");
    },
    flush(): void {
      record("flush");
    },
    getError(): number {
      return 0;
    },
  };
  mock.gl = gl as unknown as WebGL2RenderingContext;
  return mock;
}

/** 모의 캔버스: getContext("webgl2")가 모의 GL을 돌려준다(없으면 null). */
export function createMockWebgl2Canvas(mock: MockWebgl2 | null, width: number, height: number): HTMLCanvasElement {
  return {
    width,
    height,
    getContext(kind: string): unknown {
      return kind === "webgl2" && mock ? mock.gl : null;
    },
  } as unknown as HTMLCanvasElement;
}
