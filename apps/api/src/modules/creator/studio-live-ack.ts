import {
  StudioCrdtBackpressureError,
  StudioCrdtDocumentTooLargeError,
  StudioCrdtInvalidPayloadError,
  StudioCrdtStorageCorruptionError,
  StudioCrdtUpdateIdConflictError,
} from "./studio-crdt.service";

import type {
  StudioLiveAck,
  StudioLiveAckCallback,
  StudioLiveFailure,
  StudioLiveFailureCode,
} from "./studio-live.protocol";

export type StudioLiveCrdtOperation = "sync" | "update";

/**
 * Internal diagnostics are deliberately separate from the public ACK. A storage exception may be
 * logged with work context, but its implementation detail must never cross the Socket.IO contract.
 */
export interface StudioLiveCrdtFailureDiagnostic {
  readonly workId: string;
  readonly operation: StudioLiveCrdtOperation;
  readonly error: string;
  readonly corruption: boolean;
}

export interface StudioLiveCrdtFailureMapping {
  readonly response: StudioLiveFailure;
  readonly diagnostic: StudioLiveCrdtFailureDiagnostic | null;
}

/** Construct the one public failure envelope shared by every studio-live event. */
export function studioLiveFailure(
  code: StudioLiveFailureCode,
  message: string
): StudioLiveFailure {
  return { ok: false, code, message };
}

/**
 * Socket.IO handlers support both callback ACKs and returned values. Preserve object identity so a
 * handler cannot accidentally acknowledge one payload while returning a different payload.
 */
export function replyStudioLiveAck<T>(
  ack: StudioLiveAckCallback<T> | undefined,
  response: StudioLiveAck<T>
): StudioLiveAck<T> {
  ack?.(response);
  return response;
}

/**
 * Maps internal CRDT service failures onto the stable public protocol. This classifier does not
 * log or emit: callers decide when diagnostics are observable, keeping transaction/fan-out order
 * in the gateway while the externally visible error policy remains independently testable.
 */
export function mapStudioLiveCrdtFailure(
  error: unknown,
  workId: string,
  operation: StudioLiveCrdtOperation
): StudioLiveCrdtFailureMapping {
  if (error instanceof StudioCrdtBackpressureError) {
    // Admission failed before a durable mutation began. The ordered browser outbox can safely
    // retry the same idempotent update after backoff.
    return {
      response: studioLiveFailure(
        "rate_limited",
        "공동 편집 요청이 밀려 있습니다. 잠시 후 자동으로 다시 시도합니다."
      ),
      diagnostic: null,
    };
  }

  if (
    error instanceof StudioCrdtInvalidPayloadError
    || error instanceof StudioCrdtUpdateIdConflictError
    || error instanceof StudioCrdtDocumentTooLargeError
  ) {
    return {
      response: studioLiveFailure(
        "invalid_payload",
        "CRDT 데이터가 올바르지 않거나 허용 크기를 초과했습니다."
      ),
      diagnostic: null,
    };
  }

  const corruption = error instanceof StudioCrdtStorageCorruptionError;
  const diagnostic: StudioLiveCrdtFailureDiagnostic = {
    workId,
    operation,
    error: error instanceof Error ? error.message : "unknown",
    corruption,
  };

  if (corruption) {
    // Retrying deterministic corruption cannot heal the authoritative document. The dedicated
    // permanent code tells sync and update clients to stop at their recovery boundary.
    return {
      response: studioLiveFailure(
        "storage_corruption",
        "서버 원고 저장소의 무결성을 확인하지 못해 공동 편집을 중지했습니다."
      ),
      diagnostic,
    };
  }

  return {
    response: studioLiveFailure(
      "internal_error",
      "CRDT 데이터를 안전하게 저장하거나 불러오지 못했습니다."
    ),
    diagnostic,
  };
}
