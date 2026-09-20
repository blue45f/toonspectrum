// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioWorkSessionComposer } from "./StudioWorkSessionComposer";
import type { StudioWorkSessionController } from "./studio-work-session-controller";

vi.mock("../virtual-space/use-studio-review-roster", () => ({ useStudioReviewRoster: () => ({ members: [], refresh: vi.fn() }) }));
vi.mock("../virtual-space/studio-virtual-space-review-invitation", () => ({ listStudioVirtualSpaceReviewSubjects: async (workId: string) => ({
  ok: true, truncated: false, choices: [{ title: "고정 입력본", artifactTitle: "원고", subject: { schemaVersion: 1, workId,
    projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) } }],
}) }));
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function fixture(confirmed = false) {
  const create = vi.fn().mockResolvedValue(undefined), onCreated = vi.fn();
  const controller = { create, getSnapshot: () => ({ phase: confirmed ? "ready" : "uncertain", view: confirmed ? { session: { id: "saved" } } : null }) } as unknown as StudioWorkSessionController;
  return { create, controller, onCreated };
}
const title = () => screen.getByRole("textbox", { name: "세션 제목" }) as HTMLInputElement;
const purpose = () => screen.getByRole("textbox", { name: "이번 작업의 목적" }) as HTMLTextAreaElement;
it("restores title and purpose without creating or inviting anyone on reopen", async () => {
  const f = fixture(); const first = render(<StudioWorkSessionComposer {...f} workId="work" actorId="actor" busy={false} />);
  fireEvent.change(title(), { target: { value: "12화 검토" } }); fireEvent.change(purpose(), { target: { value: "시선을 함께 검토" } });
  await screen.findByRole("option", { name: /고정 입력본/u }); first.unmount();
  render(<StudioWorkSessionComposer {...f} workId="work" actorId="actor" busy={false} />);
  expect(title().value).toBe("12화 검토"); expect(purpose().value).toBe("시선을 함께 검토");
  expect(f.create).not.toHaveBeenCalled();
});
it("does not restore another actor's title or purpose", async () => {
  const f = fixture(); const first = render(<StudioWorkSessionComposer {...f} workId="work" actorId="first" busy={false} />);
  fireEvent.change(title(), { target: { value: "첫 계정 입력" } });
  await screen.findByRole("option", { name: /고정 입력본/u }); first.unmount();
  render(<StudioWorkSessionComposer {...f} workId="work" actorId="second" busy={false} />);
  expect(title().value).toBe(""); expect(purpose().value).toBe(""); expect(f.create).not.toHaveBeenCalled();
});
it.each([false, true])("clears form recovery only for a confirmed creation: %s", async (confirmed) => {
  const f = fixture(confirmed); render(<StudioWorkSessionComposer {...f} workId="work" actorId="actor" busy={false} />);
  fireEvent.change(title(), { target: { value: "12화 검토" } }); fireEvent.change(purpose(), { target: { value: "시선 검토" } });
  await screen.findByRole("option", { name: /고정 입력본/u });
  fireEvent.change(screen.getByRole("combobox", { name: "같이 확인할 고정 검수본" }), { target: { value: "review" } });
  fireEvent.click(screen.getByRole("button", { name: "세션 초안 저장" }));
  await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  await waitFor(() => expect(title().value).toBe(confirmed ? "" : "12화 검토"));
  expect(f.onCreated).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  expect(sessionStorage.getItem(JSON.stringify(["studio-session-title", "actor", "work"]))).toBe(confirmed ? null : "12화 검토");
});

it("keeps the purpose field editable during refresh without sending a create request", async () => {
  const f = fixture();
  const { rerender } = render(<StudioWorkSessionComposer {...f} workId="work" actorId="actor" busy={false} saving={false} />);
  await screen.findByRole("option", { name: /고정 입력본/u });
  const field = purpose(); field.focus();
  fireEvent.change(field, { target: { value: "작성 중인 목적" } });
  rerender(<StudioWorkSessionComposer {...f} workId="work" actorId="actor" busy saving={false} />);
  expect(field.matches(":disabled")).toBe(false); expect(document.activeElement).toBe(field);
  fireEvent.submit(field.closest("form")!); expect(f.create).not.toHaveBeenCalled();
});
