// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudioArtifactRecord,
  StudioProjectRecord,
  StudioReviewSummary,
  StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";
import { createProductionDemoProject } from "./production-demo";
import { ProductionManuscriptWorkspace } from "./ProductionManuscriptWorkspace";

const f = vi.hoisted(() => ({
  getProject: vi.fn(),
  listRevisions: vi.fn(),
  listReviews: vi.fn(),
}));

vi.mock("../project-graph/studio-project-graph-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../project-graph/studio-project-graph-client")>();
  return {
    ...actual,
    getStudioProjectByWork: f.getProject,
    listStudioArtifactRevisions: f.listRevisions,
    listStudioReviews: f.listReviews,
  };
});

vi.mock("../project-graph/StudioProjectVersionStackPanel", () => ({
  StudioProjectVersionStackPanel: () => <div>VERSION STACK PANEL</div>,
}));

vi.mock("../studio-shell/StudioExportPanel", () => ({
  StudioExportPanel: () => <div>EXPORT PANEL</div>,
}));

vi.mock("../studio-shell/StudioProjectAssistantPanel", () => ({
  StudioProjectAssistantPanel: () => <div>ASSISTANT PANEL</div>,
}));

const at = (minute: number) => `2026-09-23T01:${String(minute).padStart(2, "0")}:00.000Z`;

function artifact(
  id: string,
  kind: StudioArtifactRecord["kind"],
  title: string,
  headRevisionId: string,
  approvedRevisionId: string | null,
): StudioArtifactRecord {
  return {
    id,
    projectId: "graph-project",
    kind,
    title,
    scope: { projectId: "graph-project", seasonId: "season-1", episodeId: "episode-12" },
    headRevisionId,
    approvedRevisionId,
    ownerWorkspaceId: "workspace-1",
    createdAt: at(1),
    updatedAt: at(8),
  };
}

function revision(
  artifactId: string,
  id: string,
  kind: StudioRevisionRecord["kind"],
  minute: number,
): StudioRevisionRecord {
  return {
    id,
    artifactId,
    kind,
    parentIds: [],
    rootGraphHash: "a".repeat(64),
    operationFirst: null,
    operationLast: null,
    createdBy: "owner-user",
    deviceId: "device-1",
    createdAt: at(minute),
    message: `${kind} ${id}`,
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  };
}

const imageArtifact = artifact(
  "artifact-image",
  "canvas-2d",
  "12화 작화 원고",
  "revision-head",
  "revision-approved",
);
const storyArtifact = artifact(
  "artifact-story",
  "story",
  "12화 대본",
  "story-head",
  null,
);

const project: StudioProjectRecord = {
  id: "graph-project",
  workId: "sample-work",
  schemaVersion: 3,
  authorityVersion: "project-graph-v3",
  ownerUserId: "owner-user",
  createdAt: at(0),
  updatedAt: at(9),
  access: {
    view: true,
    comment: true,
    edit: true,
    manageMembers: true,
    respondInvite: false,
    owner: true,
    role: "owner",
  },
  artifacts: [imageArtifact, storyArtifact],
};

const review: StudioReviewSummary = {
  id: "review-image",
  artifactId: imageArtifact.id,
  revisionId: "revision-review",
  requestedBy: "owner-user",
  title: "12화 편집 검수",
  status: "changes-requested",
  decidedAt: null,
  decidedBy: null,
  createdAt: at(6),
  updatedAt: at(9),
  reviewerIds: ["owner-user", "editor-user"],
  openRequiredCommentCount: 2,
};

