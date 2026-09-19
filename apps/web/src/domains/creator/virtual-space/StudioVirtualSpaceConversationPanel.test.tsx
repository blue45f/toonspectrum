// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceConversationPanel } from "./StudioVirtualSpaceConversationPanel";
import type { StudioConversationRecord, StudioConversationSnapshot } from "./studio-virtual-space-conversation";

const self = { sessionId: "a", displayName: "A", role: "editor" as const };
const peers = ["b", "c", "d", "e"].map((sessionId) => ({ sessionId, displayName: sessionId.toUpperCase(), role: "editor" as const }));
const idle: StudioConversationSnapshot = { available: true, readyPeers: peers, active: null, records: [] };
afterEach(cleanup);
describe("group conversation full-roster consent UI", () => {
  it("shows the exact roster, requires an explicit proposal, and limits it to four including self", () => {
    const onPropose = vi.fn(() => "new-conversation");
    render(<StudioVirtualSpaceConversationPanel self={self} snapshot={idle} onPropose={onPropose} onRespond={vi.fn()} onLeave={vi.fn()} />);
    expect(onPropose).not.toHaveBeenCalled();
    for (const name of ["B", "C", "D"]) fireEvent.click(screen.getByRole("checkbox", { name }));
    expect((screen.getByRole("checkbox", { name: "E" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("제안 명단 · 나, B, C, D")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이 명단으로 대화 제안" }));
    expect(onPropose).toHaveBeenCalledExactlyOnceWith(["a", "b", "c", "d"]);
  });
  it("seeds an existing call's roster without inheriting consent and does not reset selection on snapshots", () => {
    const onPropose = vi.fn(() => "new-conversation"); const onRespond = vi.fn();
    const initial = { id: "pair", memberIds: ["a", "b"] };
    const result = render(<StudioVirtualSpaceConversationPanel self={self} snapshot={idle} currentConversation={initial} onPropose={onPropose} onRespond={onRespond} onLeave={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "C" }));
    result.rerender(<StudioVirtualSpaceConversationPanel self={self} snapshot={{ ...idle, readyPeers: [...peers] }} currentConversation={{ ...initial, memberIds: [...initial.memberIds] }} onPropose={onPropose} onRespond={onRespond} onLeave={vi.fn()} />);
    expect((screen.getByRole("checkbox", { name: "C" }) as HTMLInputElement).checked).toBe(true);
    expect(onRespond).not.toHaveBeenCalled(); expect(onPropose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "이 명단으로 대화 제안" }));
    expect(onPropose).toHaveBeenCalledExactlyOnceWith(["a", "b", "c"]);
  });
  it("displays everyone in an incoming proposal before explicit whole-roster acceptance", () => {
    const record: StudioConversationRecord = { id: "proposal", initiatorId: "b", initiatorInstanceId: "instance", ordinal: 1, memberIds: ["a", "b", "c"],
      status: "offered", localAccepted: false, acceptedIds: ["b"], canAccept: true, members: [self, peers[0]!, peers[1]!] };
    const onRespond = vi.fn();
    render(<StudioVirtualSpaceConversationPanel self={self} snapshot={{ ...idle, records: [record] }} onPropose={vi.fn()} onRespond={onRespond} onLeave={vi.fn()} />);
    expect(screen.getByText("나, B, C")).not.toBeNull(); expect(screen.getByText("1/3명 동의")).not.toBeNull();
    expect(onRespond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "이 전체 명단에 동의" }));
    expect(onRespond).toHaveBeenCalledExactlyOnceWith("proposal", "accept");
  });
  it("does not allow proposals when foreground/authenticated readiness is absent", () => {
    const onPropose = vi.fn();
    render(<StudioVirtualSpaceConversationPanel self={self} snapshot={{ ...idle, available: false }} currentConversation={{ id: "pair", memberIds: ["a", "b"] }} onPropose={onPropose} onRespond={vi.fn()} onLeave={vi.fn()} />);
    const button = screen.getByRole("button", { name: "이 명단으로 대화 제안" });
    expect((button as HTMLButtonElement).disabled).toBe(true); fireEvent.click(button);
    expect(onPropose).not.toHaveBeenCalled();
  });
});
