import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CreatorDraftCollaborationStatusLockedError,
  assertCreatorDraftCollaborationStatusMutationAllowed,
} from "./creator-provisional-work-status";

describe("creator provisional-work status guard", () => {
  it("allows ordinary drafts but reserves active hidden publication for atomic promotion", () => {
    expect(() => assertCreatorDraftCollaborationStatusMutationAllowed({
      hidden: true,
      draftCollaborationStatus: "active",
      requestedStatus: "draft",
    })).not.toThrow();
    expect(() => assertCreatorDraftCollaborationStatusMutationAllowed({
      hidden: true,
      draftCollaborationStatus: "active",
      requestedStatus: undefined,
    })).not.toThrow();
    expect(() => assertCreatorDraftCollaborationStatusMutationAllowed({
      hidden: false,
      draftCollaborationStatus: "promoted",
      requestedStatus: "published",
    })).not.toThrow();

    expect(() => assertCreatorDraftCollaborationStatusMutationAllowed({
      hidden: true,
      draftCollaborationStatus: "active",
      requestedStatus: "published",
    })).toThrow(CreatorDraftCollaborationStatusLockedError);
  });

  it("runs the direct PATCH guard after the authoritative work lock and before UPDATE", () => {
    const source = readFileSync(new URL("./creator.ts", import.meta.url), "utf8");
    const method = source.indexOf("export async function updateWork(");
    const transaction = source.indexOf("const updated = await db.transaction", method);
    const workLock = source.indexOf('.for("update")', transaction);
    const roomProbe = source.indexOf(".from(creatorDraftCollaborationRooms)", workLock);
    const guard = source.indexOf(
      "assertCreatorDraftCollaborationStatusMutationAllowed",
      roomProbe
    );
    const update = source.indexOf(".update(creatorWorks)", guard);

    expect(method).toBeGreaterThan(0);
    expect(transaction).toBeGreaterThan(method);
    expect(workLock).toBeGreaterThan(transaction);
    expect(roomProbe).toBeGreaterThan(workLock);
    expect(guard).toBeGreaterThan(roomProbe);
    expect(update).toBeGreaterThan(guard);
  });
});
