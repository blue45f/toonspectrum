const pageInitializers = new WeakMap<object, Promise<void>>();

/** 같은 Page의 재탐색에서도 init script 등록은 한 번만 유지한다. */
export async function initializeStudioVerifierPageOnce(page: object, install: () => Promise<void>): Promise<void> {
  let pending = pageInitializers.get(page);
  if (!pending) {
    pending = Promise.resolve().then(install);
    pageInitializers.set(page, pending);
  }
  try {
    await pending;
  } catch (error) {
    if (pageInitializers.get(page) === pending) pageInitializers.delete(page);
    throw error;
  }
}

/** 현재·직전 배율만 비교한다. 제거된 캔버스와 과거 프레임 전체를 붙들지 않는다. */
export function installStudioCanvasScaleDiagnostics(): void {
  const histories = new WeakMap<HTMLCanvasElement, { samples: number[]; total: number }>();
  let canvasSequence = 0;
  const original = CanvasRenderingContext2D.prototype.setTransform;
  CanvasRenderingContext2D.prototype.setTransform = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    const result: unknown = Reflect.apply(original, this, args);
    try {
      const canvas = this.canvas;
      const a = Number(args[0]);
      const d = Number(args[3]);
      if (canvas && args.length >= 6 && Number.isFinite(a) && Number.isFinite(d)) {
        if (!canvas.dataset.__ctxId) canvas.dataset.__ctxId = `c${canvasSequence++}`;
        const history = histories.get(canvas) ?? { samples: [], total: 0 };
        history.samples.push(+Math.hypot(a, d).toFixed(4));
        if (history.samples.length > 2) history.samples.shift();
        history.total += 1;
        histories.set(canvas, history);
      }
    } catch {
      // 진단 실패가 원래 setTransform의 반환값이나 예외를 바꾸지 않는다.
    }
    return result;
  };

  Object.defineProperties(globalThis, {
    __studioCtxScales: {
      configurable: true,
      get: () => Object.fromEntries(Array.from(document.querySelectorAll("canvas")).flatMap((canvas) => {
        const history = histories.get(canvas);
        return history ? [[canvas.dataset.__ctxId, [...history.samples]]] : [];
      })),
    },
    __studioCtxScaleSampleCounts: {
      configurable: true,
      get: () => Object.fromEntries(Array.from(document.querySelectorAll("canvas")).flatMap((canvas) => {
        const history = histories.get(canvas);
        return history ? [[canvas.dataset.__ctxId, history.total]] : [];
      })),
    },
  });
}
