/**
 * 컷츠 팬 리믹스 순수 로직 테스트 — 허용 정책 판정·게시 가드·원작 메타 강제·목록 선택자.
 */

import { describe, expect, it } from "vitest";

import { buildCutsClip } from "./cuts-clip-builder";
import {
  buildRemixClip,
  buildRemixOrigin,
  countFanRemixes,
  guardRemixPublish,
  isClipRemixAllowed,
  isFanRemix,
  remixEpisodePolicyKey,
  remixTitlePolicyKey,
  resolveRemixAllowed,
  selectFanRemixes,
  withRemixOrigin,
  type RemixPolicySource,
} from "./cuts-remix";
import { DEMO_EPISODES } from "./cuts-seed";
import type { CutsClip, EpisodeSource } from "./cuts-types";

const ALLOWED_SOURCE: RemixPolicySource = {
  titleId: "sky-whale",
  episodeNumber: 3,
  remixAllowed: true,
};
const DENIED_SOURCE: RemixPolicySource = { titleId: "midnight-noodle", episodeNumber: 12 };
const EXPLICITLY_DENIED_SOURCE: RemixPolicySource = {
  titleId: "detective-bunsik",
  episodeNumber: 7,
  remixAllowed: false,
};

describe("resolveRemixAllowed", () => {
  it("선언값이 없으면 기본으로 허용하지 않는다 (opt-in)", () => {
    expect(resolveRemixAllowed(DENIED_SOURCE)).toBe(false);
  });

  it("회차가 허용을 선언하면 허용한다", () => {
    expect(resolveRemixAllowed(ALLOWED_SOURCE)).toBe(true);
  });

  it("작품 오버라이드가 선언값보다 우선한다", () => {
    expect(
      resolveRemixAllowed(ALLOWED_SOURCE, { [remixTitlePolicyKey("sky-whale")]: false }),
    ).toBe(false);
    expect(
      resolveRemixAllowed(EXPLICITLY_DENIED_SOURCE, {
        [remixTitlePolicyKey("detective-bunsik")]: true,
      }),
    ).toBe(true);
  });

  it("회차 오버라이드가 작품 오버라이드보다 우선한다", () => {
    const overrides = {
      [remixTitlePolicyKey("sky-whale")]: true,
      [remixEpisodePolicyKey("sky-whale", 3)]: false,
    };
    expect(resolveRemixAllowed(ALLOWED_SOURCE, overrides)).toBe(false);
    expect(
      resolveRemixAllowed(ALLOWED_SOURCE, {
        [remixTitlePolicyKey("sky-whale")]: false,
        [remixEpisodePolicyKey("sky-whale", 3)]: true,
      }),
    ).toBe(true);
  });

  it("다른 작품·다른 회차의 오버라이드는 영향을 주지 않는다", () => {
    const overrides = {
      [remixTitlePolicyKey("other-title")]: true,
      [remixEpisodePolicyKey("sky-whale", 99)]: true,
    };
    expect(resolveRemixAllowed(DENIED_SOURCE, overrides)).toBe(false);
  });
});

describe("isClipRemixAllowed", () => {
  it("클립에 대응하는 회차 선언값으로 판정한다", () => {
    const sources = [ALLOWED_SOURCE, DENIED_SOURCE];
    expect(
      isClipRemixAllowed({ titleId: "sky-whale", episodeNumber: 3 }, sources),
    ).toBe(true);
    expect(
      isClipRemixAllowed({ titleId: "midnight-noodle", episodeNumber: 12 }, sources),
    ).toBe(false);
  });

  it("선언값을 모르는 작품은 기본 꺼짐이지만 오버라이드로는 열 수 있다", () => {
    expect(isClipRemixAllowed({ titleId: "unknown", episodeNumber: 1 }, [])).toBe(false);
    expect(
      isClipRemixAllowed({ titleId: "unknown", episodeNumber: 1 }, [], {
        [remixEpisodePolicyKey("unknown", 1)]: true,
      }),
    ).toBe(true);
  });
});

