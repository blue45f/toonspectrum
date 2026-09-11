// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioProjectFeatureSuitePanel } from "./StudioProjectFeatureSuitePanel";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectFeatureSuitePanel", () => {
  it("edits and persists storyboard beats from the Story project view", async () => {
    render(
      <StudioProjectFeatureSuitePanel
        projectId="project-story"
        section="story"
        view="script"
        locale="ko"
      />,
    );

    await screen.findByRole("heading", { name: "대본에서 컷 계획 만들기" });
    fireEvent.change(screen.getByPlaceholderText("장면에서 일어나는 핵심 사건"), {
      target: { value: "새로운 장면을 발견한다" },
    });
    fireEvent.change(screen.getByPlaceholderText("선택 사항: 주요 대사"), {
      target: { value: "여기였구나." },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(await screen.findByText("새로운 장면을 발견한다")).toBeInTheDocument();
    expect(window.localStorage.length).toBeGreaterThan(0);
  });

  it("exposes the connected 3D and voice workflows in the render view", async () => {
    render(
      <StudioProjectFeatureSuitePanel
        projectId="project-render"
        section="production"
        view="renders"
        locale="ko"
      />,
    );

    await screen.findByRole("heading", { name: "웹툰용 3D 분리 출력" });
    expect(screen.getByRole("heading", { name: "대사와 장면 타이밍 연결" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "color" })).toBeInTheDocument();
    expect(screen.getByLabelText("대표 대사")).toBeInTheDocument();
  });

  it("requires confirmation only for external automation steps", async () => {
    render(
      <StudioProjectFeatureSuitePanel
        projectId="project-automation"
        section="settings"
        view="automation"
        locale="ko"
      />,
    );

    await screen.findByRole("heading", { name: "안전한 작업은 자동으로, 외부 작업은 확인 후" });
    const allow = screen.getByRole("button", { name: "이 단계 허용" });
    fireEvent.click(allow);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "이 단계 허용" })).toBeNull();
      expect(screen.getByRole("button", { name: "허용 취소" })).toBeInTheDocument();
    });
  });
});
