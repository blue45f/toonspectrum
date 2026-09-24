// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CreatorHomePage } from "./CreatorHomePage";

vi.mock("../marketing/CreatorHomeExperience", () => ({
  CreatorHomeExperience: () => <h1>Public creator main</h1>,
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

describe("public main and historical introduction URLs", () => {
  it("opens a separate public main instead of mounting the virtual studio", () => {
    visit("/?project=explicit-work&panel=work#not-an-introduction-section");
    expect(screen.getByRole("heading", { name: "Public creator main" })).toBeTruthy();
    expect(screen.queryByText("Workspace")).toBeNull();
  });

  it("opens the public main by default", () => {
    visit("/");
    expect(screen.getByRole("heading", { name: "Public creator main" })).toBeTruthy();
  });

  it("preserves registered introduction anchors without forwarding unrelated query data", async () => {
    visit("/?unrelated=value#creator-faq-title");
    expect(await screen.findByText("#creator-faq-title|")).toBeTruthy();
  });
});
