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
  it.each(["draft", "in-review", "changes-requested", "superseded"] as const)(
    "invalidates matching approvals and publish packages for a %s review",
    (status) => {
      const coordinates = approvedCoordinates();
      const review = coordinates.review;
      if (review === null) throw new Error("approved fixture must include a review");

      for (const serverRevision of [7, 8]) {
        const unapproved: StudioVersionCoordinates = {
          ...coordinates,
          server: { revision: serverRevision, contentDigest: `digest-r${serverRevision}` },
          review: { ...review, status },
          publish: {
            packageId: "package-1",
            approvalId: "approval-1",
            sourceRevision: 7,
            profileId: "webtoon",
            profileVersion: 1,
          },
        };

        expect(validateStudioVersionCoordinates(unapproved).map((issue) => issue.code))
          .toContain("approval-review-not-approved");
        expect(resolveStudioVersionProjection(unapproved)).toMatchObject({
          approvalState: "invalid",
          publishState: "invalid",
          publishableRevision: null,
        });
        expect(canCreateStudioPublishPackage(unapproved, 7)).toBe(false);

        const reviewOnly: StudioVersionCoordinates = { ...unapproved, approval: null, publish: null };
        expect(validateStudioVersionCoordinates(reviewOnly)).toEqual([]);
        expect(resolveStudioVersionProjection(reviewOnly)).toMatchObject({
          approvalState: "none",
          publishState: "none",
          publishableRevision: null,
        });
      }
    },
  );

  it.each([7, 8])("preserves an approved snapshot when the server head is revision %s", (serverRevision) => {
    const coordinates: StudioVersionCoordinates = {
      ...approvedCoordinates(),
      server: { revision: serverRevision, contentDigest: `digest-r${serverRevision}` },
    };
    expect(validateStudioVersionCoordinates(coordinates)).toEqual([]);
    expect(resolveStudioVersionProjection(coordinates)).toMatchObject({
      approvalState: serverRevision === 7 ? "current" : "stale",
      publishableRevision: 7,
    });
    expect(canCreateStudioPublishPackage(coordinates, 7)).toBe(true);
  });

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

  it("treats observed local and server digest divergence as a conflict", () => {
    const coordinates = approvedCoordinates();
    const divergent: StudioVersionCoordinates = {
      ...coordinates,
      local: { ...coordinates.local, documentDigest: "local-digest" },
      server: { revision: 7, contentDigest: "server-digest" },
      review: null,
      approval: null,
    };

    expect(resolveStudioVersionProjection(divergent).serverSyncState).toBe("conflict");
  });

  it("marks an approval stale when the server head advances", () => {
    const coordinates = approvedCoordinates();
    const advanced: StudioVersionCoordinates = {
      ...coordinates,
      server: { revision: 8, contentDigest: "digest-r8" },
      local: { ...coordinates.local, baseServerRevision: 8, documentDigest: "digest-r8" },
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

  it("requires non-empty, exact review and approval digests", () => {
    const coordinates = approvedCoordinates();
    const approval = coordinates.approval;
    if (approval === null) throw new Error("approved fixture must include an approval");
    const missingDigest: StudioVersionCoordinates = {
      ...coordinates,
      approval: { ...approval, sourceDigest: null },
    };

    expect(validateStudioVersionCoordinates(missingDigest).map((issue) => issue.code)).toContain(
      "approval-source-digest-missing",
    );
    expect(resolveStudioVersionProjection(missingDigest).approvalState).toBe("invalid");
    expect(canCreateStudioPublishPackage(missingDigest, 7)).toBe(false);
  });

  it("invalidates approvals when their review has no server authority", () => {
    const coordinates = approvedCoordinates();
    const localOnly: StudioVersionCoordinates = {
      ...coordinates,
      local: { ...coordinates.local, baseServerRevision: null },
      server: null,
    };

    expect(validateStudioVersionCoordinates(localOnly).map((issue) => issue.code)).toContain(
      "review-without-server",
    );
    expect(resolveStudioVersionProjection(localOnly).approvalState).toBe("invalid");
    expect(canCreateStudioPublishPackage(localOnly, 7)).toBe(false);
  });

  it("rejects review sources ahead of the server head", () => {
    const coordinates = approvedCoordinates();
    const review = coordinates.review;
    const approval = coordinates.approval;
    if (review === null || approval === null) {
      throw new Error("approved fixture must include review and approval");
    }
    const impossible: StudioVersionCoordinates = {
      ...coordinates,
      review: { ...review, sourceRevision: 999, sourceDigest: "digest-r999" },
      approval: { ...approval, sourceRevision: 999, sourceDigest: "digest-r999" },
    };

    expect(validateStudioVersionCoordinates(impossible).map((issue) => issue.code)).toContain(
      "review-source-ahead-of-server",
    );
    expect(resolveStudioVersionProjection(impossible).approvalState).toBe("invalid");
    expect(canCreateStudioPublishPackage(impossible, 999)).toBe(false);
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
