import { describe, expect, it } from "vitest";

import {
  canCreateStudioPublishPackage,
  createEmptyStudioVersionCoordinates,
  resolveStudioVersionProjection,
  validateStudioVersionCoordinates,
  type StudioVersionCoordinates,
} from "./studio-version-coordinates";

function approvedCoordinates(): StudioVersionCoordinates {
  return {
    local: {
      sequence: 42,
      durableState: "opfs",
      documentDigest: "digest-r7",
      baseServerRevision: 7,
      pendingServerMutations: 0,
    },
    server: {
      revision: 7,
      contentDigest: "digest-r7",
    },
    review: {
      cycleId: "review-1",
      snapshotId: "snapshot-1",
      sourceRevision: 7,
      sourceDigest: "digest-r7",
      status: "approved",
    },
    approval: {
      approvalId: "approval-1",
      reviewSnapshotId: "snapshot-1",
      sourceRevision: 7,
      sourceDigest: "digest-r7",
    },
    publish: null,
  };
}

describe("studio version coordinates", () => {
  it("starts as a local-only memory document", () => {
    const coordinates = createEmptyStudioVersionCoordinates();
    expect(validateStudioVersionCoordinates(coordinates)).toEqual([]);
    expect(resolveStudioVersionProjection(coordinates)).toEqual({
      serverSyncState: "local-only",
      approvalState: "none",
      publishState: "none",
      publishableRevision: null,
    });
  });

  it("distinguishes synchronized, queued and behind local state", () => {
    const synced = approvedCoordinates();
    expect(resolveStudioVersionProjection(synced).serverSyncState).toBe("synced");

    const queued: StudioVersionCoordinates = {
      ...synced,
      local: { ...synced.local, pendingServerMutations: 3 },
    };
    expect(resolveStudioVersionProjection(queued).serverSyncState).toBe("queued");

    const behind: StudioVersionCoordinates = {
      ...synced,
      local: { ...synced.local, baseServerRevision: 6 },
    };
    expect(resolveStudioVersionProjection(behind).serverSyncState).toBe("behind");
  });

  it("marks an approval stale when the server head advances", () => {
    const coordinates = approvedCoordinates();
    const advanced: StudioVersionCoordinates = {
      ...coordinates,
      server: { revision: 8, contentDigest: "digest-r8" },
      local: { ...coordinates.local, baseServerRevision: 8 },
    };

    expect(resolveStudioVersionProjection(advanced)).toMatchObject({
      approvalState: "stale",
      publishableRevision: 7,
    });
    expect(canCreateStudioPublishPackage(advanced, 7)).toBe(true);
    expect(canCreateStudioPublishPackage(advanced, 8)).toBe(false);
  });

  it("accepts only packages pinned to the approved source", () => {
    const coordinates = approvedCoordinates();
    const published: StudioVersionCoordinates = {
      ...coordinates,
      publish: {
        packageId: "package-1",
        approvalId: "approval-1",
        sourceRevision: 7,
        profileId: "webtoon",
        profileVersion: 3,
      },
    };

    expect(validateStudioVersionCoordinates(published)).toEqual([]);
    expect(resolveStudioVersionProjection(published).publishState).toBe("current");
    expect(canCreateStudioPublishPackage(published, 7)).toBe(true);
  });

  it("reports review, approval and package source mismatches", () => {
    const coordinates = approvedCoordinates();
    const approval = coordinates.approval;
    if (approval === null) throw new Error("approved fixture must include an approval");
    const invalid: StudioVersionCoordinates = {
      ...coordinates,
      approval: {
        ...approval,
        reviewSnapshotId: "snapshot-other",
        sourceRevision: 6,
      },
      publish: {
        packageId: "package-1",
        approvalId: "approval-other",
        sourceRevision: 5,
        profileId: "webtoon",
        profileVersion: 0,
      },
    };

    expect(validateStudioVersionCoordinates(invalid).map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "approval-review-mismatch",
        "approval-source-mismatch",
        "publish-approval-mismatch",
        "publish-source-mismatch",
        "profile-version-invalid",
      ]),
    );
    expect(resolveStudioVersionProjection(invalid)).toMatchObject({
      approvalState: "invalid",
      publishState: "invalid",
    });
  });
});
