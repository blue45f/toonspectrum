// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioWorldVisualEditor } from "./StudioWorldVisualEditor";
import { useStudioWorldEditHistory } from "./studio-virtual-space-world-edit-history";
import type { StudioVirtualSpaceWorldManifest as World } from "./studio-virtual-space-world-manifest";

const initial = (): World => ({ id: "test-world", version: 1, width: 500, height: 400, backgroundAssetKey: "bg", backgroundUrl: "/bg.webp",
  rooms: [{ id: "lounge", labelKo: "방", labelEn: "Room", x: 0, y: 0, width: 500, height: 400 }],
  props: [{ id: "prop-a", kind: "decor", x: 100, y: 100, width: 30, height: 30, assetUrl: "/prop.png" },
    { id: "painted", kind: "decor", x: 300, y: 100 }], colliders: [], interactions: [], spawns: [{ id: "spawn", point: { x: 30, y: 30 } }], portals: [], npcs: [] });
function Harness({ disabled = false, scope = "work-a" }: { disabled?: boolean; scope?: string }) {
  const [world, setWorld] = useState(initial);
  const history = useStudioWorldEditHistory({ manifest: world, projectId: scope, disabled, onChange: setWorld });
  return <><button onClick={() => setWorld({ ...world, version: 99 })}>Replace from server</button>
    <StudioWorldVisualEditor world={world} scope={scope} disabled={disabled} onChange={history.change} onUndo={history.undo} onRedo={history.redo} />
    <button disabled={!history.canUndo} onClick={history.undo}>Undo layout</button><button disabled={!history.canRedo} onClick={history.redo}>Redo layout</button>
    <output data-testid="world">{JSON.stringify(world)}</output></>;
}
const current = (): World => JSON.parse(screen.getByTestId("world").textContent!);
beforeEach(() => {
  class Pointer extends MouseEvent { pointerId: number; isPrimary: boolean; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.isPrimary = init.isPrimary ?? true; } }
  vi.stubGlobal("PointerEvent", Pointer);
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 500, bottom: 400, width: 500, height: 400, toJSON: () => ({}) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const map = () => screen.getByRole("group", { name: "공간 배치 지도" });
const prop = () => screen.getByRole("button", { name: "prop-a · 배치 선택" });
describe("actual visual layout editing", () => {
  it("commits a drag once on release and makes the whole edit undoable", () => {
    render(<Harness />);
    fireEvent.pointerDown(prop(), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 131, clientY: 100 });
    expect(current().props[0]!.x).toBe(100);
    fireEvent.pointerUp(map(), { pointerId: 1, clientX: 131, clientY: 100 });
    expect(current().props[0]!.x).toBe(128);
    fireEvent.click(screen.getByRole("button", { name: "Undo layout" })); expect(current().props[0]!.x).toBe(100);
    expect(screen.getByRole("button", { name: "Undo layout" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Redo layout" })); expect(current().props[0]!.x).toBe(128);
  });
  it.each(["Escape", "pointercancel", "blur", "external", "disabled", "scope"])("cancels %s without committing a stale drag", (reason) => {
    const result = render(<Harness />);
    fireEvent.pointerDown(prop(), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 150, clientY: 140 });
    if (reason === "Escape") fireEvent.keyDown(map(), { key: "Escape" });
    if (reason === "pointercancel") fireEvent.pointerCancel(map(), { pointerId: 1 });
    if (reason === "blur") fireEvent.blur(window);
    if (reason === "external") fireEvent.click(screen.getByRole("button", { name: "Replace from server" }));
    if (reason === "disabled") result.rerender(<Harness disabled />);
    if (reason === "scope") result.rerender(<Harness scope="work-b" />);
    fireEvent.pointerUp(map(), { pointerId: 1, clientX: 150, clientY: 140 });
    expect(current().props[0]!.x).toBe(100); expect(screen.getByRole("button", { name: "Undo layout" }).matches(":disabled")).toBe(true);
  });
  it("uses touch-friendly alternative buttons and keeps typed-input undo native", () => {
    render(<Harness />); fireEvent.click(screen.getByRole("checkbox", { name: "prop-a" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 오른쪽 이동" })); expect(current().props[0]!.x).toBe(116);
    fireEvent.keyDown(map(), { key: "ArrowLeft", shiftKey: true }); expect(current().props[0]!.x).toBe(100);
    expect(fireEvent.keyDown(screen.getByLabelText("표시 너비"), { key: "z", ctrlKey: true })).toBe(true);
    expect(current().props[0]!.x).toBe(100);
    fireEvent.keyDown(map(), { key: "z", ctrlKey: true }); expect(current().props[0]!.x).toBe(116);
  });
  it("does not snap a simple click, move a locked selection, or pretend baked art is movable", () => {
    render(<Harness />);
    fireEvent.pointerDown(prop(), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(map(), { pointerId: 1, clientX: 100, clientY: 100 });
    expect(current().props[0]!.x).toBe(100); expect(screen.getByRole("button", { name: "Undo layout" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "편집 잠금 전환" }));
    expect(screen.getByRole("button", { name: "선택 오른쪽 이동" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "선택 해제" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "painted · 배경 고정" }));
    expect(screen.getByRole("button", { name: "선택 오른쪽 이동" }).matches(":disabled")).toBe(true);
    const scope = screen.getByRole("group", { name: "선택 배치 조정" });
    expect(within(scope).getByRole("button", { name: "선택 소품 복제" }).matches(":disabled")).toBe(true);
  });
  it("clears prior selection after external replacement instead of retargeting its index", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: "prop-a" }));
    expect(screen.getByRole("checkbox", { name: "prop-a" })).toHaveProperty("checked", true);
    fireEvent.click(screen.getByRole("button", { name: "Replace from server" }));
    expect(screen.getByRole("checkbox", { name: "prop-a" })).toHaveProperty("checked", false);
    expect(screen.getByRole("button", { name: "선택 오른쪽 이동" }).matches(":disabled")).toBe(true);
    fireEvent.keyDown(map(), { key: "ArrowRight" });
    expect(current().props[0]!.x).toBe(100);
  });
  it("rejects a proposal outside the map and retains the original world", () => {
    render(<Harness />); fireEvent.pointerDown(prop(), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(map(), { pointerId: 1, clientX: 510, clientY: 100 });
    expect(current().props[0]!.x).toBe(100); expect(within(screen.getByRole("region", { name: "직접 배치 편집" })).getByRole("status").textContent).toContain("초안은 변경하지 않았습니다");
  });
});
