// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorHubPage } from "./CreatorHubPage";
import { RESEARCH_DESK_SESSION_KEY } from "./research-desk-session";
import { RESEARCH_NOTEBOOK_KEY } from "./research-notebook";

import type { CreatorResource, CreatorWorkspace } from "@/shared/lib/creator-resources";

import { CREATOR_WORKSPACE_KEY } from "@/shared/lib/creator-workspace-persistence";

vi.mock("./ProviderStatus", () => ({ ProviderStatus: () => <p>provider-status-loaded</p> }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;
}

function resource(): CreatorResource {
  return {
    id: "met:costume",
    provider: "met",
    title: "Costume reference",
    creator: "Museum creator",
    description: "Detailed visual reference",
    sourceUrl: "https://www.metmuseum.org/art/collection/search/1",
    imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP251139.jpg",
    license: "CC0",
    licenseUrl: "",
    credit: "The Met",
    fetchedAt: "2026-09-09T00:00:00.000Z",
  };
}

function workspace(saved: CreatorResource[] = []): CreatorWorkspace {
  return { version: 1, saved, story: {}, checks: [] };
}

function renderPage() {
  return render(<MemoryRouter initialEntries={["/research"]}><CreatorHubPage /><LocationProbe /></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    locks: { request: async (_name: string, _options: unknown, operation: () => unknown) => operation() },
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("research synthesis workspace", () => {
  it("persists a source-linked observation and lets the creator reclassify it as a scene decision", async () => {
    localStorage.setItem(CREATOR_WORKSPACE_KEY, JSON.stringify(workspace([resource()])));
    renderPage();
    const synthesis = screen.getByRole("heading", { name: "자료를 장면 선택으로 바꾸는 판단 노트" }).closest("section")!;
    const noteText = "역무실 시계는 출입문 맞은편에서 보인다.";

    fireEvent.change(within(synthesis).getByLabelText("확인한 근거"), { target: { value: noteText } });
    fireEvent.click(within(synthesis).getByRole("checkbox", { name: /Costume reference/u }));
    fireEvent.click(within(synthesis).getByRole("button", { name: "노트 저장" }));

    expect(await within(synthesis).findByText(noteText)).toBeTruthy();
    expect(within(synthesis).getByRole("link", { name: "Costume reference ↗" })).toBeTruthy();
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem(RESEARCH_NOTEBOOK_KEY)!) as { entries: Array<{ kind: string; sourceIds: string[] }> };
      expect(persisted.entries).toHaveLength(1);
      expect(persisted.entries[0]).toMatchObject({ kind: "observation", sourceIds: ["met:costume"] });
    });

    fireEvent.change(within(synthesis).getByLabelText(`${noteText} 노트 유형`), { target: { value: "decision" } });
    expect(await within(synthesis).findByRole("link", { name: "Story Lab에 반영" })).toBeTruthy();
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem(RESEARCH_NOTEBOOK_KEY)!) as { entries: Array<{ kind: string }> };
      expect(persisted.entries[0]!.kind).toBe("decision");
    });
  });

  it("turns an open question into a bounded provider search and records the launch in the desk session", async () => {
    renderPage();
    const synthesis = screen.getByRole("heading", { name: "자료를 장면 선택으로 바꾸는 판단 노트" }).closest("section")!;
    const question = "1920년대 야간 역무원이 사용한 휴대 조명의 연료는 무엇인가?";

    fireEvent.click(within(synthesis).getByRole("button", { name: "질문" }));
    const input = within(synthesis).getByLabelText("남은 불확실성");
    fireEvent.change(input, { target: { value: question } });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(await within(synthesis).findByText(question)).toBeTruthy();

    fireEvent.click(within(synthesis).getByRole("button", { name: "이 질문 조사" }));
    expect(screen.getByTestId("location").textContent).toContain("/research/assets?q=");
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem(RESEARCH_DESK_SESSION_KEY)!) as { history: Array<{ query: string }> };
      expect(persisted.history[0]!.query).toBe(question);
    });
  });
});
