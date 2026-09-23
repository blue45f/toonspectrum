// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
  it("shows the pre-release risks on Studio routes", () => {
    render(<StudioBetaNoticeGate pathname="/studio" />);

    expect(
      screen.getByRole("dialog", {
        name: "툰스튜디오는 현재 베타 테스트 중입니다",
      }),
    ).toBeTruthy();
    expect(screen.getByText("저장 데이터 초기화 가능")).toBeTruthy();
    expect(screen.getByText("기능·정책 수시 변경")).toBeTruthy();
    expect(screen.getByText("중요한 작업은 별도 백업")).toBeTruthy();
  });

  it("requires an explicit acknowledgement before closing", () => {
    render(<StudioBetaNoticeGate pathname="/studio/p/project-1/canvas" />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "확인하고 툰스튜디오 시작하기",
      }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem(STUDIO_BETA_NOTICE_STORAGE_KEY)).toBe(
      STUDIO_BETA_NOTICE_REVISION,
    );
  });

  it("does not mount outside the Studio namespace", () => {
    render(<StudioBetaNoticeGate pathname="/discover" />);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem(STUDIO_BETA_NOTICE_STORAGE_KEY)).toBeNull();
  });

  it("does not repeat an acknowledged revision", () => {
    window.localStorage.setItem(
      STUDIO_BETA_NOTICE_STORAGE_KEY,
      STUDIO_BETA_NOTICE_REVISION,
    );

    render(<StudioBetaNoticeGate pathname="/studio/new" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows again when the stored acknowledgement belongs to older copy", () => {
    window.localStorage.setItem(
      STUDIO_BETA_NOTICE_STORAGE_KEY,
      "2026-01-01-old-copy",
    );

    render(<StudioBetaNoticeGate pathname="/studio" />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("uses the current interface language", () => {
    useI18n.setState({ lang: "en" });

    render(<StudioBetaNoticeGate pathname="/studio" />);
    expect(
      screen.getByRole("dialog", {
        name: "ToonStudio is currently in beta testing",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Stored data may be reset")).toBeTruthy();
  });
});
