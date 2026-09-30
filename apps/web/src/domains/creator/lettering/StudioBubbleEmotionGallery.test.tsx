// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioBubbleEmotionGallery } from "./StudioBubbleEmotionGallery";

afterEach(cleanup);

describe("StudioBubbleEmotionGallery", () => {
  it("6가지 감정 카드를 렌더링한다", () => {
    render(<StudioBubbleEmotionGallery />);
    for (const label of ["분노", "놀람", "속삭임", "생각", "설렘", "중립"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("대사를 입력하기 전에는 빈 상태 안내를 보여준다", () => {
    render(<StudioBubbleEmotionGallery />);
    expect(screen.getByText("아직 대사가 없어요")).toBeTruthy();
    expect(
      screen.getByText(/위에 대사를 쓰면 6가지 감정 말풍선으로/)
    ).toBeTruthy();
  });

  it("대사를 입력하면 6개 미리보기 말풍선에 대사가 들어간다", () => {
    render(<StudioBubbleEmotionGallery />);
    const textarea = screen.getByLabelText("내 대사로 미리보기");
    fireEvent.change(textarea, { target: { value: "그만해!!!" } });

    // 빈 상태 안내가 사라지고, 6개 미리보기 svg가 생긴다.
    expect(screen.queryByText("아직 대사가 없어요")).toBeNull();
    const previews = screen.getAllByRole("img", {
      name: /말풍선 미리보기$/,
    });
    expect(previews.length).toBeGreaterThanOrEqual(6);
  });

  it("감정 강도 슬라이더가 있다", () => {
    render(<StudioBubbleEmotionGallery />);
    expect(screen.getByLabelText("감정 강도")).toBeTruthy();
  });
});
