/**
 * fake GPUDevice 기록기 — GPU가 없는 Node에서 바인딩·디스패치·제출 계약을 검증한다.
 *
 * - 모든 호출을 `calls`(이름 순서)와 세부 목록(buffers·pipelines·dispatches·writes…)에 기록한다.
 * - 버퍼는 실제 바이트 백킹을 가진다: `writeBuffer`·`clearBuffer`·`copyBufferToBuffer`가 즉시 반영되고
 *   `mapAsync`/`getMappedRange`가 그 바이트를 돌려준다. 테스트는 `bufferByLabel(...).data`에 값을 써서
 *   GPU가 계산했을 결과(카운터·readback)를 주입한다.
 * - `compilationMessages[label]`로 `getCompilationInfo` 오류를 주입하고, `loseDevice()`로 `device.lost`를 해소한다.
 * - 실 브라우저(Dawn) 검증에서 드러난 사양 규칙을 흉내 내 던진다(`MockValidationError`): 같은 dispatch의 usage scope에서
 *   INDIRECT와 쓰기 storage 겸용 금지, 파이프라인 레이아웃의 모든 bind group이 설정돼 있어야 함, `resolveQuerySet` 오프셋 256 배수,
 *   buffer 복사·clear·writeBuffer 4 B 정렬과 usage 플래그, compute 스테이지 storage 버퍼 수 ≤ maxStorageBuffersPerShaderStage.
 *   (Node에서 실 GPU 검증을 대신하지는 못하지만, 한 번 브라우저에서 잡은 위반이 다시 들어오는 것을 막는다.)
 * - vitest에 의존하지 않는다(엔진 테스트 보조 파일, 배럴에서 내보내지 않는다).
 */

/** 모의 장치가 흉내 내는 WebGPU 검증 오류. 실 장치에서는 uncapturederror·command buffer 무효화로 나타난다. */
export class MockValidationError extends Error {
  constructor(message: string) {
    super(`mock WebGPU validation: ${message}`);
    this.name = "MockValidationError";
  }
}

const USAGE_COPY_SRC = 0x0004;
const USAGE_COPY_DST = 0x0008;
const USAGE_UNIFORM = 0x0040;
const USAGE_STORAGE = 0x0080;
const USAGE_INDIRECT = 0x0100;
const USAGE_QUERY_RESOLVE = 0x0200;

interface MockBindGroupLayout {
  label: string;
  entries: {
    binding: number;
    kind: "uniform" | "storage" | "read-only-storage" | "texture" | "sampler" | "storage-texture";
    /** `hasDynamicOffset` — `setBindGroup`이 오프셋을 요구한다. */
    dynamic: boolean;
  }[];
}

interface MockPipelineLayout {
  label: string;
  bgls: MockBindGroupLayout[];
}

interface MockBindGroupEntry {
  label: string;
  layout: MockBindGroupLayout;
  buffers: Map<number, MockBuffer>;
  /** 바인딩 시작 오프셋·크기(동적 오프셋 범위 검증용). */
  ranges: Map<number, { offset: number; size: number }>;
  bindings: Set<number>;
}

export interface MockCompilationMessage {
  message: string;
  type: "error" | "warning" | "info";
  lineNum?: number;
  linePos?: number;
}

export interface MockGpuOptions {
  features?: readonly string[];
  limits?: Partial<Record<string, number>>;
  /** 셰이더 label → 주입할 컴파일 메시지. */
  compilationMessages?: Record<string, readonly MockCompilationMessage[]>;
  /** 타임스탬프 쿼리 해소 시 돌려줄 ns 값 쌍(begin, end). 생략 시 0. */
  timestampsNs?: readonly [bigint, bigint];
}

export interface MockBuffer {
  label: string;
  size: number;
  usage: number;
  data: ArrayBuffer;
  mapped: boolean;
  destroyed: boolean;
  mapCount: number;
  handle: GPUBuffer;
}

export interface MockTexture {
  label: string;
  width: number;
  height: number;
  format: string;
  mipLevelCount: number;
  usage: number;
  destroyed: boolean;
  /** 테스트가 `copyTextureToBuffer` 결과로 쓰일 바이트(레벨 0, 행 길이 width·bpp)를 주입한다. */
  data: Uint8Array | null;
  handle: GPUTexture;
}

export interface MockPipeline {
  label: string;
  kind: "compute" | "render";
  entryPoint: string;
  async: boolean;
  /** 명시 파이프라인 레이아웃 label(auto 레이아웃이면 null). */
  layoutLabel: string | null;
}

export interface MockDispatch {
  entryPoint: string;
  /** dispatch 시점에 설정된 bind group별 동적 오프셋(없으면 null). */
  groupOffsets: (readonly number[] | null)[];
  kind: "direct" | "indirect";
  x: number;
  y: number;
  z: number;
  indirectBuffer: string | null;
  indirectOffset: number;
  /** dispatch 시점 파이프라인의 명시 레이아웃 label(auto 레이아웃이면 null). */
  layoutLabel: string | null;
  /** 몇 번째 compute pass 안에서 기록됐는지. */
  pass: number;
}

