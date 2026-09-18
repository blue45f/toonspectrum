// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioProjectVersionStackPanel } from "./StudioProjectVersionStackPanel";

const api = vi.hoisted(() => ({
  listStudioArtifactRevisions: vi.fn(),
  newStudioProjectGraphId: vi.fn(),
  restoreStudioRevision: vi.fn(),
}));
const graph = vi.hoisted(() => ({
  project: {
    id: "project-1",
    workId: "work-1",
    schemaVersion: 3 as const,
    authorityVersion: "project-graph-v3" as const,
    ownerUserId: "owner-1",
    createdAt: "2026-09-17T05:00:00.000Z",
    updatedAt: "2026-09-17T06:00:00.000Z",
    access: {
      view: true,
      comment: true,
      edit: true,
      manageMembers: true,
      respondInvite: false,
      owner: true,
      role: "owner" as const,
    },
    artifacts: [{
      id: "artifact-1",
      projectId: "project-1",
      kind: "canvas-2d" as const,
      title: "1화 원고",
      scope: {
        projectId: "project-1",
        kind: "project" as const,
        id: "project-1",
        ancestors: [],
      },
      headRevisionId: "revision-head",
      approvedRevisionId: null,
      ownerWorkspaceId: "workspace-1",
      createdAt: "2026-09-17T05:00:00.000Z",
      updatedAt: "2026-09-17T06:00:00.000Z",
    }],
  },
  status: "synced" as const,
  error: null,
  cachedAt: null,
  refresh: vi.fn(async () => undefined),
}));

vi.mock("./studio-project-graph-client", () => api);
vi.mock("./useStudioProjectGraph", () => ({
  useStudioProjectGraph: () => graph,
}));
vi.mock("./studio-project-graph-device", () => ({
  getStudioProjectGraphDeviceId: () => "device-web-1",
}));

const NOW = "2026-09-17T06:00:00.000Z";
const HASH = "a".repeat(64);
const revision = (id: string, message: string) => ({
  id,
  artifactId: "artifact-1",
  kind: "checkpoint" as const,
  parentIds: [],
  rootGraphHash: HASH,
  operationFirst: null,
  operationLast: null,
  createdBy: "owner-1",
  deviceId: "device-1",
  createdAt: NOW,
  message,
  compatibilityReportId: null,
  provenanceManifestId: null,
  blobRefs: [],
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  vi.clearAllMocks();
  api.listStudioArtifactRevisions.mockResolvedValue([
    revision("revision-head", "현재 작업"),
    revision("revision-old", "검수 전 상태"),
  ]);
  api.newStudioProjectGraphId
    .mockReturnValueOnce("revision-restored")
    .mockReturnValueOnce("command-restored");
  api.restoreStudioRevision.mockResolvedValue({
    artifactId: "artifact-1",
    revisionId: "revision-restored",
    headRevisionId: "revision-restored",
    approvedRevisionId: null,
    sequence: 4,
    replayed: false,
  });
});

describe("StudioProjectVersionStackPanel", () => {
  it("restores an old state only after explicit two-step confirmation", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/p/work-1/review?view=versions&artifact=artifact-1"]}>
        <StudioProjectVersionStackPanel projectId="work-1" locale="ko" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("검수 전 상태")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "새 체크포인트로 복원" }));
    expect(api.restoreStudioRevision).not.toHaveBeenCalled();
    expect(screen.getByText(/한 번 더 누르면/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "복원 확정" }));
    await waitFor(() => expect(api.restoreStudioRevision).toHaveBeenCalledTimes(1));
    expect(api.restoreStudioRevision).toHaveBeenCalledWith(
      "artifact-1",
      "revision-old",
      "revision-head",
      expect.objectContaining({
        revisionId: "revision-restored",
        commandId: "command-restored",
        deviceId: "device-web-1",
      }),
    );
    await waitFor(() => expect(graph.refresh).toHaveBeenCalled());
  });
});
