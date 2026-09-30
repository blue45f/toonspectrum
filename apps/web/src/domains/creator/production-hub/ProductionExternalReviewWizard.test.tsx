// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductionExternalReviewWizard } from "./ProductionExternalReviewWizard";

afterEach(() => cleanup());

const SUBMISSIONS = [
  { id: "sub-1", label: "12화 최종 제출본" },
  { id: "sub-2", label: "13화 초안" },
];

describe("ProductionExternalReviewWizard", () => {
  it("3단계로 제출본 선택 → 설정 → 공유가 이어진다", async () => {
    const onCreate = vi.fn().mockResolvedValue("https://toonstudio.cloud/production/review/p/r?token=abc");
    render(<ProductionExternalReviewWizard submissions={SUBMISSIONS} onCreate={onCreate} />);

    // 1단계: 제출본 선택
    expect(screen.getByRole("heading", { name: "제출본 선택" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("검수할 제출본"), { target: { value: "sub-2" } });
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

    // 2단계: 권한 선택 후 링크 만들기
    expect(screen.getByRole("heading", { name: "링크 설정" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^보기·댓글댓글로/ }));
    fireEvent.change(screen.getByLabelText("링크 만료"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /링크 만들기/ }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      submissionId: "sub-2",
      label: "편집부 최종 검수",
      permission: "commenter",
      allowDownload: false,
      expiresInDays: 3,
    }));

    // 3단계: 공유 링크 표시
    expect(screen.getByRole("heading", { name: "공유" })).toBeTruthy();
    expect(screen.getByLabelText("외부 검수 링크")).toHaveProperty("value", expect.stringContaining("token=abc"));
  });

  it("링크 생성 실패 시 에러를 안내한다", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("네트워크 오류"));
    render(<ProductionExternalReviewWizard submissions={SUBMISSIONS} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /링크 만들기/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("네트워크 오류");
  });

  it("공유 단계에서 다음 버튼 없이 닫기로 끝낸다", async () => {
    const onCreate = vi.fn().mockResolvedValue("https://example.com/r/1");
    const onCancel = vi.fn();
    render(<ProductionExternalReviewWizard submissions={SUBMISSIONS} onCreate={onCreate} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    // 2단계에서는 마법사 다음 버튼이 숨겨진다 (링크 만들기가 주 액션)
    expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /링크 만들기/ }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
