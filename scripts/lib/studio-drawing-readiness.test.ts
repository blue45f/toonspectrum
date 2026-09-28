import { errors, type Locator, type Page } from "playwright";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clickStudioControlAfterReadiness,
  prepareStudioDrawingUi,
  waitForStudioDrawingReady,
} from "./studio-drawing-readiness";

type Surface = "comic" | "beta" | "welcome" | "quickstart" | "viewport" | "stage";
const selectors: Record<Surface, string> = {
  comic: '[data-studio-quick-comic-overlay="true"]',
  beta: '[data-studio-beta-notice="true"]',
  welcome: '[data-studio-cinematic-canvas-welcome="true"]',
  quickstart: '[data-studio-creative-starter="true"]',
  viewport: '[data-studio-canvas-viewport="true"]',
  stage: ".konvajs-content",
};
const closeControls: Partial<Record<Surface, string>> = {
  comic: "빠른 웹툰 조립 취소",
  beta: '[data-studio-beta-notice-acknowledge="true"]',
  welcome: "시작 안내 닫기",
  quickstart: '[data-studio-quickstart-dismiss="true"]',
};
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function fakePage() {
  const visible: Record<Surface, boolean> = {
    comic: false, beta: false, welcome: false, quickstart: false, viewport: true, stage: true,
  };
  const calls: Array<{ surface: Surface | "target"; options: { timeout: number } }> = [];
  const close = vi.fn(async (surface: Surface, options: { timeout: number }) => {
    // 강제 클릭/DOM 변경 없이 실제 닫기 컨트롤만 사용해야 이 fake가 상태를 바꾼다.
    expect(Object.keys(options)).toEqual(["timeout"]);
    expect(options.timeout).toBeGreaterThan(0);
    calls.push({ surface, options });
    visible[surface] = false;
  });
  const isVisible = vi.fn(async (surface: Surface) => visible[surface]);
  const locators = Object.fromEntries(Object.keys(selectors).map((key) => {
    const surface = key as Surface;
    const locator = {
      first: () => locator,
      isVisible: () => isVisible(surface),
      locator: (selector: string) => {
        expect(selector).toBe(closeControls[surface]);
        return { click: (options: { timeout: number }) => close(surface, options) };
      },
      getByRole: (role: string, options: { name: string; exact: boolean }) => {
        expect(role).toBe("button");
        expect(options).toEqual({ name: closeControls[surface], exact: true });
        return { click: (options: { timeout: number }) => close(surface, options) };
      },
    };
    return [selectors[surface], locator];
  }));
  const page = {
    locator: (selector: string) => {
      if (!locators[selector]) throw new Error(`허용하지 않은 locator: ${selector}`);
      return locators[selector];
    },
    waitForTimeout: pause,
  } as unknown as Page;
  const targetClick = vi.fn(async (options: { timeout: number }) => {
    expect(Object.keys(options)).toEqual(["timeout"]);
    calls.push({ surface: "target", options });
  });
  const target = { click: targetClick } as unknown as Locator;
  return { page, visible, calls, close, isVisible, target, targetClick };
}

