// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { LearningRecordsPage } from "./LearningRecordsPage";

afterEach(cleanup);

describe("LearningRecordsPage", () => {
  it("renders the progress summary and an empty-state guide when no records exist", () => {
    window.localStorage.clear();
    render(
      <MemoryRouter initialEntries={["/learn/records"]}>
        <LearningRecordsPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "배운 과정도,내 기록으로 남기세요." }),
    ).toBeTruthy();
    expect(screen.getByRole("region", { name: "학습 현황 요약" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "아직 기록된 학습이 없어요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "강좌 보러 가기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "← 강좌로 돌아가기" })).toBeTruthy();
  });
});
