import {
  STUDIO_WILL_V1_LIMITS,
  type StudioWillV1Limits,
  type StudioWillV1Path,
} from "./studio-will-v1-interchange";
import {
  STUDIO_WILL_V1_OPC_ASSURANCE,
  STUDIO_WILL_V1_OPC_LIMITS,
  type StudioWillV1OpcBuildResult,
  type StudioWillV1OpcErrorCode,
  type StudioWillV1OpcExportInput,
  type StudioWillV1OpcImportResult,
  type StudioWillV1OpcLimits,
} from "./studio-will-v1-opc-interchange";

export const STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION = 1 as const;
/**
 * Object-graph transport is intentionally capped below the codec's one-million-point storage
 * limit. Raising this requires a versioned packed typed-array request/response transport.
 */
export const STUDIO_WILL_V1_OPC_WORKER_MAX_STRUCTURED_CLONE_POINTS =
  100_000;

export interface StudioWillV1OpcWorkerCodecOptions {
  readonly limits?: Partial<StudioWillV1OpcLimits>;
  readonly willLimits?: Partial<StudioWillV1Limits>;
}

interface StudioWillV1OpcWorkerRequestBase {
  readonly version: typeof STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION;
  readonly requestId: string;
}

export interface StudioWillV1OpcWorkerEncodeRequest
  extends StudioWillV1OpcWorkerRequestBase {
  readonly type: "studio-will-v1-opc/encode";
  readonly input: StudioWillV1OpcExportInput;
  readonly options?: StudioWillV1OpcWorkerCodecOptions;
}

export interface StudioWillV1OpcWorkerDecodeRequest
  extends StudioWillV1OpcWorkerRequestBase {
  readonly type: "studio-will-v1-opc/decode";
  /** Uint8Array snapshots are transferred; Blob inputs are structured-cloned and read in-Worker. */
  readonly source: Uint8Array | Blob;
  readonly options?: StudioWillV1OpcWorkerCodecOptions;
}

export type StudioWillV1OpcWorkerRequest =
  | StudioWillV1OpcWorkerEncodeRequest
  | StudioWillV1OpcWorkerDecodeRequest;

export type StudioWillV1OpcWorkerFailureCode =
  | StudioWillV1OpcErrorCode
  | "INVALID_REQUEST"
  | "OPERATION_FAILED";

export interface StudioWillV1OpcWorkerSerializedError {
  readonly code: StudioWillV1OpcWorkerFailureCode;
  readonly name: string;
  readonly message: string;
  readonly path?: string;
}

export interface StudioWillV1OpcWorkerEncodeSuccess {
  readonly type: "studio-will-v1-opc/encode-success";
  readonly version: typeof STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly result: StudioWillV1OpcBuildResult;
}

export interface StudioWillV1OpcWorkerDecodeSuccess {
  readonly type: "studio-will-v1-opc/decode-success";
  readonly version: typeof STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly result: StudioWillV1OpcImportResult;
}

export interface StudioWillV1OpcWorkerFailure {
  readonly type: "studio-will-v1-opc/failure";
  readonly version: typeof STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly operation: "decode" | "encode";
  readonly error: StudioWillV1OpcWorkerSerializedError;
}

export type StudioWillV1OpcWorkerResponse =
  | StudioWillV1OpcWorkerEncodeSuccess
  | StudioWillV1OpcWorkerDecodeSuccess
  | StudioWillV1OpcWorkerFailure;

const FAILURE_CODES = new Set<StudioWillV1OpcWorkerFailureCode>([
  "ABORTED",
  "ARCHIVE_INVALID",
  "CONTENT_TYPES_INVALID",
  "DIMENSION_INVALID",
  "LIMIT_INVALID",
  "METADATA_INVALID",
  "PART_SET_INVALID",
  "RELATIONSHIP_INVALID",
  "RESOURCE_LIMIT",
  "STROKES_INVALID",
  "SVG_INVALID",
  "XML_INVALID",
  "INVALID_REQUEST",
  "OPERATION_FAILED",
]);

