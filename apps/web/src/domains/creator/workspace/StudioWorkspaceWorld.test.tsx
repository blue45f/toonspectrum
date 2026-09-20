// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioWorkspaceWorld } from "./StudioWorkspaceWorld";
import { workspaceProjectLinks } from "./studio-workspace-model";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
afterEach(cleanup);
describe("workspace world preserves a recoverable, optional spatial view", () => {
  it("keeps the personal scope when using the team hotspot", () => {
    render(<MemoryRouter><StudioWorkspaceWorld project={null} links={workspaceProjectLinks(null)} onFallback={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "팀과 함께" }).getAttribute("href")).toBe("/team?scope=personal");
  });
  it("offers list view after image failure without replacing original art or opening another work", () => {
    const fallback = vi.fn();
    render(<MemoryRouter><StudioWorkspaceWorld project={null} links={workspaceProjectLinks(null)} onFallback={fallback} /></MemoryRouter>);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "내 책상" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "목록 보기로 전환" }));
    expect(fallback).toHaveBeenCalledOnce();
  });
});