export interface MockDraw {
  entryPoint: string;
  vertexCount: number;
  instanceCount: number;
  pass: number;
}

export interface MockWrite {
  target: string;
  offset: number;
  size: number;
}

export interface MockTextureWrite {
  target: string;
  mipLevel: number;
  width: number;
  height: number;
  bytes: number;
}

export interface MockGpu {
  device: GPUDevice;
  calls: string[];
  buffers: MockBuffer[];
  textures: MockTexture[];
  shaderModules: { label: string; code: string }[];
  pipelines: MockPipeline[];
  bindGroupLayouts: { label: string; entries: number }[];
  bindGroups: { label: string; layout: string; entries: number }[];
  dispatches: MockDispatch[];
  draws: MockDraw[];
  writes: MockWrite[];
  textureWrites: MockTextureWrite[];
  clears: MockWrite[];
  copies: { from: string; to: string; size: number }[];
  textureCopies: { from: string; to: string; bytesPerRow: number }[];
  querySets: { label: string; count: number; type: string }[];
  resolves: { querySet: string; first: number; count: number; to: string }[];
  computePasses: { timestampWrites: boolean }[];
  renderPasses: number;
  submits: number;
  destroyed: boolean;
  /** `device.lost`를 해소한다. */
  loseDevice(reason: "destroyed" | "unknown", message: string): void;
  bufferByLabel(label: string): MockBuffer;
  textureByLabel(label: string): MockTexture;
  /** 버퍼 백킹에 u32를 기록한다(GPU 결과 주입). */
  setU32(label: string, byteOffset: number, value: number): void;
  getU32(label: string, byteOffset: number): number;
}

