// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioWorkSession, type StudioWorkSessionView } from "@toonspectrum/studio-project-model/work-session";
import { StudioWorkSessionDetail } from "./StudioWorkSessionDetail";
import { useStudioSessionFormDraft } from "./use-studio-session-form-draft";
import type { StudioWorkSessionController } from "./studio-work-session-controller";

vi.mock("../virtual-space/use-studio-review-roster", () => ({ useStudioReviewRoster: () => ({ members: [], candidates: [], status: "idle", refresh: vi.fn() }) }));
vi.mock("./StudioWorkSessionPreview", () => ({ StudioWorkSessionPreview: () => <div>Real preview boundary</div> }));
vi.mock("./StudioWorkSessionResultPicker", () => ({ StudioWorkSessionResultPicker: () => <div>Existing outcome picker boundary</div> }));
vi.mock("@/shared/navigation/router-link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);
function fixture() {
  const input = { id: "session", operationId: "create", title: "12화 검수", purpose: "8컷 시선", kind: "review" as const,
    input: { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) }, invitedUserIds: ["guest"] };
  const session = createStudioWorkSession(input, { userId: "host", canEdit: true, canComment: true }, "2026-09-21T00:00:00.000Z");
  const view: StudioWorkSessionView = { session, capabilities: { edit: true, comment: true } };
  const command = vi.fn().mockResolvedValue(undefined), controller = { command, getSnapshot: () => ({ phase: "ready", view }) } as unknown as StudioWorkSessionController;
  return { view, command, controller };
}
describe("actual work-session detail actions", () => {
  it("renders without joining, saving, starting media or approving work", () => {
    const f = fixture(); render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
    expect(f.command).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "준비 완료" })).toBeTruthy();
  });
  it("does not unmount text fields or lose typed notes during a background read", () => {
    const f = fixture(); const { rerender } = render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
    const input = screen.getByRole("textbox", { name: "내용" }); input.focus(); fireEvent.change(input, { target: { value: "수정해야 할 시선" } });
    rerender(<StudioWorkSessionDetail {...f} actorId="host" busy />);
    expect(screen.getByRole("textbox", { name: "내용" })).toBe(input); expect((input as HTMLTextAreaElement).value).toBe("수정해야 할 시선");
    rerender(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
    expect((screen.getByRole("textbox", { name: "내용" }) as HTMLTextAreaElement).value).toBe("수정해야 할 시선");
  });
  it("restores unsent text only for the same actor and session after an error remount", () => {
    const f = fixture(); const first = render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
    fireEvent.change(screen.getByRole("textbox", { name: "내용" }), { target: { value: "아직 보내지 않은 메모" } }); first.unmount();
    render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
    expect((screen.getByRole("textbox", { name: "내용" }) as HTMLTextAreaElement).value).toBe("아직 보내지 않은 메모"); expect(f.command).not.toHaveBeenCalled();
  });
  it("requires explicit summary and confirmation before closing, never approval", () => {
    const f = fixture(); f.view.session = { ...f.view.session, status: "active" };
    render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "결과를 남기고 종료" })); expect(f.command).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "확인하고 적용" }); expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: /결론·미결/u }), { target: { value: "결론 보류. 수정 후 재검토." } });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(confirm);
    expect(f.command).toHaveBeenCalledExactlyOnceWith({ action: "close", summary: "결론 보류. 수정 후 재검토." });
  });
  it("shows closed results without re-enabling participant or editing actions", () => {
    const f = fixture(); f.view.session = { ...f.view.session, status: "closed", closeSummary: "재검토 필요" };
    render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
    expect(screen.getByText("재검토 필요")).toBeTruthy(); expect(screen.queryByRole("button", { name: "기록 저장" })).toBeNull(); expect(f.command).not.toHaveBeenCalled();
  });
});

it("shows a recovery warning and retains typed text when browser storage is full", () => {
  const f = fixture();
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  try {
    render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
    const field = screen.getByRole("textbox", { name: "내용" });
    fireEvent.change(field, { target: { value: "이 화면에 유지할 메모" } });
    expect((field as HTMLTextAreaElement).value).toBe("이 화면에 유지할 메모");
    expect(screen.getByText(/탭 복구 저장을 사용할 수 없습니다/u)).toBeTruthy();
    expect(f.command).not.toHaveBeenCalled();
  } finally { write.mockRestore(); }
});

