// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/lib/i18n";
import CreatorEssentialsPage from "./CreatorEssentialsPage";
const downloads = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./creator-essentials-download", () => ({ downloadCreatorEssential: downloads.run }));
vi.mock("./CreatorEssentialModelPreview", () => ({ default: () => <div data-testid="model-preview-content">model preview</div> }));
function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function mount(query = "?view=essentials&project=project-12") {
  return render(<MemoryRouter initialEntries={[`/studio/assets${query}`]}><CreatorEssentialsPage /><Location /></MemoryRouter>);
}
beforeEach(() => { useI18n.getState().setLang("ko"); downloads.run.mockReset(); downloads.run.mockResolvedValue(undefined); });
afterEach(cleanup);

describe("creator essentials page", () => {
  it("renders all 48 useful originals with lazy thumbnails and explicit limitations", () => {
    mount();
    expect(screen.getAllByRole("article")).toHaveLength(48);
    expect(screen.getByRole("status").textContent).toContain("48 / 48");
    expect(screen.getByText(/자동 2D→3D 복원/u)).toBeTruthy();
    for (const image of screen.getAllByRole("img")) expect(image.getAttribute("loading")).toBe("lazy");
    expect(screen.queryByTestId("model-preview-content")).toBeNull();
  });
  it("preserves project context while filtering and clearing an empty result", () => {
    mount();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no-matching-asset" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "pose-2d" } });