interface PipelineHandle {
  label: string;
  entryPoint: string;
  kind: "compute" | "render";
  layout: MockPipelineLayout | null;
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

function labelOf(desc: { label?: string } | undefined, fallback: string): string {
  return desc?.label ?? fallback;
}

/** fake GPUDevice를 만든다. */
export function createMockGpu(options: MockGpuOptions = {}): MockGpu {
  const calls: string[] = [];
  const buffers: MockBuffer[] = [];
  const textures: MockTexture[] = [];
  const shaderModules: { label: string; code: string }[] = [];
  const pipelines: MockPipeline[] = [];
  const bindGroupLayouts: { label: string; entries: number }[] = [];
  const bindGroups: { label: string; layout: string; entries: number }[] = [];
  const dispatches: MockDispatch[] = [];
  const draws: MockDraw[] = [];
  const writes: MockWrite[] = [];
  const textureWrites: MockTextureWrite[] = [];
  const clears: MockWrite[] = [];
  const copies: { from: string; to: string; size: number }[] = [];
  const textureCopies: { from: string; to: string; bytesPerRow: number }[] = [];
  const querySets: { label: string; count: number; type: string }[] = [];
  const resolves: { querySet: string; first: number; count: number; to: string }[] = [];
  const computePasses: { timestampWrites: boolean }[] = [];
  const bufferOf = new WeakMap<object, MockBuffer>();
  const bglOf = new WeakMap<object, MockBindGroupLayout>();
  const plOf = new WeakMap<object, MockPipelineLayout>();
  const bgOf = new WeakMap<object, MockBindGroupEntry>();
  const textureOf = new WeakMap<object, MockTexture>();
  const pipelineOf = new WeakMap<object, PipelineHandle>();
  const querySetOf = new WeakMap<object, { label: string; count: number; type: string }>();
  let anonymous = 0;
  let lostResolve: ((info: GPUDeviceLostInfo) => void) | null = null;
  const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
    lostResolve = resolve;
  });

  const limits: Record<string, number> = {
    maxTextureDimension1D: 8192,
    maxTextureDimension2D: 8192,
    maxTextureDimension3D: 2048,
    maxTextureArrayLayers: 256,
    maxBindGroups: 4,
    maxBindingsPerBindGroup: 1000,
    maxDynamicUniformBuffersPerPipelineLayout: 8,
    maxDynamicStorageBuffersPerPipelineLayout: 4,
    maxSampledTexturesPerShaderStage: 16,
    maxSamplersPerShaderStage: 16,
    maxStorageBuffersPerShaderStage: 8,
    maxStorageTexturesPerShaderStage: 4,
    maxUniformBuffersPerShaderStage: 12,
    maxUniformBufferBindingSize: 65536,
    maxStorageBufferBindingSize: 134217728,
    minUniformBufferOffsetAlignment: 256,
    minStorageBufferOffsetAlignment: 256,
    maxVertexBuffers: 8,
    maxBufferSize: 268435456,
    maxVertexAttributes: 16,
    maxVertexBufferArrayStride: 2048,
    maxInterStageShaderVariables: 16,
    maxColorAttachments: 8,
    maxColorAttachmentBytesPerSample: 32,
    maxComputeWorkgroupStorageSize: 16384,
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupSizeX: 256,
    maxComputeWorkgroupSizeY: 256,
    maxComputeWorkgroupSizeZ: 64,
    maxComputeWorkgroupsPerDimension: 65535,
    ...options.limits,
  };
  const features = new Set<string>(options.features ?? []);

  const record = (name: string): void => {
    calls.push(name);
  };

  const makeBuffer = (desc: GPUBufferDescriptor): GPUBuffer => {
    const label = labelOf(desc, `buffer#${anonymous++}`);
    const entry: MockBuffer = {
      label,
      size: desc.size,
      usage: desc.usage,
      data: new ArrayBuffer(desc.size),
      mapped: Boolean(desc.mappedAtCreation),
      destroyed: false,
      mapCount: 0,
      handle: undefined as unknown as GPUBuffer,
    };
    const handle = {
      label,
      size: desc.size,
      usage: desc.usage,
      get mapState(): GPUBufferMapState {
        return entry.mapped ? "mapped" : "unmapped";
      },
      async mapAsync(): Promise<void> {
        record("buffer.mapAsync");
        if (entry.destroyed) throw new Error(`mock buffer ${label} destroyed`);
        entry.mapped = true;
        entry.mapCount += 1;
      },
      getMappedRange(offset = 0, size?: number): ArrayBuffer {
        record("buffer.getMappedRange");
        if (!entry.mapped) throw new Error(`mock buffer ${label} is not mapped`);
        const end = size === undefined ? entry.size : offset + size;
        return entry.data.slice(offset, end);
      },
      unmap(): void {
        record("buffer.unmap");
        entry.mapped = false;
      },
      destroy(): void {
        record("buffer.destroy");
        entry.destroyed = true;
      },
    };
    const typed = handle as unknown as GPUBuffer;
    entry.handle = typed;
    bufferOf.set(typed, entry);
    buffers.push(entry);
    return typed;
  };

  const makeTexture = (desc: GPUTextureDescriptor): GPUTexture => {
    const label = labelOf(desc, `texture#${anonymous++}`);
    const sizeArr = Array.isArray(desc.size) ? desc.size : null;
    const sizeDict = !Array.isArray(desc.size) ? desc.size : null;
    const width = sizeArr ? (sizeArr[0] ?? 1) : (sizeDict?.width ?? 1);
    const height = sizeArr ? (sizeArr[1] ?? 1) : (sizeDict?.height ?? 1);
    const entry: MockTexture = {
      label,
      width,
      height,
      format: desc.format,
      mipLevelCount: desc.mipLevelCount ?? 1,
      usage: desc.usage,
      destroyed: false,
      data: null,
      handle: undefined as unknown as GPUTexture,
    };
    const handle = {
      label,
      width,
      height,
      format: desc.format,
      mipLevelCount: entry.mipLevelCount,
      createView(viewDesc?: GPUTextureViewDescriptor): GPUTextureView {
        record("texture.createView");
        return { label: viewDesc?.label ?? `${label}.view` } as unknown as GPUTextureView;
      },
      destroy(): void {
        record("texture.destroy");
        entry.destroyed = true;
      },
    };
    const typed = handle as unknown as GPUTexture;
    entry.handle = typed;
    textureOf.set(typed, entry);
    textures.push(entry);
    return typed;
  };

  const makePipeline = (
    label: string,
    entryPoint: string,
    kind: "compute" | "render",
    async: boolean,
    layoutHandle: unknown,
  ): PipelineHandle => {
    const layout = layoutHandle && typeof layoutHandle === "object" ? (plOf.get(layoutHandle) ?? null) : null;
    pipelines.push({ label, kind, entryPoint, async, layoutLabel: layout?.label ?? null });
    if (layout && kind === "compute") {
      let storage = 0;
      for (const bgl of layout.bgls) {
        for (const e of bgl.entries) if (e.kind === "storage" || e.kind === "read-only-storage") storage += 1;
      }
      const maxStorage = limits.maxStorageBuffersPerShaderStage ?? 8;
      if (storage > maxStorage) {
        throw new MockValidationError(`pipeline ${label}: storage buffers ${storage} > maxStorageBuffersPerShaderStage ${maxStorage}`);
      }
      if (layout.bgls.length > (limits.maxBindGroups ?? 4)) {
        throw new MockValidationError(`pipeline ${label}: bind groups ${layout.bgls.length} > maxBindGroups`);
      }
    }
    const handle: PipelineHandle = {
      label,
      entryPoint,
      kind,
      layout,
      getBindGroupLayout(index: number): GPUBindGroupLayout {
        return { label: `${label}.auto${index}` } as unknown as GPUBindGroupLayout;
      },
    };
    pipelineOf.set(handle, handle);
    return handle;
  };

  const requireBuffer = (b: GPUBuffer): MockBuffer => {
    const entry = bufferOf.get(b);
    if (!entry) throw new Error("mock: unknown GPUBuffer");
    if (entry.destroyed) throw new Error(`mock: buffer ${entry.label} destroyed`);
    return entry;
  };

  const makeEncoder = (): GPUCommandEncoder => {
    record("device.createCommandEncoder");
    let currentPipeline: PipelineHandle | null = null;
    const encoder = {
      label: "mock-encoder",
      beginComputePass(desc?: GPUComputePassDescriptor): GPUComputePassEncoder {
        record("encoder.beginComputePass");
        const passIndex = computePasses.length;
        computePasses.push({ timestampWrites: Boolean(desc?.timestampWrites) });
        const boundGroups: (MockBindGroupEntry | undefined)[] = [];
        const boundOffsets: (readonly number[] | null)[] = [];
        /** dispatch 1회의 usage scope 검증(Dawn 규칙): 파이프라인 레이아웃의 bind group만 포함한다. */
        const validateDispatch = (indirect: MockBuffer | null): void => {
          const pl = currentPipeline?.layout ?? null;
          if (!pl) return;
          const writable = new Map<MockBuffer, number>();
          const readable = new Set<MockBuffer>();
          pl.bgls.forEach((bgl, index) => {
            const group = boundGroups[index];
            if (!group) throw new MockValidationError(`dispatch ${currentPipeline?.entryPoint}: bind group ${index} is not set`);
            if (group.layout.label !== bgl.label) {
              throw new MockValidationError(`dispatch ${currentPipeline?.entryPoint}: bind group ${index} layout ${group.layout.label} ≠ ${bgl.label}`);
            }
            for (const e of bgl.entries) {
              const buf = group.buffers.get(e.binding);
              if (!buf) continue;
              if (e.kind === "storage") writable.set(buf, (writable.get(buf) ?? 0) + 1);
              else readable.add(buf);
            }
          });
          if (indirect && writable.has(indirect)) {
            throw new MockValidationError(
              `buffer ${indirect.label} usage (Indirect|Storage(read-write)) includes writable usage and another usage in the same synchronization scope`,
            );
          }
          for (const [buf, n] of writable) {
            if (n > 1 || readable.has(buf)) {
              throw new MockValidationError(`buffer ${buf.label} is bound as writable storage together with another usage in one dispatch`);
            }
          }
        };
        const pass = {
          setPipeline(p: GPUComputePipeline): void {
            const h = pipelineOf.get(p);
            if (!h) throw new Error("mock: unknown compute pipeline");
            currentPipeline = h;
            record("pass.setPipeline");
          },
          setBindGroup(index: number, group: GPUBindGroup | null, offsets?: Iterable<number> | Uint32Array): void {
            record("pass.setBindGroup");
            const entry = group ? bgOf.get(group) : undefined;
            boundGroups[index] = entry;
            const list = offsets === undefined ? [] : Array.from(offsets);
            const dynamic = entry ? entry.layout.entries.filter((e) => e.dynamic) : [];
            if (entry && dynamic.length !== list.length) {
              throw new MockValidationError(`setBindGroup(${index}): ${dynamic.length} dynamic offset(s) required, got ${list.length}`);
            }
            dynamic.forEach((e, k) => {
              const off = list[k] ?? 0;
              if (off % 256 !== 0) throw new MockValidationError(`setBindGroup(${index}): dynamic offset ${off} is not a multiple of 256`);
              const range = entry?.ranges.get(e.binding);
              const buf = entry?.buffers.get(e.binding);
              if (range && buf && range.offset + off + range.size > buf.size) {
                throw new MockValidationError(`setBindGroup(${index}): dynamic offset ${off} + size ${range.size} exceeds buffer ${buf.label}`);
              }
            });
            boundOffsets[index] = list.length > 0 ? list : null;
          },
          dispatchWorkgroups(x: number, y = 1, z = 1): void {
            record("pass.dispatchWorkgroups");
            if (!currentPipeline) throw new Error("mock: dispatch without pipeline");
            validateDispatch(null);
            dispatches.push({
              entryPoint: currentPipeline.entryPoint,
              groupOffsets: boundOffsets.slice(),
              kind: "direct",
              x,
              y,
              z,
              indirectBuffer: null,
              indirectOffset: 0,
              layoutLabel: currentPipeline.layout?.label ?? null,
              pass: passIndex,
            });
          },
          dispatchWorkgroupsIndirect(buffer: GPUBuffer, offset: number): void {
            record("pass.dispatchWorkgroupsIndirect");
            if (!currentPipeline) throw new Error("mock: dispatch without pipeline");
            const entry = requireBuffer(buffer);
            if ((entry.usage & USAGE_INDIRECT) === 0) throw new MockValidationError(`buffer ${entry.label} lacks INDIRECT usage`);
            if (offset % 4 !== 0) throw new MockValidationError(`indirect offset ${offset} is not a multiple of 4`);
            if (offset + 12 > entry.size) throw new MockValidationError(`indirect args out of range on ${entry.label}`);
            validateDispatch(entry);
            dispatches.push({
              entryPoint: currentPipeline.entryPoint,
              groupOffsets: boundOffsets.slice(),
              kind: "indirect",
              x: 0,
              y: 0,
              z: 0,
              indirectBuffer: entry.label,
              indirectOffset: offset,
              layoutLabel: currentPipeline.layout?.label ?? null,
              pass: passIndex,
            });
          },
          end(): void {
            record("pass.end");
          },
        };
        return pass as unknown as GPUComputePassEncoder;
      },
      beginRenderPass(): GPURenderPassEncoder {
        record("encoder.beginRenderPass");
        const passIndex = computePasses.length;
        const pass = {
          setPipeline(p: GPURenderPipeline): void {
            const h = pipelineOf.get(p);
            if (!h) throw new Error("mock: unknown render pipeline");
            currentPipeline = h;
            record("pass.setPipeline");
          },
          setBindGroup(): void {
            record("pass.setBindGroup");
          },
          setVertexBuffer(): void {
            record("pass.setVertexBuffer");
          },
          draw(vertexCount: number, instanceCount = 1): void {
            record("pass.draw");
            if (!currentPipeline) throw new Error("mock: draw without pipeline");
            draws.push({ entryPoint: currentPipeline.entryPoint, vertexCount, instanceCount, pass: passIndex });
          },
          end(): void {
            record("pass.end");
          },
        };
        return pass as unknown as GPURenderPassEncoder;
      },
      clearBuffer(buffer: GPUBuffer, offset = 0, size?: number): void {
        record("encoder.clearBuffer");
        const entry = requireBuffer(buffer);
        const n = size ?? entry.size - offset;
        if (offset % 4 !== 0 || n % 4 !== 0) throw new MockValidationError(`clearBuffer ${entry.label} offset/size must be multiples of 4`);
        if ((entry.usage & USAGE_COPY_DST) === 0) throw new MockValidationError(`clearBuffer ${entry.label} lacks COPY_DST usage`);
        new Uint8Array(entry.data, offset, n).fill(0);
        clears.push({ target: entry.label, offset, size: n });
      },
      copyBufferToBuffer(src: GPUBuffer, srcOffset: number, dst: GPUBuffer, dstOffset: number, size: number): void {
        record("encoder.copyBufferToBuffer");
        const s = requireBuffer(src);
        const d = requireBuffer(dst);
        if (srcOffset % 4 !== 0 || dstOffset % 4 !== 0 || size % 4 !== 0) {
          throw new MockValidationError(`copyBufferToBuffer ${s.label}→${d.label}: offsets/size must be multiples of 4`);
        }
        if ((s.usage & USAGE_COPY_SRC) === 0) throw new MockValidationError(`copyBufferToBuffer source ${s.label} lacks COPY_SRC usage`);
        if ((d.usage & USAGE_COPY_DST) === 0) throw new MockValidationError(`copyBufferToBuffer destination ${d.label} lacks COPY_DST usage`);
        new Uint8Array(d.data, dstOffset, size).set(new Uint8Array(s.data, srcOffset, size));
        copies.push({ from: s.label, to: d.label, size });
      },
      copyTextureToBuffer(src: GPUTexelCopyTextureInfo, dst: GPUTexelCopyBufferInfo, size: GPUExtent3D): void {
        record("encoder.copyTextureToBuffer");
        const tex = textureOf.get(src.texture);
        if (!tex) throw new Error("mock: unknown texture");
        const d = requireBuffer(dst.buffer);
        const bytesPerRow = dst.bytesPerRow ?? 0;
        if (bytesPerRow % 256 !== 0) throw new MockValidationError(`copyTextureToBuffer bytesPerRow ${bytesPerRow} is not a multiple of 256`);
        if ((d.usage & USAGE_COPY_DST) === 0) throw new MockValidationError(`copyTextureToBuffer destination ${d.label} lacks COPY_DST usage`);
        const sizeArr = Array.isArray(size) ? size : null;
        const sizeDict = !Array.isArray(size) ? size : null;
        const w = sizeArr ? (sizeArr[0] ?? 1) : (sizeDict?.width ?? 1);
        const h = sizeArr ? (sizeArr[1] ?? 1) : (sizeDict?.height ?? 1);
        if (tex.data) {
          const bpp = 4;
          const out = new Uint8Array(d.data, dst.offset ?? 0);
          for (let y = 0; y < h; y += 1) {
            out.set(tex.data.subarray(y * w * bpp, (y + 1) * w * bpp), y * bytesPerRow);
          }
        }
        textureCopies.push({ from: tex.label, to: d.label, bytesPerRow });
      },
      resolveQuerySet(qs: GPUQuerySet, first: number, count: number, dst: GPUBuffer, dstOffset: number): void {
        record("encoder.resolveQuerySet");
        const q = querySetOf.get(qs);
        if (!q) throw new Error("mock: unknown query set");
        const d = requireBuffer(dst);
        if (dstOffset % 256 !== 0) {
          throw new MockValidationError(`The destination buffer ${d.label} offset (${dstOffset}) is not a multiple of 256`);
        }
        if ((d.usage & USAGE_QUERY_RESOLVE) === 0) throw new MockValidationError(`resolveQuerySet destination ${d.label} lacks QUERY_RESOLVE usage`);
        const view = new DataView(d.data);
        const ts = options.timestampsNs ?? [0n, 0n];
        for (let i = 0; i < count; i += 1) {
          view.setBigUint64(dstOffset + i * 8, i % 2 === 0 ? ts[0] : ts[1], true);
        }
        resolves.push({ querySet: q.label, first, count, to: d.label });
      },
      finish(): GPUCommandBuffer {
        record("encoder.finish");
        return { label: "mock-commands" } as unknown as GPUCommandBuffer;
      },
    };
    return encoder as unknown as GPUCommandEncoder;
  };

  const queue = {
    label: "mock-queue",
    writeBuffer(buffer: GPUBuffer, offset: number, data: BufferSource | SharedArrayBuffer, dataOffset = 0, size?: number): void {
      record("queue.writeBuffer");
      const entry = requireBuffer(buffer);
      if ((entry.usage & USAGE_COPY_DST) === 0) throw new MockValidationError(`writeBuffer destination ${entry.label} lacks COPY_DST usage`);
      let bytes: Uint8Array;
      if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
        bytes = new Uint8Array(data, dataOffset, size ?? data.byteLength - dataOffset);
      } else {
        const view = data as ArrayBufferView;
        const elem = "BYTES_PER_ELEMENT" in view ? (view as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT : 1;
        const start = view.byteOffset + dataOffset * elem;
        const len = size === undefined ? view.byteLength - dataOffset * elem : size * elem;
        bytes = new Uint8Array(view.buffer, start, len);
      }
      if (offset % 4 !== 0 || bytes.byteLength % 4 !== 0) {
        throw new MockValidationError(`writeBuffer ${entry.label}: offset ${offset}/size ${bytes.byteLength} must be multiples of 4`);
      }
      if (offset + bytes.byteLength > entry.size) {
        throw new RangeError(`mock writeBuffer overflow on ${entry.label}: ${offset}+${bytes.byteLength} > ${entry.size}`);
      }
      new Uint8Array(entry.data, offset, bytes.byteLength).set(bytes);
      writes.push({ target: entry.label, offset, size: bytes.byteLength });
    },
    writeTexture(dest: GPUTexelCopyTextureInfo, data: AllowSharedBufferSource, _layout: GPUTexelCopyBufferLayout, size: GPUExtent3D): void {
      record("queue.writeTexture");
      const tex = textureOf.get(dest.texture);
      if (!tex) throw new Error("mock: unknown texture");
      const sizeArr = Array.isArray(size) ? size : null;
      const sizeDict = !Array.isArray(size) ? size : null;
      textureWrites.push({
        target: tex.label,
        mipLevel: dest.mipLevel ?? 0,
        width: sizeArr ? (sizeArr[0] ?? 1) : (sizeDict?.width ?? 1),
        height: sizeArr ? (sizeArr[1] ?? 1) : (sizeDict?.height ?? 1),
        bytes: data.byteLength,
      });
    },
    submit(): void {
      record("queue.submit");
      mock.submits += 1;
    },
    async onSubmittedWorkDone(): Promise<void> {
      record("queue.onSubmittedWorkDone");
    },
  };

  const device = {
    label: "mock-device",
    features,
    limits,
    lost,
    queue,
    createShaderModule(desc: GPUShaderModuleDescriptor): GPUShaderModule {
      record("device.createShaderModule");
      const label = labelOf(desc, `shader#${anonymous++}`);
      shaderModules.push({ label, code: desc.code });
      const injected = options.compilationMessages?.[label] ?? [];
      return {
        label,
        async getCompilationInfo(): Promise<GPUCompilationInfo> {
          record("shader.getCompilationInfo");
          return {
            messages: injected.map((m) => ({
              message: m.message,
              type: m.type,
              lineNum: m.lineNum ?? 0,
              linePos: m.linePos ?? 0,
              offset: 0,
              length: 0,
            })),
          } as unknown as GPUCompilationInfo;
        },
      } as unknown as GPUShaderModule;
    },
    createBindGroupLayout(desc: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout {
      record("device.createBindGroupLayout");
      const label = labelOf(desc, `bgl#${anonymous++}`);
      const list = Array.from(desc.entries);
      bindGroupLayouts.push({ label, entries: list.length });
      const entry: MockBindGroupLayout = {
        label,
        entries: list.map((e) => {
          let kind: MockBindGroupLayout["entries"][number]["kind"] = "sampler";
          if (e.buffer) kind = e.buffer.type === "uniform" ? "uniform" : e.buffer.type === "read-only-storage" ? "read-only-storage" : "storage";
          else if (e.texture) kind = "texture";
          else if (e.storageTexture) kind = "storage-texture";
          return { binding: e.binding, kind, dynamic: Boolean(e.buffer?.hasDynamicOffset) };
        }),
      };
      const handle = { label } as unknown as GPUBindGroupLayout;
      bglOf.set(handle, entry);
      return handle;
    },
    createPipelineLayout(desc: GPUPipelineLayoutDescriptor): GPUPipelineLayout {
      record("device.createPipelineLayout");
      const label = labelOf(desc, "pipeline-layout");
      const bgls = Array.from(desc.bindGroupLayouts).map((l) => {
        const hit = l ? bglOf.get(l) : undefined;
        if (!hit) throw new MockValidationError(`pipeline layout ${label}: unknown bind group layout`);
        return hit;
      });
      const handle = { label } as unknown as GPUPipelineLayout;
      plOf.set(handle, { label, bgls });
      return handle;
    },
    createBindGroup(desc: GPUBindGroupDescriptor): GPUBindGroup {
      record("device.createBindGroup");
      const label = labelOf(desc, `bg#${anonymous++}`);
      const layout = bglOf.get(desc.layout);
      const list = Array.from(desc.entries);
      bindGroups.push({
        label,
        layout: (desc.layout as unknown as { label: string }).label,
        entries: list.length,
      });
      const buffers = new Map<number, MockBuffer>();
      const ranges = new Map<number, { offset: number; size: number }>();
      const bindings = new Set<number>();
      for (const e of list) {
        bindings.add(e.binding);
        const res = e.resource as { buffer?: GPUBuffer; offset?: number; size?: number };
        if (res && typeof res === "object" && res.buffer) {
          const b = requireBuffer(res.buffer);
          ranges.set(e.binding, { offset: res.offset ?? 0, size: res.size ?? b.size - (res.offset ?? 0) });
          const kind = layout?.entries.find((x) => x.binding === e.binding)?.kind;
          const need = kind === "uniform" ? USAGE_UNIFORM : USAGE_STORAGE;
          if ((b.usage & need) === 0) throw new MockValidationError(`bind group ${label}: buffer ${b.label} lacks ${kind} usage`);
          buffers.set(e.binding, b);
        }
      }
      if (layout) {
        for (const e of layout.entries) {
          if (!bindings.has(e.binding)) throw new MockValidationError(`bind group ${label}: binding ${e.binding} missing`);
        }
      }
      const handle = { label } as unknown as GPUBindGroup;
      if (layout) bgOf.set(handle, { label, layout, buffers, ranges, bindings });
      return handle;
    },
    createComputePipeline(desc: GPUComputePipelineDescriptor): GPUComputePipeline {
      record("device.createComputePipeline");
      return makePipeline(labelOf(desc, "compute"), desc.compute.entryPoint ?? "", "compute", false, desc.layout) as unknown as GPUComputePipeline;
    },
    async createComputePipelineAsync(desc: GPUComputePipelineDescriptor): Promise<GPUComputePipeline> {
      record("device.createComputePipelineAsync");
      return makePipeline(labelOf(desc, "compute"), desc.compute.entryPoint ?? "", "compute", true, desc.layout) as unknown as GPUComputePipeline;
    },
    createRenderPipeline(desc: GPURenderPipelineDescriptor): GPURenderPipeline {
      record("device.createRenderPipeline");
      return makePipeline(labelOf(desc, "render"), desc.fragment?.entryPoint ?? desc.vertex.entryPoint ?? "", "render", false, desc.layout) as unknown as GPURenderPipeline;
    },
    async createRenderPipelineAsync(desc: GPURenderPipelineDescriptor): Promise<GPURenderPipeline> {
      record("device.createRenderPipelineAsync");
      return makePipeline(labelOf(desc, "render"), desc.fragment?.entryPoint ?? desc.vertex.entryPoint ?? "", "render", true, desc.layout) as unknown as GPURenderPipeline;
    },
    createBuffer(desc: GPUBufferDescriptor): GPUBuffer {
      record("device.createBuffer");
      return makeBuffer(desc);
    },
    createTexture(desc: GPUTextureDescriptor): GPUTexture {
      record("device.createTexture");
      return makeTexture(desc);
    },
    createSampler(desc?: GPUSamplerDescriptor): GPUSampler {
      record("device.createSampler");
      return { label: labelOf(desc, "sampler") } as unknown as GPUSampler;
    },
    createQuerySet(desc: GPUQuerySetDescriptor): GPUQuerySet {
      record("device.createQuerySet");
      const entry = { label: labelOf(desc, `query#${anonymous++}`), count: desc.count, type: desc.type };
      querySets.push(entry);
      const handle = {
        label: entry.label,
        count: desc.count,
        type: desc.type,
        destroy(): void {
          record("querySet.destroy");
        },
      };
      const typed = handle as unknown as GPUQuerySet;
      querySetOf.set(typed, entry);
      return typed;
    },
    createCommandEncoder(): GPUCommandEncoder {
      return makeEncoder();
    },
    pushErrorScope(): void {
      record("device.pushErrorScope");
    },
    async popErrorScope(): Promise<GPUError | null> {
      record("device.popErrorScope");
      return null;
    },
    destroy(): void {
      record("device.destroy");
      mock.destroyed = true;
    },
  };

  const mock: MockGpu = {
    device: device as unknown as GPUDevice,
    calls,
    buffers,
    textures,
    shaderModules,
    pipelines,
    bindGroupLayouts,
    bindGroups,
    dispatches,
    draws,
    writes,
    textureWrites,
    clears,
    copies,
    textureCopies,
    querySets,
    resolves,
    computePasses,
    renderPasses: 0,
    submits: 0,
    destroyed: false,
    loseDevice(reason, message): void {
      lostResolve?.({ reason, message } as GPUDeviceLostInfo);
    },
    bufferByLabel(label: string): MockBuffer {
      const hit = buffers.find((b) => b.label === label);
      if (!hit) throw new Error(`mock: no buffer labelled ${label}`);
      return hit;
    },
    textureByLabel(label: string): MockTexture {
      const hit = textures.find((t) => t.label === label);
      if (!hit) throw new Error(`mock: no texture labelled ${label}`);
      return hit;
    },
    setU32(label: string, byteOffset: number, value: number): void {
      new DataView(mock.bufferByLabel(label).data).setUint32(byteOffset, value >>> 0, true);
    },
    getU32(label: string, byteOffset: number): number {
      return new DataView(mock.bufferByLabel(label).data).getUint32(byteOffset, true);
    },
  };
  // beginRenderPass 횟수는 calls에서 센다.
  Object.defineProperty(mock, "renderPasses", {
    get: () => calls.filter((c) => c === "encoder.beginRenderPass").length,
  });
  return mock;
}