it("switches draft fields without carrying text into another account or work", () => {
  sessionStorage.setItem("field-a", "First draft");
  sessionStorage.setItem("field-b", "Second draft");
  const { result, rerender } = renderHook(({ fieldKey }) => useStudioSessionFormDraft(fieldKey, 100), { initialProps: { fieldKey: "field-a" } });
  act(() => result.current[1]("Edited first draft"));
  rerender({ fieldKey: "field-b" });
  expect(result.current[0]).toBe("Second draft");
  act(() => result.current[1]("Edited second draft"));
  expect(sessionStorage.getItem("field-a")).toBe("Edited first draft");
  rerender({ fieldKey: "field-a" });
  expect(result.current[0]).toBe("Edited first draft");
});
it("restores bounded text without rewriting it just by opening the form", () => {
  sessionStorage.setItem("field", "original text");
  const write = vi.spyOn(Storage.prototype, "setItem");
  try {
    const { result } = renderHook(() => useStudioSessionFormDraft("field", 4));
    expect(result.current[0]).toBe("orig");
    expect(write).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("field")).toBe("original text");
  } finally { write.mockRestore(); }
});

it("keeps typing and focus during a background refresh while blocking duplicate submission", () => {
  const f = fixture();
  const { rerender } = render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} saving={false} />);
  const field = screen.getByRole("textbox", { name: "내용" }); field.focus();
  fireEvent.change(field, { target: { value: "입력 중인 메모" } });
  rerender(<StudioWorkSessionDetail {...f} actorId="host" busy saving={false} />);
  expect(field.matches(":disabled")).toBe(false); expect(document.activeElement).toBe(field);
  expect(screen.getByRole("button", { name: "기록 저장" }).hasAttribute("disabled")).toBe(true);
  fireEvent.submit(field.closest("form")!); expect(f.command).not.toHaveBeenCalled();
});
it("reports a failed recovery read instead of silently claiming the input can be restored", () => {
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage unavailable"); });
  try {
    const { result } = renderHook(() => useStudioSessionFormDraft("field", 100));
    expect(result.current[2]).toBe(true); expect(result.current[0]).toBe("");
  } finally { read.mockRestore(); }
});

it("applies a reviewed closing draft without closing or approving until separately confirmed", () => {
  const f = fixture(); f.view.session = { ...f.view.session, status: "active" };
  render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
  fireEvent.click(screen.getByRole("button", { name: "결과를 남기고 종료" }));
  fireEvent.click(screen.getByRole("button", { name: "기록으로 종료 초안 만들기" }));
  expect(f.command).not.toHaveBeenCalled();
  const expected = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "검토용 종료 초안" }).value;
  fireEvent.click(screen.getByRole("button", { name: "검토한 초안 적용" }));
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: /결론·미결/u }).value).toBe(expected);
  expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
  expect(f.command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "확인하고 적용" }));
  expect(f.command).toHaveBeenCalledExactlyOnceWith({ action: "close", summary: expected });
});

it("revokes an open closing form if the actor loses host permission", () => {
  const f = fixture(); f.view.session = { ...f.view.session, status: "active" };
  const view = render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
  fireEvent.click(screen.getByRole("button", { name: "결과를 남기고 종료" }));
  view.rerender(<StudioWorkSessionDetail {...f} view={{ ...f.view, capabilities: { edit: false, comment: true } }} actorId="host" busy={false} />);
  expect(screen.queryByRole("button", { name: "확인하고 적용" })).toBeNull();
  expect(screen.queryByRole("button", { name: "기록으로 종료 초안 만들기" })).toBeNull();
  expect(f.command).not.toHaveBeenCalled();
});

it("does not reuse a previously confirmed close form after host permission returns", () => {
  const f = fixture(); f.view.session = { ...f.view.session, status: "active" };
  const view = render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
  fireEvent.click(screen.getByRole("button", { name: "결과를 남기고 종료" }));
  fireEvent.click(screen.getByRole("checkbox"));
  view.rerender(<StudioWorkSessionDetail {...f} view={{ ...f.view, capabilities: { edit: false, comment: true } }} actorId="host" busy={false} />);
  view.rerender(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
  expect(screen.queryByRole("button", { name: "확인하고 적용" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "결과를 남기고 종료" }));
  expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
  expect(f.command).not.toHaveBeenCalled();
});

it("requires fresh close confirmation after the summary text is edited", () => {
  const f = fixture(); f.view.session = { ...f.view.session, status: "active" };
  render(<StudioWorkSessionDetail {...f} actorId="host" busy={false} />);
  fireEvent.click(screen.getByRole("button", { name: "결과를 남기고 종료" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByRole("textbox", { name: /결론·미결/u }), { target: { value: "새로운 결론" } });
  expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "확인하고 적용" }).disabled).toBe(true);
  expect(f.command).not.toHaveBeenCalled();
});
