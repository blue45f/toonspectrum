// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioProject } from "../studio-project-library-store";
import { workspaceProjectLinks } from "./studio-workspace-model";
import { StudioWorkspaceActivityRail } from "./StudioWorkspaceActivityRail";
import { StudioWorkspaceRecentWorks } from "./StudioWorkspaceRecentWorks";
import { StudioWorkspaceLibraryEmptyState } from "./StudioWorkspaceLibraryEmptyState";
import { StudioWorkspaceWorld } from "./StudioWorkspaceWorld";
import { WorkspaceBrand, WorkspaceSidebar } from "@/shared/components/workspace/WorkspaceChrome";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
afterEach(cleanup);
function project() {
  const values = new Map<string, string>();
  return createStudioProject({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } },
    { id: "work/a b", title: "별을 담은 작업실", kind: "webtoon", createdAt: "2026-09-20T00:00:00.000Z" });
}

describe("studio-first visual redesign retains real actions", () => {
  it("presents actual empty state instead of invented work or live statistics", () => {
    render(<MemoryRouter><StudioWorkspaceActivityRail project={null} links={workspaceProjectLinks(null)} resume={null} resumeLabel={null} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "내 첫 작품 만들기" }).getAttribute("href")).toBe("/studio/new");
    expect(screen.getByRole("link", { name: /기존 파일 가져오기/ }).getAttribute("href")).toBe("/studio/import");
    expect(screen.queryByText(/접속 중|명 온라인|완료율/)).toBeNull();
  });
  it("keeps project actions encoded and honors the recovery label", () => {
    const work = project();
    render(<MemoryRouter><StudioWorkspaceActivityRail project={work} links={workspaceProjectLinks(work)} resume={null} resumeLabel="원고 목록 확인" /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "원고 목록 확인" }).getAttribute("data-workspace-resume")).toBe("true");
    expect(screen.getByRole("link", { name: /원고와 파일/ }).getAttribute("href")).toBe("/studio/p/work%2Fa%20b/production?view=documents");
    expect(screen.getByRole("heading", { name: work.title })).toBeTruthy();
  });
  it("selects the exact recent work without opening or modifying a manuscript", () => {
    const work = project(); const onSelect = vi.fn();
    render(<MemoryRouter><StudioWorkspaceRecentWorks projects={[work]} selectedId={work.id} locale="ko" onSelect={onSelect} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: /별을 담은 작업실/ });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button); expect(onSelect).toHaveBeenCalledWith(work.id);
    expect(screen.getAllByRole("heading", { name: "최근 작품" })).toHaveLength(1);
  });
  it("shows and hides space labels without losing accessible destinations or original art", () => {
    render(<MemoryRouter><StudioWorkspaceWorld project={null} links={workspaceProjectLinks(null)} onFallback={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("img").getAttribute("src")).toBe("/assets/virtual-studio/production-v2/master-central-lossless.webp");
    const toggle = screen.getByRole("button", { name: "공간 안내" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: "내 책상" })).toBeTruthy();
    fireEvent.click(toggle); expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle); expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });
  it("keeps one four-destination navigation and a consistent UI brand", () => {
    render(<MemoryRouter initialEntries={["/team?project=exact"]}><WorkspaceBrand /><WorkspaceSidebar activeId="workspace-team" /></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    expect(within(nav).getByRole("link", { name: "팀" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "스튜디오" }).getAttribute("href")).toBe("/home?project=exact");
    expect(screen.getByRole("link", { name: "ToonStudio" }).getAttribute("href")).toBe("/home");
  });
});

it("keeps creation, import and the sample workflow in the compact empty library", () => {
  render(<MemoryRouter><StudioWorkspaceLibraryEmptyState /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "첫 작품을 위한 자리를 비워 두었어요." })).toBeTruthy();
  expect(screen.getByRole("link", { name: "새 작품 만들기" }).getAttribute("href")).toBe("/studio/new");
  expect(screen.getByRole("link", { name: "파일 가져오기" }).getAttribute("href")).toBe("/studio/import");
  expect(screen.getByRole("link", { name: "샘플 제작 흐름 살펴보기" }).getAttribute("href")).toBe("/production/projects/sample-project/overview");
  expect(screen.queryByRole("img")).toBeNull();
});
