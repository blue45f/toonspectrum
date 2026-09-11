// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { STUDIO_DOCUMENT_WORKSPACES } from "../studio-document-workspace";
import { StudioDocumentWorkspaceSwitcher } from "./StudioDocumentWorkspaceSwitcher";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="*"
          element={(
            <>
              <StudioDocumentWorkspaceSwitcher />
              <LocationProbe />
            </>
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("StudioDocumentWorkspaceSwitcher", () => {
  it("switches all planned workspaces without losing document or query identity", async () => {
    renderRoute(
      "/studio/p/project-1/d/document-1?workspace=draw&focus=cut%3A2&language=ko&version=v3&room=team-a",
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("draw");
    expect(screen.getAllByRole("option")).toHaveLength(STUDIO_DOCUMENT_WORKSPACES.length);

    fireEvent.change(select, { target: { value: "slides" } });

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toBe(
        "/studio/p/project-1/d/document-1?focus=cut%3A2&language=ko&room=team-a&version=v3&workspace=slides",
      );
    });
  });

  it("preserves a canonical draft identity while changing time-based workspaces", async () => {
    renderRoute("/studio/draft/draft-1?workspace=animation&room=review-a");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "audio" } });

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toBe(
        "/studio/draft/draft-1?room=review-a&workspace=audio",
      );
    });
  });

  it("does not create a second workspace selector on legacy editor URLs", () => {
    renderRoute("/studio/work/document-1/comic");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
