// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceWorldAuthoringPanel } from "./StudioVirtualSpaceWorldAuthoringPanel";
import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

afterEach(cleanup);
const initial = (): StudioVirtualSpaceWorldManifest => ({ ...DEFAULT_STUDIO_WORLD_MANIFEST,
  props: [{ id: "test-desk", kind: "solid", x: 100, y: 150, width: 64, height: 32,
    collider: { x: 90, y: 160, width: 48, height: 16 } }],
  npcs: [],
  npcActivityAnchors: [],
});
function Editor({ projectId = "work-a", revision = "revision-a", disabled = false }: {
  projectId?: string; revision?: string; disabled?: boolean;
}) {
  const [manifest, setManifest] = useState(initial);
  return <>
    <button onClick={() => setManifest({ ...initial(), version: 999 })}>External replacement</button>
    <StudioVirtualSpaceWorldAuthoringPanel projectId={projectId} manifest={manifest}
      basePublishedRevisionId={revision} disabled={disabled} onChange={setManifest} onReset={() => setManifest(initial())} />
    <output data-testid="manifest">{JSON.stringify(manifest)}</output>
  </>;
}
const current = (): StudioVirtualSpaceWorldManifest => JSON.parse(screen.getByTestId("manifest").textContent!);
const undo = () => screen.getByRole("button", { name: "실행 취소" });
const redo = () => screen.getByRole("button", { name: "다시 실행" });
const editName = (name: string) => fireEvent.change(screen.getByLabelText("Label KO"), { target: { value: name } });

