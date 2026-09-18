// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionLandingPage } from "./ProductionLandingPage";

import { useApp } from "@/shared/lib/store";

const api = vi.hoisted(() => ({
  listProductionProjects: vi.fn(),
  getProductionPersonalInbox: vi.fn(),
}));

vi.mock("./production-dashboard-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./production-dashboard-api")>();
  return {
    ...actual,
    listProductionProjects: (...args: unknown[]) => api.listProductionProjects(...args),
    getProductionPersonalInbox: (...args: unknown[]) => api.getProductionPersonalInbox(...args),
  };
});

function resetUser(userId: string | null) {
  useApp.setState({ userId, sessionToken: userId ? "session-token" : null });
}

describe("ProductionLandingPage portfolio", () => {
  beforeEach(() => {
    resetUser("user-portfolio");
    api.listProductionProjects.mockResolvedValue({
      projects: [{
        projectId: "project-risk",
        workId: "work-risk",
        title: "위험한 연재작",
        collaborationModel: "studio-production",
        revision: 8,
        updatedAt: "2026-09-17T00:00:00.000Z",
        access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
        healthScore: 42,
        activeEpisodeCount: 3,
        readyBufferCount: 1,
        criticalRiskCount: 2,
        overdueTaskCount: 2,
        blockedTaskCount: 1,
        unassignedTaskCount: 1,
        reviewTaskCount: 2,
        nextReleaseAt: "2026-09-19T12:00:00.000Z",
        forecastFinishAt: "2026-09-20T12:00:00.000Z",
        scheduleConfidencePercent: 48,
      }],
    });
    api.getProductionPersonalInbox.mockResolvedValue({
      items: [{
        bucket: "inProgress",
        projectId: "project-risk",
        projectTitle: "위험한 연재작",
        taskId: "task-line-art",
        taskTitle: "18화 선화 마무리",
        processKey: "line-art",
        status: "in-progress",
        dueAt: "2026-09-17T09:00:00.000Z",
        estimateHours: 6,
        episodeId: "episode-18",
      }],
      counts: { dueToday: 0, inProgress: 1, review: 0, ready: 0, waitingInput: 0, blockingOthers: 0 },
    });
  });

  afterEach(() => {
    cleanup();
    resetUser(null);
    vi.clearAllMocks();
  });

  it("shows risk-sorted project cards and a cross-project personal inbox", async () => {
    render(<MemoryRouter><ProductionLandingPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "내 제작 포트폴리오" })).toBeTruthy();
    expect(screen.getByText("위험한 연재작")).toBeTruthy();
    expect(screen.getByText("내 통합 작업함")).toBeTruthy();
    expect(screen.getByText("18화 선화 마무리")).toBeTruthy();
    expect(screen.getByRole("link", { name: /운영 열기/u }).getAttribute("href"))
      .toBe("/production/projects/project-risk/overview");
    await waitFor(() => expect(api.listProductionProjects).toHaveBeenCalledTimes(1));
    expect(api.getProductionPersonalInbox).toHaveBeenCalledTimes(1);
  });
});
