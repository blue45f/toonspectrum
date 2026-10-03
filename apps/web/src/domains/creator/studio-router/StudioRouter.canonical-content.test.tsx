// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioRouter } from "./StudioRouter";

/**
 * The legacy router must judge canonical equality by parameter content, not by
 * serialization: `resolveStudioRoute` rebuilds the canonical href through
 * `URLSearchParams` (sorted for document workspaces, re-encoded for the rest),
 * while runtime writers append parameters such as the live `?room=` id after
 * the editor has mounted. Treating order or encoding as a difference swaps the
 * mounted editor for a `<Navigate>` and mounts the whole editor a second time —
 * the same defect the document workspace route fixed with
 * `isStudioCanonicalHref`. Substantive differences (a pathname change, an alias
 * parameter the canonical form strips) must still redirect.
 */
const editorMounts = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({
    data: null,
    ready: true,
    status: "unauthenticated",
    update: async () => null,
  }),
}));

vi.mock("../StudioLazySurfaceFallback", async () => {
  const { useLocation: useRouterLocation } = await import("react-router-dom");
  function StudioRouteLoading({ label }: { readonly label?: string }) {
    const location = useRouterLocation();
    return <output data-testid="route-loading">{label ?? location.pathname}</output>;
  }
  return { StudioPanelLoading: StudioRouteLoading, StudioRouteLoading };
});

vi.mock("./routes/StudioEditorRoute", async () => {
  const { useEffect: useMockEffect } = await import("react");
  return {
    StudioEditorRoute: ({ resolution }: {
      readonly resolution: { readonly canonicalHref: string };
    }) => {
      useMockEffect(() => {
        editorMounts.count += 1;
      }, []);
      return (
        <div data-testid="editor-surface" data-canonical-href={resolution.canonicalHref} />
      );
    },
  };
});

vi.mock("../StudioPublishingCommandCenter", () => ({
  StudioPublishingCommandCenter: ({ workId }: { readonly workId: string | null }) => (
    <div data-testid="publish-surface" data-work-id={workId ?? ""} />
  ),
}));

vi.mock("../StudioToolsCompanionPage", () => ({
  StudioToolsCompanionPage: () => <div data-testid="companion-surface" />,
}));

vi.mock("../studio-production/StudioProductionHubPage", () => ({
  StudioProductionHubPage: ({ surface }: { readonly surface: string }) => (
    <div data-testid="production-surface" data-surface={surface} />
  ),
}));

interface ObservedLocation {
  readonly pathname: string;
  readonly search: string;
  readonly state: unknown;
}

const observedLocations: ObservedLocation[] = [];

function LocationProbe() {
  const location = useLocation();
  observedLocations.push({
    pathname: location.pathname,
    search: location.search,
    state: location.state,
  });
  return null;
}

/**
 * Mirrors `StudioDocumentLayout`'s post-mount live-room publish: the layout owns
 * the `?room=` query and appends the per-tab instant id with
 * `URLSearchParams.set`, which keeps the existing parameter order and puts
 * `room` last.
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

function renderStudioShell(entry: {
  readonly pathname: string;
  readonly search?: string;
  readonly state?: unknown;
}) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/studio/*" element={<StudioRouter />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function renderStudioShellWithLiveRoomAppender(entry: {
  readonly pathname: string;
  readonly search?: string;
  readonly state?: unknown;
}) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/studio/*"
          element={(
            <>
              <StudioRouter />
              <LiveRoomAppender />
            </>
          )}
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  editorMounts.count = 0;
  observedLocations.length = 0;
});

afterEach(cleanup);

describe("StudioRouter canonical content comparison", () => {
  it("mounts the editor in place when only query parameter order differs from the sorted canonical href", async () => {
    renderStudioShell({
      pathname: "/studio/p/project-1/d/document-1",
      search: "?workspace=3d&focus=hero&language=ko&version=v2&room=team-a",
    });

    const surface = await screen.findByTestId("editor-surface");
    // The manifest's canonical href is the sorted serialization of the same
    // parameters, so the entered URL must be left untouched.
    expect(surface.dataset.canonicalHref).toBe(
      "/studio/p/project-1/d/document-1?focus=hero&language=ko&room=team-a&version=v2&workspace=3d",
    );
    expect(editorMounts.count).toBe(1);
    expect(observedLocations.length).toBeGreaterThan(0);
    for (const location of observedLocations) {
      expect(`${location.pathname}${location.search}`).toBe(
        "/studio/p/project-1/d/document-1?workspace=3d&focus=hero&language=ko&version=v2&room=team-a",
      );
    }
  });

  it("does not remount the editor when the live room id is appended after mount", async () => {
    renderStudioShellWithLiveRoomAppender({
      pathname: "/studio/p/project-1/d/document-1",
      search: "?resume=latest&workspace=draw",
    });

    // The layout's room publish lands as a replace that appends `room` last, so
    // the raw URL differs from the sorted canonical href only by parameter
    // order and must not be "corrected" by a redirect.
    await waitFor(() => {
      expect(observedLocations.at(-1)).toMatchObject({
        pathname: "/studio/p/project-1/d/document-1",
        search: "?resume=latest&workspace=draw&room=work-instant-seed",
      });
    });
    expect(screen.getByTestId("editor-surface")).toBeTruthy();
    expect(editorMounts.count).toBe(1);
  });

  it("mounts the editor in place when only query encoding differs from the reserialized canonical href", async () => {
    renderStudioShell({
      pathname: "/studio/work/work-1/canvas",
      search: "?memo=a%20b",
    });

    const surface = await screen.findByTestId("editor-surface");
    // The canonical href reserializes the space as `+`; the parameter content
    // is identical, so the entered URL must be left untouched.
    expect(surface.dataset.canonicalHref).toBe("/studio/work/work-1/canvas?memo=a+b");
    expect(editorMounts.count).toBe(1);
    expect(observedLocations.length).toBeGreaterThan(0);
    for (const location of observedLocations) {
      expect(`${location.pathname}${location.search}`).toBe(
        "/studio/work/work-1/canvas?memo=a%20b",
      );
    }
  });

  it("still redirects when an alias parameter changes the canonical content", async () => {
    renderStudioShell({
      pathname: "/studio/p/project-1/d/document-1",
      search: "?workspace=draw&project=project-1",
    });

    await screen.findByTestId("editor-surface");
    const finalLocation = observedLocations.at(-1);
    expect(finalLocation?.pathname).toBe("/studio/p/project-1/d/document-1");
    expect(finalLocation?.search).toBe("?workspace=draw");
    expect(editorMounts.count).toBe(1);
  });
});