const REQUEST_BASE_KEYS = ["type", "version", "requestId"] as const;
const CODEC_OPTION_KEYS = ["limits", "willLimits"] as const;
const OPC_LIMIT_KEYS = [
  "maxArchiveBytes",
  "maxXmlPartBytes",
  "maxStrokesBytes",
  "maxMetadataCharacters",
  "maxDimension",
  "maxXmlDepth",
  "maxXmlElements",
  "maxXmlAttributesPerElement",
] as const;
const WILL_LIMIT_KEYS = [
  "maxStrokesBytes",
  "maxPathMessageBytes",
  "maxPaths",
  "maxPointsPerPath",
  "maxTotalPoints",
  "maxDecimalPrecision",
  "maxCoordinateMagnitude",
  "maxStrokeWidth",
] as const;
const EXPORT_INPUT_KEYS = [
  "width",
  "height",
  "paths",
  "title",
  "createdAt",
  "application",
  "applicationVersion",
] as const;
const PATH_INPUT_KEYS = [
  "points",
  "strokeWidths",
  "strokeColor",
  "startParameter",
  "endParameter",
  "decimalPrecision",
] as const;
const PATH_KEYS = [...PATH_INPUT_KEYS, "segmentCount"] as const;
const POINT_KEYS = ["x", "y"] as const;
const COLOR_KEYS = ["r", "g", "b", "a"] as const;
const ENCODE_RESULT_KEYS = ["bytes", "paths", "loss", "assurance"] as const;
const DECODE_RESULT_KEYS = [
  "width",
  "height",
  "title",
  "createdAt",
  "application",
  "applicationVersion",
  "paths",
  "assurance",
] as const;
const LOSS_KEYS = ["status", "quantization", "items"] as const;
const LOSS_ITEM_KEYS = [
  "code",
  "pathIndex",
  "changedValues",
  "maximumAbsoluteError",
  "message",
] as const;
const FAILURE_KEYS = [
  "type",
  "version",
  "requestId",
  "operation",
  "error",
] as const;
const LOSS_CODES = new Set([
  "END_PARAMETER_BINARY32_QUANTIZED",
  "POSITION_FIXED_POINT_QUANTIZED",
  "START_PARAMETER_BINARY32_QUANTIZED",
  "STROKE_WIDTH_FIXED_POINT_QUANTIZED",
]);

function ownDataRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> | null {
  try {
    if (
      value === null
      || typeof value !== "object"
      || Array.isArray(value)
    ) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const allowed = new Set([...requiredKeys, ...optionalKeys]);
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.some(
        (key) => typeof key !== "string" || !allowed.has(key),
      )
      || requiredKeys.some((key) => !ownKeys.includes(key))
    ) {
      return null;
    }
    const record: Record<string, unknown> = {};
    for (const key of ownKeys) {
      if (typeof key !== "string") return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        return null;
      }
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function exactDenseArray(value: unknown): readonly unknown[] | null {
  try {
    if (!Array.isArray(value)) return null;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== value.length + 1
      || !keys.includes("length")
    ) {
      return null;
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(
        value,
        String(index),
      );
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        return null;
      }
    }
    return value;
  } catch {
    return null;
  }
}