describe("그리기 검증기 UI readiness", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("캔버스가 먼저 보여도 늦게 나타난 안내를 실제로 닫은 뒤 quickstart를 닫는다", async () => {
    const f = fakePage();
    const finished = vi.fn();
    const result = waitForStudioDrawingReady(f.page, { requireWelcome: true }).then(finished);
    await vi.advanceTimersByTimeAsync(650);
    expect(finished).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
    f.visible.welcome = true;
    f.visible.quickstart = true;
    await vi.runAllTimersAsync();
    await result;
    expect(f.calls.map(({ surface }) => surface)).toEqual(["welcome", "quickstart"]);
    expect(finished).toHaveBeenCalledWith({ welcomeDismissed: true });
  });

  it("동시에 보이는 모달을 comic, beta, welcome, quickstart 순으로 정상 클릭한다", async () => {
    const f = fakePage();
    for (const surface of ["comic", "beta", "welcome", "quickstart"] as const) f.visible[surface] = true;
    const result = waitForStudioDrawingReady(f.page, { requireWelcome: true });
    await vi.runAllTimersAsync();
    await result;
    expect(f.calls.map(({ surface }) => surface)).toEqual(["comic", "beta", "welcome", "quickstart"]);
  });

  it.each(["viewport", "stage"] as const)("안내를 닫아도 %s가 안 보이면 기다린다", async (surface) => {
    const f = fakePage();
    f.visible.welcome = true;
    f.visible[surface] = false;
    const finished = vi.fn();
    const result = waitForStudioDrawingReady(f.page, { requireWelcome: true }).then(finished);
    await vi.advanceTimersByTimeAsync(400);
    expect(finished).not.toHaveBeenCalled();
    f.visible[surface] = true;
    await vi.runAllTimersAsync();
    await result;
    expect(finished).toHaveBeenCalledOnce();
  });

  it("닫기 클릭이 성공해도 안내가 사라지지 않으면 준비 완료로 처리하지 않는다", async () => {
    const f = fakePage();
    f.visible.welcome = true;
    f.close.mockImplementation(async () => {});
    const result = expect(waitForStudioDrawingReady(f.page, { requireWelcome: true, timeoutMs: 450 }))
      .rejects.toThrow("450ms 초과");
    await vi.runAllTimersAsync();
    await result;
    expect(f.visible.welcome).toBe(true);
  });

  it("가시성 재확인 중 나타난 안내도 닫은 뒤 반환한다", async () => {
    const f = fakePage();
    let welcomeReads = 0;
    f.isVisible.mockImplementation(async (surface) => {
      if (surface === "welcome" && ++welcomeReads === 2) f.visible.welcome = true;
      return f.visible[surface];
    });
    const result = waitForStudioDrawingReady(f.page);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ welcomeDismissed: true });
    expect(f.calls.map(({ surface }) => surface)).toEqual(["welcome"]);
  });

  it("닫기가 실제 반영된 뒤 Playwright 응답만 timeout이어도 숨김 전환을 검증한다", async () => {
    const f = fakePage();
    f.visible.welcome = true;
    f.close.mockImplementationOnce(async (surface, { timeout }) => {
      await pause(timeout);
      f.visible[surface] = false;
      throw new errors.TimeoutError("클릭은 전달됐지만 응답 대기가 초과됨");
    });
    const finished = vi.fn();
    const result = waitForStudioDrawingReady(f.page, { requireWelcome: true, timeoutMs: 1_500 }).then(finished);
    await vi.advanceTimersByTimeAsync(999);
    expect(finished).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await result;
    expect(finished).toHaveBeenCalledWith({ welcomeDismissed: true });
    expect(f.close).toHaveBeenCalledOnce();
  });

  it("응답 timeout 뒤 늦게 사라진 안내도 다음 준비 단계에서 다시 요구하지 않는다", async () => {
    const f = fakePage();
    f.visible.welcome = true;
    f.close.mockImplementationOnce(async (surface, { timeout }) => {
      await pause(timeout);
      setTimeout(() => { f.visible[surface] = false; }, 50);
      throw new errors.TimeoutError("클릭 반영 대기");
    });
    const result = prepareStudioDrawingUi(f.page, async () => false, 1_500);
    await vi.runAllTimersAsync();
    await result;
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.visible.welcome).toBe(false);
  });

  it("안내가 없는 복구 문서는 출현을 강요하거나 데이터 조작 없이 진행한다", async () => {
    const f = fakePage();
    expect(await waitForStudioDrawingReady(f.page)).toEqual({ welcomeDismissed: false });
    expect(f.close).not.toHaveBeenCalled();
  });

  it("문서 초기화 후 늦게 뜨는 새 안내를 이전 닫기 증거로 통과시키지 않는다", async () => {
    const f = fakePage();
    f.visible.welcome = true;
    const finished = vi.fn();
    const reset = vi.fn(async () => {
      setTimeout(() => { f.visible.welcome = true; }, 650);
      return true;
    });
    const result = prepareStudioDrawingUi(f.page, reset).then(finished);
    await vi.advanceTimersByTimeAsync(500);
    expect(reset).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledWith(19_900);
    expect(finished).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await result;
    expect(f.calls.map(({ surface }) => surface)).toEqual(["welcome", "welcome"]);
  });

  it("초기화 없는 초기 진입에서도 늦은 안내의 닫기를 요구한다", async () => {
    const f = fakePage();
    const finished = vi.fn();
    const result = prepareStudioDrawingUi(f.page, async () => false).then(finished);
    await vi.advanceTimersByTimeAsync(500);
    expect(finished).not.toHaveBeenCalled();
    f.visible.welcome = true;
    await vi.runAllTimersAsync();
    await result;
    expect(f.close).toHaveBeenCalledOnce();
  });

  it("다음 문서의 준비 호출이 이전 호출의 성공을 재사용하지 않는다", async () => {
    const f = fakePage();
    f.visible.welcome = true;
    const first = waitForStudioDrawingReady(f.page, { requireWelcome: true });
    await vi.runAllTimersAsync();
    await first;
    const next = expect(waitForStudioDrawingReady(f.page, { requireWelcome: true, timeoutMs: 450 }))
      .rejects.toThrow("안내 닫기=false");
    await vi.runAllTimersAsync();
    await next;
    expect(f.close).toHaveBeenCalledOnce();
  });

  it("닫기 timeout 재시도는 단일 deadline과 남은 클릭 예산을 지킨다", async () => {
    const f = fakePage();
    f.visible.welcome = true;
    const failure = new errors.TimeoutError("닫기 버튼 차단");
    f.close.mockImplementation(async (_surface, { timeout }) => {
      await pause(timeout);
      throw failure;
    });
    const started = Date.now();
    const result = expect(waitForStudioDrawingReady(f.page, { requireWelcome: true, timeoutMs: 2_500 }))
      .rejects.toMatchObject({ cause: failure, message: expect.stringContaining("2500ms 초과") });
    await vi.runAllTimersAsync();
    await result;
    expect(Date.now() - started).toBe(2_500);
    expect(f.close.mock.calls.map(([, options]) => options)).toEqual([
      { timeout: 1_000 }, { timeout: 1_000 }, { timeout: 300 },
    ]);
  });

  it("초기화 전후도 하나의 예산을 공유한다", async () => {
    const f = fakePage();
    f.visible.welcome = true;
    const started = Date.now();
    const result = expect(prepareStudioDrawingUi(f.page, async () => {
      await pause(600);
      return true;
    }, 1_000)).rejects.toThrow("300ms 초과");
    await vi.runAllTimersAsync();
    await result;
    expect(Date.now() - started).toBe(1_000);
    expect(f.close).toHaveBeenCalledOnce();
  });

  it("모바일 대상 클릭 도중 나타난 안내를 닫고 같은 예산으로 정상 재시도한다", async () => {
    const f = fakePage();
    f.targetClick.mockImplementationOnce(async ({ timeout }) => {
      f.visible.welcome = true;
      await pause(timeout);
      throw new errors.TimeoutError("늦은 안내가 버튼을 가림");
    });
    const started = Date.now();
    const result = clickStudioControlAfterReadiness(f.page, f.target, 1_500);
    await vi.runAllTimersAsync();
    await result;
    expect(f.calls.map(({ surface }) => surface)).toEqual(["welcome", "target"]);
    expect(f.targetClick.mock.calls.map(([options]) => options)).toEqual([{ timeout: 1_000 }, { timeout: 300 }]);
    expect(Date.now() - started).toBe(1_200);
  });

  it("대상 버튼 차단이 계속되면 준비 재시도가 deadline을 늘리지 않는다", async () => {
    const f = fakePage();
    f.targetClick.mockImplementation(async ({ timeout }) => {
      await pause(timeout);
      throw new errors.TimeoutError("버튼 차단");
    });
    const started = Date.now();
    const result = expect(clickStudioControlAfterReadiness(f.page, f.target, 1_450))
      .rejects.toThrow("1450ms 초과");
    await vi.runAllTimersAsync();
    await result;
    expect(Date.now() - started).toBe(1_450);
    expect(f.targetClick.mock.calls.map(([options]) => options.timeout)).toEqual([1_000, 350]);
  });

  it.each(["visibility", "close", "target", "reset"] as const)("%s의 비 timeout 오류를 즉시 원형 전달한다", async (operation) => {
    const f = fakePage();
    const failure = new Error("브라우저 연결 종료 또는 selector 오류");
    const started = Date.now();
    if (operation === "visibility") f.isVisible.mockRejectedValue(failure);
    if (operation === "close") {
      f.visible.welcome = true;
      f.close.mockRejectedValue(failure);
    }
    if (operation === "target") f.targetClick.mockRejectedValue(failure);
    const result = operation === "reset"
      ? prepareStudioDrawingUi(f.page, async () => { throw failure; })
      : operation === "target"
        ? clickStudioControlAfterReadiness(f.page, f.target)
        : waitForStudioDrawingReady(f.page);
    await expect(result).rejects.toBe(failure);
    expect(Date.now()).toBe(started);
  });
});
