// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StudioDocumentWorkspaceRoute } from "./StudioDocumentWorkspaceRoute";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/studio/p/:projectId/d/:documentId" element={<StudioDocumentWorkspaceRoute />} />
        <Route path="/studio/draft/:draftId" element={<StudioDocumentWorkspaceRoute />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("StudioDocumentWorkspaceRoute", () => {
  it("bridges a canonical project document to the established workspace without dropping state", async () => {
    renderRoute(
      "/studio/p/project-1/d/document-1?workspace=3d&focus=hero&language=ko&version=v2&room=team-a",
    );

    expect((await screen.findByLabelText("location")).textContent).toBe(
      "/studio/work/document-1/bg3d?focus=hero&language=ko&project=project-1&room=team-a&version=v2&workspace=3d",
    );
  });

  it("bridges canonical drafts into the same editor authority", async () => {
    renderRoute("/studio/draft/draft-1?workspace=slides");

    expect((await screen.findByLabelText("location")).textContent).toBe(
      "/studio/canvas?draft=draft-1&workspace=slides",
    );
  });

  it("fails closed for malformed canonical state instead of opening an unrelated wildcard", () => {
    renderRoute("/studio/p/project-1/d/document-1?workspace=draw&workspace=3d");

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("invalid-workspace")).toBeTruthy();
    expect(screen.queryByLabelText("location")).toBeNull();
  });
});
