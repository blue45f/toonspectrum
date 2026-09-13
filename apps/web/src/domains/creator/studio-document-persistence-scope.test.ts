import { describe, expect, it } from "vitest";

import { studioAutosaveKey } from "./studio-autosave";
import { studioCheckpointKey } from "./studio-checkpoint-loader";
import { studioDocumentPersistenceWorkId } from "./studio-document-persistence-scope";

const local = { workId: null, remixId: null, projectId: "project-a", documentId: "ep01-original" };

describe("local manuscript persistence identity", () => {
  it("retains the exact existing autosave and checkpoint slots after separating the network id", () => {
    const workId = studioDocumentPersistenceWorkId(local);
    expect(workId).toBe(local.documentId);
    for (const key of [studioAutosaveKey, studioCheckpointKey]) {
      expect(key({ userId: "owner", workId })).toBe(key({ userId: "owner", workId: local.documentId }));
      expect(key({ userId: "owner", workId })).not.toBe(key({ userId: "owner", workId: null }));
    }
  });

  it("does not mix other documents, accounts, remixes or the shared new-draft slot", () => {
    const key = studioAutosaveKey({ userId: "owner", workId: studioDocumentPersistenceWorkId(local) });
    expect(key).not.toBe(studioAutosaveKey({ userId: "another", workId: local.documentId }));
    expect(key).not.toBe(studioAutosaveKey({ userId: "owner", workId: "ep02-other" }));
    expect(key).not.toBe(studioAutosaveKey({ userId: "owner", remixId: local.documentId }));
    expect(key).not.toBe(studioAutosaveKey({ userId: "owner" }));
  });

  it("never overrides a real remote work id and leaves anonymous drafts/remixes unchanged", () => {
    expect(studioDocumentPersistenceWorkId({ ...local, workId: "real-server-work" })).toBe("real-server-work");
    expect(studioDocumentPersistenceWorkId({ ...local, remixId: "source" })).toBeNull();
    expect(studioDocumentPersistenceWorkId({ workId: null, remixId: null })).toBeNull();
    expect(studioDocumentPersistenceWorkId({ ...local, projectId: null })).toBeNull();
  });
});


describe("explicit draft recovery isolation after source resolution", () => {
  const draft = { workId: null, remixId: null, draftId: "drawing-a" };

  it("keeps explicit drafts out of the shared unnamed-draft autosave and checkpoint slots", () => {
    const workId = studioDocumentPersistenceWorkId(draft);
    expect(workId).toBe("draft:drawing-a");
    for (const key of [studioAutosaveKey, studioCheckpointKey]) {
      expect(key({ userId: "owner", workId })).toBe(key({ userId: "owner", workId: "draft:drawing-a" }));
      expect(key({ userId: "owner", workId })).not.toBe(key({ userId: "owner" }));
      expect(key({ userId: "owner", workId })).not.toBe(key({
        userId: "owner", workId: studioDocumentPersistenceWorkId({ ...draft, draftId: "drawing-b" }),
      }));
    }
  });

  it("preserves explicit server and project identities before a draft fallback", () => {
    expect(studioDocumentPersistenceWorkId({ ...draft, workId: "server-a" })).toBe("server-a");
    expect(studioDocumentPersistenceWorkId({ ...local, draftId: "drawing-a" })).toBe(local.documentId);
  });

  it("never replaces a remix recovery key with an explicit draft key", () => {
    expect(studioDocumentPersistenceWorkId({ ...draft, remixId: "source-a" })).toBeNull();
  });
});
