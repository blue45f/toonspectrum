/**
 * jsdom에는 `canvas` 패키지가 없어 `HTMLCanvasElement.prototype.getContext`가 null을 돌려준다.
 * 컴포넌트·platform 테스트는 이 스텁으로 2D 컨텍스트의 최소 표면(createImageData·putImageData·clearRect·arc 등)과
 * 선택적으로 WebGPU 컨텍스트(`configure`·`getCurrentTexture`)를 제공하고 호출을 기록한다.
 * 테스트 파일이 아닌 보조 모듈이므로 `any`를 쓰지 않는다.
 */

export interface CanvasStubRecorder {
  /** putImageData 호출 횟수(전체 캔버스 합). */
  putImageDataCalls: number;
  /** 마지막으로 올라간 ImageData(폭·높이·픽셀). */
  lastImage: { width: number; height: number; data: Uint8ClampedArray } | null;
  /** clearRect 호출 횟수. */
  clearRectCalls: number;
  /** arc 호출 횟수(미리보기 점 수). */
  arcCalls: number;
  /** WebGPU 컨텍스트 configure 호출 인자 기록. */
  configureCalls: GPUCanvasConfiguration[];
  /** 원래 getContext로 되돌린다. */
  restore(): void;
}

export interface CanvasStubOptions {
  /** `getContext("webgpu")`가 WebGPU 모양 컨텍스트를 돌려주게 한다(기본 false → null). */
  webgpu?: boolean;
  /** `getContext("webgpu")`가 2D 모양(configure 없음) 컨텍스트를 돌려주게 한다(잘못된 컨텍스트 경로). */
  webgpuAs2d?: boolean;
}

interface StubImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

type GetContext = HTMLCanvasElement["getContext"];

export function installCanvasStub(opts: CanvasStubOptions = {}): CanvasStubRecorder {
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  const recorder: CanvasStubRecorder = {
    putImageDataCalls: 0,
    lastImage: null,
    clearRectCalls: 0,
    arcCalls: 0,
    configureCalls: [],
    restore: () => {
      if (original) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", original);
    },
  };
  const make2d = (): object => ({
    globalAlpha: 1,
    fillStyle: "#000",
    createImageData: (w: number, h: number): StubImageData => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: (img: StubImageData): void => {
      recorder.putImageDataCalls += 1;
      recorder.lastImage = img;
    },
    clearRect: (): void => {
      recorder.clearRectCalls += 1;
    },
    save: (): void => {},
    restore: (): void => {},
    beginPath: (): void => {},
    arc: (): void => {
      recorder.arcCalls += 1;
    },
    fill: (): void => {},
  });
  const makeWebGpu = (): object => ({
    configure: (config: GPUCanvasConfiguration): void => {
      recorder.configureCalls.push(config);
    },
    getCurrentTexture: (): object => ({}),
    unconfigure: (): void => {},
  });
  const getContext: GetContext = function stubGetContext(this: HTMLCanvasElement, contextId: string) {
    if (contextId === "2d") return make2d() as unknown as CanvasRenderingContext2D;
    if (contextId === "webgpu") {
      if (opts.webgpu) return makeWebGpu() as unknown as GPUCanvasContext;
      if (opts.webgpuAs2d) return make2d() as unknown as CanvasRenderingContext2D;
      return null;
    }
    return null;
  } as GetContext;
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    writable: true,
    value: getContext,
  });
  return recorder;
}
