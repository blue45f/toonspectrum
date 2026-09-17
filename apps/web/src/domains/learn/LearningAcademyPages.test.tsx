// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearningClassroomPage } from "./LearningClassroomPage";
import { LearningResourcesPage } from "./LearningResourcesPage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("academy product surfaces", () => {
  it("renders the curated resource hub with role and production filters", () => {
    render(<MemoryRouter initialEntries={["/learn/resources?role=artist"]}><LearningResourcesPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /좋은 강의를 찾고/u })).toBeTruthy();
    expect((screen.getByLabelText("직군") as HTMLSelectElement).value).toBe("artist");
    expect(screen.getByLabelText("제작 단계")).toBeTruthy();
    expect(screen.getAllByText("공식·검증 출처").length).toBeGreaterThan(0);
  });

  it("switches classroom templates and adds a locally managed assignment", () => {
    render(<MemoryRouter initialEntries={["/learn/classroom"]}><LearningClassroomPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /스토리·콘티 집중/u }));
    expect(screen.getByDisplayValue("스토리·콘티 집중 · 6주")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("과제 이름"), { target: { value: "3컷 콘티 제출" } });
    fireEvent.click(screen.getByRole("button", { name: "과제 추가" }));
    expect(screen.getByRole("heading", { name: "3컷 콘티 제출" })).toBeTruthy();
  });
});
