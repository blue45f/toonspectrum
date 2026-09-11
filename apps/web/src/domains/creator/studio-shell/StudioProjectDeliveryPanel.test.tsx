// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { StudioProjectDeliveryPanel } from "./StudioProjectDeliveryPanel";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectDeliveryPanel", () => {
  it("does not present an external publish as complete before preflight and account setup", async () => {
    render(
      <MemoryRouter>
        <StudioProjectDeliveryPanel
          projectId="project-delivery"
          section="export"
          view="targets"
          locale="ko"
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "검사한 결과를 안전하게 전달" })).toBeTruthy();
    expect(screen.getByText("먼저 내보내기 사전검사를 실행해 주세요")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/게시 완료|전송 완료/u);
  });

  it("builds a reversible archive manifest inside the project flow", async () => {
    render(
      <MemoryRouter>
        <StudioProjectDeliveryPanel
          projectId="project-delivery"
          section="settings"
          view="archive"
          locale="ko"
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("tab", { name: "완전한 사본" })).toBeTruthy();
    expect(screen.getByText("완전한 프로젝트 사본")).toBeTruthy();
    expect(screen.getByText("복원 가능성 검사 완료")).toBeTruthy();
    expect((screen.getByRole("button", { name: "보관 Manifest 받기" }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it("keeps publish, package and archive as one delivery surface", async () => {
    render(
      <MemoryRouter>
        <StudioProjectDeliveryPanel
          projectId="project-delivery"
          section="export"
          view="packages"
          locale="ko"
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("tab", { name: "플랫폼 게시" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "게시 패키지" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "완전한 사본" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "플랫폼 게시" }));
    expect(screen.getByLabelText("연결 방식")).toBeTruthy();
  });
});