describe("guardRemixPublish", () => {
  it("게스트는 허용 작품이어도 로그인 유도를 받는다", () => {
    expect(guardRemixPublish(ALLOWED_SOURCE, {}, null)).toEqual({
      ok: false,
      reason: "needs-login",
    });
  });

  it("허용이 꺼진 작품은 로그인해도 게시할 수 없다", () => {
    expect(guardRemixPublish(DENIED_SOURCE, {}, "fan-1")).toEqual({
      ok: false,
      reason: "not-allowed",
    });
  });

  it("미리보기 뒤 허용이 꺼졌으면 게시 시점에 차단된다", () => {
    const overrides = { [remixEpisodePolicyKey("sky-whale", 3)]: false };
    expect(guardRemixPublish(ALLOWED_SOURCE, overrides, "fan-1")).toEqual({
      ok: false,
      reason: "not-allowed",
    });
  });

  it("허용 작품 + 로그인이면 게시할 수 있다", () => {
    expect(guardRemixPublish(ALLOWED_SOURCE, {}, "fan-1")).toEqual({ ok: true });
  });
});

function remixClipOf(episode: EpisodeSource, fanId: string, originalClipId: string): CutsClip {
  const clip = buildRemixClip(episode, fanId, originalClipId);
  if (!clip) throw new Error("리믹스 클립 생성 실패");
  return clip;
}

describe("buildRemixClip · withRemixOrigin", () => {
  it("리믹스 클립에는 원작 메타(작품명·원작자·원작 링크)가 강제된다", () => {
    const episode = DEMO_EPISODES[1];
    const clip = remixClipOf(episode, "fan-1", "cuts-sky-whale-ep3");
    expect(clip.remix).toEqual({
      originalClipId: "cuts-sky-whale-ep3",
      titleId: episode.titleId,
      title: episode.title,
      author: episode.author,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.episodeTitle,
      originalHref: `/title/${episode.titleId}`,
    });
    expect(clip.createdBy).toBe("fan-1");
    expect(clip.id.startsWith("cuts-remix-")).toBe(true);
  });

  it("패널이 없는 회차는 리믹스 클립을 만들지 않는다", () => {
    const empty: EpisodeSource = { ...DEMO_EPISODES[1], panels: [] };
    expect(buildRemixClip(empty, "fan-1", "cuts-x")).toBeNull();
  });

  it("입력 클립이 들고 있던 가짜 원작 메타는 원작 기준으로 덮어쓴다", () => {
    const episode = DEMO_EPISODES[1];
    const original = buildCutsClip(episode, "author-1");
    if (!original) throw new Error("원본 클립 생성 실패");
    const tampered: CutsClip = {
      ...remixClipOf(episode, "fan-1", original.id),
      remix: {
        originalClipId: "fake",
        titleId: "fake-title",
        title: "가짜 작품",
        author: "가짜 작가",
        episodeNumber: 999,
        episodeTitle: "가짜 회차",
        originalHref: "https://example.invalid/fake",
      },
    };
    const forced = withRemixOrigin(tampered, original);
    expect(forced.remix).toEqual(buildRemixOrigin(original));
    expect(forced.remix?.originalHref).toBe(`/title/${episode.titleId}`);
  });
});

describe("selectFanRemixes · countFanRemixes · isFanRemix", () => {
  it("작품별 팬 리믹스만 피드 순서대로 골라낸다", () => {
    const whale = DEMO_EPISODES[1];
    const noodle = DEMO_EPISODES[0];
    const original = buildCutsClip(whale, "author-1");
    if (!original) throw new Error("원본 클립 생성 실패");
    const remixA = remixClipOf(whale, "fan-a", original.id);
    const remixB = { ...remixClipOf(whale, "fan-b", original.id), id: "cuts-remix-second" };
    const otherTitleRemix = remixClipOf(noodle, "fan-c", "cuts-midnight-noodle-ep12");
    // 피드는 최신순 — remixB가 가장 앞에 있는 상태로 둔다.
    const feed = [remixB, otherTitleRemix, original, remixA];
    expect(selectFanRemixes(feed, "sky-whale").map((clip) => clip.id)).toEqual([
      remixB.id,
      remixA.id,
    ]);
    expect(countFanRemixes(feed, "sky-whale")).toBe(2);
    expect(countFanRemixes(feed, "midnight-noodle")).toBe(1);
    expect(selectFanRemixes(feed, "no-such-title")).toEqual([]);
  });

  it("일반 클립은 팬 리믹스가 아니다", () => {
    const original = buildCutsClip(DEMO_EPISODES[0], "author-1");
    if (!original) throw new Error("원본 클립 생성 실패");
    expect(isFanRemix(original)).toBe(false);
    expect(isFanRemix(remixClipOf(DEMO_EPISODES[0], "fan-1", original.id))).toBe(true);
  });
});
