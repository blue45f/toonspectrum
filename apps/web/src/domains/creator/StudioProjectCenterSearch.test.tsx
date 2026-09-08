// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioProjectCenterSearch,
  StudioProjectCenterSection,
} from "./StudioProjectCenterSearch";

const FAVORITE_STORAGE_KEY =
  "toonspectrum-studio-project-center:favorites:v1";
const RECENT_STORAGE_KEY =
  "toonspectrum-studio-project-center:recent-actions:v1";

function Fixture({
  onBackup = () => undefined,
  onPreflight = () => undefined,
  onVersion = () => undefined,
}: {
  onBackup?: () => void;
  onPreflight?: () => void;
  onVersion?: () => void;
}) {
  return (
    <div data-studio-project-actions-menu="true">
      <StudioProjectCenterSearch />
      <StudioProjectCenterSection
        title="내보내기 · 백업"
        description="프로젝트 사본과 장기 보관 파일을 관리합니다."
      />
      <button
        type="button"
        title="프로젝트를 안전하게 보관"
        onClick={onBackup}
      >
        아카이브 백업
      </button>
      <StudioProjectCenterSection
        title="연출 · 게시 · 검수"
        description="게시 전 구조와 품질을 점검합니다."
      />
      <button
        type="button"
        title="게시 전 구조 검사"
        onClick={onPreflight}
      >
        게시 사전검사
      </button>
      <button
        type="button"
        aria-label="버전 체크포인트 열기"
        onClick={onVersion}
      >
        버전
      </button>
      <button type="button" data-project-center-control="true">
        닫기
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectCenterSearch", () => {
  it("ranks actions by visible text, title and accessible name", async () => {
    render(<Fixture />);
    const search = screen.getByRole("searchbox", {
      name: "프로젝트 센터 도구 검색",
    }) as HTMLInputElement;

    fireEvent.change(search, { target: { value: "검사" } });

    await waitFor(() => {
      expect(screen.getByText("게시 사전검사")).not.toBeNull();
      const hidden = document.querySelector<HTMLButtonElement>(
        'button[title="프로젝트를 안전하게 보관"]',
      );
      expect(hidden?.hidden).toBe(true);
      expect(
        document.querySelectorAll('[data-project-center-search-result="true"]'),
      ).toHaveLength(1);
    });

    fireEvent.change(search, { target: { value: "체크포인트" } });
    await waitFor(() => {
      expect(screen.getByText("버전 체크포인트 열기")).not.toBeNull();
    });
  });

  it("uses slash to focus search and Escape to clear scope before closing", async () => {
    render(<Fixture />);
    const search = screen.getByRole("searchbox", {
      name: "프로젝트 센터 도구 검색",
    }) as HTMLInputElement;

    fireEvent.keyDown(document, { key: "/" });
    expect(document.activeElement).toBe(search);

    fireEvent.change(search, { target: { value: "없는 도구" } });
    await screen.findByText("일치하는 프로젝트 도구가 없습니다");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(search.value).toBe("");
    expect(screen.queryByText("일치하는 프로젝트 도구가 없습니다")).toBeNull();

    const favorites = document.querySelector<HTMLButtonElement>(
      '[data-project-center-scope="favorites"]',
    );
    expect(favorites).not.toBeNull();
    fireEvent.click(favorites as HTMLButtonElement);
    await screen.findByText("즐겨찾기한 프로젝트 도구가 없습니다");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(favorites?.getAttribute("aria-pressed")).toBe("false");
    });
  });

  it("supports synonym search, keyboard execution and recent history", async () => {
    const onBackup = vi.fn();
    render(<Fixture onBackup={onBackup} />);
    const search = screen.getByRole("searchbox", {
      name: "프로젝트 센터 도구 검색",
    }) as HTMLInputElement;

    fireEvent.change(search, { target: { value: "archive" } });
    await screen.findByText("아카이브 백업");
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onBackup).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) ?? "[]"))
        .toHaveLength(1);
    });

    fireEvent.change(search, { target: { value: "" } });
    const recent = document.querySelector<HTMLButtonElement>(
      '[data-project-center-scope="recent"]',
    );
    fireEvent.click(recent as HTMLButtonElement);
    await waitFor(() => {
      expect(screen.getByText("아카이브 백업")).not.toBeNull();
    });
  });

  it("persists favorites and exposes them as a dedicated view", async () => {
    render(<Fixture />);
    const search = screen.getByRole("searchbox", {
      name: "프로젝트 센터 도구 검색",
    }) as HTMLInputElement;

    fireEvent.change(search, { target: { value: "게시" } });
    const favorite = await screen.findByRole("button", {
      name: "게시 사전검사 즐겨찾기 추가",
    });
    fireEvent.click(favorite);

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(FAVORITE_STORAGE_KEY) ?? "[]"))
        .toHaveLength(1);
    });

    fireEvent.change(search, { target: { value: "" } });
    const favorites = document.querySelector<HTMLButtonElement>(
      '[data-project-center-scope="favorites"]',
    );
    fireEvent.click(favorites as HTMLButtonElement);
    await waitFor(() => {
      expect(screen.getByText("게시 사전검사")).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "게시 사전검사 즐겨찾기 해제" }),
      ).not.toBeNull();
    });
  });

  it("filters the authored command catalogue by project section", async () => {
    render(<Fixture />);
    const scope = await waitFor(() => {
      const button = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          '[data-project-center-scope]',
        ),
      ).find((candidate) => candidate.textContent?.includes("내보내기 · 백업"));
      expect(button).not.toBeUndefined();
      return button as HTMLButtonElement;
    });

    fireEvent.click(scope);
    const backup = document.querySelector<HTMLButtonElement>(
      'button[title="프로젝트를 안전하게 보관"]',
    );
    const preflight = document.querySelector<HTMLButtonElement>(
      'button[title="게시 전 구조 검사"]',
    );
    await waitFor(() => {
      expect(backup?.hidden).toBe(false);
      expect(preflight?.hidden).toBe(true);
    });
  });
});
