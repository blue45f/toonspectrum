// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { studioEditorInstanceKey } from "../studio-editor-scope";

import { resolveStudioRoute } from "./studio-route-manifest";
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
