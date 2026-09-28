// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioCinematicShowcase } from "./StudioCinematicShowcase";

afterEach(cleanup);
describe("실제 입장 화면의 생성 아트", () => {
  it("선택한 아트 하나만 반응형 이미지로 로드한다", () => {
    const { container } = render(<StudioCinematicShowcase />);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("source")?.getAttribute("srcset")).toContain("480w");
    expect(container.querySelector("img")?.getAttribute("src")).toContain("campus-day-1024.webp");
    fireEvent.click(screen.getByRole("button", { name: "정원 캠퍼스" }));
    expect(container.querySelector("img")?.getAttribute("src")).toContain("campus-garden-1024.webp");
    expect(screen.getByRole("button", { name: "정원 캠퍼스" }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
  it("이미지 실패 후에도 조작을 유지하고 다른 아트 선택 시 복구한다", () => {
    const { container } = render(<StudioCinematicShowcase />);
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    if (image) fireEvent.error(image);
    expect(screen.getByRole("img", { name: /입장과 공간 조작/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "함께하는 작업실" }));
    expect(container.querySelector("img")?.getAttribute("src")).toContain("campus-social-1024.webp");
    expect(screen.queryByRole("img", { name: /입장과 공간 조작/ })).toBeNull();
  });
});
