// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioWorkSession, type StudioWorkSessionView } from "@toonspectrum/studio-project-model";
import { StudioWorkSessionDetail } from "./StudioWorkSessionDetail";
import type { StudioWorkSessionController } from "./studio-work-session-controller";

vi.mock("../virtual-space/use-studio-review-roster", () => ({ useStudioReviewRoster: () => ({ members: [], candidates: [], status: "idle", refresh: vi.fn() }) }));
vi.mock("./StudioWorkSessionPreview", () => ({ StudioWorkSessionPreview: () => <div>Real preview boundary</div> }));
vi.mock("./StudioWorkSessionResultPicker", () => ({ StudioWorkSessionResultPicker: () => <div>Existing outcome picker boundary</div> }));
vi.mock("@/compat/router-link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
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
