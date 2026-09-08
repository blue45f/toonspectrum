// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioProjectCenterSearch,
  StudioProjectCenterSection,
} from "./StudioProjectCenterSearch";

function Fixture({
  backupDisabled,
  onBackup,
}: {
  backupDisabled: boolean;
  onBackup: () => void;
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
        disabled={backupDisabled}
        onClick={onBackup}
      >
        아카이브 백업
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectCenterSearch quick access", () => {
  it("mirrors a command's disabled state in favorites and recent actions", async () => {
    const onBackup = vi.fn();
    const { rerender } = render(
      <Fixture backupDisabled={false} onBackup={onBackup} />,
    );
    const search = screen.getByRole("searchbox", {
      name: "프로젝트 센터 도구 검색",
    }) as HTMLInputElement;

    fireEvent.change(search, { target: { value: "archive" } });
    const result = await waitFor(() => {
      const candidate = document.querySelector<HTMLButtonElement>(
        '[data-project-center-search-result="true"] > button:first-of-type',
      );
      expect(candidate).not.toBeNull();
      return candidate as HTMLButtonElement;
    });
    const favorite = await screen.findByRole("button", {
      name: "아카이브 백업 즐겨찾기 추가",
    });

    fireEvent.click(favorite);
    fireEvent.click(result);
    expect(onBackup).toHaveBeenCalledTimes(1);

    fireEvent.change(search, { target: { value: "" } });
    const quickAccess = await waitFor(() => {
      const candidate = document.querySelector<HTMLElement>(
        '[data-project-center-quick-access="true"]',
      );
      expect(candidate).not.toBeNull();
      return candidate as HTMLElement;
    });
    expect(
      within(quickAccess).getAllByRole("button", { name: "아카이브 백업" }),
    ).toHaveLength(2);

    rerender(<Fixture backupDisabled onBackup={onBackup} />);

    const disabledQuickActions = await waitFor(() => {
      const buttons = within(quickAccess).getAllByRole("button", {
        name: "아카이브 백업",
      });
      expect(buttons).toHaveLength(2);
      expect(buttons.every((button) => button.hasAttribute("disabled"))).toBe(true);
      return buttons;
    });

    for (const button of disabledQuickActions) {
      fireEvent.click(button);
    }
    expect(onBackup).toHaveBeenCalledTimes(1);
  });
});
