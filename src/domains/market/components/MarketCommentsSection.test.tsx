// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { MarketCommentsSection } from "./MarketCommentsSection";

describe("MarketCommentsSection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders comment section and allows submitting a new comment", () => {
    render(
      <MarketCommentsSection resourceId="test-comments-res-1" publisherId="author-1" />
    );

    expect(screen.getByRole("heading", { name: /Q&A 및 커뮤니티 피드백/i })).toBeDefined();

    // Type a comment
    const textarea = screen.getByPlaceholderText(/에셋에 대한 궁금한 점이나 피드백/i);
    fireEvent.change(textarea, { target: { value: "안녕하세요! 스튜디오 0.2.0 버전에서도 호환되나요?" } });

    // Submit
    const submitBtn = screen.getByRole("button", { name: /댓글 등록/i });
    fireEvent.click(submitBtn);

    // Comment appears
    expect(screen.getByText("안녕하세요! 스튜디오 0.2.0 버전에서도 호환되나요?")).toBeDefined();
  });
});
