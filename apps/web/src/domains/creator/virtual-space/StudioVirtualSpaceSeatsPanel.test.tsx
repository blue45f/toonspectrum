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
    fireEvent.click(screen.getByRole("button", { name: "그만 사용" }));
    expect(onRelease).toHaveBeenCalledOnce();
    expect(screen.queryByText(/앉아/u)).toBeNull();
  });
});
