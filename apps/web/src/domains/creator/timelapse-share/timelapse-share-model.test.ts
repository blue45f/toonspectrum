// timelapse-share-model 순수 모듈 테스트 — 클립 생성·정렬·가시성·썸네일 캡처.
import { describe, expect, it } from "vitest";

import {
  MAX_TIMELAPSE_CLIPS,
  TIMELAPSE_THUMBNAIL_MAX_WIDTH,
  buildTimelapseSharedClip,
  captureTimelapseThumbnailDataUrl,
  parseTimelapseClipSort,
  sortTimelapseClips,
  visibleTimelapseClips,
  type TimelapseSharedClip,
  type TimelapseThumbnailCanvas,
  type TimelapseThumbnailSource,
} from "./timelapse-share-model";

function clip(over: Partial<TimelapseSharedClip> = {}): TimelapseSharedClip {
  return {
    id: `timelapse-clip:${over.title ?? "x"}`,
    title: "테스트 클립",
    description: "",
    visibility: "public",
    width: 720,
    height: 1280,
    durationSec: 30,
    stepCount: 12,
    watermark: true,
    authorName: "게스트",
    authorIsGuest: true,
    ownerKey: "guest:abc123",
    createdAt: "2026-10-01T10:00:00.000Z",
    likes: 0,
    views: 0,
    liked: false,
    thumbnailDataUrl: "",
    ...over,
  };
}

describe("buildTimelapseSharedClip", () => {
  it("제목·설명은 다듬고 길이 상한을 지킨다", () => {
    const built = buildTimelapseSharedClip({
      title: "  나의 그리기 과정  ",
      description: "설명",
      visibility: "public",
      width: 720,
      height: 1280,
      durationSec: 30,
      stepCount: 10,
      watermark: true,
      authorName: "게스트",
      authorIsGuest: true,
      ownerKey: "guest:x",
      thumbnailDataUrl: "",
    });
    expect(built.title).toBe("나의 그리기 과정");
    expect(built.likes).toBe(0);
    expect(built.views).toBe(0);
    expect(built.liked).toBe(false);
    expect(built.id.startsWith("timelapse-clip:")).toBe(true);
  });

  it("빈 제목은 기본 제목으로 대체된다", () => {
    const built = buildTimelapseSharedClip({
      title: "   ",
      description: "",
      visibility: "private",
      width: 0,
      height: -5,
      durationSec: -1,
      stepCount: 3,
      watermark: false,
      authorName: "",
      authorIsGuest: false,
      ownerKey: "",
      thumbnailDataUrl: "",
    });
    expect(built.title).toBe("제목 없는 타임랩스");
    expect(built.authorName).toBe("익명의 창작자");
    expect(built.width).toBe(1);
    expect(built.height).toBe(1);
    expect(built.durationSec).toBe(0);
  });

  it("ID는 매번 다르게 발급된다", () => {
    const base = {
      title: "t",
      description: "",
      visibility: "public" as const,
      width: 100,
      height: 100,
      durationSec: 5,
      stepCount: 1,
      watermark: true,
      authorName: "a",
      authorIsGuest: true,
      ownerKey: "guest:y",
      thumbnailDataUrl: "",
    };
    const a = buildTimelapseSharedClip(base);
    const b = buildTimelapseSharedClip(base);
    expect(a.id).not.toBe(b.id);
  });
});

