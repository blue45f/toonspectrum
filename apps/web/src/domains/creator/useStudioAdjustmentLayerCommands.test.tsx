// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStudioAdjustmentLayerCommands } from "./useStudioAdjustmentLayerCommands";
import { StudioLiveAdjustmentControls } from "./StudioLiveAdjustmentControls";
import { createStudioLiveAdjustment } from "./studio-live-adjustment";
import type { El } from "./studio-element-model";

afterEach(cleanup);
type Options = Parameters<typeof useStudioAdjustmentLayerCommands>[0];
function fixture(): Options {
  return { getElements: () => [], prepare: () => true, width: 800, height: 1080, canMutate: () => true, isDrawing: () => false, commit: vi.fn(() => true), select: vi.fn(), closeMenu: vi.fn(), setError: vi.fn() };
}
function Creator({ options }: { options: Options }) {
  const create = useStudioAdjustmentLayerCommands(options);
  return <button onClick={create}>보정 레이어 만들기</button>;
}

describe("adjustment layer UI mutation", () => {
  it("flushes a pending stroke and appends to the latest document in one Undo transaction", () => {
    const options = fixture(); const live: El[] = [];
    const stroke: El = { id: "stroke", type: "draw", kind: "freehand", mode: "pen", brush: "pen", points: [0, 0, 10, 10], stroke: "#000", strokeWidth: 2 };
    options.prepare = () => { live.push(stroke); return true; };
    options.getElements = () => live;
    render(<Creator options={options} />);
    fireEvent.click(screen.getByRole("button", { name: "보정 레이어 만들기" }));
    expect(options.commit).toHaveBeenCalledOnce();
    expect(options.commit).toHaveBeenCalledWith([stroke, expect.objectContaining({ type: "image", adjustmentLayer: { version: 1, scope: "composite-below" }, smartFilters: { version: 1, entries: [] } })]);
    expect(live).toEqual([stroke]);
    expect(options.select).toHaveBeenCalledOnce();
  });
  it.each(["locked", "drawing", "flush", "commit"])("does not select an uncommitted adjustment after %s refusal", (reason) => {
    const options = fixture();
    if (reason === "locked") options.canMutate = () => false;
    if (reason === "drawing") options.isDrawing = () => true;
    if (reason === "flush") options.prepare = () => false;
    if (reason === "commit") options.commit = vi.fn(() => false);
    render(<Creator options={options} />); fireEvent.click(screen.getByRole("button"));
    expect(options.select).not.toHaveBeenCalled(); expect(options.closeMenu).not.toHaveBeenCalled();
    if (reason !== "commit") expect(options.commit).not.toHaveBeenCalled();
  });
  it("changes clipping scope through a labelled inspector control and a single patch", () => {
    const selected = createStudioLiveAdjustment("adjust", 800, 1080); const onPatch = vi.fn();
    render(<StudioLiveAdjustmentControls selected={selected} onPatch={onPatch} />);
    fireEvent.change(screen.getByRole("combobox", { name: "보정 범위" }), { target: { value: "clip-previous" } });
    expect(onPatch).toHaveBeenCalledOnce();
    expect(onPatch).toHaveBeenCalledWith({ clipBelow: true, adjustmentLayer: { version: 1, scope: "clip-previous" } });
    expect(selected.adjustmentLayer.scope).toBe("composite-below");
  });
});
