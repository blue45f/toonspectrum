// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceExploreContent, WorkspaceTeamContent } from "./StudioWorkspaceSections";
import { workspaceProjectLinks } from "./studio-workspace-model";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function team(tab: string) {
  return render(<MemoryRouter initialEntries={[`/team?tab=${tab}&project=private-project`]}><WorkspaceTeamContent project={null} links={workspaceProjectLinks(null, null)} /></MemoryRouter>);
}
describe("workspace joins the merged hiring destinations without granting project access", () => {
  it("separates project access and hiring group management", () => {
    team("members");
    expect(screen.getByRole("link", { name: /팀을 관리할 작품 선택/u }).getAttribute("href")).toBe("/studio");
    expect(screen.getByRole("link", { name: /채용 팀·그룹 관리/u }).getAttribute("href")).toBe("/collaborate/workspace?panel=teams");
  });
  it("opens real recruitment filters and private resumes", () => {
    team("recruit");
    expect(screen.getByRole("link", { name: /역할·도구·보수로 인력 찾기/u }).getAttribute("href")).toBe("/collaborate/positions");
    expect(screen.getByRole("link", { name: /이력서·제안 관리/u }).getAttribute("href")).toBe("/collaborate/workspace?panel=resumes");
  });
  it("opens only the invitation-based waiting room surface without copying private project IDs", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    team("sessions");
    expect(screen.getByRole("link", { name: /면접 대기실·회의 관리/u }).getAttribute("href")).toBe("/collaborate/workspace?panel=rooms");
    expect(screen.getByText(/외부 지원자에게 내부 원고 권한을 자동으로 부여하지 않습니다/u)).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });
  it("keeps published career discovery separate from the work library", () => {
    render(<MemoryRouter><WorkspaceExploreContent /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "사람" }));
    expect(screen.getByRole("link", { name: /경력·포트폴리오/u }).getAttribute("href")).toBe("/collaborate/gallery");
  });
});
