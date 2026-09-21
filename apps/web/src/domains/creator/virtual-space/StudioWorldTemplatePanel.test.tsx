// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioWorldTemplatePanel } from "./StudioWorldTemplatePanel";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { useStudioWorldEditHistory } from "./studio-virtual-space-world-edit-history";

const io = vi.hoisted(() => ({ pin: vi.fn(), parse: vi.fn(), verify: vi.fn(), export: vi.fn() }));
vi.mock("./studio-world-template-package", async (original) => ({ ...await original<typeof import("./studio-world-template-package")>(),
  pinStudioWorldAssets: io.pin, parseStudioWorldTemplatePackage: io.parse, verifyStudioWorldTemplatePackage: io.verify,
  createStudioWorldTemplatePackage: io.export }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function Harness({ scope = "world-a", disabled = false }: { scope?: string; disabled?: boolean }) {
  const [world, setWorld] = useState(() => ({ ...DEFAULT_STUDIO_WORLD_MANIFEST }));
  const history = useStudioWorldEditHistory({ manifest: world, projectId: scope, disabled, onChange: setWorld });
  return <><StudioWorldTemplatePanel world={world} scope={scope} disabled={disabled} onChange={history.change} />
    <button onClick={history.undo} disabled={!history.canUndo}>Undo template</button><output data-testid="world">{JSON.stringify(world)}</output></>;
}
const current = () => JSON.parse(screen.getByTestId("world").textContent!) as typeof DEFAULT_STUDIO_WORLD_MANIFEST;
describe("staged template and pinning edits", () => {
  it("never replaces the world until the visible confirmation is checked and applied", () => {
    render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "개인 집중 구성" }));
    expect(current().npcs).toHaveLength(DEFAULT_STUDIO_WORLD_MANIFEST.npcs.length);
    const apply = screen.getByRole("button", { name: "확인한 구성 적용" }); expect(apply.matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /^현재 공간 초안의 구성이/u }));
    fireEvent.click(apply); expect(current().npcs).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Undo template" })); expect(current().npcs).toEqual(DEFAULT_STUDIO_WORLD_MANIFEST.npcs);
  });
  it("preserves the draft when a staged template is cancelled", () => {
    render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "검수 시작 구성" }));
    fireEvent.click(screen.getByRole("button", { name: "구성 선택 취소" }));
    expect(screen.queryByRole("button", { name: "확인한 구성 적용" })).toBeNull(); expect(current()).toEqual(DEFAULT_STUDIO_WORLD_MANIFEST);
  });
  it.each(["scope", "disabled", "cancel"])("rejects late asset verification after %s", async (cause) => {
    let finish!: (world: typeof DEFAULT_STUDIO_WORLD_MANIFEST) => void;
    io.pin.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "현재 자산 검증·고정" }));
    if (cause === "scope") view.rerender(<Harness scope="world-b" />);
    if (cause === "disabled") view.rerender(<Harness disabled />);
    if (cause === "cancel") fireEvent.click(screen.getByRole("button", { name: "검증 취소" }));
    await act(async () => finish({ ...DEFAULT_STUDIO_WORLD_MANIFEST, version: 999 }));
    expect(current().version).toBe(DEFAULT_STUDIO_WORLD_MANIFEST.version);
    expect(screen.queryByRole("button", { name: "확인한 구성 적용" })).toBeNull();
  });
});