function ownValue(value: unknown, key: string): unknown {
  try {
    if (value === null || typeof value !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isRequestId(value: unknown): value is string {
  return (
    typeof value === "string"
    && value.length >= 1
    && value.length <= 128
    && !hasControlCharacter(value)
  );
}

function isPartialNumericRecord(
  value: unknown,
  allowedKeys: readonly string[],
): boolean {
  if (value === undefined) return true;
  const record = ownDataRecord(value, [], allowedKeys);
  return (
    record !== null
    && Object.values(record).every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  );
}

function isCodecOptions(
  value: unknown,
): value is StudioWillV1OpcWorkerCodecOptions {
  if (value === undefined) return true;
  const record = ownDataRecord(value, [], CODEC_OPTION_KEYS);
  if (!record) return false;
  const willLimits = record.willLimits === undefined
    ? null
    : ownDataRecord(record.willLimits, [], WILL_LIMIT_KEYS);
  return (
    isPartialNumericRecord(record.limits, OPC_LIMIT_KEYS)
    && isPartialNumericRecord(record.willLimits, WILL_LIMIT_KEYS)
    && (
      willLimits?.maxTotalPoints === undefined
      || (
        typeof willLimits.maxTotalPoints === "number"
        && willLimits.maxTotalPoints
          <= STUDIO_WILL_V1_OPC_WORKER_MAX_STRUCTURED_CLONE_POINTS
      )
    )
  );
}

function isInputPath(value: unknown): boolean {
  const path = ownDataRecord(
    value,
    ["points", "strokeWidths", "strokeColor"],
    ["startParameter", "endParameter", "decimalPrecision"],
  );
  const points = path ? exactDenseArray(path.points) : null;
  const strokeWidths = path
    ? exactDenseArray(path.strokeWidths)
    : null;
  const color = path
    ? ownDataRecord(path.strokeColor, COLOR_KEYS)
    : null;
  if (
    !path
    || !points
    || !strokeWidths
    || !color
    || points.length < 4
    || points.length > STUDIO_WILL_V1_LIMITS.maxPointsPerPath
    || strokeWidths.length < 1
    || strokeWidths.length > points.length
  ) {
    return false;
  }
  if (
    !points.every((point) => {
      const record = ownDataRecord(point, POINT_KEYS);
      return (
        record !== null
        && finiteNumber(
          record.x,
          -STUDIO_WILL_V1_LIMITS.maxCoordinateMagnitude,
          STUDIO_WILL_V1_LIMITS.maxCoordinateMagnitude,
        )
        && finiteNumber(
          record.y,
          -STUDIO_WILL_V1_LIMITS.maxCoordinateMagnitude,
          STUDIO_WILL_V1_LIMITS.maxCoordinateMagnitude,
        )
      );
    })
    || !strokeWidths.every(
      (width) =>
        finiteNumber(
          width,
          Number.MIN_VALUE,
          STUDIO_WILL_V1_LIMITS.maxStrokeWidth,
        ),
    )
    || !COLOR_KEYS.every((channel) => {
      const component = color[channel];
      return (
        Number.isInteger(component)
        && (component as number) >= 0
        && (component as number) <= 255
      );
    })
    || (
      path.startParameter !== undefined
      && !finiteNumber(path.startParameter, 0, 1)
    )
    || (
      path.endParameter !== undefined
      && !finiteNumber(path.endParameter, 0, 1)
    )
    || (
      path.decimalPrecision !== undefined
      && (
        !Number.isInteger(path.decimalPrecision)
        || (path.decimalPrecision as number) < 0
        || (path.decimalPrecision as number)
          > STUDIO_WILL_V1_LIMITS.maxDecimalPrecision
      )
    )
  ) {
    return false;
  }
  return true;
}

function isEncodeInput(value: unknown): value is StudioWillV1OpcExportInput {
  const input = ownDataRecord(
    value,
    ["width", "height", "paths"],
    EXPORT_INPUT_KEYS.filter(
      (key) => key !== "width" && key !== "height" && key !== "paths",
    ),
  );
  const paths = input ? exactDenseArray(input.paths) : null;
  if (
    !input
    || !paths
    || !finiteNumber(
      input.width,
      Number.MIN_VALUE,
      STUDIO_WILL_V1_OPC_LIMITS.maxDimension,
    )
    || !finiteNumber(
      input.height,
      Number.MIN_VALUE,
      STUDIO_WILL_V1_OPC_LIMITS.maxDimension,
    )
    || paths.length < 1
    || paths.length > STUDIO_WILL_V1_LIMITS.maxPaths
  ) {
    return false;
  }
  let totalPoints = 0;
  for (const path of paths) {
    if (!isInputPath(path)) return false;
    const record = ownDataRecord(
      path,
      ["points", "strokeWidths", "strokeColor"],
      ["startParameter", "endParameter", "decimalPrecision"],
    );
    const points = record ? exactDenseArray(record.points) : null;
    if (!points) return false;
    totalPoints += points.length;
    if (
      totalPoints
      > STUDIO_WILL_V1_OPC_WORKER_MAX_STRUCTURED_CLONE_POINTS
    ) {
      return false;
    }
  }
  return [
    input.title,
    input.createdAt,
    input.application,
    input.applicationVersion,
  ].every(
    (entry) =>
      entry === undefined
      || (
        typeof entry === "string"
        && entry.length >= 1
        && Array.from(entry).length
          <= STUDIO_WILL_V1_OPC_LIMITS.maxMetadataCharacters
      ),
  );
}

export function isStudioWillV1OpcWorkerRequest(
  value: unknown
): value is StudioWillV1OpcWorkerRequest {
  const type = ownValue(value, "type");
  const record = type === "studio-will-v1-opc/encode"
    ? ownDataRecord(
        value,
        [...REQUEST_BASE_KEYS, "input"],
        ["options"],
      )
    : type === "studio-will-v1-opc/decode"
      ? ownDataRecord(
          value,
          [...REQUEST_BASE_KEYS, "source"],
          ["options"],
        )
      : null;
  if (
    !record
    || record.version !== STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION
    || !isRequestId(record.requestId)
    || !isCodecOptions(record.options)
  ) {
    return false;
  }
  if (type === "studio-will-v1-opc/encode") {
    return isEncodeInput(record.input);
  }
  return (
    type === "studio-will-v1-opc/decode"
    && (
      record.source instanceof Uint8Array
      || (
        typeof Blob !== "undefined"
        && record.source instanceof Blob
      )
    )
  );
}

export function studioWillV1OpcWorkerCorrelation(
  value: unknown
): { readonly requestId: string; readonly operation?: "decode" | "encode" } | null {
  const requestId = ownValue(value, "requestId");
  if (!isRequestId(requestId)) return null;
  const type = ownValue(value, "type");
  let operation: "decode" | "encode" | undefined;
  if (type === "studio-will-v1-opc/encode" || type === "studio-will-v1-opc/encode-success") {
    operation = "encode";
  } else if (
    type === "studio-will-v1-opc/decode"
    || type === "studio-will-v1-opc/decode-success"
  ) {
    operation = "decode";
  } else if (
    type === "studio-will-v1-opc/failure"
    && (
      ownValue(value, "operation") === "decode"
      || ownValue(value, "operation") === "encode"
    )
  ) {
    operation = ownValue(value, "operation") as "decode" | "encode";
  }
  return operation === undefined
    ? { requestId }
    : { requestId, operation };
}

function isSerializedError(value: unknown): value is StudioWillV1OpcWorkerSerializedError {
  const error = ownDataRecord(
    value,
    ["code", "name", "message"],
    ["path"],
  );
  if (
    !error
    || typeof error.code !== "string"
    || !FAILURE_CODES.has(
      error.code as StudioWillV1OpcWorkerFailureCode,
    )
    || typeof error.name !== "string"
    || error.name.length < 1
    || error.name.length > 128
    || typeof error.message !== "string"
    || error.message.length < 1
    || error.message.length > 2_048
  ) {
    return false;
  }
  return error.path === undefined
    || (
      typeof error.path === "string"
      && error.path.length >= 1
      && error.path.length <= 1_024
    );
}

function finiteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number"
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum
  );
}

function isPath(value: unknown): value is StudioWillV1Path {
  const path = ownDataRecord(value, PATH_KEYS);
  const points = path ? exactDenseArray(path.points) : null;
  const strokeWidths = path
    ? exactDenseArray(path.strokeWidths)
    : null;
  const strokeColor = path
    ? ownDataRecord(path.strokeColor, COLOR_KEYS)
    : null;
  if (
    !path
    || !points
    || !strokeWidths
    || !strokeColor
    || points.length < 4
    || points.length > STUDIO_WILL_V1_LIMITS.maxPointsPerPath
    || strokeWidths.length < 1
    || strokeWidths.length > points.length
    || !finiteNumber(path.startParameter, 0, 1)
    || !finiteNumber(path.endParameter, 0, 1)
    || !Number.isInteger(path.decimalPrecision)
    || (path.decimalPrecision as number) < 0
    || (path.decimalPrecision as number)
      > STUDIO_WILL_V1_LIMITS.maxDecimalPrecision
    || path.segmentCount !== points.length - 3
  ) {
    return false;
  }
  for (const point of points) {
    const record = ownDataRecord(point, POINT_KEYS);
    if (
      !record
      || !finiteNumber(
        record.x,
        -STUDIO_WILL_V1_LIMITS.maxCoordinateMagnitude,
        STUDIO_WILL_V1_LIMITS.maxCoordinateMagnitude
      )
      || !finiteNumber(
        record.y,
        -STUDIO_WILL_V1_LIMITS.maxCoordinateMagnitude,
        STUDIO_WILL_V1_LIMITS.maxCoordinateMagnitude
      )
    ) {
      return false;
    }
  }
  if (
    !strokeWidths.every((width) =>
      finiteNumber(width, Number.MIN_VALUE, STUDIO_WILL_V1_LIMITS.maxStrokeWidth)
    )
  ) {
    return false;
  }
  return COLOR_KEYS.every((channel) => {
    const component = strokeColor[channel];
    return (
      typeof component === "number"
      && Number.isInteger(component)
      && component >= 0
      && component <= 255
    );
  });
}

function isBoundedPaths(value: unknown): value is readonly StudioWillV1Path[] {
  const paths = exactDenseArray(value);
  if (
    !paths
    || paths.length < 1
    || paths.length > STUDIO_WILL_V1_LIMITS.maxPaths
  ) {
    return false;
  }
  let totalPoints = 0;
  for (const path of paths) {
    if (!isPath(path)) return false;
    totalPoints += path.points.length;
    if (
      totalPoints
      > STUDIO_WILL_V1_OPC_WORKER_MAX_STRUCTURED_CLONE_POINTS
    ) {
      return false;
    }
  }
  return true;
}

function isLossReport(value: unknown, pathCount: number): boolean {
  const loss = ownDataRecord(value, LOSS_KEYS);
  const items = loss ? exactDenseArray(loss.items) : null;
  if (
    !loss
    || !items
    || (loss.status !== "declared" && loss.status !== "exact")
    || loss.quantization !== "truncate-toward-zero"
    || items.length > pathCount * 4
  ) {
    return false;
  }
  return items.every((item) => {
    const record = ownDataRecord(item, LOSS_ITEM_KEYS);
    return (
      record !== null
      && typeof record.code === "string"
      && LOSS_CODES.has(record.code)
      && Number.isInteger(record.pathIndex)
      && (record.pathIndex as number) >= 0
      && (record.pathIndex as number) < pathCount
      && Number.isInteger(record.changedValues)
      && (record.changedValues as number) >= 1
      && finiteNumber(
        record.maximumAbsoluteError,
        0,
        Number.MAX_VALUE,
      )
      && typeof record.message === "string"
      && record.message.length >= 1
      && record.message.length <= 2_048
    );
  });
}

function hasExactAssurance(value: unknown): boolean {
  const expectedEntries = Object.entries(STUDIO_WILL_V1_OPC_ASSURANCE);
  const record = ownDataRecord(
    value,
    expectedEntries.map(([key]) => key),
  );
  if (!record) return false;
  return expectedEntries.every(
    ([key, expected]) => record[key] === expected,
  );
}

function isMetadataText(value: unknown): value is string {
  return (
    typeof value === "string"
    && value.length >= 1
    && Array.from(value).length <= STUDIO_WILL_V1_OPC_LIMITS.maxMetadataCharacters
  );
}

function isEncodeResult(value: unknown): value is StudioWillV1OpcBuildResult {
  const result = ownDataRecord(value, ENCODE_RESULT_KEYS);
  return (
    result !== null
    && result.bytes instanceof Uint8Array
    && result.bytes.buffer instanceof ArrayBuffer
    && result.bytes.byteOffset === 0
    && result.bytes.byteLength === result.bytes.buffer.byteLength
    && result.bytes.byteLength >= 22
    && result.bytes.byteLength
      <= STUDIO_WILL_V1_OPC_LIMITS.maxArchiveBytes
    && isBoundedPaths(result.paths)
    && isLossReport(
      result.loss,
      (result.paths as readonly StudioWillV1Path[]).length,
    )
    && hasExactAssurance(result.assurance)
  );
}

function isDecodeResult(value: unknown): value is StudioWillV1OpcImportResult {
  const result = ownDataRecord(value, DECODE_RESULT_KEYS);
  return (
    result !== null
    && typeof result.width === "number"
    && Number.isFinite(result.width)
    && result.width > 0
    && result.width <= STUDIO_WILL_V1_OPC_LIMITS.maxDimension
    && typeof result.height === "number"
    && Number.isFinite(result.height)
    && result.height > 0
    && result.height <= STUDIO_WILL_V1_OPC_LIMITS.maxDimension
    && isMetadataText(result.title)
    && isMetadataText(result.createdAt)
    && isMetadataText(result.application)
    && isMetadataText(result.applicationVersion)
    && isBoundedPaths(result.paths)
    && hasExactAssurance(result.assurance)
  );
}

export function isStudioWillV1OpcWorkerResponse(
  value: unknown
): value is StudioWillV1OpcWorkerResponse {
  const type = ownValue(value, "type");
  const record =
    type === "studio-will-v1-opc/encode-success"
    || type === "studio-will-v1-opc/decode-success"
      ? ownDataRecord(
          value,
          ["type", "version", "requestId", "result"],
        )
      : type === "studio-will-v1-opc/failure"
        ? ownDataRecord(value, FAILURE_KEYS)
        : null;
  if (
    !record
    || record.version !== STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION
    || !isRequestId(record.requestId)
  ) {
    return false;
  }
  if (type === "studio-will-v1-opc/encode-success") {
    return isEncodeResult(record.result);
  }
  if (type === "studio-will-v1-opc/decode-success") {
    return isDecodeResult(record.result);
  }
  return (
    type === "studio-will-v1-opc/failure"
    && (
      record.operation === "decode"
      || record.operation === "encode"
    )
    && isSerializedError(record.error)
  );
}

export function studioWillV1OpcWorkerRequestTransfers(
  request: StudioWillV1OpcWorkerRequest
): Transferable[] {
  if (request.type !== "studio-will-v1-opc/decode") return [];
  if (!(request.source instanceof Uint8Array)) return [];
  const buffer = request.source.buffer;
  return buffer instanceof ArrayBuffer ? [buffer] : [];
}

export function studioWillV1OpcWorkerResponseTransfers(
  response: StudioWillV1OpcWorkerResponse
): Transferable[] {
  if (response.type !== "studio-will-v1-opc/encode-success") return [];
  const bytes = response.result.bytes;
  const buffer = bytes.buffer;
  return (
    buffer instanceof ArrayBuffer
    && bytes.byteOffset === 0
    && bytes.byteLength === buffer.byteLength
  )
    ? [buffer]
    : [];
}
