// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionStudioRevisionBridgePanel } from "./ProductionStudioRevisionBridgePanel";
import { createProductionDemoProject } from "./production-demo";

const projectGraph = vi.hoisted(() => ({
  loadByWork: vi.fn(),
  listRevisions: vi.fn(),
}));

vi.mock("../project-graph/studio-project-graph-client", () => ({
  getStudioProjectByWork: projectGraph.loadByWork,
  listStudioArtifactRevisions: projectGraph.listRevisions,
}));

const NOW = "2026-09-17T00:00:00.000Z";
const HASH = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  projectGraph.loadByWork.mockResolvedValue({
    id: "studio-project-1",
    workId: "sample-work",
    schemaVersion: 3,
    authorityVersion: "project-graph-v3",
    ownerUserId: "user-1",
    createdAt: NOW,
    updatedAt: NOW,
    access: {
      view: true,
      comment: true,
      edit: true,
      manageMembers: true,
      respondInvite: true,
      owner: true,
      role: "owner",
    },
    artifacts: [{
      id: "storyboard-artifact",
      projectId: "studio-project-1",
      kind: "storyboard",
      title: "12화 콘티",
      scope: { projectId: "studio-project-1", episodeId: "episode-12" },
      headRevisionId: "storyboard-r1",
      approvedRevisionId: "storyboard-r1",
      ownerWorkspaceId: "workspace-1",
      createdAt: NOW,
      updatedAt: NOW,
    }],
  });
  projectGraph.listRevisions.mockResolvedValue([{
    id: "storyboard-r1",
    artifactId: "storyboard-artifact",
    kind: "approved",
    parentIds: [],
    rootGraphHash: HASH,
    operationFirst: null,
    operationLast: null,
    createdBy: "user-1",
    deviceId: "device-1",
    createdAt: NOW,
    message: null,
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  }]);
});

describe("ProductionStudioRevisionBridgePanel", () => {
  it("pins the recommended Studio revision to the production task", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const base = createProductionDemoProject();
    const aggregate = {
      ...base,
      tasks: [{
        ...base.tasks[0]!,
        id: "task-storyboard-bridge",
        processKey: "storyboard",
        scope: {
          kind: "episode" as const,
          id: "episode-12",
          ancestors: [{ kind: "project" as const, id: base.projectId }],
        },
        inputRevisionRefs: [],
      }],
      submissions: [],
    };

    render(
      <MemoryRouter>
        <ProductionStudioRevisionBridgePanel
          aggregate={aggregate}
          execute={execute}
          canEdit
          enabled
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("12화 콘티 · storyboard-r1 · 승인본")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "추천 revision 고정" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-task",
        task: expect.objectContaining({
          id: "task-storyboard-bridge",
        processKey: "storyboard",
          inputRevisionRefs: [expect.objectContaining({
            id: "storyboard-r1",
            digest: `sha256:${HASH}`,
          })],
        }),
      }),
      expect.stringContaining("Studio 정본"),
    ));
  });

  it("does not call the server for the sample project", () => {
    render(
      <MemoryRouter>
        <ProductionStudioRevisionBridgePanel
          aggregate={createProductionDemoProject()}
          execute={vi.fn()}
          canEdit
          enabled={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/기능 미리보기에서는 실제 Studio 서버 정본을 변경하지 않습니다/u)).toBeTruthy();
    expect(projectGraph.loadByWork).not.toHaveBeenCalled();
  });
});
