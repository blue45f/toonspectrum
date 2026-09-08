// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioProductionHubPage, type StudioProductionSurface } from "./StudioProductionHubPage";
import { createEmptyProductionWorkspace, parseProductionWorkspace, STUDIO_PRODUCTION_NAMESPACE } from "./studio-production-workspace";
import type { ProductionWorkspace } from "./studio-production-workspace";

const storage = vi.hoisted(() => ({
  rows: new Map<string, string>(),
  kvGet: vi.fn<(namespace: string, key: string) => Promise<string | null>>(),
  kvSet: vi.fn<(namespace: string, key: string, value: string) => Promise<void>>(),
}));
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => storage }));
const NOW = "2026-09-07T00:00:00.000Z";
const SCOPE = "work:behavior-299";
const task = { id: "task-1", title: "원고 확인", owner: "작가", due: "2026-09-08", progress: 45, status: "doing" as const };
const review = { id: "review-1", title: "대사 검수", assignee: "편집자", severity: "major" as const, status: "open" as const };
class Channel {
  static instances: Channel[] = [];
  readonly postMessage = vi.fn();
  readonly close = vi.fn();
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  constructor(readonly name: string) { Channel.instances.push(this); }
  receive(data: unknown) { this.onmessage?.(new MessageEvent("message", { data })); }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function seed(patch: Partial<ProductionWorkspace> = {}, scope = SCOPE) {
  const value = { ...createEmptyProductionWorkspace(scope, NOW), ...patch };
  storage.rows.set(scope, JSON.stringify(value));
  return value;
}
function row(scope = SCOPE) { return parseProductionWorkspace(storage.rows.get(scope) ?? null, scope)!; }
function Mount({ onOpen }: { onOpen: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const surfaces: Record<string, StudioProductionSurface> = { projects: "projects", review: "review", versions: "versions", present: "present", share: "share", join: "join" };
  return <>
    <button onClick={() => void navigate("/studio/projects?scope=work%3Aother-299")}>다른 작품으로</button>
    <output data-testid="location">{location.pathname + location.search}</output>
    <StudioProductionHubPage surface={surfaces[location.pathname.split("/").at(-1)!] ?? "projects"} onOpenStudio={onOpen} />
  </>;
}
function mount(surface: StudioProductionSurface = "projects", search = `?scope=${encodeURIComponent(SCOPE)}`) {
  const onOpen = vi.fn();
  const view = render(<MemoryRouter initialEntries={[`/studio/${surface}${search}`]}><Mount onOpen={onOpen} /></MemoryRouter>);
  return { ...view, onOpen };
}
async function saved() { await screen.findByText("SQLite/OPFS 저장됨"); }
async function go(name: string) { fireEvent.click(screen.getByRole("link", { name })); await saved(); }

beforeEach(() => {
  storage.rows.clear();
  vi.clearAllMocks();
  storage.kvGet.mockImplementation(async (_namespace, key) => storage.rows.get(key) ?? null);
  storage.kvSet.mockImplementation(async (_namespace, key, value) => { storage.rows.set(key, value); });
  Channel.instances = [];
  vi.stubGlobal("BroadcastChannel", Channel);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("production hub durable user operations", () => {
  it("adds, completes and resumes a task, saves a title, and broadcasts only a revision receipt", async () => {
    const { onOpen } = mount();
    await saved();
    fireEvent.click(screen.getByRole("button", { name: "첫 작업 추가" }));
    await screen.findByRole("heading", { name: "새 제작 작업" });
    expect(row()).toMatchObject({ revision: 1, tasks: [{ title: "새 제작 작업", progress: 0, status: "todo" }] });
    const title = screen.getByRole("textbox", { name: "프로젝트 제목" });
    fireEvent.blur(title, { target: { value: "  새 작품 제목  " } });
    await waitFor(() => expect(row().title).toBe("새 작품 제목"));
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await screen.findByRole("button", { name: "재개" });
    expect(row().tasks[0]).toMatchObject({ progress: 100, status: "done" });
    fireEvent.click(screen.getByRole("button", { name: "재개" }));
    await screen.findByRole("button", { name: "완료" });
    expect(row().tasks[0]).toMatchObject({ progress: 90, status: "doing" });
    expect(Channel.instances[0]!.postMessage).toHaveBeenLastCalledWith({
      type: "studio-production-workspace-invalidated", scopeKey: SCOPE, revision: 4, sourceClientId: expect.any(String),
    });
    expect(storage.kvSet).toHaveBeenCalledWith(STUDIO_PRODUCTION_NAMESPACE, SCOPE, expect.any(String));
    const reads = storage.kvGet.mock.calls.length;
    Channel.instances[0]!.receive({ ...Channel.instances[0]!.postMessage.mock.lastCall![0], revision: 999 });
    expect(storage.kvGet).toHaveBeenCalledTimes(reads);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByText("작업 상태를 갱신했습니다.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Studio 편집기로 돌아가기" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("toggles only the selected task and review while metrics reflect remaining blockers", async () => {
    seed({ tasks: [task, { ...task, id: "task-2", title: "연출 차단", owner: "", status: "blocked" }],
      reviews: [review, { ...review, id: "review-2", title: "연속성", assignee: "", severity: "blocker" }, { ...review, id: "review-3", title: "작은 수정", severity: "minor" }] });
    mount(); await saved();
    fireEvent.click(within(screen.getByRole("heading", { name: "원고 확인" }).closest("article")!).getByRole("button", { name: "완료" }));
    await waitFor(() => expect(row().tasks[0]!.status).toBe("done"));
    expect(row().tasks[1]!.status).toBe("blocked");
    expect(screen.getByText("차단 작업 1 · 중요 검수 2")).toBeTruthy();
    await go("리뷰");
    const issue = screen.getByRole("heading", { name: "대사 검수" }).closest("article")!;
    fireEvent.click(within(issue).getByRole("button", { name: "해결" }));
    await waitFor(() => expect(row().reviews[0]!.status).toBe("resolved"));
    expect(row().reviews[1]!.status).toBe("open");
    fireEvent.click(within(issue).getByRole("button", { name: "다시 열기" }));
    await waitFor(() => expect(row().reviews[0]!.status).toBe("open"));
    fireEvent.click(screen.getByRole("button", { name: "검수 항목 추가" }));
    await screen.findByRole("heading", { name: "새 로컬 검수 항목" });
    expect(row().reviews).toHaveLength(4);
  });

  it("restores a checkpoint's tasks and reviews without reverting later titles or slides", async () => {
    seed({ tasks: [task], reviews: [review], slides: [{ id: "slide-original", title: "기획", body: "보존할 본문" }] });
    mount("versions"); await saved();
    expect(screen.getByText("로컬 체크포인트가 없습니다")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "체크포인트 만들기" }));
    await screen.findByRole("heading", { name: "로컬 체크포인트 1" });
    await go("프로젝트");
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(row().tasks[0]!.status).toBe("done"));
    fireEvent.blur(screen.getByRole("textbox", { name: "프로젝트 제목" }), { target: { value: "보존할 새 제목" } });
    await waitFor(() => expect(row().title).toBe("보존할 새 제목"));
    await go("버전");
    fireEvent.click(screen.getByRole("button", { name: "로컬 복원" }));
    await waitFor(() => expect(row().tasks[0]!.status).toBe("doing"));
    expect(row()).toMatchObject({ title: "보존할 새 제목", reviews: [review], slides: [{ body: "보존할 본문" }] });
  });

  it("adds and edits real pitch cards without changing neighboring slides", async () => {
    mount("present"); await saved();
    fireEvent.click(screen.getByRole("button", { name: "슬라이드 추가" }));
    await waitFor(() => expect(row().slides).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "슬라이드 추가" }));
    await waitFor(() => expect(row().slides).toHaveLength(2));
    fireEvent.blur(screen.getAllByRole("textbox", { name: "제목" })[0]!, { target: { value: "주인공 소개" } });
    await waitFor(() => expect(row().slides[0]!.title).toBe("주인공 소개"));
    fireEvent.blur(screen.getAllByRole("textbox", { name: "본문" })[0]!, { target: { value: "  이야기 본문  " } });
    await waitFor(() => expect(row().slides[0]!.body).toBe("이야기 본문"));
    expect(row().slides[1]).toMatchObject({ title: "새 슬라이드", body: "핵심 메시지를 입력하세요." });
  });

  it("preserves a rejected save, refuses more edits until reload, then accepts a corrected retry", async () => {
    const original = seed({ tasks: [task] });
    storage.kvSet.mockRejectedValueOnce(new Error("저장 공간 부족"));
    mount(); await saved();
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await screen.findByRole("alert");
    expect(row()).toEqual(original);
    expect((screen.getByRole("textbox", { name: "프로젝트 제목" }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(row().tasks[0]!.status).toBe("done"));
    expect(storage.kvSet).toHaveBeenCalledTimes(2);
  });

  it("reports a non-Error write failure without claiming success or replacing the acknowledged row", async () => {
    const original = seed({ tasks: [task] });
    storage.kvSet.mockRejectedValueOnce("storage disconnected");
    mount(); await saved();
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("제작 운영 데이터를 저장하지 못했습니다.");
    expect(row()).toEqual(original);
    expect(screen.queryByText("작업 상태를 갱신했습니다.")).toBeNull();
  });

  it("still saves locally when browser privacy policy refuses the broadcast channel", async () => {
    vi.stubGlobal("BroadcastChannel", class {
      constructor() { throw new DOMException("blocked", "SecurityError"); }
    });
    mount(); await saved();
    fireEvent.click(screen.getByRole("button", { name: "첫 작업 추가" }));
    await screen.findByRole("heading", { name: "새 제작 작업" });
    expect(row().revision).toBe(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps local rows intact when loading fails and recovers after storage becomes available", async () => {
    seed({ tasks: [task] });
    storage.kvGet.mockRejectedValueOnce("offline");
    mount();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "첫 작업 추가" }));
    expect(storage.kvSet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    await screen.findByRole("heading", { name: "원고 확인" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps delayed reads scoped to their original document after navigation", async () => {
    const old = deferred<string | null>();
    storage.kvGet.mockImplementationOnce(() => old.promise);
    seed({ title: "다른 작품 제목" }, "work:other-299");
    mount();
    await waitFor(() => expect(storage.kvGet).toHaveBeenCalledWith(STUDIO_PRODUCTION_NAMESPACE, SCOPE));
    fireEvent.click(screen.getByRole("button", { name: "다른 작품으로" }));
    await saved();
    await act(async () => { old.resolve(JSON.stringify({ ...createEmptyProductionWorkspace(SCOPE, NOW), title: "늦은 이전 작품" })); await old.promise; });
    expect((screen.getByRole("textbox", { name: "프로젝트 제목" }) as HTMLInputElement).value).toBe("다른 작품 제목");
    expect(storage.kvSet).not.toHaveBeenCalled();
  });

  it("reloads only a newer same-scope peer receipt and closes the channel on unmount", async () => {
    seed({ revision: 3 });
    const view = mount(); await saved();
    const channel = Channel.instances[0]!;
    const invalid = [{}, { type: "studio-production-workspace-invalidated", scopeKey: "work:else", revision: 4, sourceClientId: "peer" },
      { type: "studio-production-workspace-invalidated", scopeKey: SCOPE, revision: 3, sourceClientId: "peer" }];
    for (const receipt of invalid) channel.receive(receipt);
    expect(storage.kvGet).toHaveBeenCalledTimes(1);
    seed({ revision: 4, title: "동료가 수정한 제목" });
    await act(async () => { channel.receive({ type: "studio-production-workspace-invalidated", scopeKey: SCOPE, revision: 4, sourceClientId: "peer" }); });
    expect((screen.getByRole("textbox", { name: "프로젝트 제목" }) as HTMLInputElement).value).toBe("동료가 수정한 제목");
    view.unmount();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it("allows demo edits without persisting them and ignores modified keyboard shortcuts", async () => {
    mount("review", "?demo=1");
    await screen.findByText("데모 · 저장 안 함");
    fireEvent.click(screen.getByRole("button", { name: "검수 항목 추가" }));
    await screen.findByRole("heading", { name: "새 로컬 검수 항목" });
    expect(screen.getByText(/데모 변경은 저장되지 않습니다/)).toBeTruthy();
    expect(storage.kvSet).not.toHaveBeenCalled();
    for (const extra of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { repeat: true }, { keyCode: 229 }]) {
      fireEvent.keyDown(window, { altKey: true, key: "1", ...extra });
    }
    expect(screen.getByTestId("location").textContent).toBe("/studio/review?demo=1");
  });

  it("returns from invalid scope through the actual action and does not assume invite authority", async () => {
    const invalid = mount("projects", "?scope=work%3A..");
    fireEvent.click(screen.getByRole("button", { name: "Studio 편집기로 돌아가기" }));
    expect(invalid.onOpen).toHaveBeenCalledOnce();
    invalid.unmount();
    mount("join"); await saved();
    expect(screen.getByText("검증할 서버 초대 링크가 없습니다")).toBeTruthy();
    expect(storage.kvSet).not.toHaveBeenCalled();
  });
});
