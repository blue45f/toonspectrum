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
function renderBanner() {
  return render(
    <MemoryRouter>
      <ServiceDegradedBanner />
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

describe("ServiceDegradedBanner", () => {
  it("states the affected capabilities without blocking local editing", () => {
    renderBanner();
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

    renderBanner();

    expect(screen.getByRole("status").textContent)
      .toContain("온라인 기능이 복구되었습니다");
    expect(screen.queryByRole("button", { name: "다시 확인" })).toBeNull();
  });
});
