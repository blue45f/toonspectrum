// @vitest-environment jsdom
/**
 * Reduced-motion coverage for the workspace page lives in its own file on purpose:
 * motion v12 caches the reduced-motion preference per module registry on the first
 * mount, so a matchMedia stub flipped mid-file would be ignored by later mounts.
 * Vitest isolates files, which makes this file's `true` stub deterministic.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { createStudioProject } from "../studio-project-library-store";
import { StudioWorkspacePage } from "./StudioWorkspacePage";

const state = vi.hoisted(() => ({
  projects: [] as StudioProjectLibraryEntry[],
  reload: vi.fn(),
  setMode: vi.fn(),
}));
vi.mock("./StudioWorkspaceLiveHome", () => ({ StudioWorkspaceLiveHome: () => null }));
vi.mock("../studio-shell/useStudioProjectLibrary", () => ({ useStudioProjectLibrary: () => ({
  projects: state.projects, state: { schemaVersion: 1, projects: state.projects },
  error: null, reload: state.reload,
}) }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => ({ data: null }) }));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
vi.mock("@/shared/lib/creator-experience-mode", () => ({
  useCreatorExperienceMode: (selector: (value: typeof state) => unknown) => selector({ mode: "classic" as const, setMode: state.setMode }),
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
  stubMatchMedia(true);
  state.projects = [makeProject("older", "2026-09-19T00:00:00.000Z")];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("studio workspace page under reduced motion", () => {
  it("mounts the context panel without an entrance animation", () => {
    render(<App entries={["/home?project=older&panel=tools"]} />);
    const motion = document.querySelector<HTMLElement>(".workspace-panel-motion");
    expect(motion).toBeTruthy();
    // initial={false}: no entrance offset — motion keeps the transform at identity.
    expect(motion?.style.transform).toBe("none");
  });

  it("removes the context panel without an exit animation", async () => {
    render(<App entries={["/home?project=older&panel=tools"]} />);
    expect(document.querySelector(".workspace-panel-motion aside")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));
    await waitFor(() => expect(document.querySelector(".workspace-panel-motion")).toBeNull());
  });
});
