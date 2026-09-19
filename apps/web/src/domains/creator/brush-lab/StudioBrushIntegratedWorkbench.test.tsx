// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StudioBrushIntegratedWorkbench } from "./StudioBrushIntegratedWorkbench";
import { createBrushStudioV6Program, type BrushStudioV6Program } from "./brush-studio-v6-engine";

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./brush-studio-saved-material-loader", () => ({ loadBrushStudioSavedMaterial: load }));
vi.mock("../MarketplaceBrushStudioBridge", () => ({ MarketplaceBrushStudioBridge: () => null }));
vi.mock("./StudioBrushV6Workbench", () => ({
  StudioBrushV6Workbench: ({ scope, initialProgram }: { scope: string; initialProgram?: BrushStudioV6Program }) =>
    <output data-testid="editor">{scope} · {initialProgram?.name ?? "stored-draft"}</output>,
}));
beforeEach(() => { localStorage.clear(); load.mockReset(); });
afterEach(cleanup);
const view = (scope: string) => <MemoryRouter><StudioBrushIntegratedWorkbench scope={scope} /></MemoryRouter>;

describe("saved material editor routing", () => {
  it("waits for the exact saved brush instead of mounting an autosaving default", async () => {
    let finish!: (value: { program: BrushStudioV6Program; persistent: boolean }) => void;
    load.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(view("brush:saved"));
    expect(screen.queryByTestId("editor")).toBeNull();
    expect(load).toHaveBeenCalledWith("saved");
    const program = { ...createBrushStudioV6Program(), name: "정확한 원본" };
    await act(async () => { finish({ program, persistent: true }); });
    expect(screen.getByTestId("editor").textContent).toContain("정확한 원본");
  });
  it("reports missing originals without substituting a recipe", async () => {
    load.mockRejectedValue(new Error("원본 없음"));
    render(view("brush:missing"));
    expect((await screen.findByRole("alert")).textContent).toContain("원본 없음");
    expect(screen.queryByTestId("editor")).toBeNull();
    expect(localStorage.length).toBe(0);
  });
  it("leaves existing draft validation to the guarded editor", () => {
    localStorage.setItem("toonspectrum.brush-program-v6:brush%3Aexisting", "corrupt-original");
    render(view("brush:existing"));
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByTestId("editor")).toBeTruthy();
    expect(localStorage.getItem("toonspectrum.brush-program-v6:brush%3Aexisting")).toBe("corrupt-original");
  });
  it("ignores a late original after navigating to a different editor", async () => {
    let finish!: (value: { program: BrushStudioV6Program; persistent: boolean }) => void;
    load.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const opened = render(view("brush:first"));
    opened.rerender(view("draft"));
    await act(async () => { finish({ program: { ...createBrushStudioV6Program(), name: "오래된 원본" }, persistent: true }); });
    expect(screen.getByTestId("editor").textContent).toBe("draft · stored-draft");
  });
  it("preserves a newer draft that appeared while the library read was pending", async () => {
    let finish!: (value: { program: BrushStudioV6Program; persistent: boolean }) => void;
    load.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    render(view("brush:saved"));
    localStorage.setItem("toonspectrum.brush-program-v6:brush%3Asaved", "new-draft");
    await act(async () => { finish({ program: createBrushStudioV6Program(), persistent: true }); });
    expect(screen.getByTestId("editor").textContent).toBe("brush:saved · stored-draft");
    expect(localStorage.getItem("toonspectrum.brush-program-v6:brush%3Asaved")).toBe("new-draft");
  });
});
