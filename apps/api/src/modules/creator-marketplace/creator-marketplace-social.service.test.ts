import {
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CreatorMarketplaceSocialPermissionError,
  CreatorMarketplaceSocialRepository,
  CreatorMarketplaceSocialResourceNotFoundError,
  CreatorMarketplaceSocialReviewEligibilityError,
} from "./creator-marketplace-social.repository";
import { CreatorMarketplaceSocialService } from "./creator-marketplace-social.service";

const mocks = vi.hoisted(() => ({
  isAdminUser: vi.fn(),
}));

vi.mock("../../server/app-config", () => ({
  isAdminUser: mocks.isAdminUser,
}));

function repositoryMock() {
  return {
    getSnapshot: vi.fn(),
    createComment: vi.fn(),
    deleteComment: vi.fn(),
    setCommentLike: vi.fn(),
    upsertReview: vi.fn(),
    deleteReview: vi.fn(),
    setReviewHelpful: vi.fn(),
  };
}

describe("CreatorMarketplaceSocialService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdminUser.mockResolvedValue(false);
  });

  it("maps an unavailable public release to a not-found response", async () => {
    const repository = repositoryMock();
    repository.getSnapshot.mockRejectedValue(
      new CreatorMarketplaceSocialResourceNotFoundError(),
    );
    const service = new CreatorMarketplaceSocialService(
      repository as unknown as CreatorMarketplaceSocialRepository,
    );

    await expect(
      service.getSnapshot("10000000-0000-4000-8000-000000000001"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ["publisher", "배급자는 자신의 리소스에 평가"],
    ["library_required", "마켓 보관함에 추가했거나 Studio에서 설치"],
  ] as const)(
    "maps %s review eligibility failures without leaking storage details",
    async (reason, expectedMessage) => {
      const repository = repositoryMock();
      repository.upsertReview.mockRejectedValue(
        new CreatorMarketplaceSocialReviewEligibilityError(reason),
      );
      const service = new CreatorMarketplaceSocialService(
        repository as unknown as CreatorMarketplaceSocialRepository,
      );

      await expect(
        service.upsertReview(
          "10000000-0000-4000-8000-000000000001",
          "20000000-0000-4000-8000-000000000001",
          {
            rating: 5,
            title: "좋은 소재",
            content: "Studio 작업에 활용했습니다.",
            roleTag: null,
            tags: [],
          },
        ),
      ).rejects.toMatchObject({
        constructor: ForbiddenException,
        response: expect.objectContaining({ message: expectedMessage }),
      });
    },
  );

  it("passes the server-derived administrator bit into deletion policy", async () => {
    const repository = repositoryMock();
    repository.deleteComment.mockResolvedValue(undefined);
    mocks.isAdminUser.mockResolvedValue(true);
    const service = new CreatorMarketplaceSocialService(
      repository as unknown as CreatorMarketplaceSocialRepository,
    );

    await expect(
      service.deleteComment(
        "10000000-0000-4000-8000-000000000001",
        "30000000-0000-4000-8000-000000000001",
        "20000000-0000-4000-8000-000000000001",
      ),
    ).resolves.toEqual({ deleted: true });
    expect(repository.deleteComment).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
      true,
    );
  });

  it("maps repository permission failures to a forbidden response", async () => {
    const repository = repositoryMock();
    repository.setReviewHelpful.mockRejectedValue(
      new CreatorMarketplaceSocialPermissionError(),
    );
    const service = new CreatorMarketplaceSocialService(
      repository as unknown as CreatorMarketplaceSocialRepository,
    );

    await expect(
      service.setReviewHelpful(
        "10000000-0000-4000-8000-000000000001",
        "30000000-0000-4000-8000-000000000001",
        "20000000-0000-4000-8000-000000000001",
        true,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
