// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageEntrance } from "./PageEntrance";

function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PageEntrance", () => {
  it("진입 중에는 모션 변형 속성이 붙고 끝나면 done으로 바뀐다", () => {
    mockReducedMotion(false);
    vi.useFakeTimers();
    const { container } = render(
      <PageEntrance variant="pop">
        <p>본문</p>
      </PageEntrance>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.dataset.entrance).toBe("pop");
    expect(wrapper.dataset.entranceDone).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(wrapper.dataset.entranceDone).toBe("true");
    vi.useRealTimers();
  });

  it("ESC를 누르면 즉시 건너뛴다", () => {
    mockReducedMotion(false);
    const { container } = render(
      <PageEntrance>
        <p>본문</p>
      </PageEntrance>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.keyDown(window, { key: "Escape" });
    expect(wrapper.dataset.entranceDone).toBe("true");
  });

  it("화면을 누르면 즉시 건너뛴다", () => {
    mockReducedMotion(false);
    const { container } = render(
      <PageEntrance>
        <p>본문</p>
      </PageEntrance>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.pointerDown(wrapper);
    expect(wrapper.dataset.entranceDone).toBe("true");
  });

  it("모션 감소 설정이면 처음부터 done 상태로 그린다", () => {
    mockReducedMotion(true);
    const { container } = render(
      <PageEntrance>
        <p>본문</p>
      </PageEntrance>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.dataset.entranceDone).toBe("true");
  });
});
