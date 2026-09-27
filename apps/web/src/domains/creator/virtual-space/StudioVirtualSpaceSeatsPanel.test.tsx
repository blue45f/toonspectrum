// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceSeatsPanel } from "./StudioVirtualSpaceSeatsPanel";
import type { StudioVirtualSlotLeaseSnapshot } from "./studio-virtual-space-slot-lease";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

const slots = DEFAULT_STUDIO_WORLD_MANIFEST.interactionSlots!;
const idle: StudioVirtualSlotLeaseSnapshot = { available: true, status: "idle", slotId: null, claimId: null, ownerSessionId: null, reason: null, occupied: [] };
afterEach(cleanup);
describe("shared workspace panel", () => {
  it("does not describe unverified spaces as empty or allow claiming without authority", () => {
    const onSelect = vi.fn();
    render(<StudioVirtualSpaceSeatsPanel slots={slots} snapshot={{ ...idle, available: false }} approachingSlotId={null} onSelect={onSelect} onRelease={vi.fn()} />);
    expect(screen.queryByText("비어 있음")).toBeNull();
    expect(screen.getAllByText("확인 필요")).toHaveLength(slots.length);
    for (const button of screen.getAllByRole("button")) { expect((button as HTMLButtonElement).disabled).toBe(true); fireEvent.click(button); }
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("selects an available space explicitly and blocks another person's occupied space", () => {
    const onSelect = vi.fn();
    render(<StudioVirtualSpaceSeatsPanel slots={slots} snapshot={{ ...idle, occupied: [{ slotId: slots[1]!.id, owner: { sessionId: "bob", displayName: "Bob", role: "editor" }, claimId: "bob-fence" }] }} approachingSlotId={null} onSelect={onSelect} onRelease={vi.fn()} />);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `${slots[0]!.labelKo} 사용하기` }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(slots[0]!.id);
    expect((screen.getByRole("button", { name: `${slots[1]!.labelKo} 사용하기` }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Bob 사용 중")).not.toBeNull();
  });
  it.each(["held", "approaching"])("provides explicit release while %s without claiming a seated pose", (state) => {
    const onRelease = vi.fn();
    render(<StudioVirtualSpaceSeatsPanel slots={slots} snapshot={state === "held" ? { ...idle, status: "held", slotId: slots[0]!.id, claimId: "fence", ownerSessionId: "alice" } : idle} approachingSlotId={state === "approaching" ? slots[0]!.id : null} onSelect={vi.fn()} onRelease={onRelease} />);
    fireEvent.click(screen.getByRole("button", { name: state === "held" ? "그만 사용" : "이동 취소" }));
    expect(onRelease).toHaveBeenCalledOnce();
    expect(screen.queryByText(/앉아/u)).toBeNull();
  });
  it("내 자리 기억은 예약하지 않으며 다른 사람의 점유를 덮어쓰지 않는다", () => {
    const slot = slots[0];
    if (!slot) throw new Error("작업 자리가 필요합니다.");
    const onPreferSlot = vi.fn(), onSelect = vi.fn();
    const props = { slots, snapshot: { ...idle, occupied: [{ slotId: slot.id, owner: { sessionId: "bob", displayName: "Bob", role: "editor" as const }, claimId: "bob-fence" }] }, approachingSlotId: null, onSelect, onRelease: vi.fn(), onPreferSlot };
    const view = render(<StudioVirtualSpaceSeatsPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: `${slot.labelKo}를 내 자리로 기억` }));
    expect(onPreferSlot).toHaveBeenCalledExactlyOnceWith(slot.id);
    expect(onSelect).not.toHaveBeenCalled();
    view.rerender(<StudioVirtualSpaceSeatsPanel {...props} preferredSlotId={slot.id} />);
    expect(screen.getByText("기억한 내 자리")).toBeTruthy();
    expect(screen.getByText("Bob 사용 중")).toBeTruthy();
    expect((screen.getByRole("button", { name: `${slot.labelKo} 사용하기` }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("내가 사용 중")).toBeNull();
  });
  it("확인되지 않은 선호 자리는 비어 있다고 표시하거나 예약하지 않는다", () => {
    const slot = slots[0];
    if (!slot) throw new Error("작업 자리가 필요합니다.");
    const onSelect = vi.fn();
    render(<StudioVirtualSpaceSeatsPanel slots={slots} snapshot={{ ...idle, available: false }} approachingSlotId={null} onSelect={onSelect} onRelease={vi.fn()} preferredSlotId={slot.id} onPreferSlot={vi.fn()} />);
    expect(screen.getByText("기억한 내 자리")).toBeTruthy();
    expect(screen.queryByText("비어 있음")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `${slot.labelKo} 사용하기` }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
