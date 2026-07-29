import { describe, expect, it } from "vitest";

import { STUDIO_WILL_V1_OPC_ASSURANCE } from "./studio-will-v1-opc-interchange";
import {
  STUDIO_WILL_V1_OPC_WORKER_MAX_STRUCTURED_CLONE_POINTS,
  STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
  isStudioWillV1OpcWorkerRequest,
  isStudioWillV1OpcWorkerResponse,
  studioWillV1OpcWorkerCorrelation,
  studioWillV1OpcWorkerRequestTransfers,
  studioWillV1OpcWorkerResponseTransfers,
  type StudioWillV1OpcWorkerDecodeRequest,
  type StudioWillV1OpcWorkerEncodeSuccess,
} from "./studio-will-v1-opc-worker-protocol";

const SAMPLE_INPUT = {
  width: 10,
  height: 20,
  paths: [
    {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ],
      strokeWidths: [1],
      strokeColor: { r: 1, g: 2, b: 3, a: 255 },
    },
  ],
};

const VALID_PATH = {
  points: SAMPLE_INPUT.paths[0]!.points,
  strokeWidths: [1],
  strokeColor: SAMPLE_INPUT.paths[0]!.strokeColor,
  startParameter: 0,
  endParameter: 1,
  decimalPrecision: 2,
  segmentCount: 1,
};

const VALID_ENCODE_RESPONSE = {
  type: "studio-will-v1-opc/encode-success",
  version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
  requestId: "valid-response",
  result: {
    bytes: new Uint8Array(22),
    paths: [VALID_PATH],
    loss: {
      status: "exact",
      quantization: "truncate-toward-zero",
      items: [],
    },
    assurance: STUDIO_WILL_V1_OPC_ASSURANCE,
  },
};

