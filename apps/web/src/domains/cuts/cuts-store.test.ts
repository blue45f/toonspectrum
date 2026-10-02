/**
 * 컷츠 스토어 테스트 — 조회수·좋아요 집계와 게스트-퍼스트 정책 검증.
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { buildCutsClip } from "./cuts-clip-builder";
import {
  remixEpisodePolicyKey,
  remixTitlePolicyKey,
  resolveRemixAllowed,
} from "./cuts-remix";
import { DEMO_EPISODES } from "./cuts-seed";
import { formatCutsCount, useCutsStore } from "./cuts-store";
import type { CutsClip } from "./cuts-types";

function seedClip(): CutsClip {
  const clip = buildCutsClip(DEMO_EPISODES[0], "seed");
  if (!clip) throw new Error("시드 클립 생성 실패");
  return clip;
}

beforeEach(() => {
  window.localStorage.clear();
  useCutsStore.getState().resetForTests();
});

describe("cuts store", () => {
  it("클립을 게시하면 피드 맨 앞에 쌓인다", () => {
    const { publishClip } = useCutsStore.getState();
    const first = seedClip();
    const second = { ...seedClip(), id: "cuts-second-ep9" };
    publishClip(first);
    publishClip(second);
    const clips = useCutsStore.getState().clips;
    expect(clips[0].id).toBe(second.id);
    expect(clips[1].id).toBe(first.id);
  });

  it("같은 ID를 다시 게시하면 중복되지 않는다", () => {
    const { publishClip } = useCutsStore.getState();
    const clip = seedClip();
    publishClip(clip);
    publishClip({ ...clip, views: 999 });
    expect(useCutsStore.getState().clips).toHaveLength(1);
  });

  it("조회수는 브라우저당 한 번만 집계된다", () => {
    const { publishClip, recordView } = useCutsStore.getState();
    const clip = seedClip();
    publishClip(clip);
    expect(recordView(clip.id)).toBe(true);
    expect(recordView(clip.id)).toBe(false);
    expect(useCutsStore.getState().getClip(clip.id)?.views).toBe(clip.views + 1);
  });

  it("없는 클립의 조회수는 기록되지 않는다", () => {
    expect(useCutsStore.getState().recordView("no-such-clip")).toBe(false);
  });

  it("게스트의 좋아요는 로그인 유도를 반환한다", () => {
    const { publishClip, toggleLike } = useCutsStore.getState();
    const clip = seedClip();
    publishClip(clip);
    const result = toggleLike(clip.id, null);
    expect(result.needsLogin).toBe(true);
    expect(result.liked).toBe(false);
    expect(useCutsStore.getState().getClip(clip.id)?.likes).toBe(clip.likes);
  });

  it("로그인 사용자의 좋아요는 토글된다", () => {
    const { publishClip, toggleLike } = useCutsStore.getState();
    const clip = seedClip();
    publishClip(clip);
    const liked = toggleLike(clip.id, "user-1");
    expect(liked).toEqual({ liked: true, needsLogin: false });
    expect(useCutsStore.getState().getClip(clip.id)?.likes).toBe(clip.likes + 1);
    const unliked = toggleLike(clip.id, "user-1");
    expect(unliked.liked).toBe(false);
    expect(useCutsStore.getState().getClip(clip.id)?.likes).toBe(clip.likes);
  });

  it("좋아요 수가 음수가 되지 않는다", () => {
    const { publishClip, toggleLike } = useCutsStore.getState();
    const clip = { ...seedClip(), likes: 0 };
    publishClip(clip);
    // 좋아요하지 않은 상태에서 취소 토글은 일어나지 않으므로 0 유지
    expect(useCutsStore.getState().getClip(clip.id)?.likes).toBe(0);
    toggleLike(clip.id, "user-1");
    toggleLike(clip.id, "user-1");
    expect(useCutsStore.getState().getClip(clip.id)?.likes).toBe(0);
  });

  it("조회수·좋아요 기록은 서버 전송 큐에 쌓인다", () => {
    const { publishClip, recordView, toggleLike } = useCutsStore.getState();
    const clip = seedClip();
    publishClip(clip);
    recordView(clip.id);
    toggleLike(clip.id, "user-1");
    const queue = useCutsStore.getState().pendingSync;
    expect(queue).toContainEqual({ kind: "view", clipId: clip.id });
    expect(queue).toContainEqual({ kind: "like", clipId: clip.id });
  });
});

describe("팬 리믹스 허용 토글", () => {
  it("게스트의 토글은 로그인 유도를 반환하고 상태를 바꾸지 않는다", () => {
    const { setRemixAllowed } = useCutsStore.getState();
    const result = setRemixAllowed({ titleId: "sky-whale", episodeNumber: 3 }, true, null);
    expect(result).toEqual({ applied: false, needsLogin: true });
    expect(useCutsStore.getState().remixPolicyOverrides).toEqual({});
  });

  it("회차 단위 토글이 정책 키에 기록되고 판정에 반영된다", () => {
    const { setRemixAllowed } = useCutsStore.getState();
    const episode = DEMO_EPISODES[0];
    expect(episode.remixAllowed).toBeUndefined();
    const result = setRemixAllowed(
      { titleId: episode.titleId, episodeNumber: episode.episodeNumber },
      true,
      "author-1",
    );
    expect(result).toEqual({ applied: true, needsLogin: false });
    const overrides = useCutsStore.getState().remixPolicyOverrides;
    expect(overrides[remixEpisodePolicyKey(episode.titleId, episode.episodeNumber)]).toBe(true);
    expect(resolveRemixAllowed(episode, overrides)).toBe(true);
  });

  it("작품 단위 토글은 선언값 true인 작품도 끌 수 있다", () => {
    const { setRemixAllowed } = useCutsStore.getState();
    const episode = DEMO_EPISODES[1];
    expect(episode.remixAllowed).toBe(true);
    setRemixAllowed({ titleId: episode.titleId }, false, "author-1");
    const overrides = useCutsStore.getState().remixPolicyOverrides;
    expect(overrides[remixTitlePolicyKey(episode.titleId)]).toBe(false);
    expect(resolveRemixAllowed(episode, overrides)).toBe(false);
  });
});

describe("formatCutsCount", () => {
  it("천·만 단위로 축약한다", () => {
    expect(formatCutsCount(999)).toBe("999");
    expect(formatCutsCount(1200)).toBe("1.2천");
    expect(formatCutsCount(10000)).toBe("1만");
    expect(formatCutsCount(128400)).toBe("12.8만");
  });

  it("잘못된 입력은 0으로 처리한다", () => {
    expect(formatCutsCount(-5)).toBe("0");
    expect(formatCutsCount(Number.NaN)).toBe("0");
  });
});
