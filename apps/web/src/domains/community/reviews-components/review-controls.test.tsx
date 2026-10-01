// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ReviewControls } from "./review-controls";
import { parseReviewRating, parseReviewSort } from "./review-query";

afterEach(cleanup);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderControls(entry = "/reviews") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ReviewControls />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("ReviewControls", () => {
  it("narrows unknown URL values to the defaults", () => {
    expect(parseReviewSort("likes")).toBe("likes");
    expect(parseReviewSort("toString")).toBe("recent");
    expect(parseReviewSort(null)).toBe("recent");
    expect(parseReviewRating("low")).toBe("low");
    expect(parseReviewRating("5")).toBe("all");
  });

  it("uses pressed toggle groups instead of a tab pattern without panels", () => {
    renderControls("/reviews?sort=high");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    const sort = screen.getByRole("group", { name: "리뷰 정렬" });
    expect(within(sort).getByRole("button", { name: "별점 높은순" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(sort).getByRole("button", { name: "최신순" }).getAttribute("aria-pressed")).toBe("false");
    const rating = screen.getByRole("group", { name: "평점 필터" });
    expect(within(rating).getByRole("button", { name: "전체 평점" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps every short label on one line so narrow screens scroll instead of breaking words", () => {
    renderControls();
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toContain("whitespace-nowrap");
      expect(button.className).toContain("shrink-0");
      expect(button.className).toContain("min-h-11");
    }
    for (const group of screen.getAllByRole("group")) expect(group.className).toContain("w-max");
  });

  it("updates the URL while keeping the other conditions", () => {
    renderControls("/reviews?rating=high");
    fireEvent.click(screen.getByRole("button", { name: "공감순" }));
    expect(screen.getByTestId("location").textContent).toBe("/reviews?rating=high&sort=likes");

    const spoiler = screen.getByRole("button", { name: "스포일러 숨기기" });
    expect(spoiler.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(spoiler);
    expect(screen.getByTestId("location").textContent).toBe("/reviews?rating=high&sort=likes&spoiler=hide");
    expect(screen.getByRole("button", { name: "스포일러 숨기기" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "최신순" }));
    expect(screen.getByTestId("location").textContent).toBe("/reviews?rating=high&spoiler=hide");
  });
});
