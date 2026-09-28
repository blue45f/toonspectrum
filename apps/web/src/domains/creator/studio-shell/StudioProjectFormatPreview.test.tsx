// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STUDIO_PROJECT_FORMAT_PROFILES } from "../studio-project-format-catalog";
import { StudioProjectFormatPreview } from "./StudioProjectFormatPreview";

afterEach(cleanup);
describe("작품 형식 안내 가독성", () => {
  it.each(STUDIO_PROJECT_FORMAT_PROFILES)("$id의 설명과 검사·출력을 읽기용 텍스트로 유지한다", (profile) => {
    const view = render(<StudioProjectFormatPreview profile={profile} locale="ko" />);
    expect(screen.getByText(profile.descriptionKo).classList.contains("text-fg-2")).toBe(true);
    expect(screen.getByText(profile.checksKo.join(" · ")).classList.contains("text-fg-2")).toBe(true);
    expect(screen.getByText(profile.outputsKo.join(" · ")).classList.contains("text-fg-2")).toBe(true);
    expect(view.container.querySelectorAll(".text-fg-3")).toHaveLength(0);
    view.rerender(<StudioProjectFormatPreview profile={profile} locale="en" />);
    expect(screen.getByText(profile.descriptionEn)).toBeTruthy();
    expect(screen.getByText(profile.checksEn.join(" · "))).toBeTruthy();
    expect(screen.getByText(profile.outputsEn.join(" · "))).toBeTruthy();
  });
});
