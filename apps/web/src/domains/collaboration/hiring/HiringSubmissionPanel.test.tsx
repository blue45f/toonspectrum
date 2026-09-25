// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HiringSubmissionPanel } from "./HiringSubmissionPanel";
import { hiringClient } from "./hiring-client";
import { emptyResume } from "./hiring-form-values";

import type { HiringResume, HiringResumeVersion } from "../../../../../../packages/contracts/src/creator-hiring";

vi.mock("./hiring-client", () => ({ hiringClient: { resumes: vi.fn(), versions: vi.fn(), submit: vi.fn() } }));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: async (e: Error) => e.message }));
vi.mock("@/compat/router-link", () => ({ default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("../collaboration-ui", () => ({ CollabField: ({ label, children }: { label: string; children: React.ReactNode }) => <label>{label}{children}</label>, CollabNotice: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>, collabButton: "", collabInput: "", collabPrimary: "" }));
const version = (id: string, resumeId = "a", revision = 1): HiringResumeVersion => ({ id, resumeId, revision, content: { ...emptyResume().content, penName: `private-${id}` }, createdAt: "2026-09-20T01:00:00Z" });
const resumes = ["a", "b"].map((id): HiringResume => ({ id, title: `이력서 ${id}`, revision: 1, currentVersion: version(id), updatedAt: "2026-09-20T01:00:00Z", submissionBlocked: false }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const action = vi.fn(async (work: () => Promise<unknown>) => { await work(); return true; });
const panel = (actor = "actor-a") => <HiringSubmissionPanel key={`post:${actor}`} postId="post" postVersion={1} busy={false} act={action} />;
async function choose(id: string) { await screen.findByLabelText("제출할 이력서"); fireEvent.change(screen.getByLabelText("제출할 이력서"), { target: { value: id } }); }
beforeEach(() => { vi.mocked(hiringClient.resumes).mockResolvedValue(resumes); vi.mocked(hiringClient.versions).mockResolvedValue([version("v1")]); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe("submission version loading and privacy", () => {
  it("retry reruns the selected versions request even when resumeId is unchanged", async () => {
    vi.mocked(hiringClient.versions).mockRejectedValueOnce(new Error("버전 요청 실패"));
    render(panel()); await choose("a"); await screen.findByText("버전 요청 실패");
    fireEvent.click(screen.getByText("다시 불러오기"));
    await screen.findByLabelText("제출할 저장 버전"); expect(hiringClient.versions).toHaveBeenCalledTimes(2);
    expect(vi.mocked(hiringClient.versions).mock.calls.every(([id]) => id === "a")).toBe(true);
    expect(screen.queryByText("버전 요청 실패")).toBeNull();
  });
  it("ignores and aborts a stale version response after selecting another resume", async () => {
    const stale = deferred<HiringResumeVersion[]>();
    vi.mocked(hiringClient.versions).mockImplementation((id) => id === "a" ? stale.promise : Promise.resolve([version("b1", "b")]));
    render(panel()); await choose("a"); await choose("b"); await screen.findByLabelText("제출할 저장 버전");
    expect(vi.mocked(hiringClient.versions).mock.calls[0][1]?.aborted).toBe(true);
    await act(async () => { stale.resolve([version("a1")]); });
    expect((screen.getByLabelText("제출할 저장 버전") as HTMLSelectElement).value).toBe("b1");
    expect(screen.queryByText("private-a1")).toBeNull();
  });
  it("rejects versions for another resume and resets consent on version changes", async () => {
    vi.mocked(hiringClient.versions).mockResolvedValue([version("wrong", "b"), version("v2", "a", 2), version("v1")]);
    render(panel()); await choose("a"); await screen.findByLabelText("제출할 저장 버전");
    expect((screen.getByLabelText("제출할 저장 버전") as HTMLSelectElement).value).toBe("v2");
    expect(screen.queryByText("private-wrong")).toBeNull();
    const consent = screen.getByLabelText(/선택한 이력서 버전·포트폴리오와 연락처/u);
    fireEvent.click(consent); fireEvent.change(screen.getByLabelText("제출할 저장 버전"), { target: { value: "v1" } });
    expect((consent as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("button", { name: "선택한 버전으로 지원" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("지원 메시지"), { target: { value: "충분히 긴 지원 메시지를 작성하고 확인합니다." } });
    fireEvent.change(screen.getByLabelText("지원용 비공개 연락처"), { target: { value: "fixture@example.com" } });
    fireEvent.click(consent); fireEvent.submit(screen.getByRole("button", { name: "선택한 버전으로 지원" }).closest("form")!);
    await waitFor(() => expect(hiringClient.submit).toHaveBeenCalledWith("post", expect.objectContaining({ resumeVersionId: "v1", portfolioIndexes: [] })));
  });
  it("keeps the actual parent actor key and clears private state and pending requests on actor unmount", async () => {
    const source = readFileSync(`${process.cwd()}/apps/web/src/domains/collaboration/CollaborationPostPage.tsx`, "utf8");
    expect(source).toContain('key={`${id}:${userId || "guest"}`}');
    const stale = deferred<HiringResumeVersion[]>(); vi.mocked(hiringClient.versions).mockReturnValueOnce(stale.promise);
    const view = render(panel()); await choose("a");
    fireEvent.change(screen.getByLabelText("지원용 비공개 연락처"), { target: { value: "private@example.com" } });
    view.rerender(panel("actor-b"));
    await act(async () => { stale.resolve([version("a1")]); });
    expect(vi.mocked(hiringClient.versions).mock.calls[0][1]?.aborted).toBe(true);
    await screen.findByLabelText("지원용 비공개 연락처");
    expect((screen.getByLabelText("지원용 비공개 연락처") as HTMLInputElement).value).toBe("");
    expect(screen.queryByLabelText("제출할 저장 버전")).toBeNull();
  });
  it("explains that deleting derived resume payloads leaves the original message/contact until withdrawal", async () => {
    render(panel()); await screen.findByLabelText("제출할 이력서");
    expect(screen.getByText(/이력서 삭제는 이력서와 파생 제출본 내용만 지웁니다/u)).toBeTruthy();
    expect(screen.getByText(/지원 메시지·연락처도 지우려면 해당 공고에서 지원을 철회/u)).toBeTruthy();
  });
});
