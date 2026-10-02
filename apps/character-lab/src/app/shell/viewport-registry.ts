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
  /** 뷰포트 호스트 요소를 붙인다. 등록된 캔버스가 없을 때 호스트 안의 첫 <canvas>를 탐색한다. */
  attachHost(host: HTMLElement): () => void;
  current(): HTMLCanvasElement | null;
  subscribe(listener: (canvas: HTMLCanvasElement | null) => void): () => void;
}

export function createViewportRegistry(): ViewportRegistry {
  let canvas: HTMLCanvasElement | null = null;
  let host: HTMLElement | null = null;
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
