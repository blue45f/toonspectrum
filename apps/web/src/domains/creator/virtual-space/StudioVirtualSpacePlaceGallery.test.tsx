// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpacePlaceGallery } from "./StudioVirtualSpacePlaceGallery";

afterEach(() => cleanup());

describe("StudioVirtualSpacePlaceGallery", () => {
  it("moves to an authored room from an ImageGen place card", () => {
    const onSelectPlace = vi.fn();
    render(<StudioVirtualSpacePlaceGallery personal currentPlaceId="skyport" onSelectPlace={onSelectPlace} />);
    fireEvent.click(screen.getByRole("button", { name: /개인 아틀리에로 이동/u }));
    expect(onSelectPlace).toHaveBeenCalledWith("personal-atelier");
  });

  it("does not advertise project-only control rooms in personal space", () => {
    render(<StudioVirtualSpacePlaceGallery personal currentPlaceId="skyport" onSelectPlace={vi.fn()} />);
    expect(screen.queryByText("프로덕션 관제실")).toBeNull();
    expect(screen.queryByText("팀 미팅 로프트")).toBeNull();
  });

  it("filters the gallery without losing the current place signal", () => {
    render(<StudioVirtualSpacePlaceGallery personal={false} currentPlaceId="review-gallery" onSelectPlace={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "검수" }));
    expect(screen.getByText("리뷰 갤러리")).toBeTruthy();
    expect(screen.getByText("스토리 관측소")).toBeTruthy();
    expect(screen.queryByText("해변 아틀리에")).toBeNull();
  });
});
