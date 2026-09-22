import { describe, expect, it } from "vitest";

import {
  chunkStudioOfflineBranchPeerPayloads,
  decodeStudioOfflineBranchPeerBundle,
  encodeStudioOfflineBranchPeerBundle,
} from "./studio-offline-branch-peer-bundle";
import {
  decodeStudioOfflineBranchPayload,
  encodeStudioOfflineBranchPayload,
  fingerprintStudioOfflineBranchValue,
  stableStudioOfflineBranchJson,
} from "./studio-offline-branch-payload";

import type {
  StudioCrdtLayerGroupInput,
  StudioCrdtSceneElementInput,
  StudioCrdtStrokeInput,
} from "../live/studio-crdt-document-types";

const stroke: StudioCrdtStrokeInput = {
  id: "stroke-1",
  pageId: "page-1",
  layerId: "page-root",
  payload: {
    version: 1,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [0, 0, 10, 10],
    pressures: [0.4, 0.8],
    stroke: "#123456",
    strokeWidth: 7,
  },
};

const text: StudioCrdtSceneElementInput = {
  id: "text-1",
  pageId: "page-1",
  layerId: "lettering",
  payload: {
    version: 1,
    type: "text",
    props: {
      text: "대사",
      x: 10,
      y: 20,
      width: 240,
      fontSize: 28,
      fill: "#111111",
      rotation: 0,
    },
  },
};

const group: StudioCrdtLayerGroupInput = {
  id: "group-1",
  pageId: "page-1",
  payload: {
    version: 1,
    props: { name: "선화", hidden: false, locked: false },
  },
};

function hash(index: number): string {
  return `sha256:${index.toString(16).padStart(64, "0")}`;
}

describe("studio offline branch payload codec", () => {
  it.each([
    ["stroke", stroke],
    ["scene-element", text],
    ["layer-group", group],
  ] as const)("round-trips a validated %s canonical input", (targetType, value) => {
    const bytes = encodeStudioOfflineBranchPayload(targetType, value);
    expect(decodeStudioOfflineBranchPayload(bytes, targetType)).toEqual({
      version: 1,
      targetType,
      value,
    });
  });

  it("rejects the old layer-group shape that incorrectly carried layerId", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({
      version: 1,
      targetType: "layer-group",
      value: { ...group, layerId: "page-root" },
    }));
    expect(() => decodeStudioOfflineBranchPayload(bytes, "layer-group")).toThrow(
      /canonical input/u,
    );
  });

  it("creates stable fingerprints independent of object insertion order", () => {
    const left = { a: 1, b: { x: true, y: "text" } };
    const right = { b: { y: "text", x: true }, a: 1 };
    expect(stableStudioOfflineBranchJson(left)).toBe(stableStudioOfflineBranchJson(right));
    expect(fingerprintStudioOfflineBranchValue(left)).toBe(
      fingerprintStudioOfflineBranchValue(right),
    );
  });
});

describe("studio offline branch peer bundle", () => {
  it("round-trips payload-only and document-only frames", () => {
    const payloadOnly = encodeStudioOfflineBranchPeerBundle({
      workId: "work-1",
      scope: "user-1",
      documentBytes: null,
      payloads: [{ hash: hash(1), bytes: Uint8Array.of(1, 2, 3) }],
    });
    expect(decodeStudioOfflineBranchPeerBundle(payloadOnly)).toEqual({
      workId: "work-1",
      scope: "user-1",
      documentBytes: null,
      payloads: [{ hash: hash(1), bytes: Uint8Array.of(1, 2, 3) }],
    });

    const documentOnly = encodeStudioOfflineBranchPeerBundle({
      workId: "work-1",
      scope: "user-1",
      documentBytes: Uint8Array.of(8, 9),
      payloads: [],
    });
    expect(decodeStudioOfflineBranchPeerBundle(documentOnly)).toEqual({
      workId: "work-1",
      scope: "user-1",
      documentBytes: Uint8Array.of(8, 9),
      payloads: [],
    });
  });

  it("chunks more than one frame worth of content-addressed payloads", () => {
    const payloads = Array.from({ length: 129 }, (_, index) => ({
      hash: hash(index + 1),
      bytes: Uint8Array.of(index % 256),
    }));
    const chunks = chunkStudioOfflineBranchPeerPayloads(payloads);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(128);
    expect(chunks[1]).toHaveLength(1);
  });

  it("rejects truncated frames", () => {
    const encoded = encodeStudioOfflineBranchPeerBundle({
      workId: "work-1",
      scope: "user-1",
      documentBytes: Uint8Array.of(1, 2, 3),
      payloads: [],
    });
    expect(() => decodeStudioOfflineBranchPeerBundle(encoded.subarray(0, -1))).toThrow();
  });
});
