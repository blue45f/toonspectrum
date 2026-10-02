/**
 * 뷰포트 캔버스 등록소. ViewportPane(render)이 마운트 시 캔버스를 등록하고,
 * TopBar의 엔진 선택 버튼이 `current()`로 꺼내 `engineSession.select(backend, canvas)`에 넘긴다.
 * Babylon 객체·DOM 요소를 React state에 두지 않기 위한 얇은 ref 저장소다.
 *
 * ViewportPane이 등록 API를 쓰지 않더라도 셸(WorkbenchLayout)이 뷰포트 호스트 요소를 `attachHost`로
 * 붙여 두면 호스트 안의 첫 `<canvas>`를 찾는다. 둘 다 없으면 null이며 호출부가 fail-visible로 노출한다.
 */
export interface ViewportRegistry {
  /** 캔버스를 등록하고 해제 함수를 돌려준다(언마운트 시 호출). */
  register(canvas: HTMLCanvasElement): () => void;
  /**
   * 뷰포트가 캔버스를 새 것으로 교체하는 방법을 등록한다(ViewportPane). `renew()`는 **동기적으로** 새 캔버스를 마운트하고
   * `register`까지 마쳐야 한다. 해제 함수를 돌려준다.
   */
  setRenewer(renew: () => void): () => void;
  /**
   * 엔진 생성에 쓸 캔버스를 꺼낸다. WebGPU·WebGL2 컨텍스트는 한 번 얻으면 그 캔버스에 잠겨(다른 종류의 `getContext`는 null)
   * 한 캔버스를 한 번의 엔진 생성 시도에만 쓸 수 있다. 이미 엔진 생성에 넘긴 캔버스면 renewer로 새 캔버스를 마운트해 돌려준다.
   * renewer가 없어 교체할 수 없으면 현재 캔버스를 그대로 돌려준다. 캔버스가 없으면 null.
   */
  claim(): HTMLCanvasElement | null;
  /** 뷰포트 호스트 요소를 붙인다. 등록된 캔버스가 없을 때 호스트 안의 첫 <canvas>를 탐색한다. */
  attachHost(host: HTMLElement): () => void;
  current(): HTMLCanvasElement | null;
  subscribe(listener: (canvas: HTMLCanvasElement | null) => void): () => void;
}

export function createViewportRegistry(): ViewportRegistry {
  let canvas: HTMLCanvasElement | null = null;
  let host: HTMLElement | null = null;
  /** 마지막으로 엔진 생성에 넘긴 캔버스 */
  let claimed: HTMLCanvasElement | null = null;
  let renewer: (() => void) | null = null;
  const listeners = new Set<(canvas: HTMLCanvasElement | null) => void>();
  const resolve = (): HTMLCanvasElement | null => {
    if (canvas) return canvas;
    if (!host) return null;
    const found = host.querySelector("canvas");
    return found instanceof HTMLCanvasElement ? found : null;
  };
  const emit = (): void => {
    const resolved = resolve();
    for (const listener of listeners) listener(resolved);
  };
  return {
    register(next) {
      canvas = next;
      emit();
      return () => {
        if (canvas === next) {
          canvas = null;
          emit();
        }
      };
    },
    setRenewer(renew) {
      renewer = renew;
      return () => {
        if (renewer === renew) renewer = null;
      };
    },
    claim() {
      const current = resolve();
      if (!current) return null;
      if (current !== claimed) {
        claimed = current;
        return current;
      }
      if (renewer) {
        renewer();
        const next = resolve();
        if (next && next !== current) {
          claimed = next;
          return next;
        }
      }
      return current;
    },
    attachHost(next) {
      host = next;
      emit();
      return () => {
        if (host === next) {
          host = null;
          emit();
        }
      };
    },
    current: resolve,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
