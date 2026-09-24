// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioBetaNoticeGate } from "./StudioBetaNoticeGate";
import {
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "./studio-beta-notice-storage";

const initialLanguage = useI18n.getState().lang;

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useI18n.setState({ lang: initialLanguage });
});

describe("StudioBetaNoticeGate", () => {
  it("shows a non-modal notice without blocking the Studio behind it", () => {
    const onCanvasAction = vi.fn();
    render(
      <>
        <button type="button" onClick={onCanvasAction}>캔버스 작업</button>
        <StudioBetaNoticeGate pathname="/studio" />
      </>,
    );

    expect(
      screen.getByRole("region", {
        name: "툰스튜디오는 현재 베타 테스트 중입니다",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("[data-studio-beta-notice-overlay]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "캔버스 작업" }));
    expect(onCanvasAction).toHaveBeenCalledOnce();
  });

  it("keeps detailed risks collapsed until the author asks for them", () => {
    render(<StudioBetaNoticeGate pathname="/studio" />);

    expect(screen.queryByText("저장 데이터 초기화 가능")).toBeNull();
    const details = screen.getByRole("button", { name: "주의사항 자세히" });
    expect(details.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(details);
    expect(screen.getByText("저장 데이터 초기화 가능")).toBeTruthy();
    expect(screen.getByText("기능·정책 수시 변경")).toBeTruthy();
    expect(screen.getByText("중요한 작업은 별도 백업")).toBeTruthy();
    expect(screen.getByRole("button", { name: "주의사항 접기" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("requires an explicit acknowledgement before storing the current revision", () => {
    render(<StudioBetaNoticeGate pathname="/studio/p/project-1/canvas" />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("region")).toBeTruthy();
    expect(window.localStorage.getItem(STUDIO_BETA_NOTICE_STORAGE_KEY)).toBeNull();

    const acknowledge = screen.getByRole("button", { name: "확인했어요" });
    expect(acknowledge.getAttribute("data-studio-beta-notice-acknowledge")).toBe("true");
    fireEvent.click(acknowledge);

    expect(screen.queryByRole("region")).toBeNull();
    expect(window.localStorage.getItem(STUDIO_BETA_NOTICE_STORAGE_KEY)).toBe(
      STUDIO_BETA_NOTICE_REVISION,
    );
  });

  it("does not mount outside the Studio namespace", () => {
    render(<StudioBetaNoticeGate pathname="/discover" />);

    expect(screen.queryByRole("region")).toBeNull();
    expect(window.localStorage.getItem(STUDIO_BETA_NOTICE_STORAGE_KEY)).toBeNull();
  });

  it("does not repeat an acknowledged revision", () => {
    window.localStorage.setItem(
      STUDIO_BETA_NOTICE_STORAGE_KEY,
      STUDIO_BETA_NOTICE_REVISION,
    );

    render(<StudioBetaNoticeGate pathname="/studio/new" />);
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("shows again when the stored acknowledgement belongs to older copy", () => {
    window.localStorage.setItem(
      STUDIO_BETA_NOTICE_STORAGE_KEY,
      "2026-01-01-old-copy",
    );

    render(<StudioBetaNoticeGate pathname="/studio" />);
    expect(screen.getByRole("region")).toBeTruthy();
  });

  it("uses the current interface language", () => {
    useI18n.setState({ lang: "en" });

    render(<StudioBetaNoticeGate pathname="/studio" />);
    expect(
      screen.getByRole("region", {
        name: "ToonStudio is currently in beta testing",
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review beta risks" }));
    expect(screen.getByText("Stored data may be reset")).toBeTruthy();
  });
});
