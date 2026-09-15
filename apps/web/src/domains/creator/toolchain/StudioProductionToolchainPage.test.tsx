// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  StudioEngineCenterPage,
  StudioProductionJobsPage,
  StudioProductionToolchainPage,
} from "./StudioProductionToolchainPage";

function renderRoute(element: React.ReactNode, path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {element}
    </MemoryRouter>,
  );
}

afterEach(() => {
  sessionStorage.clear();
});

describe("Studio production toolchain pages", () => {
  it("renders the integrated production overview without exposing NC tools in Open profile", () => {
    renderRoute(<StudioProductionToolchainPage />, "/studio/toolchain?projectId=project-a");

    expect(screen.getByRole("heading", { name: /그리기 이후의 제작/u })).toBeTruthy();
    expect(screen.getByRole("link", { name: /제작 작업 시작/u }).getAttribute("href"))
      .toBe("/studio/jobs?projectId=project-a");
    expect(screen.queryByText("Mixbox")).not.toBeTruthy();
    expect(screen.getByRole("button", { name: /^Open 기본/u }).getAttribute("aria-pressed"))
      .toBe("true");
  });

  it("renders every reviewed engine with an honest disconnected state", () => {
    renderRoute(<StudioEngineCenterPage />, "/studio/engines");

    expect(screen.getByRole("heading", { name: "설치·라이선스 상태" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tesseract OCR" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mixbox" })).toBeTruthy();
    expect(screen.getAllByText("프로필 제한").length).toBeGreaterThan(0);
    expect(screen.getByText("연결 안 됨")).toBeTruthy();
  });

  it("renders the job workspace without claiming durable storage or a live runner prematurely", async () => {
    renderRoute(<StudioProductionJobsPage />, "/studio/jobs?projectId=project-a");

    expect(screen.getByRole("heading", { name: "제작 작업 큐" })).toBeTruthy();
    expect(screen.getByText("연결 안 됨")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "처리 중 작업" })).toBeTruthy();
    expect(screen.getByText("아직 제작 작업이 없습니다.")).toBeTruthy();
  });
});
