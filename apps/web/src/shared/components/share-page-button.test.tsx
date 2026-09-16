// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SharePageButton } from "./share-page-button";

const kakao = vi.hoisted(() => ({
  share: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/lib/kakao-share", () => ({
  isKakaoShareConfigured: () => true,
  shareWithKakao: kakao.share,
}));

afterEach(() => {
  cleanup();
  kakao.share.mockClear();
});

describe("SharePageButton", () => {
  it("opens the unified dialog and keeps a contextual Kakao call-to-action", async () => {
    render(
      <SharePageButton
        path="/collaborate/post-1"
        text="배경 작가 모집"
        description="원격으로 함께할 배경 작가를 찾습니다."
        label="공고 공유"
        actionLabel="공고 보기"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "공고 공유: 배경 작가 모집" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("배경 작가 모집")).toBeTruthy();
    expect(screen.getByText("원격으로 함께할 배경 작가를 찾습니다.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /카카오톡/u }));

    await waitFor(() => {
      expect(kakao.share).toHaveBeenCalledWith({
        title: "배경 작가 모집",
        text: "원격으로 함께할 배경 작가를 찾습니다.",
        url: "/collaborate/post-1",
        imageUrl: undefined,
        buttonLabel: "공고 보기",
      });
    });
  });
});
