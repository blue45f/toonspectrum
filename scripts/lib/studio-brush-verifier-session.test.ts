// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { initializeStudioVerifierPageOnce, installStudioCanvasScaleDiagnostics } from "./studio-brush-verifier-session";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  Reflect.deleteProperty(globalThis, "__studioCtxScales");
  Reflect.deleteProperty(globalThis, "__studioCtxScaleSampleCounts");
});

describe("브러시 검증 세션의 진단 자원 수명", () => {
  it("같은 Page의 동시 준비와 재탐색은 두 init script를 한 번만 등록한다", async () => {
    const page = {};
    const addInitScript = vi.fn(async () => undefined);
    const install = async () => { await addInitScript(); await addInitScript(); };
    await Promise.all(Array.from({ length: 3 }, () => initializeStudioVerifierPageOnce(page, install)));
    await initializeStudioVerifierPageOnce(page, install);
    expect(addInitScript).toHaveBeenCalledTimes(2);
    await initializeStudioVerifierPageOnce({}, install);
    expect(addInitScript).toHaveBeenCalledTimes(4);
  });

  it("초기화 실패를 숨기지 않고 실패한 Page는 다시 준비할 수 있다", async () => {
    const page = {};
    const error = new Error("init registration failed");
    const install = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    await expect(initializeStudioVerifierPageOnce(page, install)).rejects.toBe(error);
    await initializeStudioVerifierPageOnce(page, install);
    await initializeStudioVerifierPageOnce(page, install);
    expect(install).toHaveBeenCalledTimes(2);
  });

  function installCanvasFixture() {
    const original = vi.fn(function (...args: unknown[]): unknown { return args[0]; });
    class CanvasContext {
      constructor(readonly canvas: HTMLCanvasElement) {}
      setTransform(...args: unknown[]): unknown { return original.apply(this, args); }
    }
    vi.stubGlobal("CanvasRenderingContext2D", CanvasContext);
    installStudioCanvasScaleDiagnostics();
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    return { canvas, context: new CanvasContext(canvas), original };
  }

  it("천 프레임에서도 최근 두 배율과 전체 표본 수만 유지하고 분리된 캔버스를 제외한다", () => {
    const { canvas, context } = installCanvasFixture();
    for (let index = 1; index <= 1000; index += 1) context.setTransform(index, 0, 0, index, 0, 0);
    const scales = () => Reflect.get(globalThis, "__studioCtxScales");
    const counts = () => Reflect.get(globalThis, "__studioCtxScaleSampleCounts");
    expect(scales()).toEqual({ c0: [+Math.hypot(999, 999).toFixed(4), +Math.hypot(1000, 1000).toFixed(4)] });
    expect(counts()).toEqual({ c0: 1000 });
    canvas.remove();
    expect(scales()).toEqual({});
    expect(counts()).toEqual({});
  });

  it("원래 setTransform의 this·인수·반환값·예외를 보존한다", () => {
    const { context, original } = installCanvasFixture();
    const matrix = { a: 2, d: 3 };
    expect(context.setTransform(matrix)).toBe(matrix);
    expect(original.mock.contexts[0]).toBe(context);
    expect(original.mock.calls[0]).toEqual([matrix]);
    const error = new Error("native transform failed");
    original.mockImplementationOnce(() => { throw error; });
    expect(() => context.setTransform(2, 0, 0, 2, 0, 0)).toThrow(error);
    expect(Reflect.get(globalThis, "__studioCtxScales")).toEqual({});
  });
});
