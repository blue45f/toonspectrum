// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PwaOfflinePage } from "./PwaOfflinePage";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateBilingualValueForActiveLocale: (_scope: string, ko: unknown) => ko,
  useBilingualI18nRevision: () => undefined,
}));

vi.mock("./usePwaOfflineReadiness", () => ({
  usePwaOfflineReadiness: () => ({
    readiness: "partial" as const,
    cachedResources: 12,
    refresh: vi.fn(),
    prepare: vi.fn(),
  }),
}));

vi.mock("./pwa-install-showcase-schedule", () => ({
  openPwaInstallShowcase: vi.fn(),
}));

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PwaOfflinePage", () => {
  it("오프라인 안내와 긴급 드로잉 보드 링크를 보여준다", () => {
    render(<PwaOfflinePage />);
    expect(screen.getByRole("heading", { name: "오프라인이에요" })).toBeTruthy();
    const drawLink = screen.getByRole("link", { name: "긴급 드로잉 보드 열기" });
    expect(drawLink.getAttribute("href")).toBe("/offline-draw/");
  });

  it("캐시된 리소스 수를 표시한다", () => {
    render(<PwaOfflinePage />);
    expect(screen.getByRole("status").textContent).toContain("12");
  });

  it("앱 설치 안내 링크를 보여준다", () => {
    render(<PwaOfflinePage />);
    expect(
      screen.getByRole("button", { name: /앱으로 설치하면 오프라인이 더 편해져요/ }),
    ).toBeTruthy();
  });
});
