// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionDemoProject } from "../production-hub/production-demo";
import { StudioVirtualSpaceTodayBoard } from "./StudioVirtualSpaceTodayBoard";
import { studioVirtualProductionDestination } from "./studio-virtual-space-production-route";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";

afterEach(cleanup);

describe("가상 스튜디오 제작 동선", () => {
  it.each([
    ["story", "story"], ["script", "story"], ["story-lock", "story"],
    ["storyboard", "drawing"], ["thumbnail", "drawing"], ["line-art", "drawing"], ["lettering", "drawing"],
    ["asset", "assets"], ["background-3d", "assets"], ["scene-3d", "assets"],
    ["rights-preflight", "review"], ["joint-proof", "review"], ["qc", "review"],
    ["publication", "production"], ["delivery", "production"], ["custom-stage", "production"], ["constructor", "production"],
  ])("%s 공정을 %s 장소로 안내한다", (processKey, destination) => {
    expect(studioVirtualProductionDestination({ processKey, status: "ready" })).toBe(destination);
  });

  it("검수 중인 공정은 원래 제작 장소보다 검수실을 우선한다", () => {
    expect(studioVirtualProductionDestination({ processKey: "story", status: "changes-requested" })).toBe("review");
    expect(studioVirtualProductionDestination({ processKey: "publication", status: "external-review" })).toBe("review");
  });

  it("한글 상태와 구체적 목적지를 표시하고 선택한 작업 장소로 안내한다", () => {
    const aggregate = createProductionDemoProject();
    const template = aggregate.tasks[0];
    if (!template) throw new Error("제작 예시에 기준 작업이 필요합니다.");
    const snapshot: StudioVirtualOperationsSnapshot = {
      phase: "ready", inbox: [], calendar: [], error: null,
      project: {
        access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
        aggregate: { ...aggregate, tasks: [
          { ...template, id: "story", title: "대본 이어쓰기", processKey: "script", status: "in-progress" },
          { ...template, id: "board", title: "콘티 수정", processKey: "storyboard", status: "ready" },
          { ...template, id: "asset", title: "배경 자료", processKey: "asset", status: "needs-input" },
          { ...template, id: "release", title: "출고 준비", processKey: "publication", status: "blocked" },
        ] },
      },
    };
    const onGuide = vi.fn();
    render(<MemoryRouter><StudioVirtualSpaceTodayBoard snapshot={snapshot} workId="sample" onRefresh={vi.fn()} onGuide={onGuide} /></MemoryRouter>);
    for (const [name, destination] of [
      ["대본 이어쓰기: 대본 데스크로 안내", "story"],
      ["콘티 수정: 드로잉 스튜디오로 안내", "drawing"],
      ["배경 자료: 자료실로 안내", "assets"],
      ["출고 준비: 제작 관제실로 안내", "production"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(onGuide).toHaveBeenLastCalledWith(destination);
    }
    expect(screen.getByText(/^작업 중 ·/u)).toBeTruthy();
    expect(screen.getByText(/^입력 자료 대기 ·/u)).toBeTruthy();
    expect(screen.queryByText(/in-progress/u)).toBeNull();
  });
});
