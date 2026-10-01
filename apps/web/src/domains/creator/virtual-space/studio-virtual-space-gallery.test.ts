/**
 * 전시관 테스트 (Track 4 · 벤치마크 gap 3)
 */
import { describe, expect, it } from "vitest";

import {
  advanceDocentTour,
  createDocentTour,
  docentTourCurrent,
  docentTourProgress,
  recordGalleryView,
  STUDIO_GALLERY_PROXIMITY_RADIUS,
  studioGalleryFrameNear,
  studioGalleryPopularFrameIds,
  toggleGalleryLike,
  validateStudioGalleryFrames,
  type StudioGalleryFrame,
} from "./studio-virtual-space-gallery";

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

describe("액자 검증", () => {
  it("정상 목록은 통과한다", () => {
    expect(validateStudioGalleryFrames([frame(), frame({ id: "frame-b" })])).toEqual([]);
  });

  it("중복 id·빈 제목·잘못된 URL을 거부한다", () => {
    expect(validateStudioGalleryFrames([frame(), frame()]).length).toBeGreaterThan(0);
    expect(validateStudioGalleryFrames([frame({ titleKo: " " })]).length).toBeGreaterThan(0);
    expect(validateStudioGalleryFrames([frame({ imageUrl: "ftp://x/y.png" })]).length).toBeGreaterThan(0);
  });
});

describe("근접 판정", () => {
  it("기본 반경 140px 안의 가장 가까운 액자를 찾는다", () => {
    expect(STUDIO_GALLERY_PROXIMITY_RADIUS).toBe(140);
    const frames = [frame(), frame({ id: "frame-b", position: { x: 700, y: 300 } })];
    expect(studioGalleryFrameNear(frames, { x: 410, y: 310 })?.id).toBe("frame-a");
    expect(studioGalleryFrameNear(frames, { x: 0, y: 0 })).toBeNull();
  });

  it("반경을 지정할 수 있다", () => {
    const frames = [frame()];
    expect(studioGalleryFrameNear(frames, { x: 400, y: 500 }, 100)).toBeNull();
    expect(studioGalleryFrameNear(frames, { x: 400, y: 500 }, 250)?.id).toBe("frame-a");
  });
});

describe("도슨트 투어", () => {
  const frames = [frame(), frame({ id: "frame-b" }), frame({ id: "frame-c" })];

  it("액자 순서대로 투어를 만든다", () => {
    const tour = createDocentTour(frames);
    expect(docentTourCurrent(tour, frames)?.id).toBe("frame-a");
    expect(docentTourProgress(tour)).toBe(0);
  });

  it("지정한 순서대로 순회한다", () => {
    const tour = createDocentTour(frames, ["frame-c", "frame-a"]);
    expect(docentTourCurrent(tour, frames)?.id).toBe("frame-c");
    const next = advanceDocentTour(tour);
    expect(docentTourCurrent(next!, frames)?.id).toBe("frame-a");
    expect(docentTourProgress(next!)).toBe(1);
  });

  it("끝에 도달하면 null을 반환한다", () => {
    const tour = createDocentTour(frames);
    const second = advanceDocentTour(tour)!;
    const third = advanceDocentTour(second)!;
    expect(advanceDocentTour(third)).toBeNull();
  });

  it("없는 id는 순서에서 제외하고, 전부 없으면 예외", () => {
    const tour = createDocentTour(frames, ["nope", "frame-b"]);
    expect(tour.frameIds).toEqual(["frame-b"]);
    expect(() => createDocentTour(frames, ["nope"])).toThrow();
    expect(() => createDocentTour([])).toThrow();
  });
});

describe("조회수·좋아요 집계", () => {
  it("조회수를 누적한다", () => {
    let stats = recordGalleryView({}, "frame-a");
    stats = recordGalleryView(stats, "frame-a");
    expect(stats["frame-a"]?.views).toBe(2);
  });

  it("좋아요를 토글한다", () => {
    let stats = toggleGalleryLike({}, "frame-a", "user-1");
    expect(stats["frame-a"]?.likes).toBe(1);
    stats = toggleGalleryLike(stats, "frame-a", "user-2");
    expect(stats["frame-a"]?.likes).toBe(2);
    stats = toggleGalleryLike(stats, "frame-a", "user-1");
    expect(stats["frame-a"]?.likes).toBe(1);
    expect(stats["frame-a"]?.likedBy).toEqual(["user-2"]);
  });

  it("빈 userId는 예외를 던진다", () => {
    expect(() => toggleGalleryLike({}, "frame-a", " ")).toThrow();
  });

  it("인기순 id를 반환한다 (좋아요 가중치 3)", () => {
    const frames = [frame(), frame({ id: "frame-b" }), frame({ id: "frame-c" })];
    let stats = recordGalleryView({}, "frame-a");
    stats = recordGalleryView(stats, "frame-a");
    stats = toggleGalleryLike(stats, "frame-b", "user-1");
    // frame-b: 0 views + 1 like*3 = 3 > frame-a: 2 views
    expect(studioGalleryPopularFrameIds(frames, stats, 2)).toEqual(["frame-b", "frame-a"]);
  });
});
