// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioProjectWorkspaceState } from "../studio-project-workspace-store";
import { StudioReviewPanel } from "./StudioReviewPanel";
import { useStudioProjectWorkspace } from "./useStudioProjectWorkspace";

vi.mock("./useStudioProjectWorkspace", () => ({
  useStudioProjectWorkspace: vi.fn(),
}));

const useWorkspaceMock = vi.mocked(useStudioProjectWorkspace);

function workspaceState(openChangeRequest: boolean): StudioProjectWorkspaceState {
  return {
    schemaVersion: 1,
    projectId: "project-12",
    story: {
      synopsisComplete: true,
      episodeCount: 1,
      sceneCount: 1,
      characterCount: 2,
      unresolvedContinuityIssueCount: 0,
    },
    productionTasks: [],
    assets: [],
    reviewSession: {
      documentId: "document-1",
      versionId: "version-1",
      status: openChangeRequest ? "changes-requested" : "in-review",
      requiredReviewerIds: ["project-owner"],
      threads: openChangeRequest ? [{
        id: "thread-1",
        kind: "change-request",
        targetId: "cut-34",
        status: "open",
        messages: [{
          id: "message-1",
          authorId: "reviewer-1",
          body: "표정을 다시 확인해 주세요.",
          createdAt: "2026-09-11T03:00:00.000Z",
        }],
        resolvedBy: null,
        resolvedAt: null,
      }] : [],
      decisions: [],
      updatedAt: "2026-09-11T03:00:00.000Z",
    },
    localization: [],
    exportPreflights: [],
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceMock.mockReset();
});

afterEach(cleanup);

describe("StudioReviewPanel approval eligibility", () => {
  it("allows the current reviewer to approve before the final readiness state exists", () => {
    useWorkspaceMock.mockReturnValue({
      state: workspaceState(false),
      error: null,
      update: vi.fn(),
      reload: vi.fn(),
    });

    render(<StudioReviewPanel projectId="project-12" locale="ko" />);

    expect(screen.getByRole("button", { name: "승인" })).toBeEnabled();
  });

  it("blocks approval while a change request remains open", () => {
    useWorkspaceMock.mockReturnValue({
      state: workspaceState(true),
      error: null,
      update: vi.fn(),
      reload: vi.fn(),
    });

    render(<StudioReviewPanel projectId="project-12" locale="ko" />);

    expect(screen.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(screen.getByText(/열린 수정 요청 1개/u)).toBeTruthy();
  });
});
