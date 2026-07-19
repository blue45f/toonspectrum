import { describe, expect, it, vi } from "vitest";

import {
  StudioCrdtBackpressureError,
  StudioCrdtDocumentTooLargeError,
  StudioCrdtInvalidPayloadError,
  StudioCrdtStorageCorruptionError,
  StudioCrdtUpdateIdConflictError,
} from "./studio-crdt.service";
import {
  mapStudioLiveCrdtFailure,
  replyStudioLiveAck,
  studioLiveFailure,
} from "./studio-live-ack";

describe("studio live ACK mapping", () => {
  it("constructs the public failure envelope without internal fields", () => {
    expect(studioLiveFailure("forbidden", "권한이 없습니다.")).toEqual({
      ok: false,
      code: "forbidden",
      message: "권한이 없습니다.",
    });
  });

  it("passes the exact returned response to an optional Socket.IO ACK once", () => {
    const response = { ok: true as const, data: { accepted: true as const } };
    const ack = vi.fn();

    expect(replyStudioLiveAck(ack, response)).toBe(response);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith(response);
    expect(replyStudioLiveAck(undefined, response)).toBe(response);
  });

  it("preserves callback throw-through semantics", () => {
    const response = studioLiveFailure("internal_error", "전송 실패");
    const callbackError = new Error("socket callback failed");
    const ack = vi.fn(() => {
      throw callbackError;
    });

    expect(() => replyStudioLiveAck(ack, response)).toThrow(callbackError);
    expect(ack).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledWith(response);
  });

  it.each([
    new StudioCrdtInvalidPayloadError(),
    new StudioCrdtUpdateIdConflictError(),
    new StudioCrdtDocumentTooLargeError(),
  ])("maps client-invalid CRDT errors without producing server diagnostics", (error) => {
    expect(mapStudioLiveCrdtFailure(error, "work-1", "update")).toEqual({
      response: {
        ok: false,
        code: "invalid_payload",
        message: "CRDT 데이터가 올바르지 않거나 허용 크기를 초과했습니다.",
      },
      diagnostic: null,
    });
  });

  it("maps pre-transaction backpressure to a recoverable rate limit", () => {
    expect(
      mapStudioLiveCrdtFailure(
        new StudioCrdtBackpressureError(),
        "work-queue",
        "sync"
      )
    ).toEqual({
      response: {
        ok: false,
        code: "rate_limited",
        message: "공동 편집 요청이 밀려 있습니다. 잠시 후 자동으로 다시 시도합니다.",
      },
      diagnostic: null,
    });
  });

  it("maps deterministic storage corruption to a permanent public boundary and safe diagnostic", () => {
    expect(
      mapStudioLiveCrdtFailure(
        new StudioCrdtStorageCorruptionError("stored update cannot be decoded"),
        "work-corrupt",
        "update"
      )
    ).toEqual({
      response: {
        ok: false,
        code: "storage_corruption",
        message: "서버 원고 저장소의 무결성을 확인하지 못해 공동 편집을 중지했습니다.",
      },
      diagnostic: {
        workId: "work-corrupt",
        operation: "update",
        error: "stored update cannot be decoded",
        corruption: true,
      },
    });
  });

  it("maps unexpected Error instances to an opaque public failure with contextual diagnostics", () => {
    expect(
      mapStudioLiveCrdtFailure(new Error("database password leaked here"), "work-2", "sync")
    ).toEqual({
      response: {
        ok: false,
        code: "internal_error",
        message: "CRDT 데이터를 안전하게 저장하거나 불러오지 못했습니다.",
      },
      diagnostic: {
        workId: "work-2",
        operation: "sync",
        error: "database password leaked here",
        corruption: false,
      },
    });
  });

  it("normalizes non-Error throws without reflecting their value into the public response", () => {
    expect(mapStudioLiveCrdtFailure({ secret: "raw driver state" }, "work-3", "update"))
      .toEqual({
        response: {
          ok: false,
          code: "internal_error",
          message: "CRDT 데이터를 안전하게 저장하거나 불러오지 못했습니다.",
        },
        diagnostic: {
          workId: "work-3",
          operation: "update",
          error: "unknown",
          corruption: false,
        },
      });
  });
});
