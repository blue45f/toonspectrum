// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { TracePracticePage } from "./TracePracticePage";
import { LearnPage } from "./LearnPage";

afterEach(cleanup);

describe("trace practice", () => {
  it("starts the real Studio canvas with an explicit trace-practice query", () => {
    render(<MemoryRouter><TracePracticePage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /참고 이미지는 가이드로/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /따라 그리기 시작/ }).getAttribute("href"))
      .toBe("/studio/canvas?practice=trace");
    expect(screen.getByText(/완성 원고에 자동 포함되지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/화면 공유 중이라면/)).toBeTruthy();
  });

  it("is reachable from the existing /learn wildcard without a duplicate router", () => {
    render(<MemoryRouter initialEntries={["/learn/trace"]}><LearnPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /참고 이미지는 가이드로/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "따라 그리기" }).getAttribute("aria-current")).toBe("page");
  });
});
