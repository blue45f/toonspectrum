/**
 * 컷츠 좋아요·리믹스 정책 소유자 파티션 회귀 테스트.
 *
 * 좋아요 목록과 리믹스 허용 오버라이드가 계정 구분 없이 공유돼, 계정을
 * 바꾸면 이전 계정의 좋아요가 눌린 채로 보이고 다른 작가의 리믹스 정책
 * 토글이 전역으로 적용되던 혼선을 막는다.
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/platform/api", () => ({
  apiFetch: vi.fn(async () => ({ ok: true })),
}));

import { useCutsStore } from "./cuts-store";
import type { CutsClip } from "./cuts-types";

const clip: CutsClip = {
  id: "clip-1",
  titleId: "title-1",
  title: "작품",
  author: "작가",
  episodeNumber: 1,
  episodeTitle: "1화",
  shots: [],
  durationMs: 30000,
  narrationSsml: "",
  thumbnailUrl: "",
  createdBy: "author-1",
  createdAt: "2026-10-01T00:00:00.000Z",
  publishedAt: "2026-10-01T00:00:00.000Z",
  views: 0,
  likes: 0,
};

beforeEach(() => {
  window.localStorage.clear();
  useCutsStore.getState().resetForTests();
  useCutsStore.getState().publishClip(clip);
});

describe("cuts owner partitions", () => {
  it("좋아요는 누른 계정에게만 눌린 것으로 보인다", () => {
    const store = useCutsStore.getState();
    store.bindCutsOwner("user-a");
    store.toggleLike("clip-1", "user-a");
    expect(useCutsStore.getState().likedClipIds).toEqual(["clip-1"]);

    useCutsStore.getState().bindCutsOwner("user-b");
    expect(useCutsStore.getState().likedClipIds).toEqual([]);

    useCutsStore.getState().bindCutsOwner("user-a");
    expect(useCutsStore.getState().likedClipIds).toEqual(["clip-1"]);
  });

  it("리믹스 정책 오버라이드는 설정한 계정 파티션에만 남는다", () => {
    const store = useCutsStore.getState();
    store.bindCutsOwner("author-1");
    store.setRemixAllowed({ titleId: "title-1", episodeNumber: 1 }, true, "author-1");
    expect(Object.values(useCutsStore.getState().remixPolicyOverrides)).toEqual([true]);

    useCutsStore.getState().bindCutsOwner("author-2");
    expect(useCutsStore.getState().remixPolicyOverrides).toEqual({});

    useCutsStore.getState().bindCutsOwner("author-1");
    expect(Object.values(useCutsStore.getState().remixPolicyOverrides)).toEqual([true]);
  });

  it("레거시(미귀속) 좋아요는 첫 bind 계정이 claim 한다", () => {
    useCutsStore.getState().toggleLike("clip-1", "user-a");
    // bind 없이 토글만 한 상태에서도 파티션에 기록된다.
    useCutsStore.getState().bindCutsOwner("user-b");
    expect(useCutsStore.getState().likedClipIds).toEqual([]);
    useCutsStore.getState().bindCutsOwner("user-a");
    expect(useCutsStore.getState().likedClipIds).toEqual(["clip-1"]);
  });
});
