import { describe, expect, it } from "vitest";

import { StudioScene3dCommandTimeline } from "./studio-scene3d-command-core";
import {
  StudioScene3dDocumentCommandError,
  createStudioScene3dBatchTransformCommand,
  createStudioScene3dCameraCommand,
  createStudioScene3dOutputCommand,
  createStudioScene3dReparentCommand,
} from "./studio-scene3d-document-command";
import {
  assertStudioScene3dDocument,
  createStudioScene3dDocument,
  type StudioScene3dDocumentV1,
  type StudioScene3dPrimitiveEntity,
} from "./studio-scene3d-document";

const NOW = "2026-09-15T00:00:00.000Z";
const LATER = "2026-09-15T00:01:00.000Z";

function primitive(
  id: string,
  parentId: string | null = null,
  locked = false,
): StudioScene3dPrimitiveEntity {
  return Object.freeze({
    id,
    name: id,
    kind: "primitive",
    primitiveKind: "box",
    color: "#ffffff",
    transform: Object.freeze({
      position: Object.freeze([0, 0, 0] as const),
      rotation: Object.freeze([0, 0, 0, 1] as const),
      scale: Object.freeze([1, 1, 1] as const),
    }),
    visible: true,
    locked,
    castShadow: true,
    receiveShadow: true,
    parentId,
  });
}

function scene(): StudioScene3dDocumentV1 {
  const base = createStudioScene3dDocument("scene:command-test", NOW);
  const document = Object.freeze({
    ...base,
    entities: Object.freeze([
      primitive("room"),
      primitive("desk", "room"),
      primitive("chair", "room"),
      primitive("locked-prop", null, true),
    ]),
  });
  assertStudioScene3dDocument(document);
  return document;
}

function entity(document: StudioScene3dDocumentV1, id: string) {
  return document.entities.find((candidate) => candidate.id === id);
}

describe("Studio Scene3D document commands", () => {
  it("commits a multi-object transform as one document revision and one undo step", () => {
    const timeline = new StudioScene3dCommandTimeline(scene());
    const command = createStudioScene3dBatchTransformCommand({
      patches: [
        { entityId: "desk", patch: { position: [1, 0, 0] } },
        { entityId: "chair", patch: { position: [2, 0, 0] } },
      ],
      expectedDocumentId: "scene:command-test",
      expectedRevision: 0,
      committedAt: LATER,
    });

    expect(timeline.commit(command)).toMatchObject({ status: "applied", cursor: 1 });
    expect(timeline.readState().revision).toBe(1);
    expect(timeline.readState().updatedAt).toBe(LATER);
    expect(entity(timeline.readState(), "desk")?.transform.position).toEqual([1, 0, 0]);
    expect(entity(timeline.readState(), "chair")?.transform.position).toEqual([2, 0, 0]);
    expect(timeline.undo().state.revision).toBe(0);
    expect(timeline.redo().state.revision).toBe(1);
    expect(timeline.verifyReplay().stateHash).toBe(timeline.stateHash);
  });

  it("keeps a batch atomic when any selected entity is locked", () => {
    const initial = scene();
    const timeline = new StudioScene3dCommandTimeline(initial);
    const command = createStudioScene3dBatchTransformCommand({
      patches: [
        { entityId: "desk", patch: { position: [4, 0, 0] } },
        { entityId: "locked-prop", patch: { position: [5, 0, 0] } },
      ],
      committedAt: LATER,
    });

    expect(() => timeline.commit(command)).toThrowError(
      expect.objectContaining<Partial<StudioScene3dDocumentCommandError>>({
        code: "ENTITY_LOCKED",
      }),
    );
    expect(timeline.readState()).toEqual(initial);
    expect(timeline.cursor).toBe(0);
    expect(timeline.revision).toBe(0);
  });

  it("rejects cyclic parenting without mutating the timeline", () => {
    const initial = scene();
    const timeline = new StudioScene3dCommandTimeline(initial);

    expect(() => timeline.commit(createStudioScene3dReparentCommand({
      entityId: "room",
      parentId: "desk",
      committedAt: LATER,
    }))).toThrowError(expect.objectContaining({ code: "CYCLIC_PARENT" }));
    expect(timeline.readState()).toEqual(initial);
    expect(timeline.cursor).toBe(0);
  });

  it("treats an identical transform as a semantic no-op", () => {
    const timeline = new StudioScene3dCommandTimeline(scene());
    const receipt = timeline.commit(createStudioScene3dBatchTransformCommand({
      patches: [{ entityId: "desk", patch: { position: [0, 0, 0] } }],
      committedAt: LATER,
    }));

    expect(receipt.status).toBe("noop");
    expect(timeline.readState().revision).toBe(0);
    expect(timeline.cursor).toBe(0);
  });

  it("fails closed when a command targets a stale document revision", () => {
    const timeline = new StudioScene3dCommandTimeline(scene());
    const command = createStudioScene3dBatchTransformCommand({
      patches: [{ entityId: "desk", patch: { position: [1, 0, 0] } }],
      expectedRevision: 4,
      committedAt: LATER,
    });

    expect(() => timeline.commit(command)).toThrowError(
      expect.objectContaining({ code: "DOCUMENT_REVISION_MISMATCH" }),
    );
    expect(timeline.cursor).toBe(0);
  });

  it("changes and activates a camera through the same replay-safe command path", () => {
    const timeline = new StudioScene3dCommandTimeline(scene());
    timeline.commit(createStudioScene3dCameraCommand({
      cameraId: "camera:main",
      patch: { position: [8, 3, 7], focalLengthMm: 85 },
      activate: true,
      committedAt: LATER,
    }));

    expect(timeline.readState().activeCameraId).toBe("camera:main");
    expect(timeline.readState().cameras[0]?.position).toEqual([8, 3, 7]);
    expect(timeline.readState().cameras[0]?.focalLengthMm).toBe(85);
    expect(timeline.verifyReplay().stateHash).toBe(timeline.stateHash);
  });

  it("validates output bounds before publishing a new revision", () => {
    const timeline = new StudioScene3dCommandTimeline(scene());

    expect(() => timeline.commit(createStudioScene3dOutputCommand({
      patch: { width: 32 },
      committedAt: LATER,
    }))).toThrow("출력 크기");
    expect(timeline.readState().output.width).toBe(2048);
    expect(timeline.readState().revision).toBe(0);
  });
});
