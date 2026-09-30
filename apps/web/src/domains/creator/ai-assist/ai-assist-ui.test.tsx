// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiAssistDock, type AiFeatureId } from "./AiAssistDock";
import { AiEmptyStateArt, AiFeatureArt } from "./AiFeatureArt";
import { AiWorkflowDiagram } from "./AiWorkflowDiagram";
import { AiStrokeStudio } from "./AiStrokeStudio";
import { AiPerspectiveStudio } from "./AiPerspectiveStudio";
import { AiBalloonStudio } from "./AiBalloonStudio";
import { AiLightGuidePanel } from "./AiLightGuidePanel";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.classList.remove("ai-assist-page");
});

describe("AiFeatureArt", () => {
  const features: readonly AiFeatureId[] = ["color", "stroke", "perspective", "balloon"];
  it.each(features)("기능 %s의 일러스트 프레임을 렌더한다", (feature) => {
    const { container } = render(<AiFeatureArt feature={feature} />);
    const frame = container.querySelector(".ai-art__frame");
    expect(frame).not.toBeNull();
    expect(frame?.querySelector("svg.ai-art")).not.toBeNull();
  });

  it("빈 상태 대형 일러스트를 렌더한다", () => {
    const { container } = render(<AiEmptyStateArt />);
    expect(container.querySelector("svg.ai-studio__empty-art")).not.toBeNull();
  });
});

describe("AiWorkflowDiagram", () => {
  it("3단계 도식을 list/listitem 시맨틱으로 렌더한다", () => {
    render(<AiWorkflowDiagram />);
    expect(screen.getByRole("list", { name: "AI 채색 동작 방식" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("탭으로 힌트 배치")).toBeTruthy();
    expect(screen.getByText("AI가 채색")).toBeTruthy();
    expect(screen.getByText("비교하고 다듬기")).toBeTruthy();
  });

  it("IntersectionObserver가 없으면 즉시 등장 상태가 된다", () => {
    const { container } = render(<AiWorkflowDiagram />);
    expect(container.querySelector(".ai-flow.is-visible")).not.toBeNull();
  });
});

describe("AiAssistDock", () => {
  it("핵심 CTA와 4개 기능 카드를 렌더한다", () => {
    const { container } = render(<AiAssistDock />);
    expect(screen.getByRole("region", { name: "AI 드로잉 어시스턴트" })).toBeTruthy();
    // 카드 4개 + 일러스트 4개
    expect(container.querySelectorAll(".ai-dock__card")).toHaveLength(4);
    expect(container.querySelectorAll(".ai-art__frame")).toHaveLength(4);
    // 4개 기능 모두 시작 가능 (버튼 접근 이름에 기능명 포함)
    expect(screen.getAllByRole("button", { name: /시작하기$/ })).toHaveLength(4);
  });

  it("카운트업 통계를 렌더한다", () => {
    const { container } = render(<AiAssistDock />);
    expect(container.querySelectorAll(".ai-dock__stat")).toHaveLength(3);
    expect(screen.getByText("분위기 팔레트")).toBeTruthy();
  });

  it("시작하기를 누르면 채색 스튜디오로 전환된다", () => {
    render(<AiAssistDock />);
    fireEvent.click(screen.getByRole("button", { name: "AI 자동 채색 시작하기" }));
    // 돌아가기 버튼 + 빈 상태 CTA가 보이면 스튜디오 진입 성공
    expect(screen.getByRole("button", { name: /AI 기능 목록/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "데모 선화로 시작하기" })).toBeTruthy();
  });

  it("돌아가기를 누르면 도크로 복귀한다", () => {
    render(<AiAssistDock />);
    fireEvent.click(screen.getByRole("button", { name: "AI 자동 채색 시작하기" }));
    fireEvent.click(screen.getByRole("button", { name: /AI 기능 목록/ }));
    expect(screen.getByRole("region", { name: "AI 드로잉 어시스턴트" })).toBeTruthy();
  });
});

describe("AiStrokeStudio", () => {
  it("그리기 캔버스와 AI 정리 CTA를 렌더한다", () => {
    render(<AiStrokeStudio />);
    expect(
      screen.getByLabelText("그리기 캔버스 — 마우스나 손가락으로 선을 그어보세요"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "AI 정리 적용" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AI 정리 적용" })).toHaveProperty("disabled", true);
  });
});

describe("AiPerspectiveStudio", () => {
  it("투시 그리드 섹션과 소실점 안내를 렌더한다", () => {
    render(<AiPerspectiveStudio />);
    expect(screen.getByLabelText("AI 투시 그리드")).toBeTruthy();
    expect(screen.getByRole("group", { name: "투시 종류" })).toBeTruthy();
  });
});

describe("AiBalloonStudio", () => {
  it("말풍선 배치 섹션과 타입 선택을 렌더한다", () => {
    render(<AiBalloonStudio />);
    expect(screen.getByLabelText("AI 말풍선 배치")).toBeTruthy();
    expect(screen.getByRole("group", { name: "말풍선 타입" })).toBeTruthy();
  });
});

describe("AiLightGuidePanel", () => {
  it("광원 방향 선택 UI를 렌더한다", () => {
    const { container } = render(
      <AiLightGuidePanel bounds={{ x: 10, y: 10, width: 100, height: 100 }} canvasSize={320} intensity={0.7} />,
    );
    expect(container.querySelector(".ai-light")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "그림자·하이라이트 가이드" })).toBeTruthy();
  });

  it("bounds가 없으면 빈 상태 안내를 렌더한다", () => {
    const { container } = render(<AiLightGuidePanel bounds={null} canvasSize={320} intensity={0.7} />);
    expect(container.querySelector(".ai-light__empty")).not.toBeNull();
    expect(screen.getByText("AI 채색을 먼저 실행하면 음영 가이드를 볼 수 있어요")).toBeTruthy();
  });
});
