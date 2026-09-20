// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { persistSession } from "@/compat/auth-session-state";
import { StudioHandoffEnvelopeComposer, StudioHandoffEnvelopeInbox } from "./StudioHandoffEnvelope";
import { handoffFixture } from "./studio-handoff-envelope-fixture";

const io = vi.hoisted(() => ({ actor: "actor", prepare: vi.fn(), list: vi.fn(), read: vi.fn(), create: vi.fn(), act: vi.fn() }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: io.actor } } }) }));
vi.mock("./studio-handoff-envelope-client", async (original) => ({ ...await original<object>(), studioHandoffClient: io }));
let f = handoffFixture();
beforeEach(() => {
  vi.clearAllMocks(); io.actor = "actor"; persistSession({ user: { id: io.actor }, token: null }); f = handoffFixture();
  io.prepare.mockReset().mockImplementation(async () => f.prepared); io.read.mockReset().mockImplementation(async () => f.view);
  io.list.mockReset().mockResolvedValue({ items: [{ id: "envelope", taskTitle: f.view.envelope.taskTitle, direction: "received", createdAt: f.view.envelope.createdAt, status: "delivered" }], nextCursor: null });
  io.create.mockReset().mockResolvedValue(f.view); io.act.mockReset();
});
afterEach(() => { cleanup(); persistSession(null); vi.restoreAllMocks(); });
const renderComposer = () => render(<StudioHandoffEnvelopeComposer workId="work" taskId="task" />, { wrapper: MemoryRouter });
async function openComposer() {
  fireEvent.click(screen.getByRole("button", { name: "완료 근거로 다음 담당자에게 인계" }));
  await screen.findByRole("option", { name: "선화 담당자 · 선화" });
}
describe("handoff disclosures and explicit recipient consent", () => {
  it("opens the real hook without treating the client object as a callback, and never sends automatically", async () => {
    renderComposer(); expect(io.prepare).not.toHaveBeenCalled(); await openComposer();
    expect(io.prepare).toHaveBeenCalledOnce(); expect(io.create).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "확인한 수신자에게 봉투 전달" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("clears private content immediately on hidden or account replacement without posting", async () => {
    renderComposer(); await openComposer();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.queryByRole("option", { name: "선화 담당자 · 선화" })).toBeNull();
    visibility.mockReturnValue("visible"); fireEvent(document, new Event("visibilitychange"));
    await screen.findByRole("option", { name: "선화 담당자 · 선화" });
    await act(async () => { persistSession({ user: { id: "other" }, token: null }); });
    expect(screen.queryByRole("option", { name: "선화 담당자 · 선화" })).toBeNull();
    expect(io.create).not.toHaveBeenCalled(); expect(io.act).not.toHaveBeenCalled();
  });
  it("requires a selected recipient and nonblank usage instructions before a deliberate delivery", async () => {
    renderComposer(); await openComposer();
    fireEvent.change(screen.getByLabelText("실제 수신자와 기존 역할 배정"), { target: { value: "role" } });
    const button = screen.getByRole("button", { name: "확인한 수신자에게 봉투 전달" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("사용 조건 (필수)"), { target: { value: "   " } }); expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("사용 조건 (필수)"), { target: { value: f.choice.usageConditions } }); expect(button.disabled).toBe(false);
    io.create.mockImplementation(async (_workId, input) => ({ ...f.view, envelope: { ...f.view.envelope, id: input.envelopeId } }));
    fireEvent.click(button); await screen.findByText("전달됨 · 아직 열지 않음");
    expect(io.create).toHaveBeenCalledOnce(); expect(io.prepare).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "고정 입력 검수본" }).getAttribute("href")).toContain("sharedReview=review");
  });
  it("separates opening from acceptance and requires an unchecked-by-default confirmation", async () => {
    io.actor = "recipient"; persistSession({ user: { id: io.actor }, token: null });
    f.view.canCancel = false;
    io.act.mockImplementation(async (_work, _id, phase, input) => {
      const evidence = { actorUserId: "recipient", requestId: input.requestId, at: "2026-09-20T00:04:00.000Z" };
      f.view = phase === "open" ? { ...f.view, opened: evidence, status: "read", canAccept: true }
        : { ...f.view, accepted: evidence, status: "accepted", canAccept: false };
      return f.view;
    });
    render(<StudioHandoffEnvelopeInbox workId="work" />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole("button", { name: "보낸·받은 인수인계 봉투" }));
    fireEvent.click(await screen.findByRole("button", { name: /두 번째 컷 수정/u }));
    const read = await screen.findByRole("button", { name: "내용을 읽었음을 기록" });
    expect(io.act).not.toHaveBeenCalled(); expect(screen.queryByRole("checkbox")).toBeNull(); fireEvent.click(read);
    const checkbox = await screen.findByRole("checkbox") as HTMLInputElement;
    const accept = screen.getByRole("button", { name: "지정 수신자로 인수 확인" }) as HTMLButtonElement;
    expect(checkbox.checked).toBe(false); expect(accept.disabled).toBe(true); expect(io.act).toHaveBeenCalledTimes(1);
    fireEvent.click(checkbox); expect(accept.disabled).toBe(false); fireEvent.click(accept);
    await waitFor(() => expect(screen.getByText("수신자가 인수 확인")).toBeTruthy());
    expect(io.act.mock.calls.map((args) => args[2])).toEqual(["open", "accept"]);
  });
});

it("does not include recipient option text in the select's associated label", async () => {
  renderComposer(); await openComposer();
  const select = screen.getByLabelText("실제 수신자와 기존 역할 배정", { exact: true }) as HTMLSelectElement;
  expect(select.labels?.[0]?.textContent).toBe("실제 수신자와 기존 역할 배정");
  expect(select.labels?.[0]?.htmlFor).toBe(select.id);
});
