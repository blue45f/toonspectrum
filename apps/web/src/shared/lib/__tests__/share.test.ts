// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  absoluteShareImageUrl,
  absoluteShareUrl,
  emitShareEvent,
  shareTargetUrl,
  shareText,
  TOONSPECTRUM_SHARE_EVENT,
  withShareAttribution,
  type ShareEventDetail,
  type SharePayload,
} from "../share";

const payload: SharePayload = {
  title: "테스트 작품 · 툰스펙트럼",
  text: "  여러   줄의\n소개  ",
  url: "https://www.toonstudio.cloud/title/test-work?tab=reviews#top",
  imageUrl: "/covers/test.jpg",
};

describe("share URL normalization", () => {
  it("상대 주소를 지정된 origin의 절대 주소로 바꾼다", () => {
    expect(absoluteShareUrl("/ranking", "https://example.com")).toBe(
      "https://example.com/ranking",
    );
  });

  it("상대 이미지를 절대 주소로 만들고 기본 OG 이미지를 제공한다", () => {
    expect(absoluteShareImageUrl("/cover.png", "https://example.com")).toBe(
      "https://example.com/cover.png",
    );
    expect(absoluteShareImageUrl(undefined, "https://example.com")).toBe(
      "https://example.com/brand/toonstudio-og.png",
    );
  });

  it("기존 쿼리와 해시를 유지하며 채널별 UTM을 덧붙인다", () => {
    const attributed = new URL(withShareAttribution(payload.url, "naver"));
    expect(attributed.searchParams.get("tab")).toBe("reviews");
    expect(attributed.searchParams.get("utm_source")).toBe("naver");
    expect(attributed.searchParams.get("utm_medium")).toBe("social");
    expect(attributed.searchParams.get("utm_campaign")).toBe("content_share");
    expect(attributed.hash).toBe("#top");
  });

  it("공유 문구의 연속 공백과 줄바꿈을 정리한다", () => {
    expect(shareText(payload)).toBe("여러 줄의 소개");
  });
});

describe("share channel targets", () => {
  it("네이버 공유 URL에 제목과 추적 URL을 전달한다", () => {
    const target = new URL(shareTargetUrl("naver", payload));
    expect(target.host).toBe("share.naver.com");
    expect(target.searchParams.get("title")).toBe(payload.title);
    const shared = new URL(target.searchParams.get("url") ?? "");
    expect(shared.searchParams.get("utm_source")).toBe("naver");
  });

  it.each([
    ["line", "social-plugins.line.me"],
    ["x", "twitter.com"],
    ["facebook", "www.facebook.com"],
    ["linkedin", "www.linkedin.com"],
    ["telegram", "t.me"],
  ] as const)("%s 채널의 공식 공유 호스트를 사용한다", (channel, host) => {
    expect(new URL(shareTargetUrl(channel, payload)).host).toBe(host);
  });

  it("메일 제목·본문과 추적 URL을 생성한다", () => {
    const target = new URL(shareTargetUrl("email", payload));
    expect(target.protocol).toBe("mailto:");
    expect(target.searchParams.get("subject")).toBe(payload.title);
    expect(target.searchParams.get("body")).toContain("utm_source=email");
  });
});

describe("share events", () => {
  it("분석 이벤트에는 전체 URL 대신 채널·결과·경로만 담는다", () => {
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener(TOONSPECTRUM_SHARE_EVENT, listener);

    emitShareEvent("copy", "completed", payload);

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent<ShareEventDetail>;
    expect(event.detail).toEqual({
      channel: "copy",
      outcome: "completed",
      path: "/title/test-work",
    });

    window.removeEventListener(TOONSPECTRUM_SHARE_EVENT, listener);
  });
});