beforeEach(() => {
  f.getProject.mockResolvedValue(project);
  f.listRevisions.mockImplementation(async (artifactId: string) => artifactId === imageArtifact.id
    ? [
      revision(imageArtifact.id, "revision-head", "checkpoint", 8),
      revision(imageArtifact.id, "revision-review", "review-snapshot", 7),
      revision(imageArtifact.id, "revision-approved", "approved", 5),
    ]
    : [revision(storyArtifact.id, "story-head", "checkpoint", 4)]);
  f.listReviews.mockImplementation(async (artifactId: string) => artifactId === imageArtifact.id ? [review] : []);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProductionManuscriptWorkspace", () => {
  it("projects real revision, final and required-feedback state for one episode", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/manuscripts?episode=episode-12&artifact=artifact-image"]}>
        <ProductionManuscriptWorkspace
          aggregate={createProductionDemoProject()}
          canEdit
          isDemo={false}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "공정별 원고·버전·피드백" })).toBeTruthy();
    expect(screen.getAllByText("12화 작화 원고").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12화 대본").length).toBeGreaterThan(0);
    expect(screen.getAllByText("현재 작업본 · 체크포인트")).toHaveLength(2);
    expect(screen.getByText("최종본 준비")).toBeTruthy();
    expect(screen.getAllByText("필수 수정 2개").length).toBeGreaterThan(0);
    expect(f.getProject).toHaveBeenCalledWith("sample-work");
    expect(f.listRevisions).toHaveBeenCalledTimes(2);
    expect(f.listReviews).toHaveBeenCalledTimes(2);
  });

  it("opens feedback against the exact immutable review snapshot", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/manuscripts?episode=episode-12&artifact=artifact-image"]}>
        <ProductionManuscriptWorkspace
          aggregate={createProductionDemoProject()}
          canEdit
          isDemo={false}
        />
      </MemoryRouter>,
    );

    await screen.findAllByText("12화 작화 원고");
    fireEvent.click(within(screen.getByRole("tablist", { name: "원고 운영 보기" })).getByRole("tab", { name: "피드백" }));
    expect(await screen.findByRole("heading", { name: "고정 원고 피드백" })).toBeTruthy();
    expect(screen.getByText("12화 편집 검수")).toBeTruthy();
    expect(screen.getByText("필수 2")).toBeTruthy();
    const link = screen.getByRole("link", { name: "고정 검수본 열기" });
    await waitFor(() => expect(link.getAttribute("href")).toContain("sharedReview=review-image"));
    expect(link.getAttribute("href")).toContain("revision=revision-review");
    expect(link.getAttribute("href")).toContain("artifact=artifact-image");
  });

  it("filters process work and switches to the at-a-glance matrix", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/manuscripts?episode=episode-12"]}>
        <ProductionManuscriptWorkspace
          aggregate={createProductionDemoProject()}
          canEdit
          isDemo={false}
        />
      </MemoryRouter>,
    );

    const search = await screen.findByRole("searchbox", { name: "원고·공정 검색" });
    fireEvent.change(search, { target: { value: "대본" } });
    const processPanel = screen.getByRole("tabpanel", { name: "공정·원고" });
    expect(within(processPanel).getByRole("heading", { name: "12화 대본" })).toBeTruthy();
    expect(within(processPanel).queryByRole("heading", { name: "12화 작화 원고" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "한눈 보기" }));
    expect(await screen.findByRole("region", { name: "공정 한눈 보기 표" })).toBeTruthy();
    expect(within(processPanel).getByRole("columnheader", { name: "현재 작업본" })).toBeTruthy();
  });

  it("does not hijack keys inside an explicit Studio shortcut boundary", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/manuscripts?episode=episode-12"]}>
        <ProductionManuscriptWorkspace
          aggregate={createProductionDemoProject()}
          canEdit
          isDemo={false}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "공정별 원고·버전·피드백" });
    const boundary = document.createElement("button");
    boundary.setAttribute("data-studio-shortcut-boundary", "true");
    boundary.textContent = "별도 도구";
    document.body.append(boundary);
    boundary.focus();
    fireEvent.keyDown(boundary, { key: "2" });
    expect(screen.getByRole("tab", { name: "공정·원고" }).getAttribute("aria-selected"))
      .toBe("true");
    expect(screen.queryByText("VERSION STACK PANEL")).toBeNull();
    boundary.remove();
  });

  it("supports keyboard help, search focus and numbered view switching", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/manuscripts?episode=episode-12"]}>
        <ProductionManuscriptWorkspace
          aggregate={createProductionDemoProject()}
          canEdit
          isDemo={false}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "공정별 원고·버전·피드백" });
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("region", { name: "원고 운영 단축키" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "/" });
    const search = screen.getByRole("searchbox", { name: "원고·공정 검색" });
    await waitFor(() => expect(search).toBe(document.activeElement));
    fireEvent.blur(search);
    fireEvent.keyDown(window, { key: "2" });
    expect(await screen.findByText("VERSION STACK PANEL")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "버전·비교" }).getAttribute("aria-selected")).toBe("true");
  });
});
