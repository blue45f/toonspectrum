import type {
  StudioRasterDecoded,
  StudioRasterEncoded,
  StudioRasterInterchangeFormat,
} from "./studio-raster-interchange";

export const STUDIO_RASTER_INTERCHANGE_WORKER_VERSION = 2 as const;

interface StudioRasterInterchangeWorkerRequestBase {
  readonly version: typeof STUDIO_RASTER_INTERCHANGE_WORKER_VERSION;
  readonly requestId: string;
}

export interface StudioRasterInterchangeWorkerEncodeRequest
  extends StudioRasterInterchangeWorkerRequestBase {
  readonly type: "studio-raster-interchange/encode";
  readonly format: StudioRasterInterchangeFormat;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface StudioRasterInterchangeWorkerDecodeRequest
  extends StudioRasterInterchangeWorkerRequestBase {
  readonly type: "studio-raster-interchange/decode";
  readonly bytes: Uint8Array;
  readonly expectedFormat?: StudioRasterInterchangeFormat;
}

export type StudioRasterInterchangeWorkerRequest =
  | StudioRasterInterchangeWorkerEncodeRequest
  | StudioRasterInterchangeWorkerDecodeRequest;

export type StudioRasterInterchangeWorkerSuccessResponse =
  | {
      readonly type: "studio-raster-interchange/encode-success";
      readonly version: typeof STUDIO_RASTER_INTERCHANGE_WORKER_VERSION;
      readonly requestId: string;
      readonly result: StudioRasterEncoded;
    }
  | {
      readonly type: "studio-raster-interchange/decode-success";
      readonly version: typeof STUDIO_RASTER_INTERCHANGE_WORKER_VERSION;
      readonly requestId: string;
      readonly result: StudioRasterDecoded;
    };

export type StudioRasterInterchangeWorkerResponse =
  | {
      readonly type: "studio-raster-interchange/ready";
      readonly version: typeof STUDIO_RASTER_INTERCHANGE_WORKER_VERSION;
    }
  | StudioRasterInterchangeWorkerSuccessResponse
  | {
      readonly type: "studio-raster-interchange/failure";
      readonly version: typeof STUDIO_RASTER_INTERCHANGE_WORKER_VERSION;
      readonly requestId: string;
      readonly error: { readonly name: string; readonly message: string };
    };

export function studioRasterInterchangeRequestTransfers(
  request: StudioRasterInterchangeWorkerRequest
): Transferable[] {
  const buffer = request.type === "studio-raster-interchange/encode"
    ? request.data.buffer
    : request.bytes.buffer;
  return buffer instanceof ArrayBuffer ? [buffer] : [];
}

export function studioRasterInterchangeResponseTransfers(
  response: StudioRasterInterchangeWorkerResponse
): Transferable[] {
  if (response.type === "studio-raster-interchange/encode-success") {
    return response.result.bytes.buffer instanceof ArrayBuffer ? [response.result.bytes.buffer] : [];
  }
  if (response.type === "studio-raster-interchange/decode-success") {
    return response.result.bitmap.data.buffer instanceof ArrayBuffer ? [response.result.bitmap.data.buffer] : [];
  }
  return [];
}