describe("world authoring editing continuity", () => {
  it("undoes and redoes the actual controlled form", () => {
    render(<Editor />);
    const before = current().rooms[0]!.labelKo;
    expect(undo().matches(":disabled")).toBe(true); expect(redo().matches(":disabled")).toBe(true);
    editName("수정한 방"); expect(current().rooms[0]!.labelKo).toBe("수정한 방");
    fireEvent.click(undo()); expect(current().rooms[0]!.labelKo).toBe(before);
    fireEvent.click(redo()); expect(current().rooms[0]!.labelKo).toBe("수정한 방");
  });
  it("supports touch nudge buttons with a shared collider and a single undo", () => {
    render(<Editor />); fireEvent.click(screen.getByRole("button", { name: /^소품/u }));
    fireEvent.click(screen.getByRole("button", { name: "오른쪽으로" }));
    expect(current().props[0]!.x).toBe(108); expect(current().props[0]!.collider!.x).toBe(98);
    fireEvent.click(undo()); expect(current().props[0]!.x).toBe(100); expect(current().props[0]!.collider!.x).toBe(90);
    fireEvent.change(screen.getByLabelText("이동 간격"), { target: { value: "16" } });
    fireEvent.click(screen.getByRole("button", { name: "아래로" }));
    expect(current().props[0]!.y).toBe(166); expect(current().props[0]!.collider!.y).toBe(176);
    expect(redo().matches(":disabled")).toBe(true);
  });
  it("also links collider movement for typed coordinates", () => {
    render(<Editor />); fireEvent.click(screen.getByRole("button", { name: /^소품/u }));
    fireEvent.change(screen.getAllByLabelText("X")[0]!, { target: { value: "120" } });
    expect(current().props[0]!.collider!.x).toBe(110);
  });
  it("keeps native input undo and composition separate from world undo", () => {
    render(<Editor />); editName("입력 중");
    const input = screen.getByLabelText("Label KO");
    expect(fireEvent.keyDown(input, { key: "z", ctrlKey: true })).toBe(true);
    expect(current().rooms[0]!.labelKo).toBe("입력 중");
    fireEvent.keyDown(undo(), { key: "z", ctrlKey: true, isComposing: true });
    expect(current().rooms[0]!.labelKo).toBe("입력 중");
    fireEvent.keyDown(undo(), { key: "z", ctrlKey: true });
    expect(current().rooms[0]!.labelKo).toBe(initial().rooms[0]!.labelKo);
    fireEvent.keyDown(redo(), { key: "z", ctrlKey: true, shiftKey: true });
    expect(current().rooms[0]!.labelKo).toBe("입력 중");
  });
  it.each(["work", "publication", "disabled"])("does not replay edits after %s scope changes", (scope) => {
    const view = render(<Editor />); editName("이전 범위"); expect(undo().matches(":disabled")).toBe(false);
    view.rerender(<Editor projectId={scope === "work" ? "work-b" : "work-a"}
      revision={scope === "publication" ? "revision-b" : "revision-a"} disabled={scope === "disabled"} />);
    expect(undo().matches(":disabled")).toBe(true); expect(redo().matches(":disabled")).toBe(true);
    fireEvent.click(undo()); expect(current().rooms[0]!.labelKo).toBe("이전 범위");
  });
  it("clears stale history when the parent replaces the draft", () => {
    render(<Editor />); editName("내 초안");
    fireEvent.click(screen.getByRole("button", { name: "External replacement" }));
    expect(current().version).toBe(999); expect(undo().matches(":disabled")).toBe(true);
  });
  it("treats an imported document as one undoable edit", async () => {
    const view = render(<Editor />);
    const imported = { ...initial(), version: 78 };
    await act(async () => {
      fireEvent.change(view.container.querySelector("input[type=file]")!, { target: { files: [{ text: async () => JSON.stringify(imported) }] } });
    });
    expect(current().version).toBe(78); fireEvent.click(undo()); expect(current().version).toBe(initial().version);
  });
  it("does not let a late import overwrite a newer local edit", async () => {
    let complete!: (value: string) => void;
    const file = { text: () => new Promise<string>((resolve) => { complete = resolve; }) };
    const view = render(<Editor />);
    fireEvent.change(view.container.querySelector("input[type=file]")!, { target: { files: [file] } });
    editName("새 편집 보존");
    await act(async () => complete(JSON.stringify({ ...initial(), version: 78 })));
    expect(current().rooms[0]!.labelKo).toBe("새 편집 보존"); expect(current().version).not.toBe(78);
  });
  it("does not apply a late import to a different work", async () => {
    let complete!: (value: string) => void;
    const file = { text: () => new Promise<string>((resolve) => { complete = resolve; }) };
    const view = render(<Editor />);
    fireEvent.change(view.container.querySelector("input[type=file]")!, { target: { files: [file] } });
    view.rerender(<Editor projectId="work-b" />);
    await act(async () => complete(JSON.stringify({ ...initial(), version: 78 })));
    expect(current().version).toBe(initial().version); expect(undo().matches(":disabled")).toBe(true);
  });
  it("explains that anchor-only props cannot move the painted background", () => {
    render(<Editor />); fireEvent.click(screen.getByRole("button", { name: /^소품/u }));
    expect(screen.getByRole("note").textContent).toContain("배경 그림은 이동하지 않습니다");
    fireEvent.change(screen.getByLabelText("Asset URL"), { target: { value: "/assets/independent-desk.png" } });
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(undo());
    expect(screen.getByRole("note").textContent).toContain("배경 그림은 이동하지 않습니다");
  });
  it.each(["publication", "disabled"])("rejects a late import after %s changes", async (scope) => {
    let complete!: (value: string) => void;
    const file = { text: () => new Promise<string>((resolve) => { complete = resolve; }) };
    const view = render(<Editor />);
    fireEvent.change(view.container.querySelector("input[type=file]")!, { target: { files: [file] } });
    view.rerender(<Editor revision={scope === "publication" ? "revision-b" : "revision-a"} disabled={scope === "disabled"} />);
    await act(async () => complete(JSON.stringify({ ...initial(), version: 78 })));
    expect(current().version).toBe(initial().version);
    expect(undo().matches(":disabled")).toBe(true);
  });
  it("keeps the last selected import when file reads finish out of order", async () => {
    let completeFirst!: (value: string) => void;
    const first = { text: () => new Promise<string>((resolve) => { completeFirst = resolve; }) };
    const second = { text: async () => JSON.stringify({ ...initial(), version: 79 }) };
    const view = render(<Editor />);
    const input = view.container.querySelector("input[type=file]")!;
    fireEvent.change(input, { target: { files: [first] } });
    await act(async () => { fireEvent.change(input, { target: { files: [second] } }); });
    await act(async () => completeFirst(JSON.stringify({ ...initial(), version: 78 })));
    expect(current().version).toBe(79);
    fireEvent.click(undo()); expect(current().version).toBe(initial().version);
  });
  it("does not call the draft owner after an importing editor unmounts", async () => {
    let complete!: (value: string) => void;
    const onChange = vi.fn();
    const view = render(<StudioVirtualSpaceWorldAuthoringPanel projectId="work-a" manifest={initial()} onChange={onChange} onReset={vi.fn()} />);
    fireEvent.change(view.container.querySelector("input[type=file]")!, {
      target: { files: [{ text: () => new Promise<string>((resolve) => { complete = resolve; }) }] },
    });
    view.unmount();
    await act(async () => complete(JSON.stringify({ ...initial(), version: 78 })));
    expect(onChange).not.toHaveBeenCalled();
  });
  it("preserves the original draft and reports invalid JSON without adding history", async () => {
    const view = render(<Editor />);
    await act(async () => {
      fireEvent.change(view.container.querySelector("input[type=file]")!, { target: { files: [{ text: async () => "{" }] } });
    });
    expect(current()).toEqual(initial());
    expect(view.container.querySelector(".studio-vspace-authoring-message[role=status]")?.textContent).toBeTruthy();
    expect(undo().matches(":disabled")).toBe(true);
  });
});
