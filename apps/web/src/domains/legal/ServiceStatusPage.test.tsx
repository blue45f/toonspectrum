// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ServiceStatusPage } from "./ServiceStatusPage";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  state: {} as Record<string, unknown>,
}));

vi.mock("@/platform/service-capability-state", () => ({
  requestServiceCapabilityRefresh: mocks.refresh,
  useServiceCapabilityState: () => mocks.state,
}));
vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ServiceStatusPage", () => {
  it("does not claim the service is healthy before the first successful probe", () => {
    mocks.state = {
      status: "unknown",
      checking: false,
      report: null,
      lastError: null,
      nextProbeAt: null,
      recoveredAt: null,
    };
    render(<ServiceStatusPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent)
      .toContain("아직 확인하지 못했습니다");
    expect(screen.queryByText("현재 주요 기능이 정상입니다.")).toBeNull();
    expect(screen.getByText("기능 상태를 아직 확인하지 못했습니다.")).toBeTruthy();
  });

  it("shows capability-level outage details and the incident id", () => {
    mocks.state = {
      status: "degraded",
      checking: false,
      report: {
        status: "degraded",
        incidentId: "inc_status",
        retryAfterSeconds: 30,
        checkedAt: "2026-09-25T20:00:00.000Z",
        capabilities: {
          publicCatalog: "available",
          authSession: "degraded",
          communityRead: "unavailable",
          communityWrite: "unavailable",
          marketplaceRead: "unavailable",
          studioLocalEditing: "available",
          studioProjectRead: "unavailable",
          studioCloudSave: "unavailable",
          realtimeCollaboration: "unavailable",
          publishing: "unavailable",
          serverAi: "degraded",
        },
      },
      lastError: null,
      nextProbeAt: Date.now() + 30_000,
      recoveredAt: null,
    };
    render(<ServiceStatusPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent)
      .toContain("일부 온라인 기능이 제한");
    expect(screen.getByText("장애 ID inc_status")).toBeTruthy();
    expect(screen.getByText("Studio 로컬 편집")).toBeTruthy();
    expect(screen.getAllByText("일시 중지").length).toBeGreaterThan(0);
  });
});
