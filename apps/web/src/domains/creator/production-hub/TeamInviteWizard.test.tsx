// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeamInviteWizard } from "./TeamInviteWizard";

afterEach(() => cleanup());

const PROJECTS = [
  { workId: "work-1", title: "밤의 우편배달부" },
  { workId: "work-2", title: "별빛 식당" },
];

describe("TeamInviteWizard", () => {
  it("이메일 → 역할 → 작품 배정 3단계로 초대가 완료된다", async () => {
    const onInvite = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(<TeamInviteWizard projects={PROJECTS} onInvite={onInvite} onCancel={onCancel} />);

    // 1단계: 이메일이 유효해야 다음으로 이동
    const next = screen.getByRole("button", { name: "다음" });
    expect(next.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/초대받을 이메일/), { target: { value: "teammate@example.com" } });
    expect(screen.getByRole("button", { name: "다음" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    // 2단계: 역할 선택
    expect(screen.getByRole("heading", { name: "역할 정하기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /검수자/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    // 3단계: 작품 배정 (선택)
    expect(screen.getByRole("heading", { name: "작품 배정" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/함께 참여할 작품/), { target: { value: "work-1" } });
    fireEvent.change(screen.getByLabelText(/작품에서의 역할/), { target: { value: "commenter" } });
    fireEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));

    await waitFor(() => expect(onInvite).toHaveBeenCalledWith({
      email: "teammate@example.com",
      tierId: "commenter",
      projectWorkId: "work-1",
      projectRole: "commenter",
    }));

    // 완료 화면
    expect(screen.getByText("초대 링크를 만들었습니다")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("잘못된 이메일 형식을 안내한다", () => {
    render(<TeamInviteWizard projects={PROJECTS} onInvite={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/초대받을 이메일/), { target: { value: "not-an-email" } });
    expect(screen.getByRole("alert").textContent).toContain("이메일 형식");
  });

  it("초대 실패 시 에러를 안내한다", async () => {
    const onInvite = vi.fn().mockRejectedValue(new Error("이미 초대된 이메일입니다"));
    render(<TeamInviteWizard projects={PROJECTS} onInvite={onInvite} />);

    fireEvent.change(screen.getByLabelText(/초대받을 이메일/), { target: { value: "dup@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("이미 초대된 이메일입니다");
  });
});