/** 가짜 GPUAdapter(probe 테스트용). */
export interface MockAdapterOptions {
  info?: Partial<GPUAdapterInfo> & { isFallbackAdapter?: boolean };
  features?: readonly string[];
  limits?: Partial<Record<string, number>>;
  /** requestDevice가 거부할 오류. */
  rejectDevice?: Error;
  gpu?: MockGpu;
}

export function createMockAdapter(options: MockAdapterOptions = {}): { adapter: GPUAdapter; gpu: MockGpu } {
  const gpu = options.gpu ?? createMockGpu({ features: options.features, limits: options.limits });
  const info = {
    vendor: options.info?.vendor ?? "mock",
    architecture: options.info?.architecture ?? "mock-arch",
    device: options.info?.device ?? "mock-device",
    description: options.info?.description ?? "mock adapter",
    isFallbackAdapter: options.info?.isFallbackAdapter ?? false,
    subgroupMinSize: 4,
    subgroupMaxSize: 64,
  };
  const adapter = {
    info,
    features: new Set<string>(options.features ?? []),
    limits: { ...(gpu.device.limits as unknown as Record<string, number>), ...options.limits },
    async requestDevice(desc?: GPUDeviceDescriptor): Promise<GPUDevice> {
      if (options.rejectDevice) throw options.rejectDevice;
      for (const f of desc?.requiredFeatures ?? []) {
        if (!adapter.features.has(f)) throw new TypeError(`feature ${f} unsupported`);
        (gpu.device.features as Set<string>).add(f);
      }
      return gpu.device;
    },
  };
  return { adapter: adapter as unknown as GPUAdapter, gpu };
}

