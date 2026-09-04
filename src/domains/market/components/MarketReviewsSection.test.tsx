// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { MarketReviewsSection } from "./MarketReviewsSection";

describe("MarketReviewsSection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders ratings breakdown and allows writing a review", () => {
    render(<MarketReviewsSection resourceId="test-reviews-res-1" />);

    expect(screen.getByRole("heading", { name: /작가 평점 & 활용 리뷰/i })).toBeDefined();

    // Open review form
    const writeBtn = screen.getByRole("button", { name: /리뷰 작성하기/i });
    fireEvent.click(writeBtn);

    // Form inputs should be visible
    const titleInput = screen.getByPlaceholderText(/선화 추출과 투시 구도 잡을 때 필수입니다/i);
    fireEvent.change(titleInput, { target: { value: "작업 속도 대폭 향상" } });

    const textarea = screen.getByPlaceholderText(/스튜디오에서 어떻게 활용하셨는지/i);
    fireEvent.change(textarea, { target: { value: "선화 작업 속도가 진짜 획기적으로 줄어들었습니다. 최고예요!" } });

    // Submit review
    const submitBtn = screen.getByRole("button", { name: /리뷰 등록하기/i });
    fireEvent.click(submitBtn);

    // Submitted review should appear in the list
    expect(screen.getByText("선화 작업 속도가 진짜 획기적으로 줄어들었습니다. 최고예요!")).toBeDefined();
  });
});
