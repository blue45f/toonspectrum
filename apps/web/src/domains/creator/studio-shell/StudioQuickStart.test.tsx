// @vitest-environment jsdom
import { StrictMode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { readStudioProjectDocuments } from "../studio-project-document-store";
import { StudioQuickStart } from "./StudioQuickStart";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname}{location.search}</output>;
}
function mountQuickStart(locale: "ko" | "en" = "ko") {
  render(<StrictMode><MemoryRouter initialEntries={["/studio"]}>
    <StudioQuickStart locale={locale} /><LocationProbe />
  </MemoryRouter></StrictMode>);
}
beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe("StudioQuickStart", () => {
  it("does not create a project from mounting, rendering or focus", () => {
    mountQuickStart();
    screen.getByRole("button", { name: "그림 시작하기" }).focus();
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });
  it("opens one recoverable drawing in a single click and ignores repeated clicks", () => {
    mountQuickStart();
    const button = screen.getByRole("button", { name: "그림 시작하기" });
    fireEvent.click(button);
    fireEvent.click(button);
    const projects = readStudioProjectLibrary(window.localStorage).projects;
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ kind: "illustration", templateId: "quick-sketch" });
    const document = readStudioProjectDocuments(window.localStorage, projects[0]!.id).documents[0]!;
    expect(document).toMatchObject({ width: 1600, height: 1200, defaultWorkspace: "draw" });
    expect(screen.getByLabelText("location").textContent)
      .toBe(`/studio/p/${projects[0]!.id}/d/${document.id}?workspace=draw&uiMode=focus&startTool=draw`);
  });
  it("creates a recoverable webtoon from the primary action", () => {
    mountQuickStart();
    fireEvent.click(screen.getByRole("button", { name: "웹툰 시작하기" }));
    const projects = readStudioProjectLibrary(window.localStorage).projects;
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ kind: "webtoon", templateId: "webtoon-vertical" });
    const document = readStudioProjectDocuments(window.localStorage, projects[0]!.id).documents[0]!;
    expect(document.defaultWorkspace).toBe("comic");
    expect(screen.getByLabelText("location").textContent)
      .toBe(`/studio/p/${projects[0]!.id}/d/${document.id}?workspace=comic&uiMode=basic&startTool=draw`);
  });
  it("shows a retryable error when storage is blocked without navigating", () => {
    mountQuickStart("en");
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked test storage", "QuotaExceededError");
    });
    fireEvent.click(screen.getByRole("button", { name: "Start drawing" }));
    expect(screen.getByRole("alert").textContent).toContain("Existing work was not changed");
    expect(screen.getByLabelText("location").textContent).toBe("/studio");
    write.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Start drawing" }));
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(1);
  });
});
