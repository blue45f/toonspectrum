// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PwaConnectionPulse } from "./PwaConnectionPulse";
import { PWA_OUTBOX_SYNC_EVENT } from "./pwa-offline-outbox";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateBilingualValueForActiveLocale: (_scope: string, ko: unknown) => ko,
  useBilingualI18nRevision: () => undefined,
}));

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

beforeEach(() => {
  cleanup();
  setOnline(true);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PwaConnectionPulse", () => {
  it("온라인이면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(<PwaConnectionPulse />);
    expect(container.innerHTML).toBe("");
  });

  it("초기 상태가 오프라인이면 pill을 보여준다", () => {
    setOnline(false);
    render(<PwaConnectionPulse />);
    expect(screen.getByRole("status").textContent).toContain("오프라인");
  });

  it("offline 이벤트에서 pill이 나타난다", () => {
    render(<PwaConnectionPulse />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status").textContent).toContain("오프라인");
  });

  it("online 이벤트에서 pill이 사라진다", () => {
    setOnline(false);
    render(<PwaConnectionPulse />);
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("알림 열(왼쪽 아래)에 놓이고 점유 높이를 게시해 위의 안내가 가리지 않게 하며, 사라지면 거둔다", () => {
    const property = "--service-status-overlay-clearance";
    setOnline(false);
    render(<PwaConnectionPulse />);
    const pill = screen.getByRole("status");
    expect(pill.getAttribute("data-state")).toBe("offline");

    pill.style.position = "fixed";
    vi.spyOn(pill, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 700, 280, 40));
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(document.documentElement.style.getPropertyValue(property)).toBe(`${window.innerHeight - 700 + 12}px`);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.documentElement.style.getPropertyValue(property)).toBe("");
  });

  it("동기화 시작 이벤트에서 진행 상태를 보여준다", () => {
    render(<PwaConnectionPulse />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(PWA_OUTBOX_SYNC_EVENT, { detail: { phase: "started" } }),
      );
    });
    expect(screen.getByRole("status").textContent).toContain("동기화 중");
  });
});
