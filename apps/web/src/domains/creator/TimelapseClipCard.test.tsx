// @vitest-environment jsdom
// TimelapseClipCard — 게스트-퍼스트(미리보기 로그인 불필요), 좋아요 로그인 유도,
// 상세 모달 조회수 1회 집계.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TimelapseClipCard } from "./TimelapseClipCard";
import { useTimelapseShareStore } from "./timelapse-share-store";

import type { TimelapseSharedClip } from "./timelapse-share-model";

import { AccountNudgeHost } from "@/domains/auth/components/account-required-nudge";
import {
  SessionContext,
  type SessionContextValue,
} from "@/domains/auth/public/session/auth-session-store";

const signedOut: SessionContextValue = {
  data: null,
  ready: true,
  status: "unauthenticated",
  update: async () => null,
};

function resetStore() {
  useTimelapseShareStore.setState({ clips: [], viewedClipIds: [], serverAdapter: null });
  window.localStorage.clear();
}

function seedClip(over: Partial<TimelapseSharedClip> = {}): TimelapseSharedClip {
  return {
    id: "timelapse-clip:test-1",
    title: "오늘의 드로잉 과정",
    description: "스케치부터 채색까지",
    visibility: "public",
    width: 720,
    height: 1280,
    durationSec: 32,
    stepCount: 14,
    watermark: true,
    authorName: "게스트",
    authorIsGuest: true,
    ownerKey: "guest:test-guest",
    createdAt: "2026-10-01T10:00:00.000Z",
    likes: 3,
    views: 10,
    liked: false,
    thumbnailDataUrl: "",
    ...over,
  };
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  cleanup();
  resetStore();
});

function renderCard(clip: TimelapseSharedClip) {
  return render(
    <SessionContext.Provider value={signedOut}>
      <AccountNudgeHost />
      <TimelapseClipCard clip={clip} />
    </SessionContext.Provider>,
  );
}

describe("TimelapseClipCard", () => {
  it("로그인 없이 제목·작성자·길이·좋아요·조회수를 보여준다", () => {
    const clip = seedClip();
    useTimelapseShareStore.setState({ clips: [clip] });
    renderCard(clip);
    expect(screen.getByText("오늘의 드로잉 과정")).toBeTruthy();
    expect(screen.getByText(/게스트/)).toBeTruthy();
    // 32초 → "32초" 뱃지
    expect(screen.getByText("32초")).toBeTruthy();
    // 좋아요 3, 조회수 10
    expect(screen.getByRole("button", { name: "좋아요" })).toBeTruthy();
  });

  it("게스트가 좋아요를 누르면 로그인 nudge가 뜨고 카운트는 그대로다", () => {
    const clip = seedClip();
    useTimelapseShareStore.setState({ clips: [clip] });
    renderCard(clip);
    fireEvent.click(screen.getByRole("button", { name: "좋아요" }));
    expect(screen.getByRole("dialog").textContent).toContain(
      "좋아요를 누르려면 로그인이 필요해요",
    );
    // 게스트 좋아요는 집계되지 않는다
    expect(useTimelapseShareStore.getState().clips[0].liked).toBe(false);
    expect(useTimelapseShareStore.getState().clips[0].likes).toBe(3);
  });

  it("카드를 클릭하면 상세 모달이 열리고 조회수가 1회만 오른다", () => {
    const clip = seedClip();
    useTimelapseShareStore.setState({ clips: [clip] });
    renderCard(clip);
    fireEvent.click(screen.getByRole("button", { name: /클립 보기/ }));
    // 상세 모달 — 썸네일 없음 + 이전 세션 안내(Blob 미등록)
    expect(screen.getByText("스케치부터 채색까지")).toBeTruthy();
    expect(useTimelapseShareStore.getState().clips[0].views).toBe(11);
    // 모달을 닫았다 다시 열어도 중복 집계되지 않는다
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.click(screen.getByRole("button", { name: /클립 보기/ }));
    expect(useTimelapseShareStore.getState().clips[0].views).toBe(11);
  });

  it("상세 모달은 ESC로 닫힌다", () => {
    const clip = seedClip();
    useTimelapseShareStore.setState({ clips: [clip] });
    renderCard(clip);
    fireEvent.click(screen.getByRole("button", { name: /클립 보기/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
