// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioAutosaveKey } from "../../studio-autosave";
import { studioDocumentPersistenceWorkId } from "../../studio-document-persistence-scope";
import { studioDocumentHref } from "../../studio-document-workspace";
import { isStudioSourceHydrationPending } from "../../studio-editor-scope";
import { createStudioProjectWithInitialDocument } from "../../studio-project-creation";
import { useStudioDocumentLayout } from "../studio-document-layout-context";
import { resolveStudioRoute } from "../studio-route-manifest";

import { StudioEditorRoute } from "./StudioEditorRoute";

import type { StudioWorkspaceRoute } from "../../studio-workspace-route";

const observed = vi.hoisted(() => ({ sources: [] as (string | null)[] }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: { user: { id: "owner" } }, ready: true }),
}));
vi.mock("../../studio-legacy-editor-adapter", () => ({
  LegacyStudioEditorAdapter: ({ studioRoute }: { studioRoute: StudioWorkspaceRoute }) => {
    const layout = useStudioDocumentLayout();
    const [ink, setInk] = useState(0);
    observed.sources.push(studioRoute.workId);
    const key = studioAutosaveKey({
      userId: "owner",
      workId: studioDocumentPersistenceWorkId(layout),
      remixId: layout.remixId,
    });
    return (
      <section
        data-testid="editor"
        data-source={studioRoute.workId ?? "local"}
        data-layout-source={layout.workId ?? "local"}
        data-recovery-key={key}
        data-pending={String(isStudioSourceHydrationPending(studioRoute.workId, studioRoute.remixSourceWorkId, false))}
      >
        <button type="button" onClick={() => setInk((value) => value + 1)}>draw</button>
        <output aria-label="ink">{ink}</output>
        <output aria-label="recovery">{localStorage.getItem(key)}</output>
      </section>
    );
  },
}));

function Harness() {
  const location = useLocation();
  const navigate = useNavigate();
  const resolution = resolveStudioRoute({ pathname: location.pathname, search: location.search });
  if (resolution.kind !== "editor") throw new Error(resolution.kind);
  return (
    <>
      <output aria-label="location">{`${location.pathname}${location.search}`}</output>
      <button type="button" onClick={() => {
        const params = new URLSearchParams(location.search);
        params.set("workspace", "image");
        navigate(`${location.pathname}?${params}`);
      }}>change workspace</button>
      <StudioEditorRoute resolution={resolution} />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  observed.sources.length = 0;
});
afterEach(cleanup);

function localFixture() {
  return createStudioProjectWithInitialDocument(localStorage, {
    title: "재현 원고", kind: "webtoon", createdAt: "2026-09-13T06:00:00.000Z",
  });
}

function open(href: string) {
  render(<MemoryRouter initialEntries={[href]}><Harness /></MemoryRouter>);
}

describe("StudioEditorRoute local-source integration", () => {
  it("passes a local source to both layout and editor while retaining the stored recovery key", async () => {
    const { href, document } = localFixture();
    const originalKey = studioAutosaveKey({ userId: "owner", workId: document.id });
    localStorage.setItem(originalKey, "previously saved ink");
    open(`${href}&room=existing-room`);
    const editor = await screen.findByTestId("editor");
    expect(editor.dataset.source).toBe("local");
    expect(editor.dataset.layoutSource).toBe("local");
    expect(editor.dataset.pending).toBe("false");
    expect(editor.dataset.recoveryKey).toBe(originalKey);
    expect(screen.getByLabelText("recovery").textContent).toBe("previously saved ink");
    expect(observed.sources.every((source) => source === null)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "draw" }));
    fireEvent.click(screen.getByRole("button", { name: "change workspace" }));
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toContain("workspace=image"));
    expect(screen.getByLabelText("ink").textContent).toBe("1");
    expect(localStorage.getItem(originalKey)).toBe("previously saved ink");
  });

  it.each(["project", "document"])("redirects a legacy %s alias before any remote editor mounts", async (alias) => {
    const { project, document } = localFixture();
    open(`/studio/work/${alias === "project" ? project.id : document.id}/comic?room=existing-room`);
    const editor = await screen.findByTestId("editor");
    expect(screen.getByLabelText("location").textContent).toContain(`/studio/p/${project.id}/d/${document.id}`);
    expect(editor.dataset.source).toBe("local");
    expect(observed.sources).not.toHaveLength(0);
    expect(observed.sources.every((source) => source === null)).toBe(true);
  });

  it.each(["drawing-a", "drawing-b"])("keeps explicit draft %s in its isolated recovery slot", async (draftId) => {
    const key = studioAutosaveKey({ userId: "owner", workId: `draft:${draftId}` });
    localStorage.setItem(key, "draft-specific ink");
    open(studioDocumentHref({ draftId, workspace: "draw" }));
    const editor = await screen.findByTestId("editor");
    expect(editor.dataset.source).toBe("local");
    expect(editor.dataset.pending).toBe("false");
    expect(editor.dataset.recoveryKey).toBe(key);
    expect(screen.getByLabelText("recovery").textContent).toBe("draft-specific ink");
  });

  it("still requires remote hydration for a real server work", async () => {
    localFixture();
    open("/studio/work/real-server-work/canvas?room=existing-room");
    const editor = await screen.findByTestId("editor");
    expect(editor.dataset.source).toBe("real-server-work");
    expect(editor.dataset.layoutSource).toBe("real-server-work");
    expect(editor.dataset.pending).toBe("true");
  });
});
