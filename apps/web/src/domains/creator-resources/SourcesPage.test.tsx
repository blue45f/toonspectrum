// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { SourcesPage } from "./SourcesPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/insights/resources"]}>
      <SourcesPage />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("resource source cost visibility", () => {
  it("shows explicit free labels on cards", () => {
    renderPage();
    const google = screen.getByRole("heading", { name: "Google Books" }).closest("article");
    const commons = screen.getByRole("heading", { name: "Wikidata·Wikimedia" }).closest("article");
    const kmas = screen.getByRole("heading", { name: "만화규장각 KMAS" }).closest("article");
    expect(google).not.toBeNull();
    expect(commons).not.toBeNull();
    expect(kmas).not.toBeNull();
    expect(within(google!).getByText("무료 · 키/신청 필요")).toBeTruthy();
    expect(within(commons!).getByText("무료 · 키 없음")).toBeTruthy();
    expect(within(kmas!).getByText("무료 · 키/신청 필요")).toBeTruthy();
  });

  it("filters free providers separately from keyless providers", () => {
    renderPage();
    fireEvent.click(screen.getByRole("checkbox", { name: "무료 제공처만 보기" }));
    expect(screen.getByRole("heading", { name: "Google Books" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "만화규장각 KMAS" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "TMDB" })).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "가입·키 없는 제공처만 보기" }));
    expect(screen.queryByRole("heading", { name: "Google Books" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Wikidata·Wikimedia" })).toBeTruthy();
  });

  it("finds sources by the free cost label", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: "제공처·분야·비용·상업 준비 상태 필터" }), {
      target: { value: "무료 · 키/신청 필요" },
    });
    expect(screen.getByRole("heading", { name: "Google Books" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "The Met" })).toBeNull();
  });
});