describe("studio WILL v1 OPC Worker protocol", () => {
  it("validates typed encode/decode requests and exposes bounded correlation", () => {
    const encode = {
      type: "studio-will-v1-opc/encode",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "encode-1",
      input: SAMPLE_INPUT,
    };
    const decode: StudioWillV1OpcWorkerDecodeRequest = {
      type: "studio-will-v1-opc/decode",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "decode-1",
      source: new Uint8Array([1, 2, 3]),
    };

    expect(isStudioWillV1OpcWorkerRequest(encode)).toBe(true);
    expect(isStudioWillV1OpcWorkerRequest(decode)).toBe(true);
    expect(studioWillV1OpcWorkerCorrelation(encode)).toEqual({
      requestId: "encode-1",
      operation: "encode",
    });
    expect(
      isStudioWillV1OpcWorkerRequest({ ...decode, version: 2 })
    ).toBe(false);
    expect(
      isStudioWillV1OpcWorkerRequest({ ...decode, requestId: "\u0000" })
    ).toBe(false);
    expect(
      isStudioWillV1OpcWorkerRequest({ ...decode, source: [1, 2, 3] })
    ).toBe(false);
  });

  it("transfers only decode request bytes and encode response bytes", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const decode: StudioWillV1OpcWorkerDecodeRequest = {
      type: "studio-will-v1-opc/decode",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "decode-transfer",
      source: bytes,
    };
    expect(studioWillV1OpcWorkerRequestTransfers(decode)).toEqual([bytes.buffer]);
    expect(
      studioWillV1OpcWorkerRequestTransfers({
        type: "studio-will-v1-opc/encode",
        version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
        requestId: "encode-transfer",
        input: SAMPLE_INPUT,
      })
    ).toEqual([]);

    const responseBytes = new Uint8Array([4, 5]);
    const success = {
      type: "studio-will-v1-opc/encode-success",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "encode-transfer",
      result: {
        bytes: responseBytes,
        paths: [],
        loss: { status: "exact", quantization: "truncate-toward-zero", items: [] },
        assurance: {},
      },
    } as unknown as StudioWillV1OpcWorkerEncodeSuccess;
    expect(studioWillV1OpcWorkerResponseTransfers(success)).toEqual([
      responseBytes.buffer,
    ]);

    const blobDecode: StudioWillV1OpcWorkerDecodeRequest = {
      ...decode,
      requestId: "blob-transfer",
      source: new Blob([bytes]),
    };
    expect(isStudioWillV1OpcWorkerRequest(blobDecode)).toBe(true);
    expect(studioWillV1OpcWorkerRequestTransfers(blobDecode)).toEqual([]);

    const surrounding = new Uint8Array(32);
    const subarraySuccess = {
      ...success,
      result: {
        ...success.result,
        bytes: surrounding.subarray(5, 27),
      },
    };
    expect(studioWillV1OpcWorkerResponseTransfers(subarraySuccess)).toEqual([]);
  });

  it("fails closed on malformed correlated success/error payloads", () => {
    const malformedSuccess = {
      type: "studio-will-v1-opc/encode-success",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "same-id",
      result: { bytes: [1, 2, 3] },
    };
    const malformedFailure = {
      type: "studio-will-v1-opc/failure",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "same-id",
      operation: "encode",
      error: { code: "NOT_A_CODE", name: "Error", message: "bad" },
    };

    expect(studioWillV1OpcWorkerCorrelation(malformedSuccess)).toEqual({
      requestId: "same-id",
      operation: "encode",
    });
    expect(isStudioWillV1OpcWorkerResponse(malformedSuccess)).toBe(false);
    expect(isStudioWillV1OpcWorkerResponse(malformedFailure)).toBe(false);
  });

  it("rejects empty-path success and preserves exact assurance identity", () => {
    const emptySuccess = {
      type: "studio-will-v1-opc/encode-success",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "empty-success",
      result: {
        bytes: new Uint8Array(22),
        paths: [],
        loss: {
          status: "exact",
          quantization: "truncate-toward-zero",
          items: [],
        },
        assurance: STUDIO_WILL_V1_OPC_ASSURANCE,
      },
    };

    expect(isStudioWillV1OpcWorkerResponse(emptySuccess)).toBe(false);
    expect(
      isStudioWillV1OpcWorkerResponse({
        ...emptySuccess,
        result: {
          ...emptySuccess.result,
          assurance: {
            ...STUDIO_WILL_V1_OPC_ASSURANCE,
            vendorCertified: true,
          },
        },
      })
    ).toBe(false);
  });

  it("rejects additional request, option, input, and path keys", () => {
    const request = {
      type: "studio-will-v1-opc/encode",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "exact-request",
      input: SAMPLE_INPUT,
      options: {
        limits: { maxArchiveBytes: 1_024 },
      },
    };
    expect(isStudioWillV1OpcWorkerRequest(request)).toBe(true);
    expect(
      isStudioWillV1OpcWorkerRequest({ ...request, extra: true }),
    ).toBe(false);
    expect(
      isStudioWillV1OpcWorkerRequest({
        ...request,
        options: { ...request.options, extra: true },
      }),
    ).toBe(false);
    expect(
      isStudioWillV1OpcWorkerRequest({
        ...request,
        input: { ...request.input, extra: true },
      }),
    ).toBe(false);
    expect(
      isStudioWillV1OpcWorkerRequest({
        ...request,
        input: {
          ...request.input,
          paths: [{
            ...request.input.paths[0]!,
            extra: true,
          }],
        },
      }),
    ).toBe(false);
  });

  it("rejects additional response, result, path, and error keys", () => {
    expect(isStudioWillV1OpcWorkerResponse(VALID_ENCODE_RESPONSE)).toBe(
      true,
    );
    expect(
      isStudioWillV1OpcWorkerResponse({
        ...VALID_ENCODE_RESPONSE,
        extra: true,
      }),
    ).toBe(false);
    expect(
      isStudioWillV1OpcWorkerResponse({
        ...VALID_ENCODE_RESPONSE,
        result: { ...VALID_ENCODE_RESPONSE.result, extra: true },
      }),
    ).toBe(false);
    expect(
      isStudioWillV1OpcWorkerResponse({
        ...VALID_ENCODE_RESPONSE,
        result: {
          ...VALID_ENCODE_RESPONSE.result,
          paths: [{ ...VALID_PATH, extra: true }],
        },
      }),
    ).toBe(false);
    expect(
      isStudioWillV1OpcWorkerResponse({
        type: "studio-will-v1-opc/failure",
        version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
        requestId: "failure-extra",
        operation: "encode",
        error: {
          code: "OPERATION_FAILED",
          name: "Error",
          message: "작업에 실패했습니다.",
          extra: true,
        },
      }),
    ).toBe(false);
  });

  it("publishes a bounded object-clone cap below the storage limit", () => {
    expect(
      STUDIO_WILL_V1_OPC_WORKER_MAX_STRUCTURED_CLONE_POINTS,
    ).toBe(100_000);
  });
});
