// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { openStudioToolsCompanionForMenu } from "./studio-tools-companion-runtime";

function input(overrides: Record<string, unknown> = {}) {
  return {
    surface: "reference" as const,
    ensureRuntime: vi.fn(async () => null),
    runtimeRef: { current: null },
    windowRef: { current: null },
    announce: vi.fn(),
    workId: "work-1",
    t: (key: string) => key,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("openStudioToolsCompanionForMenu", () => {
  it("routes an already-ready request to the dedicated reference surface", () => {
    const openReady = vi.fn();
    const runtime = {
      sessionId: "session-ready",
      binding: {},
      protocol: { openReadyStudioToolsCompanionForMenu: openReady },
    };
    const request = input({ runtimeRef: { current: runtime } });

    openStudioToolsCompanionForMenu(request as never);

    expect(openReady).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-ready",
      surface: "reference",
      windowRef: request.windowRef,
      workId: "work-1",
    }));
    expect(request.ensureRuntime).not.toHaveBeenCalled();
  });

  it("reserves a reference-sized popup before the lazy runtime finishes", async () => {
    vi.useFakeTimers();
    const reservation = {
      closed: false,
      close: vi.fn(),
      focus: vi.fn(),
      opener: {} as Window | null,
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(reservation);
    const complete = vi.fn();
    const runtime = {
      sessionId: "session-lazy",
      binding: {},
      protocol: { completeReservedStudioToolsCompanionWindow: complete },
    };
    const request = input({ ensureRuntime: vi.fn(async () => runtime) });

    openStudioToolsCompanionForMenu(request as never);
    await vi.runAllTimersAsync();

    expect(open).toHaveBeenCalledWith(
      "",
      "_blank",
      expect.stringContaining("width=520,height=860"),
    );
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-lazy",
      surface: "reference",
      reservation,
      windowRef: request.windowRef,
    }));
  });
});
