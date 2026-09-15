// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LegacyStudioEditorAdapter } from "./studio-legacy-editor-adapter";
import { parseStudioWorkspaceRoute, type StudioWorkspaceRoute } from "./studio-workspace-route";

vi.mock("./canvas/studio-canvas-shared-runtime", () => ({ recordStudioRenderProfile: vi.fn() }));
vi.mock("./StudioPage", () => ({
  StudioCuttoonEditor: ({ studioRoute }: { studioRoute: StudioWorkspaceRoute }) => (
    <div data-testid="editor-source" data-work-id={studioRoute.workId ?? ""}
      data-document-id={studioRoute.documentId ?? ""} />
  ),
}));

afterEach(cleanup);

describe("local manuscript editor entry", () => {
  it("does not forward local project document IDs to the source-hydrating editor", () => {
    const route = parseStudioWorkspaceRoute({ pathname: "/studio/p/project-new/d/ep01-new", search: "?workspace=draw" });
    if (!route.valid) throw new Error("Invalid route fixture");
    render(<LegacyStudioEditorAdapter remixId={null} studioRoute={route} />);
    expect(screen.getByTestId("editor-source").dataset.workId).toBe("");
    expect(screen.getByTestId("editor-source").dataset.documentId).toBe("ep01-new");
    expect(route.workId).toBe("ep01-new");
  });

  it("still forwards saved server work IDs for protected hydration", () => {
    const route = parseStudioWorkspaceRoute({ pathname: "/studio/work/server-work/canvas" });
    if (!route.valid) throw new Error("Invalid route fixture");
    render(<LegacyStudioEditorAdapter remixId={null} studioRoute={route} />);
    expect(screen.getByTestId("editor-source").dataset.workId).toBe("server-work");
  });
});
