// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { createStudioProject } from "../studio-project-library-store";
import { createStudioProjectDocument, trashStudioProjectDocument } from "../studio-project-document-store";
import { writeStudioExactResumeContext } from "../studio-exact-resume-context";
import { StudioWorkspacePage } from "./StudioWorkspacePage";

const state = vi.hoisted(() => ({
  projects: [] as StudioProjectLibraryEntry[],
  loaded: true,
  error: null as string | null,
  mode: "classic" as "classic" | "virtual-studio",
  reload: vi.fn(),
  setMode: vi.fn(),
}));
vi.mock("./StudioWorkspaceLiveHome", () => ({ StudioWorkspaceLiveHome: ({ projectId, header }: { projectId: string | null; header: ReactNode }) => <div data-testid="actual-live-home" data-project={projectId ?? "personal"}>{header}</div> }));
vi.mock("../studio-shell/useStudioProjectLibrary", () => ({ useStudioProjectLibrary: () => ({
  projects: state.projects, state: state.loaded ? { schemaVersion: 1, projects: state.projects } : null,
  error: state.error, reload: state.reload,
}) }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: null }) }));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
vi.mock("@/shared/lib/creator-experience-mode", () => ({
  useCreatorExperienceMode: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock("@/shared/components/CreatorExperienceModeSwitch", () => ({ CreatorExperienceModeSwitch: () => null }));
vi.mock("@/shared/components/open-search-button", () => ({ OpenSearchButton: () => <button type="button">검색</button> }));
vi.mock("@/shared/components/workspace/WorkspaceContextPanel", () => ({
  WorkspaceContextPanel: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <aside>{children}</aside> : null,
}));
function makeProject(id: string, createdAt: string) {
  const values = new Map<string, string>();
  return createStudioProject({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } },
    { id, title: `작품 ${id}`, kind: "webtoon", createdAt });
}
function LocationProbe() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname + location.search}</output><button type="button" onClick={() => navigate(-1)}>뒤로</button></>;
}
function App({ entries = ["/home"] }: { entries?: string[] }) {
  return <MemoryRouter initialEntries={entries}><LocationProbe /><Routes>
    <Route path="/home" element={<StudioWorkspacePage />} />
    <Route path="/team" element={<StudioWorkspacePage surface="team" />} />
    <Route path="/hub" element={<StudioWorkspacePage surface="hub" />} />
  </Routes></MemoryRouter>;
}
function nav(name: string) { return within(screen.getByRole("navigation", { name: "주 메뉴" })).getByRole("link", { name }); }
beforeEach(() => {
  window.localStorage.clear();
  state.projects = [makeProject("older", "2026-09-19T00:00:00.000Z"), makeProject("newer", "2026-09-20T00:00:00.000Z")];
  state.loaded = true; state.error = null; state.mode = "classic";
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("studio workspace continuity and safe recovery", () => {
  it("preserves an older selected work through team, explore and home without carrying panel or category state", async () => {
    render(<App entries={["/home?project=older"]} />);
    fireEvent.click(nav("팀"));
    fireEvent.click(screen.getByRole("button", { name: "모집·의뢰" }));
    expect(nav("둘러보기").getAttribute("href")).toBe("/hub?project=older");
    fireEvent.click(nav("둘러보기")); fireEvent.click(nav("홈"));
    expect(screen.getByRole("combobox").getAttribute("disabled")).toBeNull();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("older");
    expect(screen.getByTestId("location").textContent).toBe("/home?project=older");
  });
  it("keeps personal scope through navigation even with existing works", () => {
    render(<App entries={["/home?scope=personal"]} />);
    fireEvent.click(nav("팀")); fireEvent.click(nav("둘러보기")); fireEvent.click(nav("홈"));
    expect(screen.getByTestId("location").textContent).toBe("/home?scope=personal");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
  });
  it("pins an implicit default using replace so Back still returns to the previous destination", async () => {
    render(<App entries={["/hub?scope=personal", "/home"]} />);
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/home?project=newer"));
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(screen.getByTestId("location").textContent).toBe("/hub?scope=personal");
  });
  it("does not switch work after another project becomes more recent", async () => {
    const view = render(<App />);
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/home?project=newer"));
    state.projects = state.projects.map((project) => project.id === "older" ? { ...project, lastOpenedAt: "2026-09-21T00:00:00.000Z" } : project);
    view.rerender(<App />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("newer");
  });
  it.each(["classic", "virtual-studio"] as const)("offers recovery rather than creation or stale actions for a missing project in %s", (mode) => {
    state.mode = mode;
    render(<App entries={["/home?project=missing&panel=work"]} />);
    expect(document.querySelector('[data-workspace-state="missing"]')).toBeTruthy();
    expect(document.querySelector('.workspace-world')).toBeNull();
    expect(document.querySelector('a[href="/studio/new"]')).toBeNull();
    expect(document.querySelector('a[href^="/studio/p/"]')).toBeNull();
    expect(nav("팀").getAttribute("href")).toBe("/team?project=missing");
    fireEvent.click(screen.getByRole("button", { name: "개인 홈으로 돌아가기" }));
    expect(screen.getByTestId("location").textContent).toBe("/home?scope=personal");
  });
  it("does not expose any artwork action while the library is loading", () => {
    state.loaded = false;
    render(<App entries={["/home?project=older&panel=work"]} />);
    expect(document.querySelector('[data-workspace-state="loading"]')?.getAttribute("aria-busy")).toBe("true");
    expect(document.querySelector('a[href^="/studio/p/"]')).toBeNull();
    expect(document.querySelector('a[href="/studio/new"]')).toBeNull();
  });
  it("blocks stale work actions after a library error, including the work inspector", () => {
    const view = render(<App entries={["/home?project=older&panel=work"]} />);
    state.error = "저장 공간 오류"; view.rerender(<App entries={["/home?project=older&panel=work"]} />);
    expect(document.querySelector('[data-workspace-state="error"]')).toBeTruthy();
    expect(document.querySelector('a[href^="/studio/p/"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" })); expect(state.reload).toHaveBeenCalledOnce();
  });
  it("keeps public exploration usable during a device library failure", () => {
    state.error = "저장 공간 오류";
    render(<App entries={["/hub?project=older"]} />);
    expect(screen.getByRole("link", { name: /창작 작품 전시/ }).getAttribute("href")).toBe("/showcase");
    expect(nav("홈").getAttribute("href")).toBe("/home?project=older");
  });
});

describe("workspace search switching integration", () => {
  it("switches exact work in the same team category and Back returns without reopening the picker", () => {
    render(<App entries={["/team?project=older&tab=recruit"]} />);
    fireEvent.click(screen.getByRole("button", { name: "작품 찾아 전환" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "newer" } });
    fireEvent.click(screen.getByRole("button", { name: /작품 newer\s*작품 ID: newer/ }));
    expect(screen.getByTestId("location").textContent).toBe("/team?project=newer&tab=recruit");
    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(screen.getByTestId("location").textContent).toBe("/team?project=older&tab=recruit");
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
  it("removes a deleted result while the picker is open instead of opening another work", () => {
    const view = render(<App entries={["/home?project=older&panel=projects"]} />);
    state.projects = state.projects.filter((project) => project.id !== "older"); view.rerender(<App />);
    expect(document.querySelector('button[data-workspace-project="older"]')).toBeNull();
    expect(document.querySelector('.workspace-statusbar strong')?.textContent).toBe("선택 작품 확인 필요");
    expect(document.querySelector('.workspace-statusbar .workspace-primary')).toBeNull();
    expect(screen.getByTestId("location").textContent).toBe("/home?project=older&panel=projects");
    fireEvent.click(screen.getByRole("button", { name: /작품 newer\s*작품 ID: newer/ }));
    expect(screen.getByTestId("location").textContent).toBe("/home?project=newer");
  });
  it("clears artwork identity only after explicitly selecting the personal workspace", () => {
    render(<App entries={["/hub?project=older&tab=materials&panel=projects"]} />);
    fireEvent.click(screen.getByRole("button", { name: /개인 작업실\s*작품을 선택하지 않고/ }));
    expect(screen.getByTestId("location").textContent).toBe("/hub?tab=materials&scope=personal");
    expect(nav("홈").getAttribute("href")).toBe("/home?scope=personal");
  });
  it("does not mislabel a library failure as a personal workspace", () => {
    state.error = "저장 공간 오류";
    render(<App entries={["/home?project=older&panel=projects"]} />);
    expect(document.querySelector('.workspace-statusbar strong')?.textContent).toBe("저장 공간 확인 필요");
    expect(document.querySelectorAll('button[data-workspace-project]')).toHaveLength(0);
    expect(screen.getByRole("searchbox").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("location").textContent).toBe("/home?project=older&panel=projects");
  });
});

describe("workspace live resume integration", () => {
  it("updates the footer without replacing the selected project and never opens a neighbouring document", async () => {
    state.projects = [{ ...state.projects[0]!, lastOpenedDocumentId: "last" }];
    createStudioProjectDocument(localStorage, "older", { id: "last", title: "최근 원고", kind: "webtoon" });
    createStudioProjectDocument(localStorage, "older", { id: "other", title: "다른 원고", kind: "webtoon" });
    render(<App entries={["/home?project=older"]} />);
    await act(async () => { writeStudioExactResumeContext(localStorage, { projectId: "older", documentId: "last", workspace: "draw", zoom: 3 }, window); });
    expect(document.querySelector(".workspace-statusbar small")?.textContent).toContain("300%");
    act(() => { trashStudioProjectDocument(localStorage, "older", "last", { target: window }); });
    expect(document.querySelector('[data-workspace-resume-notice="unavailable"]')).toBeTruthy();
    expect(document.querySelector('.workspace-statusbar .workspace-primary')?.getAttribute("href")).toBe("/studio/p/older/production?view=documents");
    expect(document.querySelector('a[href*="/d/other"]')).toBeNull();
    expect(screen.getByTestId("location").textContent).toBe("/home?project=older");
  });
  it("revalidates on activation even when another tab has not delivered its event yet", () => {
    state.projects = [{ ...state.projects[0]!, lastOpenedDocumentId: "last" }];
    createStudioProjectDocument(localStorage, "older", { id: "last", title: "최근 원고", kind: "webtoon" });
    render(<App entries={["/home?project=older"]} />);
    trashStudioProjectDocument(localStorage, "older", "last");
    fireEvent.click(document.querySelector('.workspace-statusbar .workspace-primary')!);
    expect(screen.getByTestId("location").textContent).toBe("/home?project=older");
    expect(document.querySelector('[data-workspace-resume-notice="unavailable"]')).toBeTruthy();
  });
});

it("keeps home task-first and makes every virtual-space entry explicit", () => {
  state.mode = "virtual-studio";
  render(<App entries={["/home?project=older"]} />);
  expect(screen.queryByTestId("actual-live-home")).toBeNull();
  expect(screen.getByRole("heading", { name: "홈" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /캐릭터 선택/ }).getAttribute("href"))
    .toBe("/onboarding/character?next=%2Fstudio%2Fspace");
  expect(screen.getByRole("link", { name: /작품 협업 공간/ }).getAttribute("href"))
    .toBe("/studio/p/older/space");
  expect(document.querySelector(".workspace-main .workspace-recent")).toBeTruthy();
  expect(document.querySelector(".workspace-world")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "작업 바로가기 열기" }));
  expect(document.querySelector(".workspace-activity")).toBeTruthy();
  expect(screen.getByTestId("location").textContent).toBe("/home?project=older&panel=work");
});
