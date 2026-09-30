// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { createStudioProject } from "../studio-project-library-store";
import { StudioWorkspacePage } from "./StudioWorkspacePage";
import { WORKSPACE_TOUR_STORAGE_KEY } from "./studio-workspace-tour-state";

const state = vi.hoisted(() => ({
  projects: [] as StudioProjectLibraryEntry[],
  loaded: true,
  error: null as string | null,
  mode: "classic" as "classic" | "virtual-studio",
  reload: vi.fn(),
  setMode: vi.fn(),
}));
vi.mock("./StudioWorkspaceLiveHome", () => ({ StudioWorkspaceLiveHome: () => null }));
vi.mock("../studio-shell/useStudioProjectLibrary", () => ({ useStudioProjectLibrary: () => ({
  projects: state.projects, state: state.loaded ? { schemaVersion: 1, projects: state.projects } : null,
  error: state.error, reload: state.reload,
}) }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => ({ data: null }) }));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
vi.mock("@/shared/lib/creator-experience-mode", () => ({
  useCreatorExperienceMode: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock("@/shared/components/CreatorExperienceModeSwitch", () => ({ CreatorExperienceModeSwitch: () => null }));
vi.mock("@/shared/components/open-search-button", () => ({ OpenSearchButton: () => <button type="button">검색</button> }));
vi.mock("@/shared/components/workspace/WorkspaceContextPanel", () => ({
  WorkspaceContextPanel: ({ open, onClose, children }: { open: boolean; onClose?: () => void; children: ReactNode }) => open ? (
    <aside>
      <button type="button" onClick={onClose}>패널 닫기</button>
      {children}
    </aside>
  ) : null,
}));

const TARGET_RECTS: Record<string, { top: number; left: number; width: number; height: number }> = {
  continue: { top: 100, left: 50, width: 200, height: 60 },
  "quick-actions": { top: 300, left: 50, width: 200, height: 120 },
  tools: { top: 600, left: 900, width: 48, height: 48 },
};

function stubMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reducedMotion && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function stubTargetRects() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const key = this.getAttribute("data-tour-target") ?? "";
    const box = TARGET_RECTS[key];
    if (!box) {
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
    }
    return {
      x: box.left, y: box.top, top: box.top, left: box.left,
      right: box.left + box.width, bottom: box.top + box.height,
      width: box.width, height: box.height, toJSON: () => ({}),
    } as DOMRect;
  });
}

function makeProject(id: string, createdAt: string) {
  const values = new Map<string, string>();
  return createStudioProject({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } },
    { id, title: `작품 ${id}`, kind: "webtoon", createdAt });
}

function App({ entries = ["/home"] }: { entries?: string[] }) {
  return <MemoryRouter initialEntries={entries}><Routes>
    <Route path="/home" element={<StudioWorkspacePage />} />
  </Routes></MemoryRouter>;
}

beforeEach(() => {
  window.localStorage.clear();
  stubMatchMedia(false);
  stubTargetRects();
  state.projects = [makeProject("older", "2026-09-19T00:00:00.000Z")];
  state.loaded = true; state.error = null; state.mode = "classic";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("studio workspace polish wiring", () => {
  it("renders the cinematic continue hero as the tour entry point", () => {
    render(<App entries={["/home?project=older"]} />);
    expect(document.querySelector(".workspace-hero-cinematic")).toBeTruthy();
    const cta = document.querySelector('[data-tour-target="continue"]');
    expect(cta?.getAttribute("href")).toBeTruthy();
    expect(cta?.textContent).toMatch(/원고 이어하기|작품 열기/);
  });

  it("exposes every spotlight tour target on the home surface", () => {
    render(<App entries={["/home?project=older"]} />);
    expect(document.querySelector('[data-tour-target="continue"]')).toBeTruthy();
    expect(document.querySelector('[data-tour-target="quick-actions"]')).toBeTruthy();
    expect(document.querySelector('[data-tour-target="tools"]')).toBeTruthy();
  });

  it("starts the spotlight tour for a first-time visitor", async () => {
    expect(window.localStorage.getItem(WORKSPACE_TOUR_STORAGE_KEY)).toBeNull();
    render(<App entries={["/home?project=older"]} />);
    const dialog = await screen.findByRole("dialog", { name: "스포트라이트 투어" }, { timeout: 5000 });
    expect(dialog.textContent).toContain("작업을 이어가세요");
    expect(document.querySelector(".workspace-tour-ring")).toBeTruthy();
  });

  it("opens the context panel inside a spring motion wrapper", () => {
    render(<App entries={["/home?project=older&panel=tools"]} />);
    expect(document.querySelector(".workspace-panel-motion")).toBeTruthy();
    expect(document.querySelector(".workspace-panel-motion aside")).toBeTruthy();
  });

  it("plays the panel exit before unmounting", async () => {
    render(<App entries={["/home?project=older&panel=tools"]} />);
    expect(document.querySelector(".workspace-panel-motion aside")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));
    // The spring exit keeps the panel mounted briefly instead of vanishing.
    expect(document.querySelector(".workspace-panel-motion aside")).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".workspace-panel-motion")).toBeNull(), { timeout: 5000 });
  });
});
