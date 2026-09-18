/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioPublishVisualJourney } from "../StudioPublishVisualJourney";
import { useI18n } from "@/shared/lib/i18n";

import { StudioProjectLibraryEmptyVisual } from "./StudioProjectLibraryEmptyVisual";
import { StudioWorkspaceContextCoach } from "./StudioWorkspaceContextCoach";

function routed(node: ReactNode) {
  return <MemoryRouter>{node}</MemoryRouter>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Studio visual guidance", () => {
  it("keeps the empty My Work state action-first and visual", () => {
    render(routed(<StudioProjectLibraryEmptyVisual locale="ko" />));

    expect(screen.getByRole("heading", { name: "표시할 작업이 없습니다" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /오리지널 스튜디오 비주얼/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /새 작업 시작/ }).getAttribute("href")).toBe("/studio/new");
    expect(screen.getByRole("link", { name: /기존 파일 가져오기/ }).getAttribute("href")).toBe("/studio/import");
    expect(screen.getByRole("link", { name: /샘플 제작 흐름 보기/ }).getAttribute("href")).toBe(
      "/production/projects/sample-project/overview",
    );
  });

  it("dismisses a contextual 3D coach for the rest of the tab session", async () => {
    const view = render(<StudioWorkspaceContextCoach surface="bg3d" />);
    expect(screen.getByText("3D 배경은 세 가지만 기억하면 돼요.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "가이드 닫기" }));
    await waitFor(() => {
      expect(screen.queryByText("3D 배경은 세 가지만 기억하면 돼요.")).toBeNull();
    });
    expect(window.sessionStorage.getItem("toonstudio:context-coach:v1:bg3d")).toBe("seen");

    view.unmount();
    render(<StudioWorkspaceContextCoach surface="bg3d" />);
    expect(screen.queryByText("3D 배경은 세 가지만 기억하면 돼요.")).toBeNull();
  });
});

describe("Studio publish visual journey", () => {
  it("lets the visual journey select the existing publish state-machine step", () => {
    const onSelect = vi.fn();
    render(
      <StudioPublishVisualJourney
        activeStep="content"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole("button", { name: /원고를 독자가 볼 순서로 정리/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /공개 범위와 시점을 결과 기준으로 선택/ }));
    expect(onSelect).toHaveBeenCalledWith("distribution");
  });
});
