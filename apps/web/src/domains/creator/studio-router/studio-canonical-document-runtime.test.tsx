// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { studioEditorInstanceKey } from "../studio-editor-scope";
import { studioWorkspaceDocumentIdentity } from "../studio-workspace-route";

import { useStudioDocumentLayout } from "./studio-document-layout-context";
import { resolveStudioRoute } from "./studio-route-manifest";
import { StudioDocumentLayout } from "./StudioDocumentLayout";
import { StudioDocumentRuntimeBoundary } from "./StudioDocumentRuntimeBoundary";

let nextMountId = 0;

function RuntimeProbe() {
  const runtime = useStudioDocumentLayout();
  const [mountId] = useState(() => ++nextMountId);
  const [edits, setEdits] = useState(0);
  return (
    <section
      data-document-id={runtime.documentId ?? ""}
      data-document-key={runtime.documentKey}
      data-draft-id={runtime.draftId ?? ""}
      data-mount-id={mountId}
      data-project-id={runtime.projectId ?? ""}
      data-testid="runtime-probe"
      data-workspace={runtime.documentWorkspace ?? ""}
    >
      <output aria-label="edit-count">{edits}</output>
      <button type="button" onClick={() => setEdits((value) => value + 1)}>edit</button>
    </section>
  );
}

function CanonicalRuntimeHarness() {
  const location = useLocation();
  const navigate = useNavigate();
  const resolution = resolveStudioRoute({
    pathname: location.pathname,
    search: location.search,
  });
  if (resolution.kind !== "editor") {
    throw new Error(`Expected canonical editor route, received ${resolution.kind}.`);
  }
  const route = resolution.workspaceRoute;
  const identity = studioWorkspaceDocumentIdentity(route);
  const documentKey = studioEditorInstanceKey({
    authScopeKey: "account-a",
    canonicalDocumentIdentity: route.projectId && route.documentId ? identity : null,
    draftSessionEpoch: 0,
    remixId: route.remixSourceWorkId,
    workId: route.workId,
  });

  return (
    <>
      <output aria-label="location">{`${location.pathname}${location.search}`}</output>
      <button
        type="button"
        onClick={() => navigate("/studio/p/project-b/d/shared-document?workspace=draw&room=team-a")}
      >
        open other project
      </button>
      <StudioDocumentRuntimeBoundary documentKey={documentKey}>
        <StudioDocumentLayout draftSessionEpoch={0} studioRoute={route}>
          <RuntimeProbe />
        </StudioDocumentLayout>
      </StudioDocumentRuntimeBoundary>
    </>
  );
}

function probe(): DOMStringMap {
  return screen.getByTestId("runtime-probe").dataset;
}

afterEach(cleanup);

describe("canonical Studio document runtime", () => {
  it("preserves editing state across all workspace projections and isolates project identity", async () => {
    nextMountId = 0;
    render(
      <MemoryRouter initialEntries={[
        "/studio/p/project-a/d/shared-document?workspace=draw&room=team-a",
      ]}>
        <CanonicalRuntimeHarness />
      </MemoryRouter>,
    );

    const before = { ...probe() };
    expect(before.projectId).toBe("project-a");
    expect(before.documentId).toBe("shared-document");
    expect(before.workspace).toBe("draw");

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    expect(screen.getByLabelText("edit-count").textContent).toBe("1");

    fireEvent.change(screen.getByRole("combobox", { name: "문서 작업공간" }), {
      target: { value: "slides" },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toBe(
        "/studio/p/project-a/d/shared-document?room=team-a&workspace=slides",
      );
      expect(probe().workspace).toBe("slides");
    });
    expect(probe().mountId).toBe(before.mountId);
    expect(probe().documentKey).toBe(before.documentKey);
    expect(screen.getByLabelText("edit-count").textContent).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "open other project" }));

    await waitFor(() => {
      expect(probe().projectId).toBe("project-b");
      expect(probe().workspace).toBe("draw");
    });
    expect(probe().documentId).toBe("shared-document");
    expect(probe().mountId).not.toBe(before.mountId);
    expect(probe().documentKey).not.toBe(before.documentKey);
    expect(screen.getByLabelText("edit-count").textContent).toBe("0");
  });

  it("keys the same opaque document id differently in different projects", () => {
    const account = "account-a";
    const document = "shared/document:id";
    const projectA = studioEditorInstanceKey({
      authScopeKey: account,
      canonicalDocumentIdentity: `project:project-a:document:${document}`,
      remixId: null,
      workId: document,
    });
    const projectB = studioEditorInstanceKey({
      authScopeKey: account,
      canonicalDocumentIdentity: `project:project-b:document:${document}`,
      remixId: null,
      workId: document,
    });

    expect(projectA).not.toBe(projectB);
  });
});
