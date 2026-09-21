// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioWorldRuleGate } from "./StudioWorldRuleGate";
import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest as World } from "./studio-virtual-space-world-manifest";
import type { StudioVirtualSpaceActivity } from "./studio-virtual-space-model";

const target = DEFAULT_STUDIO_WORLD_MANIFEST.interactions.find((item) => item.action === "review")!;
const rule = { id: "safe-rule", interactionId: target.id, trigger: "explicit-use" as const, activities: ["available" as const], action: "review" as const, messageKo: "검토 도구를 엽니다", messageEn: "Open the review tool" };
const world = { ...DEFAULT_STUDIO_WORLD_MANIFEST, interactionRules: [rule] };
function Harness({ data = world, activity = "available", run }: { data?: World; activity?: StudioVirtualSpaceActivity; run: (value: string) => void }) {
  const gate = useStudioWorldRuleGate(data, activity, run);
  return <><button onClick={() => gate.request(target)}>Use review desk</button>{gate.element}</>;
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function() { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("explicit rule confirmation", () => {
  it("requires a separate confirmation, focuses Cancel and executes only one action", () => {
    const run = vi.fn(); render(<Harness run={run} />);
    const trigger = screen.getByRole("button", { name: "Use review desk" }); trigger.focus(); fireEvent.click(trigger);
    expect(run).not.toHaveBeenCalled(); expect(document.activeElement).toBe(screen.getByRole("button", { name: "취소" }));
    const button = screen.getByRole("button", { name: "확인하고 도구 열기" });
    act(() => { button.click(); button.click(); });
    expect(run).toHaveBeenCalledTimes(1); expect(run).toHaveBeenCalledWith("review");
    expect(document.activeElement).toBe(trigger);
  });
  it.each(["cancel", "status", "world", "hidden"])("invalidates a pending request on %s", (cause) => {
    const run = vi.fn(), view = render(<Harness run={run} />); fireEvent.click(screen.getByRole("button", { name: "Use review desk" }));
    const button = screen.getByRole("button", { name: "확인하고 도구 열기" });
    if (cause === "cancel") fireEvent.click(screen.getByRole("button", { name: "취소" }));
    if (cause === "status") view.rerender(<Harness run={run} activity="focused" />);
    if (cause === "world") view.rerender(<Harness run={run} data={{ ...world, version: 99 }} />);
    if (cause === "hidden") { vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); fireEvent(document, new Event("visibilitychange")); }
    button.click(); expect(run).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not execute when the allowed activity condition is false", () => {
    const run = vi.fn(); render(<Harness run={run} activity="focused" />); fireEvent.click(screen.getByRole("button", { name: "Use review desk" }));
    expect(run).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("현재 작업 상태");
  });
  it("preserves the existing explicit unruled action", () => {
    const run = vi.fn(); render(<Harness run={run} data={DEFAULT_STUDIO_WORLD_MANIFEST} />);
    fireEvent.click(screen.getByRole("button", { name: "Use review desk" })); expect(run).toHaveBeenCalledWith("review");
  });
});
