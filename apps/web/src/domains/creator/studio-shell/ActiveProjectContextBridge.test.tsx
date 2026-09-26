// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveProjectContextBridge } from "./ActiveProjectContextBridge";

import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import type { PropsWithChildren } from "react";

const fixtures = vi.hoisted(() => ({
  projects: [] as StudioProjectLibraryEntry[],
}));

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
}));

vi.mock("@/shared/navigation/router-link", () => ({
  default: ({ children, href, ...props }: PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("./useStudioProjectLibrary", () => ({
  useStudioProjectLibrary: () => ({
    projects: fixtures.projects,
    state: null,
    error: null,
    reload: vi.fn(),
    rename: vi.fn(),
    duplicate: vi.fn(),
    archive: vi.fn(),
    activate: vi.fn(),
    trash: vi.fn(),
    restore: vi.fn(),
    removePermanently: vi.fn(),
    touch: vi.fn(),
  }),
}));

function project(id: string, title: string, lastOpenedAt: string): StudioProjectLibraryEntry {
  return {
    id,
    title,
    kind: "webtoon",
    status: "active",
    statusBeforeTrash: null,
    templateId: null,
    description: "",
    primaryLocale: "ko-KR",
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: lastOpenedAt,
    lastOpenedAt,
    lastOpenedDocumentId: null,
    thumbnailUrl: null,
    definition: null,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  fixtures.projects = [
    project("project-a", "최근 작품", "2026-09-26T02:00:00.000Z"),
    project("project-b", "두 번째 작품", "2026-09-25T02:00:00.000Z"),
  ];
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("ActiveProjectContextBridge", () => {
  it("lets the user switch the active work and rewrites every contextual action", () => {
    render(
      <MemoryRouter initialEntries={["/market"]}>
        <ActiveProjectContextBridge />
      </MemoryRouter>,
    );

    const selector = screen.getByRole("combobox", { name: "현재 작품 선택" }) as HTMLSelectElement;
    expect(selector.value).toBe("project-a");
    expect(screen.getByRole("link", { name: /이 작품에 소재 추가/ }).getAttribute("href")).toBe(
      "/studio/assets?project=project-a&view=market",
    );

    fireEvent.change(selector, { target: { value: "project-b" } });

    expect(selector.value).toBe("project-b");
    expect(window.sessionStorage.getItem("toonstudio:active-project-context:v1")).toBe("project-b");
    expect(screen.getByRole("link", { name: /이 작품에 소재 추가/ }).getAttribute("href")).toBe(
      "/studio/assets?project=project-b&view=market",
    );
    expect(screen.getByRole("link", { name: /프로젝트/ }).getAttribute("href")).toBe(
      "/studio/p/project-b/overview",
    );
  });

  it("keeps a single active work compact without rendering a redundant selector", () => {
    fixtures.projects = [project("project-a", "한 작품", "2026-09-26T02:00:00.000Z")];

    render(
      <MemoryRouter initialEntries={["/research"]}>
        <ActiveProjectContextBridge />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("한 작품")).toBeTruthy();
    expect(screen.getByRole("link", { name: /이 작품의 리서치로 저장/ }).getAttribute("href")).toBe(
      "/research?project=project-a",
    );
  });
});
