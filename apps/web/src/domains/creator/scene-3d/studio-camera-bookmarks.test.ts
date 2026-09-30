import { describe, expect, it } from "vitest";

import {
  addStudioCameraBookmark,
  applyStudioCameraBookmark,
  clampStudioCameraFov,
  createStudioCameraBookmark,
  findStudioCameraBookmark,
  removeStudioCameraBookmark,
  updateStudioCameraBookmark,
  StudioCameraBookmarkError,
  STUDIO_CAMERA_FOV_MAX,
  STUDIO_CAMERA_FOV_MIN,
} from "./studio-camera-bookmarks";

describe("studio camera bookmarks", () => {
  it("FOV는 10~120으로 클램프됩니다", () => {
    expect(clampStudioCameraFov(5)).toBe(STUDIO_CAMERA_FOV_MIN);
    expect(clampStudioCameraFov(200)).toBe(STUDIO_CAMERA_FOV_MAX);
    expect(clampStudioCameraFov(Number.NaN)).toBe(50);
  });

  it("북마크 저장→복원 라운드트립이 동작합니다", () => {
    const bookmark = createStudioCameraBookmark(
      { name: "컷 1", position: [1, 1.5, 3], target: [0, 1, 0], fov: 40 },
      () => 1_700_000_000_000,
    );
    expect(bookmark.savedAt).toBe(1_700_000_000_000);
    const list = addStudioCameraBookmark([], bookmark);
    const found = findStudioCameraBookmark(list, bookmark.id);
    expect(found).toBeDefined();
    const applied = applyStudioCameraBookmark(found!);
    expect(applied.position).toEqual([1, 1.5, 3]);
    expect(applied.target).toEqual([0, 1, 0]);
    expect(applied.fov).toBe(40);
  });

  it("빈 이름·잘못된 벡터는 거부됩니다", () => {
    expect(() =>
      createStudioCameraBookmark({ name: "  ", position: [0, 0, 0], target: [0, 0, 0], fov: 40 }),
    ).toThrowError(StudioCameraBookmarkError);
    expect(() =>
      createStudioCameraBookmark({ name: "x", position: [0, 0], target: [0, 0, 0], fov: 40 }),
    ).toThrowError(StudioCameraBookmarkError);
  });

  it("ID 중복 추가는 거부됩니다", () => {
    const bookmark = createStudioCameraBookmark(
      { name: "a", position: [0, 0, 1], target: [0, 0, 0], fov: 50 },
    );
    const list = addStudioCameraBookmark([], bookmark);
    expect(() => addStudioCameraBookmark(list, bookmark)).toThrowError(StudioCameraBookmarkError);
  });

  it("업데이트와 삭제가 동작합니다", () => {
    const bookmark = createStudioCameraBookmark(
      { name: "a", position: [0, 0, 1], target: [0, 0, 0], fov: 50 },
    );
    let list = addStudioCameraBookmark([], bookmark);
    list = updateStudioCameraBookmark(list, bookmark.id, { name: "b", fov: 999 });
    expect(list[0]?.name).toBe("b");
    expect(list[0]?.fov).toBe(STUDIO_CAMERA_FOV_MAX);
    list = removeStudioCameraBookmark(list, bookmark.id);
    expect(list).toHaveLength(0);
  });
});
