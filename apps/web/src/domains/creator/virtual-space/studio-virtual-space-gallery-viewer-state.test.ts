/**
 * 전시관 뷰어 상태 테스트 (트랙 B)
 */
import { describe, expect, it } from "vitest";

import { validateStudioGalleryFrames, type StudioGalleryFrame } from "./studio-virtual-space-gallery";
import { studioVirtualSpaceDefaultGalleryFrames } from "./studio-virtual-space-gallery-defaults";
import {
  applyGalleryLike,
  galleryFrameLikedBy,
  galleryFrameStatsOf,
  resolveGalleryCurrentFrame,
} from "./studio-virtual-space-gallery-viewer-state";

function frame(overrides: Partial<StudioGalleryFrame> = {}): StudioGalleryFrame {
  return {
    id: "frame-a",
    titleKo: "첫 장면", titleEn: "First scene",
    artistNoteKo: "비가 오는 장면이에요.", artistNoteEn: "A rainy scene.",
    imageUrl: "https://example.com/art/frame-a@2x.png",
    position: { x: 400, y: 300 },
    ...overrides,
  };
}

describe("현재 액자 해석", () => {
  const frames = [frame(), frame({ id: "frame-b", position: { x: 900, y: 300 } })];

  it("근접 액자가 고정한 액자보다 우선한다", () => {
    expect(resolveGalleryCurrentFrame(frames, { x: 410, y: 300 }, "frame-b")?.id).toBe("frame-a");
  });

  it("근처에 없으면 고정한 액자를 보여준다", () => {
    expect(resolveGalleryCurrentFrame(frames, { x: 0, y: 0 }, "frame-b")?.id).toBe("frame-b");
    expect(resolveGalleryCurrentFrame(frames, null, "frame-b")?.id).toBe("frame-b");
  });

  it("둘 다 없으면 null이다", () => {
    expect(resolveGalleryCurrentFrame(frames, { x: 0, y: 0 }, null)).toBeNull();
    expect(resolveGalleryCurrentFrame(frames, null, "nope")).toBeNull();
  });
});

describe("게스트 안전 좋아요", () => {
  it("게스트는 상태를 바꾸지 않고 login-required를 받는다", () => {
    const result = applyGalleryLike({}, "frame-a", null);
    expect(result).toEqual({ ok: false, reason: "login-required" });
    expect(applyGalleryLike({}, "frame-a", " ")).toEqual({ ok: false, reason: "login-required" });
  });

  it("로그인 사용자는 토글되고 liked가 반영된다", () => {
    const liked = applyGalleryLike({}, "frame-a", "user-1");
    expect(liked.ok).toBe(true);
    if (!liked.ok) return;
    expect(liked.liked).toBe(true);
    expect(liked.stats["frame-a"]?.likes).toBe(1);
    const unliked = applyGalleryLike(liked.stats, "frame-a", "user-1");
    expect(unliked.ok).toBe(true);
    if (!unliked.ok) return;
    expect(unliked.liked).toBe(false);
    expect(unliked.stats["frame-a"]?.likes).toBe(0);
  });

  it("집계 기본값과 좋아요 여부를 읽는다", () => {
    expect(galleryFrameStatsOf({}, "frame-a")).toEqual({ views: 0, likes: 0, likedBy: [] });
    expect(galleryFrameLikedBy({}, "frame-a", "user-1")).toBe(false);
    expect(galleryFrameLikedBy({}, "frame-a", null)).toBe(false);
    const liked = applyGalleryLike({}, "frame-a", "user-1");
    if (liked.ok) expect(galleryFrameLikedBy(liked.stats, "frame-a", "user-1")).toBe(true);
  });
});

describe("기본 액자 세트", () => {
  it("콘티 갤러리 구역 안에 4점이 있고 검증 규칙을 통과하는 형태다", () => {
    const frames = studioVirtualSpaceDefaultGalleryFrames();
    expect(frames).toHaveLength(4);
    expect(validateStudioGalleryFrames(frames)).toEqual([]);
    for (const item of frames) {
      expect(item.position.x).toBeGreaterThanOrEqual(340);
      expect(item.position.x).toBeLessThanOrEqual(610);
      expect(item.position.y).toBeGreaterThanOrEqual(40);
      expect(item.position.y).toBeLessThanOrEqual(250);
      expect(item.imageUrl.startsWith("/")).toBe(true);
      expect(item.titleKo.trim().length).toBeGreaterThan(0);
      expect(item.artistNoteEn.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(frames.map((item) => item.id)).size).toBe(4);
  });
});
