// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPaletteHost } from "./command-palette-host";

import {
  resetStudioCommandSearchBridgeForTests,
  subscribeStudioCommandSearchFromAppShell,
} from "@/shared/lib/studio-command-search-bridge";
import { useUi } from "@/shared/lib/ui-store";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mockPush = vi.fn();
vi.mock("@/compat/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@toonspectrum/core/fx", () => ({
  playSfx: vi.fn(),
  getAudioState: () => ({
    sfxEnabled: true,
    bgmEnabled: false,
    muted: false,
    volume: 0.55,
  }),
  setSfxEnabled: vi.fn(),
  setBgmEnabled: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  resetStudioCommandSearchBridgeForTests();
  useUi.setState({ commandPaletteOpen: false });
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  resetStudioCommandSearchBridgeForTests();
  useUi.setState({ commandPaletteOpen: false });
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("CommandPaletteHost → Studio command-search bridge", () => {
  it("routes Cmd+K to the mounted Studio command hub without opening the global palette", () => {
    window.history.replaceState({}, "", "/studio");
    const received: unknown[] = [];
    const unsubscribe = subscribeStudioCommandSearchFromAppShell((request) => {
      received.push(request);
    });
    render(<CommandPaletteHost />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(received).toEqual([{ scope: "all" }]);
    expect(useUi.getState().commandPaletteOpen).toBe(false);
    unsubscribe();
  });

  it("supports Ctrl+K on Studio routes", () => {
    window.history.replaceState({}, "", "/studio/project/episode-1");
    const received: unknown[] = [];
    const unsubscribe = subscribeStudioCommandSearchFromAppShell((request) => {
      received.push(request);
    });
    render(<CommandPaletteHost />);

    fireEvent.keyDown(window, { key: "K", ctrlKey: true });

    expect(received).toEqual([{ scope: "all" }]);
    expect(useUi.getState().commandPaletteOpen).toBe(false);
    unsubscribe();
  });

  it("falls back to the existing global palette when the Studio host is not ready", () => {
    window.history.replaceState({}, "", "/studio");
    render(<CommandPaletteHost />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(useUi.getState().commandPaletteOpen).toBe(true);
  });

  it("keeps the existing global palette shortcut outside Studio", () => {
    render(<CommandPaletteHost />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(useUi.getState().commandPaletteOpen).toBe(true);
  });
});