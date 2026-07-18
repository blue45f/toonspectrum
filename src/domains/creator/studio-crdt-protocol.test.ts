import { describe, expect, it } from "vitest";

import {
  createStudioCrdtLocalWireMessage,
  decodeStudioCrdtSyncChunks,
  decodeStudioCrdtUpdate,
  encodeStudioCrdtStateVector,
  encodeStudioCrdtSyncChunks,
  encodeStudioCrdtUpdate,
  parseStudioCrdtLocalWireMessage,
  parsePersistedStudioCrdtUpdateRequest,
  parseStudioCrdtSyncRequest,
  parseStudioCrdtSyncResponse,
  parseStudioCrdtUpdateAck,
  parseStudioCrdtUpdateRequest,
  STUDIO_CRDT_LOCAL_WIRE_BRAND,
  STUDIO_CRDT_PROTOCOL_VERSION,
  STUDIO_CRDT_SYNC_CHUNK_MAX_BYTES,
  STUDIO_CRDT_UPDATE_MAX_BYTES,
} from "./studio-crdt-protocol";

const workId = "work-1";
const stateVector = encodeStudioCrdtStateVector(new Uint8Array([0]));
const update = encodeStudioCrdtUpdate(new Uint8Array([1, 2, 3]));

function syncRequest() {
  return {
    protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
    workId,
    requestId: "request-1",
    stateVector,
  } as const;
}

function syncResponse(bytes = new Uint8Array([1, 2, 3])) {
  const chunks = encodeStudioCrdtSyncChunks(bytes);
  return {
    protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
    workId,
    requestId: "request-1",
    transferId: "11111111-1111-4111-8111-111111111111",
    chunks,
    chunkCount: chunks.length,
    totalBytes: bytes.byteLength,
    serverStateVector: stateVector,
    serverSequence: "42",
  } as const;
}

describe("studio CRDT protocol", () => {
  it("pins the drawing-assist room gate to the v3 network and local-wire contract", () => {
    expect(STUDIO_CRDT_PROTOCOL_VERSION).toBe(3);
    expect(STUDIO_CRDT_LOCAL_WIRE_BRAND).toBe("toonspectrum:studio-crdt:v3");
  });

  it("accepts only canonical bounded base64 for incremental updates", () => {
    expect([...decodeStudioCrdtUpdate(update)]).toEqual([1, 2, 3]);
    expect(() => decodeStudioCrdtUpdate("AQID\n")).toThrow();
    expect(() => decodeStudioCrdtUpdate("AQID=")) .toThrow();
    expect(() => encodeStudioCrdtUpdate(new Uint8Array(STUDIO_CRDT_UPDATE_MAX_BYTES + 1))).toThrow();
  });

  it("chunks and exactly reassembles a large state-vector diff", () => {
    const bytes = Uint8Array.from(
      { length: STUDIO_CRDT_SYNC_CHUNK_MAX_BYTES * 2 + 17 },
      (_, index) => index % 251
    );
    const response = syncResponse(bytes);
    expect(response.chunks).toHaveLength(3);
    expect(parseStudioCrdtSyncResponse(response, { expectedWorkId: workId })).toEqual(response);
    expect(decodeStudioCrdtSyncChunks(response.chunks, response.totalBytes)).toEqual(bytes);
    expect(
      parseStudioCrdtSyncResponse(
        { ...response, chunkCount: response.chunkCount + 1 },
        { expectedWorkId: workId }
      )
    ).toBeNull();
    expect(
      parseStudioCrdtSyncResponse(
        { ...response, totalBytes: response.totalBytes - 1 },
        { expectedWorkId: workId }
      )
    ).toBeNull();
  });

  it("fails closed on extra keys, cross-work data, and invalid retry ids", () => {
    expect(parseStudioCrdtSyncRequest(syncRequest(), { expectedWorkId: workId })).toEqual(
      syncRequest()
    );
    expect(parseStudioCrdtSyncRequest({ ...syncRequest(), protocolVersion: 2 })).toBeNull();
    expect(parseStudioCrdtSyncRequest({ ...syncRequest(), extra: true })).toBeNull();
    expect(parseStudioCrdtSyncRequest(syncRequest(), { expectedWorkId: "work-2" })).toBeNull();

    const publish = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId,
      updateId: "22222222-2222-4222-8222-222222222222",
      clientSequence: 1,
      update,
    } as const;
    expect(parseStudioCrdtUpdateRequest(publish, { expectedWorkId: workId })).toEqual(publish);
    expect(parseStudioCrdtUpdateRequest({ ...publish, protocolVersion: 2 })).toBeNull();
    expect(parsePersistedStudioCrdtUpdateRequest(
      { ...publish, protocolVersion: 1 },
      { expectedWorkId: workId }
    )).toEqual(publish);
    expect(parsePersistedStudioCrdtUpdateRequest(
      { ...publish, protocolVersion: 2 },
      { expectedWorkId: workId }
    )).toEqual(publish);
    expect(parseStudioCrdtUpdateRequest({ ...publish, updateId: "bad id" })).toBeNull();
    expect(parseStudioCrdtUpdateRequest({ ...publish, clientSequence: 0 })).toBeNull();
  });

  it("supports authoritative server ACKs and non-authoritative local ACKs", () => {
    const common = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId,
      updateId: "33333333-3333-4333-8333-333333333333",
      serverSequence: "9",
      duplicate: false,
    } as const;
    expect(
      parseStudioCrdtUpdateAck({ ...common, serverStateVector: stateVector }, { expectedWorkId: workId })
    ).not.toBeNull();
    expect(
      parseStudioCrdtUpdateAck({ ...common, serverStateVector: null }, { expectedWorkId: workId })
    ).not.toBeNull();
    expect(
      parseStudioCrdtUpdateAck({ ...common, serverSequence: "01", serverStateVector: stateVector })
    ).toBeNull();
  });

  it("uses a version-gated, separately branded and targeted local durable wire surface", () => {
    const requestWire = createStudioCrdtLocalWireMessage({
      workId,
      senderSessionId: "alice-session",
      targetSessionId: null,
      kind: "sync-request",
      payload: syncRequest(),
    });
    expect(
      parseStudioCrdtLocalWireMessage(requestWire, {
        expectedWorkId: workId,
        selfSessionId: "bob-session",
      })
    ).toEqual(requestWire);
    expect(
      parseStudioCrdtLocalWireMessage(requestWire, {
        expectedWorkId: workId,
        selfSessionId: "alice-session",
      })
    ).toBeNull();
    expect(
      parseStudioCrdtLocalWireMessage(
        {
          ...requestWire,
          brand: "toonspectrum:studio-crdt:v2",
          protocolVersion: 2,
          payload: { ...requestWire.payload, protocolVersion: 2 },
        },
        {
          expectedWorkId: workId,
          selfSessionId: "bob-session",
        }
      )
    ).toBeNull();

    const responseWire = createStudioCrdtLocalWireMessage({
      workId,
      senderSessionId: "bob-session",
      targetSessionId: "alice-session",
      kind: "sync-response",
      payload: syncResponse(),
    });
    expect(
      parseStudioCrdtLocalWireMessage(responseWire, {
        expectedWorkId: workId,
        selfSessionId: "charlie-session",
      })
    ).toBeNull();
  });
});
