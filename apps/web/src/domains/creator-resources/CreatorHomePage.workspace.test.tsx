// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CreatorHomePage } from "./CreatorHomePage";

vi.mock("../creator/workspace/StudioWorkspacePage", () => ({
  StudioWorkspacePage: () => <h1>Workspace</h1>,
}));
function IntroductionLocation() {
  const { hash, search } = useLocation();
  return <output>{`${hash}|${search}`}</output>;
}
function visit(entry: string) {
  render(<MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/" element={<CreatorHomePage />} />
    <Route path="/about/studio" element={<IntroductionLocation />} />
  </Routes></MemoryRouter>);
}
describe("studio home and historical introduction URLs", () => {
  it("keeps explicit work query and unknown anchors on the workspace", () => {
    visit("/?project=explicit-work&panel=work#not-an-introduction-section");
    expect(screen.getByRole("heading", { name: "Workspace" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("opens the workspace by default", () => {
    visit("/");
    expect(screen.getByRole("heading", { name: "Workspace" })).toBeTruthy();
  });
  it("preserves registered introduction anchors without forwarding unrelated query data", async () => {
    visit("/?unrelated=value#creator-faq-title");
    expect(await screen.findByText("#creator-faq-title|")).toBeTruthy();
  });

});
