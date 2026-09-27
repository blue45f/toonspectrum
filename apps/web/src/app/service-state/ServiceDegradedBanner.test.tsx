// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceDegradedBanner } from "./ServiceDegradedBanner";

const availableCapabilities = {
  publicCatalog: "available",
  authSession: "available",
  communityRead: "available",
  communityWrite: "available",
  marketplaceRead: "available",
  studioLocalEditing: "available",
  studioProjectRead: "available",
  studioCloudSave: "available",
  realtimeCollaboration: "available",
  publishing: "available",
  serverAi: "available",
} as const;

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  state: {} as Record<string, unknown>,
}));

vi.mock("@/platform/service-capability-state", () => ({
  requestServiceCapabilityRefresh: mocks.refresh,
  useServiceCapabilityState: () => mocks.state,
}));
function renderBanner(immersive: boolean) {
  return render(
    <MemoryRouter>
      <ServiceDegradedBanner immersive={immersive} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = {
    status: "degraded",
    checking: false,
    report: {
      status: "degraded",
      incidentId: "inc_test",
      retryAfterSeconds: 30,
      checkedAt: new Date().toISOString(),
      capabilities: {
        ...availableCapabilities,
        communityRead: "unavailable",
        studioCloudSave: "unavailable",
      },
    },
    lastError: null,
    nextProbeAt: null,
    recoveredAt: null,
  };
});
afterEach(cleanup);

describe.each([false, true])("ServiceDegradedBanner immersive=%s", (immersive) => {
  it("states the affected capabilities without blocking local editing", () => {
    renderBanner(immersive);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("커뮤니티 조회");
    expect(status.textContent).toContain("클라우드 저장");
    expect(status.textContent).toContain("로컬 편집은 계속 사용할 수 있습니다");

    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "상태 자세히" }).getAttribute("href"))
      .toBe("/status");
  });

  it("announces recovery without retaining the degraded copy", () => {
    mocks.state = {
      ...mocks.state,
      status: "available",
      report: {
        status: "available",
        incidentId: null,
        retryAfterSeconds: null,
        checkedAt: new Date().toISOString(),
        capabilities: availableCapabilities,
      },
      recoveredAt: Date.now(),
    };

    renderBanner(immersive);

    expect(screen.getByRole("status").textContent)
      .toContain("온라인 기능이 복구되었습니다");
    expect(screen.queryByRole("button", { name: "다시 확인" })).toBeNull();
  });
});

it("몰입 화면의 상단 도구를 덮지 않고 장애 상세를 펼치거나 접을 수 있다", () => {
  render(<MemoryRouter><ServiceDegradedBanner immersive /></MemoryRouter>);
  const status = screen.getByRole("status");
  expect(status.className).toContain("bottom-[calc(5.5rem+env(safe-area-inset-bottom))]");
  expect(status.className).not.toContain("top-");
  expect(status.className).toContain("max-sm:bg-panel");
  expect(status.querySelector("div")?.className).toContain("max-sm:grid-cols-[auto_minmax(0,1fr)]");
  const detail = screen.getByText(/로컬 편집은 계속 사용할 수 있습니다/);
  expect(detail.hidden).toBe(true);
  const expand = screen.getByRole("button", { name: "서비스 상태 알림 펼치기" });
  expect(expand.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(expand);
  expect(detail.hidden).toBe(false);
  const collapse = screen.getByRole("button", { name: "서비스 상태 알림 접기" });
  expect(collapse.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(collapse);
  expect(detail.hidden).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "상태 자세히" }).getAttribute("href")).toBe("/status");
});

it("고정 알림의 높이 변경에 맞춰 조작부 공간을 확보하고 해제한다", () => {
  const property = "--service-status-overlay-clearance";
  document.documentElement.style.setProperty(property, "8px");
  const view = renderBanner(true);
  const banner = screen.getByRole("status");
  banner.style.position = "fixed";
  const bounds = vi.spyOn(banner, "getBoundingClientRect");
  bounds.mockReturnValue(new DOMRect(0, 600, 390, 150));
  fireEvent(window, new Event("resize"));
  expect(document.documentElement.style.getPropertyValue(property)).toBe(`${window.innerHeight - 600 + 12}px`);
  bounds.mockReturnValue(new DOMRect(0, 520, 390, 230));
  fireEvent.click(screen.getByRole("button", { name: "서비스 상태 알림 펼치기" }));
  expect(document.documentElement.style.getPropertyValue(property)).toBe(`${window.innerHeight - 520 + 12}px`);
  view.unmount();
  expect(document.documentElement.style.getPropertyValue(property)).toBe("8px");
  bounds.mockRestore();
  document.documentElement.style.removeProperty(property);
});

it("일반 문서 흐름의 알림은 고정 조작부의 공간을 변경하지 않는다", () => {
  const property = "--service-status-overlay-clearance";
  const view = renderBanner(false);
  fireEvent(window, new Event("resize"));
  expect(document.documentElement.style.getPropertyValue(property)).toBe("");
  view.unmount();
});