describe("sortTimelapseClips", () => {
  const clips = [
    clip({ id: "a", title: "a", likes: 5, views: 100, createdAt: "2026-10-01T09:00:00.000Z" }),
    clip({ id: "b", title: "b", likes: 9, views: 10, createdAt: "2026-10-01T08:00:00.000Z" }),
    clip({ id: "c", title: "c", likes: 9, views: 50, createdAt: "2026-10-01T11:00:00.000Z" }),
  ];

  it("recent — 최신 게시 순", () => {
    expect(sortTimelapseClips(clips, "recent").map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("likes — 좋아요 순, 동점자는 최신 순", () => {
    expect(sortTimelapseClips(clips, "likes").map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it("views — 조회수 순", () => {
    expect(sortTimelapseClips(clips, "views").map((c) => c.id)).toEqual(["a", "c", "b"]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const before = clips.map((c) => c.id);
    sortTimelapseClips(clips, "likes");
    expect(clips.map((c) => c.id)).toEqual(before);
  });
});

describe("visibleTimelapseClips", () => {
  const mine = clip({ id: "mine", title: "mine", visibility: "private", ownerKey: "user:me" });
  const link = clip({ id: "link", title: "link", visibility: "unlisted", ownerKey: "user:me" });
  const pub = clip({ id: "pub", title: "pub", visibility: "public", ownerKey: "user:other" });
  const otherPrivate = clip({ id: "op", title: "op", visibility: "private", ownerKey: "user:other" });

  it("public은 모두에게 보이고 private/unlisted는 소유자에게만 보인다", () => {
    const visible = visibleTimelapseClips([mine, link, pub, otherPrivate], {
      ownerIds: ["user:me"],
    });
    expect(visible.map((c) => c.id).sort()).toEqual(["link", "mine", "pub"]);
  });

  it("낯선 시청자에게는 public만 보인다", () => {
    const visible = visibleTimelapseClips([mine, link, pub, otherPrivate], { ownerIds: [] });
    expect(visible.map((c) => c.id)).toEqual(["pub"]);
  });
});

describe("buildTimelapseSharedClip ownerKey", () => {
  it("ownerKey가 비면 guest:anonymous로 대체된다", () => {
    const built = buildTimelapseSharedClip({
      title: "t",
      description: "",
      visibility: "public",
      width: 100,
      height: 100,
      durationSec: 5,
      stepCount: 1,
      watermark: true,
      authorName: "a",
      authorIsGuest: true,
      ownerKey: "   ",
      thumbnailDataUrl: "",
    });
    expect(built.ownerKey).toBe("guest:anonymous");
  });
});

describe("parseTimelapseClipSort", () => {
  it("알 수 없는 값·빈 값은 recent로 되돌린다", () => {
    expect(parseTimelapseClipSort("likes")).toBe("likes");
    expect(parseTimelapseClipSort("views")).toBe("views");
    expect(parseTimelapseClipSort("recent")).toBe("recent");
    expect(parseTimelapseClipSort("weird")).toBe("recent");
    expect(parseTimelapseClipSort(null)).toBe("recent");
    expect(parseTimelapseClipSort(undefined)).toBe("recent");
  });
});

describe("captureTimelapseThumbnailDataUrl", () => {
  // jsdom에는 실제 캔버스 이미지가 없으므로 타입만 맞춘 가짜 소스를 쓴다.
  function fakeImageSource(width: number, height: number): TimelapseThumbnailSource {
    return { source: {} as unknown as CanvasImageSource, width, height };
  }

  it("원본 비율을 유지하며 maxWidth로 축소한 data URL을 만든다", () => {
    const draws: Array<{ x: number; y: number; w: number; h: number }> = [];
    const fakeCanvas: TimelapseThumbnailCanvas = {
      width: 0,
      height: 0,
      getContext: () =>
        ({
          drawImage: (_s: unknown, x: number, y: number, w: number, h: number) => {
            draws.push({ x, y, w, h });
          },
        }) as unknown as CanvasRenderingContext2D,
      toDataURL: () => "data:image/jpeg;base64,thumb",
    };
    let created = { w: 0, h: 0 };
    const url = captureTimelapseThumbnailDataUrl(
      fakeImageSource(720, 1280),
      (w, h) => {
        created = { w, h };
        return fakeCanvas;
      },
      TIMELAPSE_THUMBNAIL_MAX_WIDTH,
    );
    // 720x1280 → 너비 320 기준 축소, 세로는 비율 유지(320*1280/720 = 568.8… → 569)
    expect(created.w).toBe(320);
    expect(created.h).toBe(569);
    expect(draws).toHaveLength(1);
    expect(url).toBe("data:image/jpeg;base64,thumb");
  });

  it("작은 원본은 확대하지 않는다", () => {
    const fakeCanvas: TimelapseThumbnailCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }) as unknown as CanvasRenderingContext2D,
      toDataURL: () => "data:image/jpeg;base64,thumb",
    };
    let created = { w: 0, h: 0 };
    captureTimelapseThumbnailDataUrl(
      fakeImageSource(200, 100),
      (w, h) => {
        created = { w, h };
        return fakeCanvas;
      },
    );
    expect(created).toEqual({ w: 200, h: 100 });
  });

  it("2d 컨텍스트가 없으면 빈 문자열", () => {
    const url = captureTimelapseThumbnailDataUrl(
      fakeImageSource(100, 100),
      () => ({ width: 1, height: 1, getContext: () => null, toDataURL: () => "" }),
    );
    expect(url).toBe("");
  });
});

describe("상수", () => {
  it("갤러리 보관 상한이 양수다", () => {
    expect(MAX_TIMELAPSE_CLIPS).toBeGreaterThan(0);
  });
});