/** 가짜 GPU(navigator.gpu 대응). `adapter: null`이면 requestAdapter가 null을 돌려준다. */
export function createMockGpuApi(adapter: GPUAdapter | null, preferredFormat: GPUTextureFormat = "bgra8unorm"): GPU {
  return {
    async requestAdapter(): Promise<GPUAdapter | null> {
      return adapter;
    },
    getPreferredCanvasFormat(): GPUTextureFormat {
      return preferredFormat;
    },
    wgslLanguageFeatures: new Set<string>(),
  } as unknown as GPU;
}

/** 가짜 WebGPU 캔버스(present 경로 테스트용). */
export function createMockCanvas(gpu: MockGpu, width: number, height: number): { canvas: OffscreenCanvas; configured: GPUCanvasConfiguration[] } {
  const configured: GPUCanvasConfiguration[] = [];
  const texture = gpu.device.createTexture({
    label: "mock-canvas-texture",
    size: { width, height },
    format: "bgra8unorm",
    usage: 0x10,
  });
  const ctx = {
    canvas: null,
    configure(cfg: GPUCanvasConfiguration): void {
      configured.push(cfg);
    },
    unconfigure(): void {
      configured.length = 0;
    },
    getCurrentTexture(): GPUTexture {
      return texture;
    },
    getConfiguration(): GPUCanvasConfiguration | null {
      return configured[configured.length - 1] ?? null;
    },
  };
  const canvas = {
    width,
    height,
    getContext(kind: string): unknown {
      return kind === "webgpu" ? ctx : null;
    },
  } as unknown as OffscreenCanvas;
  return { canvas, configured };
}
