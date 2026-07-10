import { ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CreatorWorkRevisionConflictError,
  CreatorWorkRevisionNotFoundError,
} from "../../../../../lib/server/creator-work-revisions";

import { CreatorService } from "./creator.service";

const {
  getWork,
  getWorkRevision,
  listWorkRevisions,
  restoreWorkRevision,
  updateWork,
  bumpViews,
  generateImageAsset,
} = vi.hoisted(() => ({
  getWork: vi.fn(),
  getWorkRevision: vi.fn(),
  listWorkRevisions: vi.fn(),
  restoreWorkRevision: vi.fn(),
  updateWork: vi.fn(),
  bumpViews: vi.fn(),
  generateImageAsset: vi.fn(),
}));

vi.mock("../../../../../lib/server/creator", () => ({
  addComment: vi.fn(),
  bumpAssetDownloads: vi.fn(),
  bumpViews,
  createSeries: vi.fn(),
  createWork: vi.fn(),
  deleteSeries: vi.fn(),
  deleteSharedAsset: vi.fn(),
  deleteWork: vi.fn(),
  generateImageAsset,
  getChallenge: vi.fn(),
  getCreatorPublicProfile: vi.fn(),
  getSeries: vi.fn(),
  getWork,
  getWorkRevision,
  listChallenges: vi.fn(),
  listComments: vi.fn(),
  listSeries: vi.fn(),
  listSharedAssets: vi.fn(),
  listWorkRevisions,
  listWorks: vi.fn(),
  parseCreatorSort: vi.fn(() => "recent"),
  parseSeriesSort: vi.fn(() => "recent"),
  publishAsset: vi.fn(),
  restoreWorkRevision,
  toggleFollow: vi.fn(),
  toggleLike: vi.fn(),
  updateSeries: vi.fn(),
  updateWork,
}));

describe("CreatorService safety gates", () => {
  beforeEach(() => {
    getWork.mockReset();
    getWorkRevision.mockReset();
    listWorkRevisions.mockReset();
    restoreWorkRevision.mockReset();
    updateWork.mockReset();
    bumpViews.mockReset();
    generateImageAsset.mockReset();
    delete process.env.CREATOR_IMAGE_AI_ENABLED;
  });

  afterEach(() => {
    delete process.env.CREATOR_IMAGE_AI_ENABLED;
  });

  it("소유자의 작품 조회는 공개 조회수를 올리지 않는다", async () => {
    getWork.mockResolvedValue({ id: "work-owner", isOwner: true });
    await expect(new CreatorService().getWork("work-owner", "owner")).resolves.toMatchObject({ id: "work-owner" });
    expect(bumpViews).not.toHaveBeenCalled();
  });

  it("비소유자의 공개 작품 조회만 조회수를 올린다", async () => {
    getWork.mockResolvedValue({ id: "work-reader", isOwner: false });
    await new CreatorService().getWork("work-reader", "reader");
    expect(bumpViews).toHaveBeenCalledWith("work-reader");
  });

  it("서버 이미지 생성은 명시적 kill switch가 켜지기 전까지 호출하지 않는다", async () => {
    await expect(new CreatorService().generateAsset("image-user-disabled", { prompt: "도시" })).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
    expect(generateImageAsset).not.toHaveBeenCalled();
  });

  it("활성화된 서버 이미지 생성은 사용자 ID가 있는 제한 경로에서만 실행한다", async () => {
    process.env.CREATOR_IMAGE_AI_ENABLED = "true";
    generateImageAsset.mockResolvedValue({ dataUrl: "data:image/webp;base64,AA==" });
    await expect(
      new CreatorService().generateAsset("image-user-enabled-once", { prompt: "도시" })
    ).resolves.toMatchObject({ dataUrl: "data:image/webp;base64,AA==" });
    expect(generateImageAsset).toHaveBeenCalledOnce();
  });

  it("stale baseRevision은 비밀정보 없이 현재 revision만 담은 409로 변환한다", async () => {
    updateWork.mockRejectedValue(new CreatorWorkRevisionConflictError(8));
    const error = await new CreatorService()
      .updateWork("owner", "work-1", { title: "수정", baseRevision: 7 })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toEqual({
      code: "creator_work_revision_conflict",
      message: "다른 저장이 먼저 반영되었습니다. 작품을 다시 불러온 뒤 변경 내용을 확인해 주세요.",
      currentRevision: 8,
    });
    expect(JSON.stringify((error as ConflictException).getResponse())).not.toContain("snapshot");
  });

  it("owner-only revision 조회는 작품 없음과 타인 작품을 구분하지 않는 404로 변환한다", async () => {
    getWorkRevision.mockRejectedValue(new CreatorWorkRevisionNotFoundError());
    await expect(new CreatorService().getWorkRevision("reader", "private-work", 1)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("복원 충돌도 현재 revision만 담은 409로 변환한다", async () => {
    restoreWorkRevision.mockRejectedValue(new CreatorWorkRevisionConflictError(11));
    const error = await new CreatorService()
      .restoreWorkRevision("owner", "work-1", 2, 10)
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: "creator_work_revision_conflict",
      currentRevision: 11,
    });
  });
});
