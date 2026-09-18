// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioProjectGraphContextBar } from "./StudioProjectGraphContextBar";

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
      approvedRevisionId: "revision-approved",
      ownerWorkspaceId: "workspace-1",
      createdAt: "2026-09-17T05:00:00.000Z",
      updatedAt: "2026-09-17T06:00:00.000Z",
    }],
  },
  status: "synced" as const,
  error: null,
  cachedAt: Date.parse("2026-09-17T06:00:00.000Z"),
  refresh: vi.fn(async () => undefined),
}));

vi.mock("./useStudioProjectGraph", () => ({
  useStudioProjectGraph: () => graph,
}));

afterEach(() => cleanup());

describe("StudioProjectGraphContextBar", () => {
  it("shows the authoritative document and links to its version stack", () => {
    const view = render(
      <MemoryRouter>
        <StudioProjectGraphContextBar projectId="work-1" locale="ko" />
      </MemoryRouter>,
    );
    expect(view.container.querySelector(
      "[data-studio-project-authority=project-graph-v3]",
    )).toBeTruthy();
    expect(screen.getByText("클라우드와 동기화됨")).toBeTruthy();
    expect(screen.getByText(/1화 원고/u)).toBeTruthy();
    expect(screen.getByText("승인본 고정")).toBeTruthy();
    expect(screen.getByRole("link", { name: "버전" }).getAttribute("href"))
      .toContain("view=versions&artifact=artifact-1");
  });
});
