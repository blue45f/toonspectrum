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

vi.mock("./StudioFileControlCenter", () => ({
  StudioFileControlCenter: () => (
    <section data-studio-file-control-center="true">파일 제어 센터</section>
  ),
}));

function resultActionButtons(): readonly HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      '[data-project-center-search-result="true"] > button:first-of-type',
    ),
  );
}

function findResultAction(label: string): HTMLButtonElement | undefined {
  return resultActionButtons().find((button) =>
    button.textContent?.includes(label),
  );
}

function Fixture({
  onBackup = () => undefined,
  onPreflight = () => undefined,
  onVersion = () => undefined,
  backupDisabled = false,
}: {
  onBackup?: () => void;
  onPreflight?: () => void;
  onVersion?: () => void;
  backupDisabled?: boolean;
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
        disabled={backupDisabled}
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
      expect(findResultAction("게시 사전검사")).toBeDefined();
      const hidden = document.querySelector<HTMLButtonElement>(
        'button[title="프로젝트를 안전하게 보관"]',
      );
      expect(hidden?.hidden).toBe(true);
      expect(resultActionButtons()).toHaveLength(1);
    });

    fireEvent.change(search, { target: { value: "체크포인트" } });
    await waitFor(() => {
      expect(findResultAction("버전 체크포인트 열기")).toBeDefined();
      expect(resultActionButtons()).toHaveLength(1);
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
    await waitFor(() => {
      expect(findResultAction("아카이브 백업")).toBeDefined();
    });
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
    expect(recent).not.toBeNull();
    fireEvent.click(recent as HTMLButtonElement);
    await waitFor(() => {
      expect(findResultAction("아카이브 백업")).toBeDefined();
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
    expect(favorites).not.toBeNull();
    fireEvent.click(favorites as HTMLButtonElement);
    await waitFor(() => {
      expect(findResultAction("게시 사전검사")).toBeDefined();
      expect(
        screen.getByRole("button", { name: "게시 사전검사 즐겨찾기 해제" }),
      ).not.toBeNull();
    });
  });

  it("filters the authored command catalogue by project section and restores it", async () => {
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

    const all = document.querySelector<HTMLButtonElement>(
      '[data-project-center-scope="all"]',
    );
    expect(all).not.toBeNull();
    fireEvent.click(all as HTMLButtonElement);
    await waitFor(() => {
      expect(backup?.hidden).toBe(false);
      expect(preflight?.hidden).toBe(false);
    });
  });

  it("never bypasses the disabled state of the original command", async () => {
    const onBackup = vi.fn();
    render(<Fixture onBackup={onBackup} backupDisabled />);
    const search = screen.getByRole("searchbox", {
      name: "프로젝트 센터 도구 검색",
    }) as HTMLInputElement;

    fireEvent.change(search, { target: { value: "archive" } });
    const result = await waitFor(() => {
      const action = findResultAction("아카이브 백업");
      expect(action).toBeDefined();
      return action as HTMLButtonElement;
    });

    expect(result.disabled).toBe(true);
    fireEvent.click(result);
    expect(onBackup).not.toHaveBeenCalled();
  });
});
