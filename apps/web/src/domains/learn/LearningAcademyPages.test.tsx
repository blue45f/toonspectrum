// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearningClassroomPage } from "./LearningClassroomPage";
import { LearningResourceHub } from "./LearningResourceHub";

afterEach(cleanup);

describe("academy expansion pages", () => {
  it("renders the external resource hub with safe source actions", () => {
    render(<MemoryRouter initialEntries={["/learn/resources"]}><LearningResourceHub /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /웹툰을 만드는 모든 과정/u })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "원문 열기 ↗" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "바로 실습 →" }).length).toBeGreaterThan(0);
  });

  it("renders the classroom curriculum as usable lesson links", () => {
    render(<MemoryRouter initialEntries={["/learn/classroom"]}><LearningClassroomPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /강의 자료와 제작 도구/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "바로 수업에 쓸 수 있는 기본 커리큘럼" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "열기 →" })).toHaveLength(10);
  });
});
