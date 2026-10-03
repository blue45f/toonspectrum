// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioEditorRouteResolution } from "../studio-router/studio-route-manifest";

import { StudioDocumentWorkspaceRoute } from "./StudioDocumentWorkspaceRoute";

const editorMounts = vi.hoisted(() => ({ count: 0 }));

vi.mock("../studio-router/useStudioI18nPriorityLoading", () => ({
  useStudioI18nPriorityLoading: () => undefined,
}));

vi.mock("../studio-router/routes/StudioEditorRoute", async () => {
  const { useEffect: useMockEffect } = await import("react");
  return {
    StudioEditorRoute: ({ resolution }: { readonly resolution: StudioEditorRouteResolution }) => {
      useMockEffect(() => {
        editorMounts.count += 1;
      }, []);
      return (
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
      );
    },
  };
});

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

/**
 * Mirrors `StudioDocumentLayout`'s post-mount live-room publish: the layout owns the
 * `?room=` query and appends the per-tab instant id with `URLSearchParams.set`, which
 * keeps the existing parameter order and puts `room` last.
 */
function LiveRoomAppender() {
  const [params, setSearchParams] = useSearchParams();
  const publishedRef = useRef(false);
  useEffect(() => {
    if (publishedRef.current || params.has("room")) return;
    publishedRef.current = true;
    const next = new URLSearchParams(params);
    next.set("room", "work-instant-seed");
    setSearchParams(next, { replace: true });
  }, [params, setSearchParams]);
  return null;
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

function renderRouteWithLiveRoomAppender(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/studio/p/:projectId/d/:documentId"
          element={(
            <>
              <RouteFixture />
              <LiveRoomAppender />
            </>
          )}
        />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("StudioDocumentWorkspaceRoute", () => {
  it("mounts a project document directly when only query parameter order differs from canonical", async () => {
    renderRoute(
      "/studio/p/project-1/d/document-1?workspace=3d&focus=hero&language=ko&version=v2&room=team-a",
    );

    // Parameter order is not a canonical difference, so the entered URL is left
    // untouched instead of being swapped for a redirect after mount.
    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toBe(
        "/studio/p/project-1/d/document-1?workspace=3d&focus=hero&language=ko&version=v2&room=team-a",
      );
    });
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

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toBe(
        "/studio/draft/draft-1?workspace=slides",
      );
    });
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

  it("does not remount the editor when the live room id is appended after mount", async () => {
    editorMounts.count = 0;
    renderRouteWithLiveRoomAppender(
      "/studio/p/project-1/d/document-1?resume=latest&workspace=draw",
    );

    // The layout's room publish lands as a replace that appends `room` last, so the
    // raw URL differs from the sorted canonical href only by parameter order.
    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toBe(
        "/studio/p/project-1/d/document-1?resume=latest&workspace=draw&room=work-instant-seed",
      );
    });
    expect(screen.getByLabelText("editor-resolution")).toBeTruthy();
    expect(editorMounts.count).toBe(1);
  });

  it("still redirects when the URL carries an alias parameter the canonical form strips", async () => {
    renderRoute("/studio/p/project-1/d/document-1?workspace=draw&project=project-1");

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toBe(
        "/studio/p/project-1/d/document-1?workspace=draw",
      );
    });
    expect(screen.getByLabelText("editor-resolution")).toBeTruthy();
  });
});
