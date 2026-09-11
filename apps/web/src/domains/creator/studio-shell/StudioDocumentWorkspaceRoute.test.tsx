// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioEditorRouteResolution } from "../studio-router/studio-route-manifest";

import { StudioDocumentWorkspaceRoute } from "./StudioDocumentWorkspaceRoute";

vi.mock("../studio-router/useStudioI18nPriorityLoading", () => ({
  useStudioI18nPriorityLoading: () => undefined,
}));

vi.mock("../studio-router/routes/StudioEditorRoute", () => ({
  StudioEditorRoute: ({ resolution }: { readonly resolution: StudioEditorRouteResolution }) => (
    <output aria-label="editor-resolution">
      {JSON.stringify({
        canonicalHref: resolution.canonicalHref,
        lifecycleKey: resolution.lifecycleKey,
        documentId: resolution.workspaceRoute.documentId,
        draftId: resolution.workspaceRoute.draftId,
        projectId: resolution.workspaceRoute.projectId,
        surface: resolution.workspaceRoute.surface,
        workspace: resolution.workspaceRoute.documentWorkspace,
        workId: resolution.workspaceRoute.workId,
      })}
    </output>
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function RouteFixture() {
  return (
    <>
      <StudioDocumentWorkspaceRoute />
      <LocationProbe />
    </>
  );
}

function renderRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/studio/p/:projectId/d/:documentId" element={<RouteFixture />} />
        <Route path="/studio/draft/:draftId" element={<RouteFixture />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("StudioDocumentWorkspaceRoute", () => {
  it("mounts a canonical project document directly without leaving its stable URL", async () => {
    renderRoute(
      "/studio/p/project-1/d/document-1?workspace=3d&focus=hero&language=ko&version=v2&room=team-a",
    );

    expect((await screen.findByLabelText("location")).textContent).toBe(
      "/studio/p/project-1/d/document-1?focus=hero&language=ko&room=team-a&version=v2&workspace=3d",
    );
    expect(JSON.parse(screen.getByLabelText("editor-resolution").textContent ?? "{}")).toEqual({
      canonicalHref: "/studio/p/project-1/d/document-1?focus=hero&language=ko&room=team-a&version=v2&workspace=3d",
      lifecycleKey: "/studio/project:project-1:document:document-1/editor",
      documentId: "document-1",
      draftId: null,
      projectId: "project-1",
      surface: "bg3d",
      workspace: "3d",
      workId: "document-1",
    });
  });

  it("mounts canonical drafts in the same runtime authority", async () => {
    renderRoute("/studio/draft/draft-1?workspace=slides");

    expect((await screen.findByLabelText("location")).textContent).toBe(
      "/studio/draft/draft-1?workspace=slides",
    );
    expect(JSON.parse(screen.getByLabelText("editor-resolution").textContent ?? "{}")).toMatchObject({
      lifecycleKey: "/studio/draft:draft-1/editor",
      documentId: null,
      draftId: "draft-1",
      projectId: null,
      surface: "canvas",
      workspace: "slides",
      workId: null,
    });
  });

  it("fails closed for malformed canonical state instead of opening an unrelated wildcard", () => {
    renderRoute("/studio/p/project-1/d/document-1?workspace=draw&workspace=3d");

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("invalid-workspace")).toBeTruthy();
    expect(screen.queryByLabelText("editor-resolution")).toBeNull();
  });
});
