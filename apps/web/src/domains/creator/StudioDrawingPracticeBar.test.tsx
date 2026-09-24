// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioDrawingPracticeDocument } from "./studio-drawing-practice-document";
import { StudioDrawingPracticeBar } from "./StudioDrawingPracticeBar";

const document = createStudioDrawingPracticeDocument({
  attemptId: "attempt-a",
  source: {
    sha256: `sha256:${"a".repeat(64)}`,
    name: "pose.png",
    width: 640,
    height: 480,
  },
  viewport: { canvasWidth: 800, canvasHeight: 1_200 },
});

const defaultProps = {
  document,
  sourceState: "ready" as const,
  compareActive: false,
  onPreviewView: vi.fn(),
  onCommitView: vi.fn(),
  onCancelPreview: vi.fn(),
  onCompareChange: vi.fn(),
  onOpenReferencePanel: vi.fn(),
  onFinish: vi.fn(),
  onRetry: vi.fn(),
  onRemove: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StudioDrawingPracticeBar", () => {
  it("exposes the core accessible trace-practice controls", () => {
    render(<StudioDrawingPracticeBar {...defaultProps} />);
    expect(screen.getByRole("toolbar", { name: "따라 그리기 조작" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "옆에 보기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "원본 숨기기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "배치 잠금" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "따라 그리기 원본 투명도" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "연습 마치기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "가이드 제거" })).toBeTruthy();
  });

  it("commits mode, visibility, compare, retry, finish, and removal actions", () => {
    render(<StudioDrawingPracticeBar {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "옆에 보기" }));
    expect(defaultProps.onCommitView).toHaveBeenCalledWith({ mode: "reference-window" });
    fireEvent.click(screen.getByRole("button", { name: "원본 숨기기" }));
    expect(defaultProps.onCommitView).toHaveBeenCalledWith({ visible: false });
    fireEvent.click(screen.getByRole("button", { name: "비교" }));
    expect(defaultProps.onCompareChange).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "다시 연습" }));
    fireEvent.click(screen.getByRole("button", { name: "연습 마치기" }));
    fireEvent.click(screen.getByRole("button", { name: "가이드 제거" }));
    expect(defaultProps.onRetry).toHaveBeenCalledTimes(1);
    expect(defaultProps.onFinish).toHaveBeenCalledTimes(1);
    expect(defaultProps.onRemove).toHaveBeenCalledTimes(1);
  });

  it("shows a recoverable missing-source state without hiding the artist's work", () => {
    render(<StudioDrawingPracticeBar {...defaultProps} sourceState="missing" />);
    expect(screen.getByRole("alert").textContent).toContain("원본을 찾지 못했어요");
    fireEvent.click(screen.getByRole("button", { name: "레퍼런스 열기" }));
    expect(defaultProps.onOpenReferencePanel).toHaveBeenCalledTimes(1);
  });
});
