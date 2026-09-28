import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { studioVisibleBootDeadline } from "./studio-visible-boot-deadline";

class Visibility extends EventTarget {
  hidden = false;
  setHidden(value: boolean) { this.hidden = value; this.dispatchEvent(new Event("visibilitychange")); }
}
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
afterEach(() => vi.useRealTimers());

describe("화면에 보이는 동안의 초기화 시간 제한", () => {
  it("보이는 화면의 실제 멈춤은 25초에 한 번 실패 처리한다", () => {
    const visibility = new Visibility(); const timeout = vi.fn();
    studioVisibleBootDeadline(visibility, timeout);
    vi.advanceTimersByTime(24_999); expect(timeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(timeout).toHaveBeenCalledOnce();
    visibility.setHidden(false); vi.advanceTimersByTime(50_000);
    expect(timeout).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("처음부터 숨긴 탭에서는 타이머를 만들지 않는다", () => {
    const visibility = new Visibility(); visibility.hidden = true; const timeout = vi.fn();
    const dispose = studioVisibleBootDeadline(visibility, timeout);
    expect(vi.getTimerCount()).toBe(0); vi.advanceTimersByTime(180_000);
    expect(timeout).not.toHaveBeenCalled(); visibility.setHidden(false);
    vi.advanceTimersByTime(25_000); expect(timeout).toHaveBeenCalledOnce(); dispose();
  });
  it("탭 전환을 반복해도 보이는 시간의 누적 예산을 초기화하지 않는다", () => {
    const visibility = new Visibility(); const timeout = vi.fn();
    studioVisibleBootDeadline(visibility, timeout);
    vi.advanceTimersByTime(10_000); visibility.setHidden(true);
    vi.advanceTimersByTime(90_000); expect(timeout).not.toHaveBeenCalled();
    visibility.setHidden(false); vi.advanceTimersByTime(5_000); visibility.setHidden(true);
    vi.advanceTimersByTime(90_000); visibility.setHidden(false);
    vi.advanceTimersByTime(9_999); expect(timeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(timeout).toHaveBeenCalledOnce();
  });
  it("준비 완료나 화면 해제 후에는 지연된 이벤트를 무시한다", () => {
    const visibility = new Visibility(); const timeout = vi.fn();
    const remove = vi.spyOn(visibility, "removeEventListener");
    const dispose = studioVisibleBootDeadline(visibility, timeout);
    vi.advanceTimersByTime(1000); dispose(); dispose();
    visibility.setHidden(true); visibility.setHidden(false); vi.advanceTimersByTime(90_000);
    expect(timeout).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledOnce();
  });
});
