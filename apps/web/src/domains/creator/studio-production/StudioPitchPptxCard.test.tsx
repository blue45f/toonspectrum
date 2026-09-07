// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_PITCH_SLIDE_BODY_MAX_LENGTH,
  STUDIO_PITCH_SLIDE_TITLE_MAX_LENGTH,
  StudioPitchPptxCard,
} from "./StudioPitchPptxCard";

afterEach(cleanup);

function renderCard() {
  const onChangeSlide = vi.fn();
  const onNotice = vi.fn();
  render(
    <StudioPitchPptxCard
      title="작품"
      slides={[{ id: "slide-1", title: "기존 제목", body: "기존 본문" }]}
      onChangeSlide={onChangeSlide}
      onAddSlide={vi.fn()}
      onNotice={onNotice}
    />,
  );
  return { onChangeSlide, onNotice };
}

describe("StudioPitchPptxCard", () => {
  it("reverts an empty title without sending an invalid persistence patch", () => {
    const { onChangeSlide, onNotice } = renderCard();
    const input = screen.getByRole("textbox", { name: "제목" });

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(input).toHaveValue("기존 제목");
    expect(onChangeSlide).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledWith("슬라이드 제목은 비워 둘 수 없습니다.");
  });

  it("trims valid title and body patches before persistence", () => {
    const { onChangeSlide } = renderCard();
    const title = screen.getByRole("textbox", { name: "제목" });
    const body = screen.getByRole("textbox", { name: "본문" });

    fireEvent.change(title, { target: { value: "  새 제목  " } });
    fireEvent.blur(title);
    fireEvent.change(body, { target: { value: "  새 본문  " } });
    fireEvent.blur(body);

    expect(onChangeSlide).toHaveBeenNthCalledWith(1, "slide-1", { title: "새 제목" });
    expect(onChangeSlide).toHaveBeenNthCalledWith(2, "slide-1", { body: "새 본문" });
  });

  it("exposes bounded native input limits", () => {
    renderCard();
    expect(screen.getByRole("textbox", { name: "제목" })).toHaveAttribute(
      "maxlength",
      String(STUDIO_PITCH_SLIDE_TITLE_MAX_LENGTH),
    );
    expect(screen.getByRole("textbox", { name: "본문" })).toHaveAttribute(
      "maxlength",
      String(STUDIO_PITCH_SLIDE_BODY_MAX_LENGTH),
    );
  });
});
