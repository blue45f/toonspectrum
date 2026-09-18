import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../..");

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("membership operations integration boundaries", () => {
  it("enforces account quota before durable Studio asset inserts", () => {
    const workAsset = source(
      "apps/api/src/modules/creator/studio-work-asset.repository.ts",
    );
    const raster = source(
      "apps/api/src/modules/creator/studio-raster-asset.repository.ts",
    );

    const workQuota = workAsset.indexOf("enforceMembershipUploadQuota");
    const workInsert = workAsset.indexOf(".insert(creatorWorkAssets)", workQuota);
    expect(workQuota).toBeGreaterThanOrEqual(0);
    expect(workInsert).toBeGreaterThan(workQuota);

    const rasterQuota = raster.indexOf("enforceMembershipUploadQuota");
    const rasterInsert = raster.indexOf(
      ".insert(creatorWorkRasterAssets)",
      rasterQuota,
    );
    expect(rasterQuota).toBeGreaterThanOrEqual(0);
    expect(rasterInsert).toBeGreaterThan(rasterQuota);
  });

  it("enforces generated object storage before registering its durable reference", () => {
    const workAsset = source(
      "apps/api/src/modules/creator/studio-work-asset.repository.ts",
    );
    const method = workAsset.indexOf("async registerGeneratedStorageReference");
    const quota = workAsset.indexOf(
      "enforceMembershipGeneratedStorageQuota",
      method,
    );
    const reference = workAsset.indexOf(
      "registerStorageReferenceInTransaction",
      quota,
    );
    expect(method).toBeGreaterThanOrEqual(0);
    expect(quota).toBeGreaterThan(method);
    expect(reference).toBeGreaterThan(quota);
  });

  it("links destructive community and creator mutations to reward reversals", () => {
    const community = source(
      "apps/api/src/modules/community/community.service.ts",
    );
    const creator = source(
      "apps/api/src/modules/creator/creator.service.ts",
    );

    expect(community).toContain(
      '"community.post.created",\n        postId',
    );
    expect(community).toContain(
      '"community.comment.created",\n        replyId',
    );
    expect(creator).toContain(
      '"creator.work.created",\n            id',
    );
    expect(creator).toContain(
      '"creator.work.published",\n          id',
    );
    expect(creator).toContain(
      '"community.comment.created",\n          commentId',
    );
    expect(creator).toContain(
      '"community.comment.created",\n            "workId"',
    );
    expect(community).toContain("리뷰 답글 삭제에 따른 활동 포인트 회수");
  });

  it("stops automatic rewards for restricted trust accounts", () => {
    const wallet = source(
      "apps/api/src/modules/membership-wallet/membership-wallet.service.ts",
    );
    expect(wallet).toContain("rewardAccrualRestricted");
    expect(wallet).toContain('trustLevel === "restricted"');
    expect(wallet).toContain("restricted: true");
  });

  it("keeps recovery and policy history append-only at the database boundary", () => {
    const migration = source(
      "apps/api/src/db/migrations/0077_membership_operations.sql",
    );
    expect(migration).toContain("membership_reward_reversal");
    expect(migration).toContain("'reversal'");
    expect(migration).toContain("wallet_pending_reward_recovery");
    expect(migration).toContain("membership_policy_change_capture");
    expect(migration).not.toContain("DELETE FROM public.wallet_ledger_entry");
  });
});
