// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioMainMenu } from "../../apps/web/src/domains/creator/StudioMainMenu";

import {
  openStudioShapeCorrectionMenu,
  studioRecoveredStrokeLayerState,
  waitForStudioRecoveredStrokeLayers,
} from "./studio-verify-shape-readiness.mts";

import type { Page } from "playwright";

vi.mock("../../apps/web/src/domains/creator/StudioToolHint", () => ({
  StudioToolHintTarget: ({ children }: { children: import("react").ReactNode }) => <>{children}</>,
}));
vi.mock("../../apps/web/src/domains/creator/studio-main-menu-intent-preload", () => ({
  preloadStudioMainMenuGroupRuntime: vi.fn(),
}));
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.restoreAllMocks(); });

function layers(...ids: string[]) {
  for (const id of ids) {
    const row = document.createElement("div");
    row.id = `studio-layer-${id}`;
    row.dataset.studioLayerRow = "true";
    document.body.append(row);
  }
}

/** Execute the serialized browser predicates against DOM frames, never a persisted document. */
function recoveryPage(frames: (() => void)[], onRestore: () => void = () => {}) {
  const restore = vi.fn(async () => { onRestore(); });
  const page = {
    waitForFunction: async <T, R>(predicate: (arg: T) => R, arg: T) => {
      for (;;) {
        const result = predicate(arg);
        if (result) return { jsonValue: async () => result, dispose: async () => {} };
        const next = frames.shift();
        if (!next) throw new Error("live recovered layers never became ready");
        next();
      }
    },
    locator: (selector: string) => ({ getByRole: (role: "button", options: { name: RegExp }) => ({
      click: async () => {
        const scope = document.querySelector<HTMLElement>(selector);
        if (!scope || !(within(scope).getByRole(role, options) instanceof HTMLButtonElement)) throw new Error("recovery action absent");
        await restore();
      },
    }) }),
  } as unknown as Page;
  return { page, restore };
}

describe("shape cold recovery readiness", () => {
  it("does not equate an absent notice or stored stroke metadata with a hydrated document", () => {
    document.body.innerHTML = '<script type="application/json">{"elements":[{"id":"corrected"}]}</script>';
    expect(studioRecoveredStrokeLayerState(["corrected"])).toBeNull();
    layers("another-page-stroke");
    expect(studioRecoveredStrokeLayerState(["corrected"])).toBeNull();
    layers("corrected");
    expect(studioRecoveredStrokeLayerState(["corrected", "earlier-stroke"])).toBeNull();
    layers("earlier-stroke");
    expect(studioRecoveredStrokeLayerState(["corrected", "earlier-stroke"])).toBe("ready");
    expect(studioRecoveredStrokeLayerState([])).toBeNull();
  });

  it("waits through a late automatic recovery notice until exact live rows and notice removal", async () => {
    const fixture = recoveryPage([
      () => { document.body.innerHTML = '<section data-studio-recovery-notice aria-busy="true">복원 중</section>'; },
      () => { layers("corrected", "earlier-stroke"); },
      () => { document.querySelector("section")?.remove(); },
    ]);
    await waitForStudioRecoveredStrokeLayers(fixture.page, ["corrected", "earlier-stroke"]);
    expect(fixture.restore).not.toHaveBeenCalled();
  });

  it.each(["이어서 그리기", "다시 이어 열기"])("executes one visible %s action and then requires actual restoration", async (label) => {
    const fixture = recoveryPage([
      () => { document.body.innerHTML = `<section data-studio-recovery-notice aria-busy="false"><button>${label}</button></section>`; },
      () => { layers("corrected"); document.querySelector("section")?.remove(); },
    ], () => document.querySelector("section")?.setAttribute("aria-busy", "true"));
    await waitForStudioRecoveredStrokeLayers(fixture.page, ["corrected"]);
    expect(fixture.restore).toHaveBeenCalledOnce();
  });

  it("fails when recovery does not restore the live stroke and never retries that request", async () => {
    document.body.innerHTML = '<section data-studio-recovery-notice><button>이어서 그리기</button></section>';
    const fixture = recoveryPage([]);
    await expect(waitForStudioRecoveredStrokeLayers(fixture.page, ["corrected"]))
      .rejects.toThrow("live recovered layers never became ready");
    expect(fixture.restore).toHaveBeenCalledOnce();
  });

  it("does not invoke a busy, disabled, or blocked recovery action", () => {
    for (const html of [
      '<section data-studio-recovery-notice aria-busy="true"><button>이어서 그리기</button></section>',
      '<section data-studio-recovery-notice><button disabled>다시 이어 열기</button></section>',
      '<section data-studio-recovery-notice><button>백업 파일 받기</button></section>',
    ]) {
      document.body.innerHTML = html;
      expect(studioRecoveredStrokeLayerState(["corrected"])).toBeNull();
    }
  });
});

describe("shape verifier opens the shipped menu", () => {
  it.each([false, true])("preserves selection and leaves an initially open=%s menu available for one command", async (alreadyOpen) => {
    const onSelect = vi.fn();
    const canvasEscape = vi.fn();
    document.addEventListener("keydown", canvasEscape);
    render(<StudioMainMenu groups={[{ id: "create", label: "창작", items: [
      { id: "correct-current-stroke", label: "현재 스트로크 교정", onSelect },
    ] }]} />);
    const trigger = screen.getByRole("menuitem", { name: "창작" });
    if (alreadyOpen) fireEvent.click(trigger);
    const page = {
      locator: (selector: string) => ({ getByRole: (role: "menuitem", options: { name: RegExp }) => {
        const bar = document.querySelector<HTMLElement>(selector)!;
        const button = within(bar).getByRole(role, options);
        return {
          focus: async () => { act(() => { button.focus(); }); },
          press: async (key: string) => { fireEvent.keyDown(button, { key }); },
        };
      } }),
      getByRole: (role: "menu", options: { name: RegExp }) => ({
        waitFor: async () => { await screen.findByRole(role, options); },
      }),
    } as unknown as Page;
    await openStudioShapeCorrectionMenu(page);
    fireEvent.click(within(screen.getByRole("menu", { name: "창작" })).getByRole("menuitem", { name: "현재 스트로크 교정" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(canvasEscape.mock.calls.some(([event]) => event.key === "Escape")).toBe(false);
    document.removeEventListener("keydown", canvasEscape);
  });
});
