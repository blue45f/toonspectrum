// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppApiError } from "@/platform/api-error";

import { CollaborationConflictPanel } from "./collaboration-conflict";
import { isCollaborationConflictError } from "./collaboration-conflict-error";

afterEach(cleanup);

describe("isCollaborationConflictError", () => {
  it("버전 충돌(409) 오류를 감지한다", () => {
    expect(
      isCollaborationConflictError(
        new AppApiError("conflict", { kind: "conflict", status: 409 }),
      ),
    ).toBe(true);
  });
  it("다른 종류의 API 오류는 충돌로 보지 않는다", () => {
    expect(
      isCollaborationConflictError(
        new AppApiError("not found", { kind: "not_found", status: 404 }),
      ),
    ).toBe(false);
    expect(
      isCollaborationConflictError(
        new AppApiError("server", { kind: "server", status: 500 }),
      ),
    ).toBe(false);
    expect(isCollaborationConflictError(new Error("boom"))).toBe(false);
    expect(isCollaborationConflictError(null)).toBe(false);
  });
});

describe("CollaborationConflictPanel", () => {
  const warningText =
    "최신 내용을 불러오면 지금 화면의 입력은 사라지니, 필요한 부분은 미리 복사해 두세요.";
  it("충돌 안내와 두 가지 해결 버튼을 보여준다", () => {
    const onReload = vi.fn();
    const onKeepEditing = vi.fn();
    render(
      <CollaborationConflictPanel
        onReload={onReload}
        onKeepEditing={onKeepEditing}
      />,
    );
    expect(
      screen.queryByRole("alert", { name: "다른 곳에서 먼저 저장했어요" }),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "최신 내용 불러오기" }));
    expect(onReload).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "내 작성 내용 유지하기" }),
    );
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
  });
  it("불러오는 동안 버튼을 비활성화한다", () => {
    render(
      <CollaborationConflictPanel
        onReload={vi.fn()}
        onKeepEditing={vi.fn()}
        busy
      />,
    );
    expect(
      (screen.getByRole("button", { name: "최신 내용을 불러오는 중…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "내 작성 내용 유지하기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("편집 중 입력이 있을 때만 입력 소실 경고를 보여준다", () => {
    const view = render(
      <CollaborationConflictPanel onReload={vi.fn()} onKeepEditing={vi.fn()} />,
    );
    expect(screen.queryByText(warningText)).toBeNull();
    view.rerender(
      <CollaborationConflictPanel
        onReload={vi.fn()}
        onKeepEditing={vi.fn()}
        inputWarning
      />,
    );
    expect(screen.queryByText(warningText)).not.toBeNull();
  });
});
