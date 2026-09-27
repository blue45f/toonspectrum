import { errors, type Page } from "playwright";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { waitForStudioCollaborationDocumentLane } from "./studio-collaboration-readiness";

const readyPhases = new Set(["synced", "read-only-follower", "syncing", "offline-queued"]);

function createPage() {
  const state = { welcome: false, dock: false, phase: "starting", blocked: false };
  const pause = (timeout: number) => new Promise<void>((resolve) => setTimeout(resolve, timeout));
  const click = vi.fn(async ({ timeout }: { timeout: number }) => {
    if (state.blocked) {
      await pause(timeout);
      throw new errors.TimeoutError("닫기 버튼이 비활성 상태입니다.");
    }
    state.welcome = false;
  });
  const getByRole = vi.fn(() => ({ click }));
  const welcome = { isVisible: async () => state.welcome, getByRole };
  const dock = {
    // 실제 CSS guard와 같은 조건: welcome이 있으면 synced dock도 보이지 않는다.
    isVisible: async () => state.dock && !state.welcome,
    getAttribute: async () => state.phase,
    first: () => dock,
  };
  const page = {
    locator: (selector: string) => {
      if (selector === '[data-studio-presence-dock="true"]') return dock;
      if (selector === '[data-studio-cinematic-canvas-welcome="true"]') return welcome;
      throw new Error(`예상하지 않은 locator: ${selector}`);
    },
    waitForTimeout: pause,
    url: () => "http://127.0.0.1:4173/studio/canvas",
  } as unknown as Page;
  return { page, state, click, getByRole };
}

describe("협업 검증기 시작 안내 readiness", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it.each([false, true])("대기 시작 뒤 나타난 안내를 닫는다 (초기 dock=%s)", async (initialDock) => {
    const { page, state, click, getByRole } = createPage();
    state.dock = initialDock;
    const started = Date.now();
    const result = waitForStudioCollaborationDocumentLane(page, readyPhases);
    // 최초 dismissOverlays와 readiness 시작 때는 안내가 없다.
    await vi.advanceTimersByTimeAsync(150);
    expect(click).not.toHaveBeenCalled();
    state.welcome = true;
    state.dock = true;
    state.phase = "synced";
    await vi.advanceTimersByTimeAsync(50);

    await expect(result).resolves.toBe("synced");
    expect(Date.now() - started).toBe(200);
    expect(getByRole).toHaveBeenCalledWith("button", { name: "시작 안내 닫기", exact: true });
    expect(click).toHaveBeenCalledExactlyOnceWith({ timeout: 1_000 });
    expect(state.welcome).toBe(false);
  });

  it("synced여도 계속 숨겨진 dock은 통과시키지 않는다", async () => {
    const { page, state } = createPage();
    state.phase = "synced";
    const result = expect(waitForStudioCollaborationDocumentLane(page, readyPhases, 300))
      .rejects.toThrow("협업 문서 준비 시간 300ms 초과");
    await vi.advanceTimersByTimeAsync(300);
    await result;
  });

  it("보이는 dock도 허용되지 않은 phase이면 통과시키지 않는다", async () => {
    const { page, state } = createPage();
    state.dock = true;
    state.phase = "disconnected";
    const result = expect(waitForStudioCollaborationDocumentLane(page, readyPhases, 300))
      .rejects.toThrow("phase=disconnected");
    await vi.advanceTimersByTimeAsync(300);
    await result;
  });

  it("늦은 안내의 클릭 재시도도 남은 제한 시간만 사용한다", async () => {
    const { page, state, click } = createPage();
    const started = Date.now();
    const result = expect(waitForStudioCollaborationDocumentLane(page, readyPhases, 300))
      .rejects.toThrow("협업 문서 준비 시간 300ms 초과");
    await vi.advanceTimersByTimeAsync(150);
    state.welcome = true;
    state.dock = true;
    state.phase = "synced";
    state.blocked = true;
    await vi.advanceTimersByTimeAsync(150);
    await result;
    expect(Date.now() - started).toBe(300);
    expect(click).toHaveBeenCalledExactlyOnceWith({ timeout: 100 });
    expect(state.welcome).toBe(true);
  });

  it("타임아웃 이외의 브라우저 오류를 삼키지 않는다", async () => {
    const { page, state, click } = createPage();
    state.welcome = true;
    click.mockRejectedValueOnce(new Error("브라우저가 닫혔습니다."));
    await expect(waitForStudioCollaborationDocumentLane(page, readyPhases))
      .rejects.toThrow("브라우저가 닫혔습니다.");
  });

  it("닫기 클릭이 반복 실패해도 최초 deadline을 연장하지 않는다", async () => {
    const { page, state, click } = createPage();
    state.welcome = true;
    state.blocked = true;
    const started = Date.now();
    const result = expect(waitForStudioCollaborationDocumentLane(page, readyPhases, 2_500))
      .rejects.toThrow("협업 문서 준비 시간 2500ms 초과");
    await vi.advanceTimersByTimeAsync(2_500);
    await result;
    expect(Date.now() - started).toBe(2_500);
    expect(click.mock.calls).toEqual([[{ timeout: 1_000 }], [{ timeout: 1_000 }], [{ timeout: 300 }]]);
  });
});
