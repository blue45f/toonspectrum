import { describe, expect, it } from "vitest";

import { CharacterOperationCoordinator } from "./character-operation-coordinator";

describe("CharacterOperationCoordinator", () => {
  it("allows shared readers and blocks an exclusive writer on the same resource", () => {
    const coordinator = new CharacterOperationCoordinator();
    const first = coordinator.tryAcquire({
      operationId: "export:1",
      owner: "psd",
      claims: [{ resource: "export-buffer", mode: "shared" }],
      startedAt: 1,
    });
    const second = coordinator.tryAcquire({
      operationId: "export:2",
      owner: "thumbnail",
      claims: [{ resource: "export-buffer", mode: "shared" }],
      startedAt: 2,
    });
    const writer = coordinator.tryAcquire({
      operationId: "export:3",
      owner: "cleanup",
      claims: [{ resource: "export-buffer", mode: "exclusive" }],
      startedAt: 3,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(writer.ok).toBe(false);
    if (writer.ok) return;
    expect(writer.conflicts.map((conflict) => conflict.heldByOperationId)).toEqual(["export:1", "export:2"]);
  });

  it("does not let preview thumbnail work block unrelated live document edits", () => {
    const coordinator = new CharacterOperationCoordinator();
    const thumbnail = coordinator.tryAcquire({
      operationId: "thumbnail:hair",
      owner: "thumbnail-scheduler",
      claims: [{ resource: "preview-renderer", mode: "exclusive" }],
    });
    const edit = coordinator.tryAcquire({
      operationId: "edit:iris",
      owner: "command-dispatcher",
      claims: [
        { resource: "document-write", mode: "exclusive" },
        { resource: "live-renderer", mode: "exclusive" },
      ],
    });
    expect(thumbnail.ok).toBe(true);
    expect(edit.ok).toBe(true);
  });

  it("deduplicates claims and lets a lease release only once", () => {
    const coordinator = new CharacterOperationCoordinator();
    const result = coordinator.tryAcquire({
      operationId: "paint:1",
      owner: "surface-paint",
      claims: [
        { resource: "texture-atlas", mode: "shared" },
        { resource: "texture-atlas", mode: "exclusive" },
        { resource: "live-renderer", mode: "exclusive" },
      ],
      startedAt: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lease.claims).toEqual([
      { resource: "live-renderer", mode: "exclusive" },
      { resource: "texture-atlas", mode: "exclusive" },
    ]);
    expect(coordinator.isHeld("texture-atlas")).toBe(true);
    expect(result.lease.release()).toBe(true);
    expect(result.lease.release()).toBe(false);
    expect(coordinator.snapshot()).toEqual([]);
  });
});
