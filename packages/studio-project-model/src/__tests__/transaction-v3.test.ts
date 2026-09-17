import { describe, expect, it } from "vitest";

import {
  InMemoryDocumentAuthority,
  StudioRevisionConflictError,
  StudioTransactionCoordinator,
  applyJsonPatches,
} from "../command/transaction";
import { brandStudioId } from "../graph/ids";

import type {
  CommandEnvelope,
  JsonValue,
  StudioCommandHandler,
} from "../command/transaction";
import type {
  ArtifactId,
  CommandId,
  DeviceId,
  ProjectId,
  RevisionId,
  UserId,
} from "../graph/ids";

const artifactId = brandStudioId<ArtifactId>("artifact-transaction");
const projectId = brandStudioId<ProjectId>("project-transaction");
const actorId = brandStudioId<UserId>("artist-transaction");
const deviceId = brandStudioId<DeviceId>("device-transaction");
const revision1 = brandStudioId<RevisionId>("revision-1");

const handler: StudioCommandHandler<{ name: string }> = {
  type: "layer.rename",
  validate(command, context) {
    return context.permissionSet.has("document.edit") && command.payload.name.trim().length > 0
      ? []
      : ["document.edit and a non-empty name are required"];
  },
  async plan(command) {
    return {
      patches: [{ op: "replace", path: "/layers/0/name", value: command.payload.name }],
      inversePatches: [{ op: "replace", path: "/layers/0/name", value: "Line" }],
      blobWrites: [],
      invalidations: [{ kind: "layer", targetId: "layer-1" }],
      warnings: [],
    };
  },
};

function command(id: string, baseRevisionId = revision1): CommandEnvelope<{ name: string }> {
  return {
    id: brandStudioId<CommandId>(id),
    type: "layer.rename",
    actorId,
    deviceId,
    artifactId,
    scope: { projectId },
    baseRevisionId,
    issuedAt: "2026-09-17T01:00:00.000Z",
    idempotencyKey: `idempotency-${id}`,
    undoGroupId: brandStudioId(`undo-${id}`),
    payload: { name: "Clean line" },
  };
}

function context() {
  return {
    now: "2026-09-17T01:00:00.000Z",
    actorId,
    deviceId,
    permissionSet: new Set(["document.edit"]),
    leases: [],
  };
}

describe("StudioTransactionCoordinator", () => {
  it("commits one deterministic patch and replays an idempotency key without a second revision", async () => {
    const authority = new InMemoryDocumentAuthority([
      {
        artifactId,
        revisionId: revision1,
        document: { layers: [{ id: "layer-1", name: "Line" }] },
      },
    ]);
    const coordinator = new StudioTransactionCoordinator(
      authority,
      [handler],
      (request) => brandStudioId<RevisionId>(`revision-${request.id}`),
    );
    const request = command("command-1");
    const committed = await coordinator.execute(request, context());
    expect(committed.idempotentReplay).toBe(false);
    expect(committed.snapshot.document).toEqual({
      layers: [{ id: "layer-1", name: "Clean line" }],
    });
    const replay = await coordinator.execute(request, context());
    expect(replay.idempotentReplay).toBe(true);
    expect(authority.listRevisions(artifactId)).toHaveLength(2);
  });

  it("rejects stale base revisions before a handler is planned", async () => {
    const authority = new InMemoryDocumentAuthority([
      { artifactId, revisionId: revision1, document: { layers: [] } },
    ]);
    const coordinator = new StudioTransactionCoordinator(
      authority,
      [handler],
      () => brandStudioId<RevisionId>("revision-next"),
    );
    await expect(
      coordinator.execute(command("command-stale", brandStudioId("revision-stale")), context()),
    ).rejects.toBeInstanceOf(StudioRevisionConflictError);
  });
});

describe("RFC 6902 JSON patch subset", () => {
  it("supports test, add, copy, move, replace and remove without mutating the source", () => {
    const source: JsonValue = { values: ["a", "b"], title: "before" };
    const result = applyJsonPatches(source, [
      { op: "test", path: "/title", value: "before" },
      { op: "add", path: "/values/-", value: "c" },
      { op: "copy", from: "/values/0", path: "/copied" },
      { op: "move", from: "/values/1", path: "/moved" },
      { op: "replace", path: "/title", value: "after" },
      { op: "remove", path: "/values/0" },
    ]);
    expect(source).toEqual({ values: ["a", "b"], title: "before" });
    expect(result).toEqual({ values: ["c"], title: "after", copied: "a", moved: "b" });
  });

  it("rejects prototype-polluting pointer segments without mutating Object.prototype", () => {
    const pollutionKey = "studioProjectModelPolluted";
    const unsafePaths = [
      `/__proto__/${pollutionKey}`,
      `/constructor/prototype/${pollutionKey}`,
      `/prototype/${pollutionKey}`,
    ];

    expect(Object.prototype.hasOwnProperty.call(Object.prototype, pollutionKey)).toBe(false);
    for (const path of unsafePaths) {
      expect(() => applyJsonPatches({}, [{ op: "add", path, value: true }])).toThrow(
        "unsafe JSON pointer segment",
      );
    }
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, pollutionKey)).toBe(false);
  });

  it("does not resolve inherited object properties as JSON document members", () => {
    expect(() =>
      applyJsonPatches({}, [{ op: "replace", path: "/toString", value: "changed" }]),
    ).toThrow("missing JSON pointer /toString");
  });
});
