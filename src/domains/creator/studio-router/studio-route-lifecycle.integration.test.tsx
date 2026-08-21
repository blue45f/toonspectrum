// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { studioEditorInstanceKey } from "../studio-editor-scope";

import { useStudioDocumentLayout } from "./studio-document-layout-context";
import { resolveStudioRoute } from "./studio-route-manifest";
import { StudioDocumentLayout } from "./StudioDocumentLayout";
import { StudioDocumentRuntimeBoundary } from "./StudioDocumentRuntimeBoundary";

afterEach(cleanup);

let nextMountedProbeId = 0;

function StatefulDocumentProbe({ surface }: { readonly surface: string }) {
  const [mountId] = useState(() => ++nextMountedProbeId);
  const [edits, setEdits] = useState(0);
  return (
    <div
      data-mount-id={mountId}
      data-testid="document-probe"
      data-surface={surface}
    >
      <output data-testid="edit-count">{edits}</output>
      <button type="button" onClick={() => setEdits((value) => value + 1)}>
        edit
      </button>
    </div>
  );
}

function ResolvedStudioRuntime({
  pathname,
  search = "",
}: {
  readonly pathname: string;
  readonly search?: string;
}) {
  const resolution = resolveStudioRoute({ pathname, search });
  if (resolution.kind !== "editor") {
    throw new Error(`Expected an editor route, received ${resolution.kind}.`);
  }
  const route = resolution.workspaceRoute;
  const documentKey = studioEditorInstanceKey({
    authScopeKey: "account-a",
    draftSessionEpoch: 0,
    remixId: route.remixSourceWorkId,
    workId: route.workId,
  });
  return (
    <StudioDocumentRuntimeBoundary documentKey={documentKey}>
      <StatefulDocumentProbe surface={route.surface} />
    </StudioDocumentRuntimeBoundary>
  );
}

let nextRuntimeProbeId = 0;

/** Stands in for the document-identity-scoped runtime the layout owns (live room, session id). */
function DocumentRuntimeProbe({ surface }: { readonly surface: string }) {
  const {
    documentKey,
    draftSessionEpoch,
    instantWorkId,
    liveRoomParam,
    remixId,
    workId,
  } = useStudioDocumentLayout();
  const [mountId] = useState(() => ++nextRuntimeProbeId);
  return (
    <div
      data-document-key={documentKey}
      data-draft-epoch={draftSessionEpoch}
      data-instant-work-id={instantWorkId}
      data-live-room={liveRoomParam ?? ""}
      data-mount-id={mountId}
      data-remix-id={remixId ?? ""}
      data-surface={surface}
      data-testid="runtime-probe"
      data-work-id={workId ?? ""}
    />
  );
}

function ResolvedStudioDocument({
  draftSessionEpoch = 0,
  pathname,
  search = "",
}: {
  readonly draftSessionEpoch?: number;
  readonly pathname: string;
  readonly search?: string;
}) {
  const resolution = resolveStudioRoute({ pathname, search });
  if (resolution.kind !== "editor") {
    throw new Error(`Expected an editor route, received ${resolution.kind}.`);
  }
  const route = resolution.workspaceRoute;
  const documentKey = studioEditorInstanceKey({
    authScopeKey: "account-a",
    draftSessionEpoch,
    remixId: route.remixSourceWorkId,
    workId: route.workId,
  });
  return (
    <StudioDocumentRuntimeBoundary documentKey={documentKey}>
      <StudioDocumentLayout
        draftSessionEpoch={draftSessionEpoch}
        studioRoute={route}
      >
        <DocumentRuntimeProbe surface={route.surface} />
      </StudioDocumentLayout>
    </StudioDocumentRuntimeBoundary>
  );
}

function routedDocument(node: ReactNode, entry = "/studio") {
  return <MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>;
}

function probe(): DOMStringMap {
  return screen.getByTestId("runtime-probe").dataset;
}

