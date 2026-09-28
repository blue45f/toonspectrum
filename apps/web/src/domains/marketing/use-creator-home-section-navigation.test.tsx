// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { bindCreatorSectionLayoutRecovery } from "./use-creator-home-section-navigation";

afterEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function layout() {
  document.body.innerHTML = '<header class="site-header"></header><main class="creator-home"><h2 id="creator-support-title" tabindex="-1">도움</h2><button>다음 작업</button></main>';
  window.history.replaceState(null, "", "/about/studio#creator-faq-title");
  const target = document.getElementById("creator-support-title");
  const header = document.querySelector("header");
  if (!target || !header) throw new Error("앵커 테스트 영역이 필요합니다.");
  let top = 158;
  vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => ({ top } as DOMRect));
  vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ bottom: 138 } as DOMRect);
  const scroll = vi.fn();
  target.scrollIntoView = scroll;
  let resize: () => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect = disconnect; });
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frame = callback; return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => { frame = undefined; });
  const dispose = bindCreatorSectionLayoutRecovery();
  target.focus();
  return { target, scroll, disconnect, dispose, move(value: number) { top = value; resize(); }, flush() { const callback = frame; frame = undefined; callback?.(0); } };
}

describe("소개 앵커의 늦은 레이아웃 복구", () => {
  it("CI에서 관측한 글꼴·헤더 재배치 후에도 초점 제목이 헤더 아래에 머문다", () => {
    const h = layout(); h.flush();
    expect(h.scroll).not.toHaveBeenCalled();
    h.move(133.40625); h.flush();
    expect(h.scroll).toHaveBeenCalledExactlyOnceWith({ block: "start", behavior: "instant" });
    expect(document.activeElement).toBe(h.target);
    h.dispose();
  });
  it.each(["wheel", "touchstart", "pointerdown", "keydown"])("%s 사용자 조작 뒤에는 화면을 다시 당기지 않는다", (event) => {
    const h = layout(); h.flush();
    document.dispatchEvent(new Event(event)); h.move(80); h.flush();
    expect(h.scroll).not.toHaveBeenCalled();
    h.dispose();
  });
  it("다른 컨트롤로 이동한 초점과 해제된 페이지는 건드리지 않는다", () => {
    const h = layout(); h.flush();
    document.querySelector("button")?.focus(); h.move(80); h.flush();
    expect(h.scroll).not.toHaveBeenCalled();
    h.target.focus(); h.dispose(); h.flush();
    expect(h.scroll).not.toHaveBeenCalled();
    expect(h.disconnect).toHaveBeenCalledOnce();
  });
});
