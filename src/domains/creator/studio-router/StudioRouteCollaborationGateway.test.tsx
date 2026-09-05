// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioProductionHubPage } from "../studio-production/StudioProductionHubPage";

import { resolveStudioRoute } from "./studio-route-manifest";
import { StudioRoutePlaceholder } from "./StudioRouteFallbacks";

const database = vi.hoisted(() => ({
  kvGet: vi.fn(async () => null),
  kvSet: vi.fn(async () => undefined),
}));

vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: vi.fn(async () => database),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Studio collaboration route gateways", () => {
  it.each([
    ["/studio/review", "draft", "/studio"],
    ["/studio/work/work-1/review", "work:work-1", "/studio/work/work-1/canvas"],
    ["/studio/remix/source-1/review", "remix:source-1", "/studio/remix/source-1/canvas"],
  ])("opens %s as a scoped production review surface, not the retired placeholder", async (
    pathname,
    scopeKey,
    editorHref,
  ) => {
    const resolution = resolveStudioRoute({ pathname, search: "", hash: "" });
    expect(resolution).toMatchObject({
      kind: "production",
      surface: "review",
      canonicalHref: pathname,
    });
    if (resolution.kind !== "production") throw new Error("Review route must own a production surface");

    const onOpenStudio = vi.fn();
    render(
      <MemoryRouter initialEntries={[pathname]}>
        <StudioProductionHubPage surface={resolution.surface} onOpenStudio={onOpenStudio} />
      </MemoryRouter>,
    );
    await screen.findByText("SQLite/OPFS 저장됨");

    expect(database.kvGet).toHaveBeenCalledWith("studio-production-command-center-v1", scopeKey);
    expect(
      document.querySelector("[data-studio-production-command-center]")?.getAttribute("data-scope-key"),
    ).toBe(scopeKey);
    expect(document.querySelector("[data-studio-collaboration-gateway]")).toBeNull();
    expect(screen.getByRole("heading", { name: "리뷰 및 승인" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "리뷰" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "원고 열기" }).getAttribute("href")).toBe(editorHref);
    expect(screen.getAllByRole("button", { name: "해결 처리" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Studio 편집기로 돌아가기" }));
    expect(onOpenStudio).toHaveBeenCalledTimes(1);
  });

  it("keeps non-collaboration asset guidance outside the production review contract", () => {
    const onOpenStudio = vi.fn();
    render(
      <MemoryRouter>
        <StudioRoutePlaceholder placeholderId="assets" onOpenStudio={onOpenStudio} />
      </MemoryRouter>,
    );

    expect(document.querySelector("[data-studio-collaboration-gateway]")).toBeNull();
    expect(document.querySelector("[data-studio-production-command-center]")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "에셋을 사용할 Studio 열기" }));
    expect(onOpenStudio).toHaveBeenCalledTimes(1);
  });
});
