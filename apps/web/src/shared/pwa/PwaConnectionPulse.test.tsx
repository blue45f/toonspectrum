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