describe("Studio document layout runtime", () => {
  it("survives surface switches within one identity and tears down on identity rotation", () => {
    nextRuntimeProbeId = 0;
    const view = render(
      routedDocument(<ResolvedStudioDocument pathname="/studio/work/work-1/canvas" />),
    );
    const first = { ...probe() };
    expect(first.surface).toBe("canvas");
    expect(first.workId).toBe("work-1");
    expect(first.instantWorkId).toBeTruthy();

    for (const surface of ["comic", "animation"]) {
      view.rerender(
        routedDocument(
          <ResolvedStudioDocument pathname={`/studio/work/work-1/${surface}`} />,
        ),
      );
      expect(probe().surface).toBe(surface);
      // The layout — and therefore the collaboration runtime it will own — is never remounted by a
      // surface change, because the boundary key above it deliberately ignores presentation.
      expect(probe().mountId).toBe(first.mountId);
      expect(probe().instantWorkId).toBe(first.instantWorkId);
      expect(probe().documentKey).toBe(first.documentKey);
    }

    view.rerender(
      routedDocument(<ResolvedStudioDocument pathname="/studio/work/work-2/canvas" />),
    );
    expect(probe().mountId).not.toBe(first.mountId);
    expect(probe().instantWorkId).not.toBe(first.instantWorkId);
    expect(probe().documentKey).not.toBe(first.documentKey);
  });

  it("tears the layout down when the guest-draft epoch bumps under a stable route", () => {
    nextRuntimeProbeId = 0;
    const view = render(
      routedDocument(
        <ResolvedStudioDocument pathname="/studio/remix/source-1/canvas" />,
      ),
    );
    const before = { ...probe() };
    expect(before.draftEpoch).toBe("0");
    expect(before.remixId).toBe("source-1");

    view.rerender(
      routedDocument(
        <ResolvedStudioDocument
          draftSessionEpoch={1}
          pathname="/studio/remix/source-1/canvas"
        />,
      ),
    );
    expect(probe().draftEpoch).toBe("1");
    expect(probe().mountId).not.toBe(before.mountId);
    expect(probe().instantWorkId).not.toBe(before.instantWorkId);

    // Presentation still must not rotate the runtime after an epoch bump.
    const afterBump = { ...probe() };
    view.rerender(
      routedDocument(
        <ResolvedStudioDocument
          draftSessionEpoch={1}
          pathname="/studio/remix/source-1/3d/dcc/shot"
        />,
      ),
    );
    expect(probe().surface).toBe("dcc");
    expect(probe().mountId).toBe(afterBump.mountId);
  });

  it("publishes the instant jam room into ?room= once and then leaves it alone", () => {
    nextRuntimeProbeId = 0;
    const view = render(routedDocument(<ResolvedStudioDocument pathname="/studio" />));
    const published = { ...probe() };
    expect(published.workId).toBe("");
    expect(published.liveRoom).toBe(published.instantWorkId);

    view.rerender(routedDocument(<ResolvedStudioDocument pathname="/studio/canvas" />));
    expect(probe().mountId).toBe(published.mountId);
    expect(probe().liveRoom).toBe(published.liveRoom);
  });
});

describe("resolved Studio route lifecycle", () => {
  it("retains state across same-work surfaces and replaces it for work/remix changes", () => {
    nextMountedProbeId = 0;
    const view = render(
      <ResolvedStudioRuntime pathname="/studio" search="?id=work-1" />,
    );
    const initialMountId = screen.getByTestId("document-probe").dataset.mountId;
    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    expect(screen.getByTestId("edit-count").textContent).toBe("1");

    view.rerender(
      <ResolvedStudioRuntime pathname="/studio/work/work-1/comic" />,
    );
    expect(screen.getByTestId("document-probe").dataset.surface).toBe("comic");
    expect(screen.getByTestId("document-probe").dataset.mountId).toBe(initialMountId);
    expect(screen.getByTestId("edit-count").textContent).toBe("1");

    view.rerender(
      <ResolvedStudioRuntime pathname="/studio/work/work-1/3d/dcc/cad" />,
    );
    expect(screen.getByTestId("document-probe").dataset.surface).toBe("dcc");
    expect(screen.getByTestId("document-probe").dataset.mountId).toBe(initialMountId);
    expect(screen.getByTestId("edit-count").textContent).toBe("1");

    view.rerender(
      <ResolvedStudioRuntime pathname="/studio/work/work-2/canvas" />,
    );
    const secondWorkMountId = screen.getByTestId("document-probe").dataset.mountId;
    expect(secondWorkMountId).not.toBe(initialMountId);
    expect(screen.getByTestId("edit-count").textContent).toBe("0");

    view.rerender(
      <ResolvedStudioRuntime pathname="/studio/remix/source-1/animation" />,
    );
    const remixMountId = screen.getByTestId("document-probe").dataset.mountId;
    expect(remixMountId).not.toBe(secondWorkMountId);
    fireEvent.click(screen.getByRole("button", { name: "edit" }));

    view.rerender(
      <ResolvedStudioRuntime pathname="/studio/remix/source-1/3d/dcc/shot" />,
    );
    expect(screen.getByTestId("document-probe").dataset.mountId).toBe(remixMountId);
    expect(screen.getByTestId("edit-count").textContent).toBe("1");

    view.rerender(
      <ResolvedStudioRuntime pathname="/studio/remix/source-2/canvas" />,
    );
    expect(screen.getByTestId("document-probe").dataset.mountId).not.toBe(remixMountId);
    expect(screen.getByTestId("edit-count").textContent).toBe("0");
  });
});
