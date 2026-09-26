// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceExploreContent, WorkspaceTeamContent } from "./StudioWorkspaceSections";
import { workspaceProjectLinks } from "./studio-workspace-model";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function team(tab: string) {
  return render(<MemoryRouter initialEntries={[`/team?tab=${tab}&project=private-project`]}><WorkspaceTeamContent project={null} links={workspaceProjectLinks(null, null)} /></MemoryRouter>);
}
describe("workspace exposes one purpose-led collaboration journey without granting project access", () => {
  it("keeps the unified team area navigation visible on the team home", () => {
    team("overview");
    const navigation = screen.getByRole("navigation", { name: "협업 영역" });
    expect(within(navigation).getByRole("link", { name: /협업 홈/u }).getAttribute("aria-current")).toBe("page");
    expect(within(navigation).getByRole("link", { name: /사람·권한/u }).getAttribute("href")).toBe("/team/people");
    expect(within(navigation).getByRole("link", { name: /인재·지원/u }).getAttribute("href")).toBe("/team/recruiting");
  });

  it("separates team membership from project access", () => {
    team("people");
    expect(screen.getByRole("link", { name: /팀 워크스페이스와 구성원/u }).getAttribute("href")).toBe("/team/people");
    expect(screen.getByRole("link", { name: /권한을 관리할 작품 선택/u }).getAttribute("href")).toBe("/studio");
    expect(screen.getByText(/팀 소속, 작품 접근, 제작 역할은 서로 다릅니다/u)).toBeTruthy();
  });
  it("connects public recruiting with the private hiring pipeline", () => {
    team("recruit");
    expect(screen.getByRole("link", { name: /모집·의뢰 작성/u }).getAttribute("href")).toBe("/collaborate/new");
    expect(screen.getByRole("link", { name: /공개 구인·의뢰/u }).getAttribute("href")).toBe("/collaborate");
    expect(screen.getByRole("link", { name: /인재·지원 관리/u }).getAttribute("href")).toBe("/team/recruiting");
  });
  it("opens only the invitation-based meeting surface without copying private project IDs", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    team("sessions");
    expect(screen.getByRole("link", { name: /면접·회의/u }).getAttribute("href")).toBe("/team/recruiting?panel=rooms");
    expect(screen.getByText(/공동 편집, 검토, 화면 공유 또는 가상 공간/u)).toBeTruthy();
    expect(document.body.innerHTML).not.toContain("private-project");
    expect(errors).not.toHaveBeenCalled();
  });
  it("keeps published career discovery separate from the work library", () => {
    render(<MemoryRouter><WorkspaceExploreContent /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "사람" }));
    expect(screen.getByRole("link", { name: /경력·포트폴리오/u }).getAttribute("href")).toBe("/collaborate/gallery");
  });
});
