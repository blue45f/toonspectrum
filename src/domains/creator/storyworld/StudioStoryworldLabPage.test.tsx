// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORYWORLD_DEMO_PROJECT } from "./studio-storyworld-causality";
import { StudioStoryworldLabPage } from "./StudioStoryworldLabPage";

function page(workId: string) {
  return (
    <MemoryRouter>
      <StudioStoryworldLabPage key={workId} workId={workId} remixSourceWorkId={null} />
    </MemoryRouter>
  );
}

function editProject(title: string) {
  fireEvent.click(screen.getByRole("button", { name: "원본 데이터" }));
  fireEvent.change(screen.getByRole("textbox", { name: "스토리월드 JSON" }), {
    target: { value: JSON.stringify({ ...STORYWORLD_DEMO_PROJECT, id: "authored-test", title }) },
  });
  fireEvent.click(screen.getByRole("button", { name: "적용 후 분석" }));
}

describe("Storyworld actual page integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("uses the real href-based Link contract and labels demo data", () => {
    render(page("work-first"));
    expect(screen.getByRole("link", { name: "Studio 편집기로 돌아가기" }).getAttribute("href"))
      .toBe("/studio/work/work-first/canvas");
    expect(screen.getByText(/예시 데이터 ·/)).toBeTruthy();
    expect(screen.getByLabelText("스토리월드 JSON 가져오기")).toBeTruthy();
    expect(screen.getByText(/캔버스 원고와 자동 연결되지 않은 로컬 실험/)).toBeTruthy();
  });

  it("opens each user-facing analysis surface", () => {
    render(page("work-tabs"));
    for (const label of ["모순·위험", "멀티버스", "인물 지식", "서사 계약", "창의 기능 지도", "원본 데이터", "대시보드"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(label);
    }
  });

  it("saves validated authored JSON under this document identity", () => {
    render(page("work-save"));
    editProject("내가 만든 세계");
    act(() => vi.advanceTimersByTime(300));
    const saved = window.localStorage.getItem("toonspectrum:storyworld-lab:v1:work:work-save");
    expect(JSON.parse(saved ?? "null").project.title).toBe("내가 만든 세계");
  });

  it("does not overwrite another work when the keyed route changes", () => {
    const view = render(page("work-a"));
    editProject("A의 사적인 초안");
    act(() => vi.advanceTimersByTime(300));
    view.rerender(page("work-b"));
    act(() => vi.advanceTimersByTime(300));
    const a = JSON.parse(window.localStorage.getItem("toonspectrum:storyworld-lab:v1:work:work-a") ?? "null");
    const b = JSON.parse(window.localStorage.getItem("toonspectrum:storyworld-lab:v1:work:work-b") ?? "null");
    expect(a.project.title).toBe("A의 사적인 초안");
    expect(b.project.title).toBe(STORYWORLD_DEMO_PROJECT.title);
    const router = readFileSync(new URL("../studio-router/StudioRouter.tsx", import.meta.url), "utf8");
    expect(router).toContain("key={resolution.lifecycleKey}");
  });

  it("keeps the current project after malformed JSON is rejected", () => {
    render(page("work-invalid"));
    fireEvent.click(screen.getByRole("button", { name: "원본 데이터" }));
    fireEvent.change(screen.getByRole("textbox", { name: "스토리월드 JSON" }), { target: { value: "{broken" } });
    fireEvent.click(screen.getByRole("button", { name: "적용 후 분석" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => vi.advanceTimersByTime(300));
    const saved = JSON.parse(window.localStorage.getItem("toonspectrum:storyworld-lab:v1:work:work-invalid") ?? "null");
    expect(saved.project.title).toBe(STORYWORLD_DEMO_PROJECT.title);
  });

  it("rejects excessive scene counts before analysis", () => {
    render(page("work-budget"));
    fireEvent.click(screen.getByRole("button", { name: "원본 데이터" }));
    const oversized = { ...STORYWORLD_DEMO_PROJECT, scenes: Array.from({ length: 257 }, (_, i) => ({ id: `s-${i}`, title: "장면", order: i })) };
    fireEvent.change(screen.getByRole("textbox", { name: "스토리월드 JSON" }), { target: { value: JSON.stringify(oversized) } });
    fireEvent.click(screen.getByRole("button", { name: "적용 후 분석" }));
    expect(screen.getByRole("alert").textContent).toContain("장면 256개");
  });

  it("reports storage failures instead of claiming a durable save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(page("work-quota"));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText("저장 실패")).toBeTruthy();
    expect(screen.getByText(/브라우저 저장 공간에 쓰지 못했습니다/)).toBeTruthy();
  });
});
