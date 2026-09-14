// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CreatorArtworkStudy } from "./CreatorArtworkStudy";

afterEach(cleanup);

describe("artwork study controls", () => {
  it("lets the artist compare actual values and color without loading video", () => {
    const { container } = render(<CreatorArtworkStudy locale="ko" stage={0} />);
    const slider = screen.getByRole("slider", { name: "일러스트의 명암과 컬러 비교" });
    fireEvent.change(slider, { target: { value: "25" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("컬러 25%");
    expect(container.querySelector("figure")?.style.getPropertyValue("--cf-reveal")).toBe("25%");
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByText(/실제 편집 화면이 아닙니다/)).toBeTruthy();
  });

  it("allows motion to be paused and resumed, without resetting the comparison", () => {
    const { container } = render(<CreatorArtworkStudy locale="en" stage={1} />);
    const slider = screen.getByRole("slider", { name: "Compare illustration values and color" });
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Pause background motion" }));
    expect(container.querySelector("figure")?.getAttribute("data-motion")).toBe("paused");
    expect(screen.getByRole("button", { name: "Play background motion" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Play background motion" }));
    expect(container.querySelector("figure")?.getAttribute("data-motion")).toBe("running");
    expect(slider.getAttribute("aria-valuetext")).toBe("COLOR 40%");
  });

  it("updates the composition explanation while keeping the artist’s selected values", () => {
    const { rerender } = render(<CreatorArtworkStudy locale="en" stage={0} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    rerender(<CreatorArtworkStudy locale="en" stage={2} />);
    expect(screen.getByText("Guide the eye with space and perspective")).toBeTruthy();
    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toBe("COLOR 0%");
  });
});
