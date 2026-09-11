// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioDocumentWorkspaceId } from "../studio-document-workspace";
import type { StudioDocumentLayoutRuntime } from "../studio-router/studio-document-layout-context";
import { StudioDocumentLayoutContext } from "../studio-router/studio-document-layout-context";

import { StudioDocumentWorkspaceDock } from "./StudioDocumentWorkspaceDock";

vi.mock("./StudioProjectFeatureSuitePanel", () => ({
  StudioProjectFeatureSuitePanel: ({
    projectId,
    section,
    view,
  }: {
    readonly projectId: string;
    readonly section: string;
    readonly view: string;
  }) => <output aria-label="suite-projection">{`${projectId}:${section}:${view}`}</output>,
}));

vi.mock("./StudioLocalizationPanel", () => ({
  StudioLocalizationPanel: ({ projectId }: { readonly projectId: string }) => (
    <output aria-label="localization-projection">{projectId}</output>
  ),
}));

vi.mock("./StudioReviewPanel", () => ({
  StudioReviewPanel: ({ projectId }: { readonly projectId: string }) => (
    <output aria-label="review-projection">{projectId}</output>
  ),
}));

function runtime(
  workspace: StudioDocumentWorkspaceId,
  projectId: string | null = "project-1",
): StudioDocumentLayoutRuntime {
  return {
    documentKey: projectId ? `document:${projectId}:document-1` : "draft:draft-1",
    projectId,
    documentId: projectId ? "document-1" : null,
    draftId: projectId ? null : "draft-1",
    documentWorkspace: workspace,
    draftSessionEpoch: 0,
    instantWorkId: "instant-1",
    liveRoomParam: "team-a",
    remixId: null,
    workId: projectId ? "document-1" : null,
  };
}

function DockFixture({ value }: { readonly value: StudioDocumentLayoutRuntime }) {
  return (
    <MemoryRouter>
      <StudioDocumentLayoutContext value={value}>
        <StudioDocumentWorkspaceDock />
      </StudioDocumentLayoutContext>
    </MemoryRouter>
  );
}

afterEach(cleanup);

describe("StudioDocumentWorkspaceDock", () => {
  it("opens the webtoon quality projection without replacing the document route", async () => {
    render(<DockFixture value={runtime("comic")} />);

    const trigger = screen.getByRole("button", { name: /문서 도구|Document tools/u });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByLabelText("suite-projection")).toHaveTextContent(
      "project-1:production:documents",
    );

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("suite-projection")).toBeNull());
  });

  it("projects localization and review into their document workspaces", async () => {
    const view = render(<DockFixture value={runtime("localization")} />);
    fireEvent.click(screen.getByRole("button", { name: /문서 도구|Document tools/u }));
    expect(await screen.findByLabelText("localization-projection")).toHaveTextContent("project-1");

    view.rerender(<DockFixture value={runtime("review")} />);
    await waitFor(() => {
      expect(screen.queryByLabelText("localization-projection")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: /문서 도구|Document tools/u }));
    expect(await screen.findByLabelText("review-projection")).toHaveTextContent("project-1");
  });

  it("keeps direct drawing, image editing and unsaved drafts uncluttered", () => {
    const view = render(<DockFixture value={runtime("draw")} />);
    expect(screen.queryByRole("button", { name: /문서 도구|Document tools/u })).toBeNull();

    view.rerender(<DockFixture value={runtime("image")} />);
    expect(screen.queryByRole("button", { name: /문서 도구|Document tools/u })).toBeNull();

    view.rerender(<DockFixture value={runtime("storyboard", null)} />);
    expect(screen.queryByRole("button", { name: /문서 도구|Document tools/u })).toBeNull();
  });

  it("closes the projection when the workspace changes", async () => {
    const view = render(<DockFixture value={runtime("storyboard")} />);
    fireEvent.click(screen.getByRole("button", { name: /문서 도구|Document tools/u }));
    expect(await screen.findByLabelText("suite-projection")).toHaveTextContent(
      "project-1:story:script",
    );

    view.rerender(<DockFixture value={runtime("3d")} />);
    await waitFor(() => expect(screen.queryByLabelText("suite-projection")).toBeNull());
    expect(screen.getByRole("button", { name: /문서 도구|Document tools/u }).getAttribute("aria-expanded"))
      .toBe("false");
  });
});
