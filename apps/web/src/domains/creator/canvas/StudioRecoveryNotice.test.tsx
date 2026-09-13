// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioRecoveryNotice } from "./StudioRecoveryNotice";
import { createStudioRecoveryNewDrawingHref } from "./studio-recovery-notice-model";

afterEach(cleanup);
const handlers = () => ({ onRestore: vi.fn(), onBackup: vi.fn(), onDelete: vi.fn() });

describe("beginner recovery choices", () => {
  it("shows continue and a separate drawing instead of a warning and permanent delete", () => {
    render(<StudioRecoveryNotice blockedReason={null} {...handlers()} />);
    expect(screen.getByRole("heading", { name: "이어서 그릴까요?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이어서 그리기" })).toBeTruthy();
    const fresh = screen.getByRole("link", { name: /새 그림 그리기/ });
    expect(fresh.getAttribute("target")).toBe("_blank");
    expect(fresh.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByRole("button", { name: /삭제/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "백업 파일 받기" })).toBeNull();
    expect(screen.getByRole("button", { name: "다른 방법" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("reveals backup and explicit deletion without performing either", () => {
    const props = handlers();
    render(<StudioRecoveryNotice blockedReason={null} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "다른 방법" }));
    expect(screen.getByRole("button", { name: "백업 파일 받기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이전 그림 삭제…" })).toBeTruthy();
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(props.onRestore).not.toHaveBeenCalled();
    expect(props.onBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "다른 방법" }));
    expect(screen.queryByRole("button", { name: /삭제/ })).toBeNull();
  });

  it.each(["legacy-unversioned", "work-mismatch", "revision-mismatch"] as const)("keeps %s fail-closed without technical jargon", (blockedReason) => {
    const props = handlers();
    render(<StudioRecoveryNotice blockedReason={blockedReason} {...props} />);
    expect(screen.queryByRole("button", { name: "이어서 그리기" })).toBeNull();
    expect(screen.queryByText(/revision|JSON|내구|권위/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "백업 파일 받기" }));
    expect(props.onBackup).toHaveBeenCalledOnce();
    expect(props.onRestore).not.toHaveBeenCalled();
  });

  it("serializes repeated clicks and mutually exclusive restore/delete actions", async () => {
    let complete!: () => void;
    const props = { ...handlers(), onRestore: vi.fn(() => new Promise<void>((resolve) => { complete = resolve; })) };
    render(<StudioRecoveryNotice blockedReason={null} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "다른 방법" }));
    const restore = screen.getByRole("button", { name: "이어서 그리기" });
    act(() => { restore.click(); restore.click(); });
    fireEvent.click(screen.getByRole("button", { name: "이전 그림 삭제…" }));
    expect(props.onRestore).toHaveBeenCalledOnce();
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /새 그림 그리기/ }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "그림 여는 중…" })).toBeTruthy();
    await act(async () => { complete(); });
    expect(screen.getByRole("button", { name: "이어서 그리기" }).hasAttribute("disabled")).toBe(false);
  });

  it.each(["sync", "async"])("recovers from a %s handler error without discarding anything", async (kind) => {
    const props = { ...handlers(), onRestore: vi.fn(() => {
      if (kind === "sync") throw new Error("network");
      return Promise.reject(new Error("network"));
    }) };
    render(<StudioRecoveryNotice blockedReason={null} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "이어서 그리기" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "이어서 그리기" }).hasAttribute("disabled")).toBe(false);
  });

  it("creates independent canonical drawing links without inheriting a work or shared room", () => {
    const a = new URL(createStudioRecoveryNewDrawingHref(), "https://www.toonstudio.cloud");
    const b = new URL(createStudioRecoveryNewDrawingHref(), a.origin);
    expect(a.pathname).toMatch(/^\/studio\/draft\/[a-f0-9-]+$/);
    expect(b.pathname).not.toBe(a.pathname);
    expect(a.searchParams.get("workspace")).toBe("draw");
    expect(a.searchParams.has("room")).toBe(false);
    expect(a.searchParams.has("id")).toBe(false);
  });
});
