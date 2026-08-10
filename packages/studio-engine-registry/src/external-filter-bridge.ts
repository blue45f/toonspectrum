/**
 * ToonStudio V12 external filter isolation protocol.
 *
 * G'MIC/GEGL code never enters the Studio bundle through this module. The
 * bridge exchanges neutral RGBA buffers with a separately deployed Worker,
 * Local ToonBridge, or remote provider over an injected postMessage surface.
 * Every trust decision is explicit: protocol/version, transport origin,
 * provider id, license, descriptor fingerprint, capabilities and quotas.
 */

export const EXTERNAL_FILTER_PROTOCOL = "toonspectrum.external-filter" as const;
export const EXTERNAL_FILTER_PROTOCOL_VERSION = 1 as const;

export type ExternalFilterJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ExternalFilterJsonValue[]
  | { readonly [key: string]: ExternalFilterJsonValue };

export type ExternalFilterDeployment =
  | "dedicated-worker"
  | "local-toonbridge"
  | "remote-service";

export interface ExternalFilterCapabilityDescriptor {
  readonly operationId: string;
  readonly title: string;
  readonly deterministic: boolean;
  readonly supportsProgress: boolean;
  readonly supportsCancellation: boolean;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
}

export interface ExternalFilterLicenseDescriptor {
  readonly spdx: string;
  readonly sourceUrl: string;
  readonly noticeUrl: string;
  /** Must remain false: copyleft binaries are not part of the Studio bundle. */
  readonly binaryBundled: false;
}

export interface ExternalFilterProviderDescriptor {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly engineName: string;
  readonly engineVersion: string;
  readonly buildId: string;
  readonly origin: string;
  readonly deployment: ExternalFilterDeployment;
  readonly license: ExternalFilterLicenseDescriptor;
  readonly capabilities: readonly ExternalFilterCapabilityDescriptor[];
}

export interface ExternalFilterProviderAllowance {
  readonly providerId: string;
  readonly licenses: readonly string[];
}

export interface ExternalFilterBridgeQuotas {
  readonly handshakeTimeoutMs: number;
  readonly cancelAckTimeoutMs: number;
  readonly maxRuntimeMs: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly maxParameterBytes: number;
  /** Input and expected output bytes are both reserved while a job is live. */
  readonly maxInFlightBytes: number;
  readonly maxInFlightRequests: number;
  readonly maxCapabilities: number;
  readonly maxDescriptorBytes: number;
  /** Bounds the tombstone set used to suppress late provider messages. */
  readonly maxRetiredRequestIds: number;
}

export const DEFAULT_EXTERNAL_FILTER_BRIDGE_QUOTAS: ExternalFilterBridgeQuotas = {
  handshakeTimeoutMs: 5_000,
  cancelAckTimeoutMs: 2_000,
  maxRuntimeMs: 120_000,
  maxWidth: 16_384,
  maxHeight: 16_384,
  maxInputBytes: 256 * 1024 * 1024,
  maxOutputBytes: 256 * 1024 * 1024,
  maxParameterBytes: 256 * 1024,
  maxInFlightBytes: 512 * 1024 * 1024,
  maxInFlightRequests: 2,
  maxCapabilities: 2_048,
  maxDescriptorBytes: 512 * 1024,
  maxRetiredRequestIds: 2_048,
};

export interface ExternalFilterTransportEvent {
  readonly data?: unknown;
  /** A trusted adapter must bind the actual transport origin here. */
  readonly origin?: string;
  readonly error?: unknown;
  readonly message?: string;
}

export type ExternalFilterTransportListener = (
  event: ExternalFilterTransportEvent,
) => void;

/** MessagePort-like injection point. Browser/native adapters stay outside. */
export interface ExternalFilterMessagePort {
  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void;
  addEventListener(
    type: "message" | "messageerror" | "error",
    listener: ExternalFilterTransportListener,
  ): void;
  removeEventListener(
    type: "message" | "messageerror" | "error",
    listener: ExternalFilterTransportListener,
  ): void;
  start?(): void;
  close?(): void;
}

export interface ExternalFilterRuntime {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ExternalFilterBridgeOptions {
  readonly port: ExternalFilterMessagePort;
  readonly allowedOrigins: readonly string[];
  readonly allowedProviders: readonly ExternalFilterProviderAllowance[];
  readonly quotas?: Partial<ExternalFilterBridgeQuotas>;
  readonly runtime?: ExternalFilterRuntime;
  readonly idFactory?: () => string;
  /** The bridge owns its port by default and closes it on fatal failure/dispose. */
  readonly closePortOnDispose?: boolean;
}

export interface ExternalFilterProgress {
  readonly requestId: string;
  readonly progress: number;
  readonly phase: string;
}

export interface ExternalFilterExecuteRequest {
  readonly operationId: string;
  readonly width: number;
  readonly height: number;
  readonly pixels: ArrayBuffer;
  readonly parameters?: Readonly<Record<string, ExternalFilterJsonValue>>;
  readonly seed?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExternalFilterProgress) => void;
}

export interface ExternalFilterExecuteResult {
  readonly requestId: string;
  readonly providerId: string;
  readonly operationId: string;
  readonly width: number;
  readonly height: number;
  readonly pixels: ArrayBuffer;
  readonly elapsedMs: number;
}

export interface ExternalFilterBridgeMetrics {
  readonly state: ExternalFilterBridgeState;
  readonly pendingRequests: number;
  readonly inFlightBytes: number;
  readonly peakInFlightBytes: number;
  readonly retiredRequestIds: number;
  readonly completedRequests: number;
  readonly cancelledRequests: number;
  readonly timedOutRequests: number;
  readonly rejectedMessages: number;
  readonly ignoredLateMessages: number;
}

export type ExternalFilterBridgeState =
  | "connecting"
  | "ready"
  | "failed"
  | "disposed";

export type ExternalFilterBridgeErrorCode =
  | "CONFIGURATION_ERROR"
  | "HANDSHAKE_TIMEOUT"
  | "PROTOCOL_VIOLATION"
  | "ORIGIN_REJECTED"
  | "VERSION_REJECTED"
  | "PROVIDER_REJECTED"
  | "LICENSE_REJECTED"
  | "CAPABILITY_UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "CANCELLED"
  | "CANCEL_ACK_TIMEOUT"
  | "RUNTIME_TIMEOUT"
  | "PROVIDER_ERROR"
  | "TRANSPORT_ERROR"
  | "CLIENT_CALLBACK_ERROR"
  | "DISPOSED";

export interface ExternalFilterBridgeErrorOptions {
  readonly requestId?: string;
  readonly retryable?: boolean;
  readonly details?: Readonly<Record<string, ExternalFilterJsonValue>>;
  readonly cause?: unknown;
}

export class ExternalFilterBridgeError extends Error {
  readonly code: ExternalFilterBridgeErrorCode;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, ExternalFilterJsonValue>>;

  constructor(
    code: ExternalFilterBridgeErrorCode,
    message: string,
    options: ExternalFilterBridgeErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ExternalFilterBridgeError";
    this.code = code;
    this.requestId = options.requestId ?? null;
    this.retryable = options.retryable ?? false;
    this.details = Object.freeze({ ...(options.details ?? {}) });
  }
}

export interface ExternalFilterClientHelloMessage {
  readonly protocol: typeof EXTERNAL_FILTER_PROTOCOL;
  readonly version: typeof EXTERNAL_FILTER_PROTOCOL_VERSION;
  readonly type: "client-hello";
  readonly handshakeId: string;
}

export interface ExternalFilterRunMessage {
  readonly protocol: typeof EXTERNAL_FILTER_PROTOCOL;
  readonly version: typeof EXTERNAL_FILTER_PROTOCOL_VERSION;
  readonly type: "run";
  readonly providerId: string;
  readonly requestId: string;
  readonly operationId: string;
  readonly width: number;
  readonly height: number;
  readonly pixelFormat: "rgba8";
  readonly colorSpace: "srgb";
  readonly pixels: ArrayBuffer;
  readonly parameters: Readonly<Record<string, ExternalFilterJsonValue>>;
  readonly seed: number | null;
  readonly runtimeLimitMs: number;
}

export interface ExternalFilterCancelMessage {
  readonly protocol: typeof EXTERNAL_FILTER_PROTOCOL;
  readonly version: typeof EXTERNAL_FILTER_PROTOCOL_VERSION;
  readonly type: "cancel";
  readonly providerId: string;
  readonly requestId: string;
  readonly reason: "abort-signal" | "runtime-timeout" | "client-callback-error";
}

export interface ExternalFilterDisposeMessage {
  readonly protocol: typeof EXTERNAL_FILTER_PROTOCOL;
  readonly version: typeof EXTERNAL_FILTER_PROTOCOL_VERSION;
  readonly type: "dispose";
  readonly providerId: string;
}

export type ExternalFilterClientMessage =
  | ExternalFilterClientHelloMessage
  | ExternalFilterRunMessage
  | ExternalFilterCancelMessage
  | ExternalFilterDisposeMessage;

interface ExternalFilterProviderReadyMessage {
  readonly protocol: typeof EXTERNAL_FILTER_PROTOCOL;
  readonly version: typeof EXTERNAL_FILTER_PROTOCOL_VERSION;
  readonly type: "provider-ready";
  readonly handshakeId: string;
  readonly descriptor: ExternalFilterProviderDescriptor;
  readonly descriptorFingerprint: string;
}

interface ExternalFilterProgressMessage {
  readonly type: "progress";
  readonly requestId: string;
  readonly progress: number;
  readonly phase: string;
}

interface ExternalFilterResultMessage {
  readonly type: "result";
  readonly requestId: string;
  readonly operationId: string;
  readonly width: number;
  readonly height: number;
  readonly pixelFormat: "rgba8";
  readonly colorSpace: "srgb";
  readonly pixels: ArrayBuffer;
}

interface ExternalFilterProviderErrorMessage {
  readonly type: "provider-error";
  readonly requestId: string;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly details: Readonly<Record<string, ExternalFilterJsonValue>>;
  };
}

interface ExternalFilterCancelAckMessage {
  readonly type: "cancel-ack";
  readonly requestId: string;
}

type ExternalFilterRuntimeProviderMessage =
  | ExternalFilterProgressMessage
  | ExternalFilterResultMessage
  | ExternalFilterProviderErrorMessage
  | ExternalFilterCancelAckMessage;

interface HandshakeState {
  readonly handshakeId: string;
  readonly resolve: (bridge: ExternalFilterBridge) => void;
  readonly reject: (error: ExternalFilterBridgeError) => void;
  readonly timer: unknown;
}

interface PendingRequest {
  readonly requestId: string;
  readonly operationId: string;
  readonly width: number;
  readonly height: number;
  readonly startedAt: number;
  readonly reservedBytes: number;
  readonly capability: ExternalFilterCapabilityDescriptor;
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
  readonly onProgress?: (progress: ExternalFilterProgress) => void;
  readonly resolve: (result: ExternalFilterExecuteResult) => void;
  readonly reject: (error: ExternalFilterBridgeError) => void;
  runtimeTimer: unknown;
  cancelTimer: unknown | null;
  progress: number;
  state: "running" | "cancelling";
  terminalError: ExternalFilterBridgeError | null;
}

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const OPERATION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,191}$/;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;
const SPDX_PATTERN = /^[A-Za-z0-9.+-]{1,96}$/;
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const DEFAULT_RUNTIME: ExternalFilterRuntime = {
  now: () => globalThis.performance?.now() ?? Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
};

function makeSecureId(): string {
  const crypto = globalThis.crypto;
  if (crypto === undefined || typeof crypto.getRandomValues !== "function") {
    throw new ExternalFilterBridgeError(
      "CONFIGURATION_ERROR",
      "a cryptographically secure idFactory is required",
    );
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let encoded = "ef-";
  for (const byte of bytes) encoded += byte.toString(16).padStart(2, "0");
  return encoded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", `${label} must be a plain object`);
  }
  return value;
}

function requireExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
  label = "message",
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw new ExternalFilterBridgeError(
        "PROTOCOL_VIOLATION",
        `${label} is missing required key ${key}`,
      );
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ExternalFilterBridgeError(
        "PROTOCOL_VIOLATION",
        `${label} contains unknown key ${key}`,
      );
    }
  }
}

function requireString(
  value: unknown,
  label: string,
  maxLength = 512,
): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new ExternalFilterBridgeError(
      "PROTOCOL_VIOLATION",
      `${label} must be a non-empty string of at most ${maxLength} characters`,
    );
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", `${label} must be boolean`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ExternalFilterBridgeError(
      "PROTOCOL_VIOLATION",
      `${label} must be a positive safe integer`,
    );
  }
  return value as number;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", `${label} must be finite`);
  }
  return value;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateJsonValue(
  value: unknown,
  label: string,
  depth = 0,
  seen = new Set<object>(),
): asserts value is ExternalFilterJsonValue {
  if (depth > 24) {
    throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", `${label} exceeds JSON depth 24`);
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (typeof value !== "object" || value === null) {
    throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", `${label} is not JSON-safe`);
  }
  if (seen.has(value)) {
    throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", `${label} contains a cycle`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonValue(entry, `${label}[${index}]`, depth + 1, seen));
  } else {
    const record = requireRecord(value, label);
    for (const [key, entry] of Object.entries(record)) {
      if (FORBIDDEN_JSON_KEYS.has(key)) {
        throw new ExternalFilterBridgeError(
          "PROTOCOL_VIOLATION",
          `${label} contains forbidden key ${key}`,
        );
      }
      validateJsonValue(entry, `${label}.${key}`, depth + 1, seen);
    }
  }
  seen.delete(value);
}

function validateJsonRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, ExternalFilterJsonValue>> {
  const record = requireRecord(value, label);
  validateJsonValue(record, label);
  return record as Readonly<Record<string, ExternalFilterJsonValue>>;
}

function requireHttpsUrl(value: unknown, label: string): string {
  const url = requireString(value, label, 2_048);
  if (!url.startsWith("https://")) {
    throw new ExternalFilterBridgeError(
      "PROTOCOL_VIOLATION",
      `${label} must use https`,
    );
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
      throw new Error("unsafe URL");
    }
  } catch (cause) {
    throw new ExternalFilterBridgeError(
      "PROTOCOL_VIOLATION",
      `${label} is not a valid public HTTPS URL`,
      { cause },
    );
  }
  return url;
}

function canonicalizeDescriptor(
  descriptor: ExternalFilterProviderDescriptor,
): ExternalFilterProviderDescriptor {
  const capabilities = [...descriptor.capabilities]
    .sort((left, right) => left.operationId.localeCompare(right.operationId, "en"))
    .map((capability) => Object.freeze({ ...capability }));
  return Object.freeze({
    providerId: descriptor.providerId,
    providerVersion: descriptor.providerVersion,
    engineName: descriptor.engineName,
    engineVersion: descriptor.engineVersion,
    buildId: descriptor.buildId,
    origin: descriptor.origin,
    deployment: descriptor.deployment,
    license: Object.freeze({ ...descriptor.license }),
    capabilities: Object.freeze(capabilities),
  });
}

function descriptorCanonicalJson(descriptor: ExternalFilterProviderDescriptor): string {
  const canonical = canonicalizeDescriptor(descriptor);
  return JSON.stringify({
    providerId: canonical.providerId,
    providerVersion: canonical.providerVersion,
    engineName: canonical.engineName,
    engineVersion: canonical.engineVersion,
    buildId: canonical.buildId,
    origin: canonical.origin,
    deployment: canonical.deployment,
    license: {
      spdx: canonical.license.spdx,
      sourceUrl: canonical.license.sourceUrl,
      noticeUrl: canonical.license.noticeUrl,
      binaryBundled: canonical.license.binaryBundled,
    },
    capabilities: canonical.capabilities.map((capability) => ({
      operationId: capability.operationId,
      title: capability.title,
      deterministic: capability.deterministic,
      supportsProgress: capability.supportsProgress,
      supportsCancellation: capability.supportsCancellation,
      maxWidth: capability.maxWidth,
      maxHeight: capability.maxHeight,
      maxInputBytes: capability.maxInputBytes,
      maxOutputBytes: capability.maxOutputBytes,
    })),
  });
}

/** Stable FNV-1a fingerprint over the canonical descriptor byte stream. */
export function computeExternalFilterDescriptorFingerprint(
  descriptor: ExternalFilterProviderDescriptor,
): string {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(`external-filter-descriptor-v1:${descriptorCanonicalJson(descriptor)}`);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `efd-v1-${hash.toString(16).padStart(8, "0")}`;
}

function parseCapability(value: unknown): ExternalFilterCapabilityDescriptor {
  const record = requireRecord(value, "descriptor capability");
  requireExactKeys(
    record,
    [
      "operationId",
      "title",
      "deterministic",
      "supportsProgress",
      "supportsCancellation",
      "maxWidth",
      "maxHeight",
      "maxInputBytes",
      "maxOutputBytes",
    ],
    [],
    "descriptor capability",
  );
  const operationId = requireString(record.operationId, "capability.operationId", 192);
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    throw new ExternalFilterBridgeError(
      "PROTOCOL_VIOLATION",
      `invalid capability operationId ${operationId}`,
    );
  }
  return {
    operationId,
    title: requireString(record.title, "capability.title", 256),
    deterministic: requireBoolean(record.deterministic, "capability.deterministic"),
    supportsProgress: requireBoolean(record.supportsProgress, "capability.supportsProgress"),
    supportsCancellation: requireBoolean(
      record.supportsCancellation,
      "capability.supportsCancellation",
    ),
    maxWidth: requirePositiveInteger(record.maxWidth, "capability.maxWidth"),
    maxHeight: requirePositiveInteger(record.maxHeight, "capability.maxHeight"),
    maxInputBytes: requirePositiveInteger(record.maxInputBytes, "capability.maxInputBytes"),
    maxOutputBytes: requirePositiveInteger(record.maxOutputBytes, "capability.maxOutputBytes"),
  };
}

function parseDescriptor(
  value: unknown,
  maxCapabilities: number,
): ExternalFilterProviderDescriptor {
  const record = requireRecord(value, "provider descriptor");
  requireExactKeys(
    record,
    [
      "providerId",
      "providerVersion",
      "engineName",
      "engineVersion",
      "buildId",
      "origin",
      "deployment",
      "license",
      "capabilities",
    ],
    [],
    "provider descriptor",
  );
  const providerId = requireString(record.providerId, "descriptor.providerId", 128);
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", "invalid provider id");
  }
  const deployment = requireString(record.deployment, "descriptor.deployment", 64);
  if (
    deployment !== "dedicated-worker" &&
    deployment !== "local-toonbridge" &&
    deployment !== "remote-service"
  ) {
    throw new ExternalFilterBridgeError(
      "PROTOCOL_VIOLATION",
      `unsupported deployment ${deployment}`,
    );
  }
  const licenseRecord = requireRecord(record.license, "descriptor.license");
  requireExactKeys(
    licenseRecord,
    ["spdx", "sourceUrl", "noticeUrl", "binaryBundled"],
    [],
    "descriptor.license",
  );
  const spdx = requireString(licenseRecord.spdx, "descriptor.license.spdx", 96);
  if (!SPDX_PATTERN.test(spdx)) {
    throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", "invalid SPDX license token");
  }
  if (licenseRecord.binaryBundled !== false) {
    throw new ExternalFilterBridgeError(
      "LICENSE_REJECTED",
      "external copyleft provider must declare binaryBundled=false",
    );
  }
  if (!Array.isArray(record.capabilities) || record.capabilities.length === 0) {
    throw new ExternalFilterBridgeError(
      "PROTOCOL_VIOLATION",
      "provider descriptor must declare at least one capability",
    );
  }
  if (record.capabilities.length > maxCapabilities) {
    throw new ExternalFilterBridgeError(
      "QUOTA_EXCEEDED",
      `provider descriptor exceeds ${maxCapabilities} capabilities`,
    );
  }
  const capabilities = record.capabilities.map(parseCapability);
  const operationIds = new Set<string>();
  for (const capability of capabilities) {
    if (operationIds.has(capability.operationId)) {
      throw new ExternalFilterBridgeError(
        "PROTOCOL_VIOLATION",
        `duplicate capability ${capability.operationId}`,
      );
    }
    operationIds.add(capability.operationId);
  }
  return canonicalizeDescriptor({
    providerId,
    providerVersion: requireString(record.providerVersion, "descriptor.providerVersion", 128),
    engineName: requireString(record.engineName, "descriptor.engineName", 128),
    engineVersion: requireString(record.engineVersion, "descriptor.engineVersion", 128),
    buildId: requireString(record.buildId, "descriptor.buildId", 256),
    origin: requireString(record.origin, "descriptor.origin", 2_048),
    deployment,
    license: {
      spdx,
      sourceUrl: requireHttpsUrl(licenseRecord.sourceUrl, "descriptor.license.sourceUrl"),
      noticeUrl: requireHttpsUrl(licenseRecord.noticeUrl, "descriptor.license.noticeUrl"),
      binaryBundled: false,
    },
    capabilities,
  });
}

function mergeAndValidateQuotas(
  partial: Partial<ExternalFilterBridgeQuotas> | undefined,
): ExternalFilterBridgeQuotas {
  const quotas = { ...DEFAULT_EXTERNAL_FILTER_BRIDGE_QUOTAS, ...(partial ?? {}) };
  for (const [key, value] of Object.entries(quotas)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ExternalFilterBridgeError(
        "CONFIGURATION_ERROR",
        `quota ${key} must be a positive safe integer`,
      );
    }
  }
  return Object.freeze(quotas);
}

function validateAllowlist(options: ExternalFilterBridgeOptions): {
  origins: ReadonlySet<string>;
  providers: ReadonlyMap<string, ReadonlySet<string>>;
} {
  if (options.allowedOrigins.length === 0 || options.allowedProviders.length === 0) {
    throw new ExternalFilterBridgeError(
      "CONFIGURATION_ERROR",
      "origin and provider allowlists must not be empty",
    );
  }
  const origins = new Set<string>();
  for (const origin of options.allowedOrigins) {
    if (origin.length === 0 || origin === "*" || origins.has(origin)) {
      throw new ExternalFilterBridgeError(
        "CONFIGURATION_ERROR",
        `invalid or duplicate allowed origin ${origin}`,
      );
    }
    origins.add(origin);
  }
  const providers = new Map<string, ReadonlySet<string>>();
  for (const allowance of options.allowedProviders) {
    if (!PROVIDER_ID_PATTERN.test(allowance.providerId) || providers.has(allowance.providerId)) {
      throw new ExternalFilterBridgeError(
        "CONFIGURATION_ERROR",
        `invalid or duplicate provider allowance ${allowance.providerId}`,
      );
    }
    if (allowance.licenses.length === 0 || allowance.licenses.includes("*")) {
      throw new ExternalFilterBridgeError(
        "CONFIGURATION_ERROR",
        `provider ${allowance.providerId} needs an explicit license allowlist`,
      );
    }
    providers.set(allowance.providerId, new Set(allowance.licenses));
  }
  return { origins, providers };
}

function parseProviderReady(
  value: unknown,
  quotas: ExternalFilterBridgeQuotas,
): ExternalFilterProviderReadyMessage {
  const rawJson = JSON.stringify(value);
  if (rawJson === undefined || utf8ByteLength(rawJson) > quotas.maxDescriptorBytes) {
    throw new ExternalFilterBridgeError(
      "QUOTA_EXCEEDED",
      "provider handshake exceeds descriptor byte quota",
    );
  }
  const record = requireRecord(value, "provider-ready message");
  requireExactKeys(
    record,
    ["protocol", "version", "type", "handshakeId", "descriptor", "descriptorFingerprint"],
    [],
    "provider-ready message",
  );
  if (record.protocol !== EXTERNAL_FILTER_PROTOCOL || record.type !== "provider-ready") {
    throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", "unexpected handshake message");
  }
  if (record.version !== EXTERNAL_FILTER_PROTOCOL_VERSION) {
    throw new ExternalFilterBridgeError(
      "VERSION_REJECTED",
      `provider protocol version ${String(record.version)} is unsupported`,
    );
  }
  return {
    protocol: EXTERNAL_FILTER_PROTOCOL,
    version: EXTERNAL_FILTER_PROTOCOL_VERSION,
    type: "provider-ready",
    handshakeId: requireString(record.handshakeId, "handshakeId", 192),
    descriptor: parseDescriptor(record.descriptor, quotas.maxCapabilities),
    descriptorFingerprint: requireString(
      record.descriptorFingerprint,
      "descriptorFingerprint",
      64,
    ),
  };
}

function parseRuntimeEnvelope(
  value: unknown,
  providerId: string,
): ExternalFilterRuntimeProviderMessage {
  const record = requireRecord(value, "provider message");
  const protocol = record.protocol;
  const version = record.version;
  const messageProviderId = record.providerId;
  if (protocol !== EXTERNAL_FILTER_PROTOCOL) {
    throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", "provider protocol token mismatch");
  }
  if (version !== EXTERNAL_FILTER_PROTOCOL_VERSION) {
    throw new ExternalFilterBridgeError(
      "VERSION_REJECTED",
      `provider protocol version ${String(version)} is unsupported`,
    );
  }
  if (messageProviderId !== providerId) {
    throw new ExternalFilterBridgeError(
      "PROVIDER_REJECTED",
      `message provider ${String(messageProviderId)} does not match ${providerId}`,
    );
  }
  const requestId = requireString(record.requestId, "requestId", 192);
  if (!ID_PATTERN.test(requestId)) {
    throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", "invalid request id");
  }
  switch (record.type) {
    case "progress": {
      requireExactKeys(
        record,
        ["protocol", "version", "type", "providerId", "requestId", "progress", "phase"],
        [],
        "progress message",
      );
      const progress = requireFiniteNumber(record.progress, "progress");
      if (progress < 0 || progress > 1) {
        throw new ExternalFilterBridgeError(
          "PROTOCOL_VIOLATION",
          "progress must be in [0,1]",
        );
      }
      return {
        type: "progress",
        requestId,
        progress,
        phase: requireString(record.phase, "phase", 256),
      };
    }
    case "result": {
      requireExactKeys(
        record,
        [
          "protocol",
          "version",
          "type",
          "providerId",
          "requestId",
          "operationId",
          "width",
          "height",
          "pixelFormat",
          "colorSpace",
          "pixels",
        ],
        [],
        "result message",
      );
      if (!(record.pixels instanceof ArrayBuffer)) {
        throw new ExternalFilterBridgeError(
          "PROTOCOL_VIOLATION",
          "result pixels must be a transferable ArrayBuffer",
        );
      }
      if (record.pixelFormat !== "rgba8" || record.colorSpace !== "srgb") {
        throw new ExternalFilterBridgeError(
          "PROTOCOL_VIOLATION",
          "result must use rgba8/srgb",
        );
      }
      return {
        type: "result",
        requestId,
        operationId: requireString(record.operationId, "result.operationId", 192),
        width: requirePositiveInteger(record.width, "result.width"),
        height: requirePositiveInteger(record.height, "result.height"),
        pixelFormat: "rgba8",
        colorSpace: "srgb",
        pixels: record.pixels,
      };
    }
    case "provider-error": {
      requireExactKeys(
        record,
        ["protocol", "version", "type", "providerId", "requestId", "error"],
        [],
        "provider-error message",
      );
      const error = requireRecord(record.error, "provider error");
      requireExactKeys(
        error,
        ["code", "message", "retryable", "details"],
        [],
        "provider error",
      );
      return {
        type: "provider-error",
        requestId,
        error: {
          code: requireString(error.code, "provider error code", 128),
          message: requireString(error.message, "provider error message", 2_048),
          retryable: requireBoolean(error.retryable, "provider error retryable"),
          details: validateJsonRecord(error.details, "provider error details"),
        },
      };
    }
    case "cancel-ack":
      requireExactKeys(
        record,
        ["protocol", "version", "type", "providerId", "requestId"],
        [],
        "cancel-ack message",
      );
      return { type: "cancel-ack", requestId };
    default:
      throw new ExternalFilterBridgeError(
        "PROTOCOL_VIOLATION",
        `unknown provider message type ${String(record.type)}`,
      );
  }
}

function protocolMessageBase<T extends string>(type: T): {
  protocol: typeof EXTERNAL_FILTER_PROTOCOL;
  version: typeof EXTERNAL_FILTER_PROTOCOL_VERSION;
  type: T;
} {
  return {
    protocol: EXTERNAL_FILTER_PROTOCOL,
    version: EXTERNAL_FILTER_PROTOCOL_VERSION,
    type,
  };
}

export class ExternalFilterBridge {
  private readonly port: ExternalFilterMessagePort;
  private readonly origins: ReadonlySet<string>;
  private readonly providerAllowances: ReadonlyMap<string, ReadonlySet<string>>;
  private readonly quotas: ExternalFilterBridgeQuotas;
  private readonly runtime: ExternalFilterRuntime;
  private readonly idFactory: () => string;
  private readonly closePortOnDispose: boolean;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly retired = new Set<string>();
  private readonly retiredQueue: string[] = [];
  private readonly onMessageListener: ExternalFilterTransportListener;
  private readonly onErrorListener: ExternalFilterTransportListener;
  private readonly onMessageErrorListener: ExternalFilterTransportListener;
  private bridgeState: ExternalFilterBridgeState = "connecting";
  private handshake: HandshakeState | null = null;
  private providerDescriptor: ExternalFilterProviderDescriptor | null = null;
  private inFlightBytes = 0;
  private peakInFlightBytes = 0;
  private completedRequests = 0;
  private cancelledRequests = 0;
  private timedOutRequests = 0;
  private rejectedMessages = 0;
  private ignoredLateMessages = 0;

  private constructor(options: ExternalFilterBridgeOptions) {
    this.port = options.port;
    const allowlist = validateAllowlist(options);
    this.origins = allowlist.origins;
    this.providerAllowances = allowlist.providers;
    this.quotas = mergeAndValidateQuotas(options.quotas);
    this.runtime = options.runtime ?? DEFAULT_RUNTIME;
    this.idFactory = options.idFactory ?? makeSecureId;
    this.closePortOnDispose = options.closePortOnDispose ?? true;
    this.onMessageListener = (event) => this.onMessage(event);
    this.onErrorListener = (event) => this.onTransportFailure("error", event);
    this.onMessageErrorListener = (event) => this.onTransportFailure("messageerror", event);
  }

  static connect(options: ExternalFilterBridgeOptions): Promise<ExternalFilterBridge> {
    const bridge = new ExternalFilterBridge(options);
    return bridge.beginHandshake();
  }

  get descriptor(): ExternalFilterProviderDescriptor {
    if (this.providerDescriptor === null || this.bridgeState !== "ready") {
      throw new ExternalFilterBridgeError("DISPOSED", "external filter bridge is not ready");
    }
    return this.providerDescriptor;
  }

  metrics(): ExternalFilterBridgeMetrics {
    return {
      state: this.bridgeState,
      pendingRequests: this.pending.size,
      inFlightBytes: this.inFlightBytes,
      peakInFlightBytes: this.peakInFlightBytes,
      retiredRequestIds: this.retired.size,
      completedRequests: this.completedRequests,
      cancelledRequests: this.cancelledRequests,
      timedOutRequests: this.timedOutRequests,
      rejectedMessages: this.rejectedMessages,
      ignoredLateMessages: this.ignoredLateMessages,
    };
  }

  async execute(request: ExternalFilterExecuteRequest): Promise<ExternalFilterExecuteResult> {
    this.assertReady();
    const descriptor = this.providerDescriptor as ExternalFilterProviderDescriptor;
    const capability = descriptor.capabilities.find(
      (candidate) => candidate.operationId === request.operationId,
    );
    if (capability === undefined) {
      throw new ExternalFilterBridgeError(
        "CAPABILITY_UNAVAILABLE",
        `provider ${descriptor.providerId} does not expose ${request.operationId}`,
      );
    }
    this.validateExecuteRequest(request, capability);
    if (request.signal?.aborted === true) {
      throw new ExternalFilterBridgeError("CANCELLED", "request was aborted before transfer");
    }
    if (request.signal !== undefined && !capability.supportsCancellation) {
      throw new ExternalFilterBridgeError(
        "CAPABILITY_UNAVAILABLE",
        `operation ${request.operationId} does not support acknowledged cancellation`,
      );
    }
    const outputBytes = request.width * request.height * 4;
    const reservedBytes = request.pixels.byteLength + outputBytes;
    if (this.pending.size >= this.quotas.maxInFlightRequests) {
      throw new ExternalFilterBridgeError(
        "QUOTA_EXCEEDED",
        `in-flight request quota ${this.quotas.maxInFlightRequests} exceeded`,
      );
    }
    if (this.inFlightBytes + reservedBytes > this.quotas.maxInFlightBytes) {
      throw new ExternalFilterBridgeError(
        "QUOTA_EXCEEDED",
        `in-flight byte quota ${this.quotas.maxInFlightBytes} exceeded`,
        { details: { requestedReservationBytes: reservedBytes, inFlightBytes: this.inFlightBytes } },
      );
    }
    const requestId = this.createUniqueId();
    const timeoutMs = request.timeoutMs ?? this.quotas.maxRuntimeMs;
    return new Promise<ExternalFilterExecuteResult>((resolve, reject) => {
      const abortListener =
        request.signal === undefined
          ? undefined
          : () => {
              const pending = this.pending.get(requestId);
              if (pending === undefined || pending.state !== "running") return;
              this.cancelledRequests += 1;
              this.beginCancellation(
                pending,
                "abort-signal",
                new ExternalFilterBridgeError("CANCELLED", "request cancelled by AbortSignal", {
                  requestId,
                }),
              );
            };
      const runtimeTimer = this.runtime.setTimeout(() => {
        const pending = this.pending.get(requestId);
        if (pending === undefined || pending.state !== "running") return;
        this.timedOutRequests += 1;
        this.beginCancellation(
          pending,
          "runtime-timeout",
          new ExternalFilterBridgeError(
            "RUNTIME_TIMEOUT",
            `request exceeded runtime limit ${timeoutMs}ms`,
            { requestId, retryable: true },
          ),
        );
      }, timeoutMs);
      const pending: PendingRequest = {
        requestId,
        operationId: request.operationId,
        width: request.width,
        height: request.height,
        startedAt: this.runtime.now(),
        reservedBytes,
        capability,
        signal: request.signal,
        abortListener,
        onProgress: request.onProgress,
        resolve,
        reject,
        runtimeTimer,
        cancelTimer: null,
        progress: 0,
        state: "running",
        terminalError: null,
      };
      this.pending.set(requestId, pending);
      this.inFlightBytes += reservedBytes;
      this.peakInFlightBytes = Math.max(this.peakInFlightBytes, this.inFlightBytes);
      request.signal?.addEventListener("abort", abortListener as () => void, { once: true });
      const message: ExternalFilterRunMessage = {
        ...protocolMessageBase("run"),
        providerId: descriptor.providerId,
        requestId,
        operationId: request.operationId,
        width: request.width,
        height: request.height,
        pixelFormat: "rgba8",
        colorSpace: "srgb",
        pixels: request.pixels,
        parameters: Object.freeze({ ...(request.parameters ?? {}) }),
        seed: request.seed ?? null,
        runtimeLimitMs: timeoutMs,
      };
      try {
        this.port.postMessage(message, [request.pixels]);
      } catch (cause) {
        this.failFatal(
          new ExternalFilterBridgeError("TRANSPORT_ERROR", "failed to transfer filter request", {
            requestId,
            cause,
            retryable: true,
          }),
        );
      }
    });
  }

  dispose(): void {
    if (this.bridgeState === "disposed") return;
    if (this.bridgeState === "ready" && this.providerDescriptor !== null) {
      const message: ExternalFilterDisposeMessage = {
        ...protocolMessageBase("dispose"),
        providerId: this.providerDescriptor.providerId,
      };
      try {
        this.port.postMessage(message);
      } catch {
        // Disposal still performs local cleanup; transport failure cannot undo it.
      }
    }
    const error = new ExternalFilterBridgeError("DISPOSED", "external filter bridge disposed");
    this.terminate("disposed", error);
  }

  private beginHandshake(): Promise<ExternalFilterBridge> {
    this.port.addEventListener("message", this.onMessageListener);
    this.port.addEventListener("error", this.onErrorListener);
    this.port.addEventListener("messageerror", this.onMessageErrorListener);
    this.port.start?.();
    return new Promise<ExternalFilterBridge>((resolve, reject) => {
      const handshakeId = this.createUniqueId();
      const timer = this.runtime.setTimeout(() => {
        this.failFatal(
          new ExternalFilterBridgeError(
            "HANDSHAKE_TIMEOUT",
            `provider handshake exceeded ${this.quotas.handshakeTimeoutMs}ms`,
            { retryable: true },
          ),
        );
      }, this.quotas.handshakeTimeoutMs);
      this.handshake = { handshakeId, resolve, reject, timer };
      const hello: ExternalFilterClientHelloMessage = {
        ...protocolMessageBase("client-hello"),
        handshakeId,
      };
      try {
        this.port.postMessage(hello);
      } catch (cause) {
        this.failFatal(
          new ExternalFilterBridgeError("TRANSPORT_ERROR", "failed to start provider handshake", {
            cause,
            retryable: true,
          }),
        );
      }
    });
  }

  private onMessage(event: ExternalFilterTransportEvent): void {
    if (this.bridgeState === "disposed" || this.bridgeState === "failed") return;
    try {
      const origin = requireString(event.origin, "transport origin", 2_048);
      if (!this.origins.has(origin)) {
        throw new ExternalFilterBridgeError(
          "ORIGIN_REJECTED",
          `transport origin ${origin} is not allowlisted`,
        );
      }
      if (this.bridgeState === "connecting") {
        this.acceptHandshake(event.data, origin);
        return;
      }
      const descriptor = this.providerDescriptor as ExternalFilterProviderDescriptor;
      if (origin !== descriptor.origin) {
        throw new ExternalFilterBridgeError(
          "ORIGIN_REJECTED",
          `message origin ${origin} differs from descriptor origin ${descriptor.origin}`,
        );
      }
      const message = parseRuntimeEnvelope(event.data, descriptor.providerId);
      const pending = this.pending.get(message.requestId);
      if (pending === undefined) {
        if (this.retired.has(message.requestId)) {
          this.ignoredLateMessages += 1;
          return;
        }
        throw new ExternalFilterBridgeError(
          "PROTOCOL_VIOLATION",
          `provider referenced unknown request ${message.requestId}`,
        );
      }
      this.acceptRuntimeMessage(pending, message);
    } catch (error) {
      this.rejectedMessages += 1;
      this.failFatal(
        error instanceof ExternalFilterBridgeError
          ? error
          : new ExternalFilterBridgeError(
              "PROTOCOL_VIOLATION",
              "provider message validation failed",
              { cause: error },
            ),
      );
    }
  }

  private acceptHandshake(value: unknown, origin: string): void {
    const handshake = this.handshake;
    if (handshake === null) {
      throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", "handshake state missing");
    }
    const message = parseProviderReady(value, this.quotas);
    if (message.handshakeId !== handshake.handshakeId) {
      throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", "handshake id mismatch");
    }
    const descriptor = message.descriptor;
    if (descriptor.origin !== origin) {
      throw new ExternalFilterBridgeError(
        "ORIGIN_REJECTED",
        `descriptor origin ${descriptor.origin} differs from transport origin ${origin}`,
      );
    }
    const allowedLicenses = this.providerAllowances.get(descriptor.providerId);
    if (allowedLicenses === undefined) {
      throw new ExternalFilterBridgeError(
        "PROVIDER_REJECTED",
        `provider ${descriptor.providerId} is not allowlisted`,
      );
    }
    if (!allowedLicenses.has(descriptor.license.spdx)) {
      throw new ExternalFilterBridgeError(
        "LICENSE_REJECTED",
        `license ${descriptor.license.spdx} is not allowed for ${descriptor.providerId}`,
      );
    }
    const expectedFingerprint = computeExternalFilterDescriptorFingerprint(descriptor);
    if (message.descriptorFingerprint !== expectedFingerprint) {
      throw new ExternalFilterBridgeError(
        "PROTOCOL_VIOLATION",
        "provider descriptor fingerprint mismatch",
      );
    }
    this.runtime.clearTimeout(handshake.timer);
    this.providerDescriptor = descriptor;
    this.bridgeState = "ready";
    this.handshake = null;
    handshake.resolve(this);
  }

  private acceptRuntimeMessage(
    pending: PendingRequest,
    message: ExternalFilterRuntimeProviderMessage,
  ): void {
    if (pending.state === "cancelling" && message.type !== "cancel-ack") {
      this.ignoredLateMessages += 1;
      return;
    }
    switch (message.type) {
      case "progress":
        if (!pending.capability.supportsProgress) {
          throw new ExternalFilterBridgeError(
            "PROTOCOL_VIOLATION",
            `operation ${pending.operationId} emitted undeclared progress`,
          );
        }
        if (message.progress < pending.progress) {
          throw new ExternalFilterBridgeError(
            "PROTOCOL_VIOLATION",
            `progress regressed from ${pending.progress} to ${message.progress}`,
          );
        }
        pending.progress = message.progress;
        try {
          pending.onProgress?.({
            requestId: pending.requestId,
            progress: message.progress,
            phase: message.phase,
          });
        } catch (cause) {
          this.beginCancellation(
            pending,
            "client-callback-error",
            new ExternalFilterBridgeError(
              "CLIENT_CALLBACK_ERROR",
              "progress callback threw",
              { requestId: pending.requestId, cause },
            ),
          );
        }
        return;
      case "result": {
        if (
          message.operationId !== pending.operationId ||
          message.width !== pending.width ||
          message.height !== pending.height
        ) {
          throw new ExternalFilterBridgeError(
            "PROTOCOL_VIOLATION",
            `result metadata does not match request ${pending.requestId}`,
          );
        }
        const expectedBytes = pending.width * pending.height * 4;
        if (
          message.pixels.byteLength !== expectedBytes ||
          message.pixels.byteLength > this.quotas.maxOutputBytes ||
          message.pixels.byteLength > pending.capability.maxOutputBytes
        ) {
          throw new ExternalFilterBridgeError(
            "QUOTA_EXCEEDED",
            `result byte length ${message.pixels.byteLength} is invalid`,
          );
        }
        this.completedRequests += 1;
        this.finishRequest(pending, {
          requestId: pending.requestId,
          providerId: (this.providerDescriptor as ExternalFilterProviderDescriptor).providerId,
          operationId: pending.operationId,
          width: pending.width,
          height: pending.height,
          pixels: message.pixels,
          elapsedMs: Math.max(0, this.runtime.now() - pending.startedAt),
        });
        return;
      }
      case "provider-error":
        this.failRequest(
          pending,
          new ExternalFilterBridgeError("PROVIDER_ERROR", message.error.message, {
            requestId: pending.requestId,
            retryable: message.error.retryable,
            details: { providerCode: message.error.code, ...message.error.details },
          }),
        );
        return;
      case "cancel-ack":
        if (pending.state !== "cancelling" || pending.terminalError === null) {
          throw new ExternalFilterBridgeError(
            "PROTOCOL_VIOLATION",
            `unexpected cancel acknowledgement for ${pending.requestId}`,
          );
        }
        this.failRequest(pending, pending.terminalError);
    }
  }

  private beginCancellation(
    pending: PendingRequest,
    reason: ExternalFilterCancelMessage["reason"],
    terminalError: ExternalFilterBridgeError,
  ): void {
    if (pending.state !== "running") return;
    pending.state = "cancelling";
    pending.terminalError = terminalError;
    this.runtime.clearTimeout(pending.runtimeTimer);
    if (!pending.capability.supportsCancellation) {
      this.failRequest(pending, terminalError);
      return;
    }
    const descriptor = this.providerDescriptor as ExternalFilterProviderDescriptor;
    const cancel: ExternalFilterCancelMessage = {
      ...protocolMessageBase("cancel"),
      providerId: descriptor.providerId,
      requestId: pending.requestId,
      reason,
    };
    try {
      this.port.postMessage(cancel);
    } catch (cause) {
      this.failFatal(
        new ExternalFilterBridgeError("TRANSPORT_ERROR", "failed to send cancellation", {
          requestId: pending.requestId,
          cause,
          retryable: true,
        }),
      );
      return;
    }
    pending.cancelTimer = this.runtime.setTimeout(() => {
      if (this.pending.get(pending.requestId) !== pending || pending.state !== "cancelling") {
        return;
      }
      this.failRequest(
        pending,
        new ExternalFilterBridgeError(
          "CANCEL_ACK_TIMEOUT",
          `provider did not acknowledge cancellation within ${this.quotas.cancelAckTimeoutMs}ms`,
          {
            requestId: pending.requestId,
            retryable: true,
            details: { originalCode: terminalError.code },
          },
        ),
      );
    }, this.quotas.cancelAckTimeoutMs);
  }

  private finishRequest(
    pending: PendingRequest,
    result: ExternalFilterExecuteResult,
  ): void {
    this.releaseRequest(pending);
    pending.resolve(result);
  }

  private failRequest(pending: PendingRequest, error: ExternalFilterBridgeError): void {
    this.releaseRequest(pending);
    pending.reject(error);
  }

  private releaseRequest(pending: PendingRequest): void {
    if (this.pending.get(pending.requestId) !== pending) return;
    this.pending.delete(pending.requestId);
    this.runtime.clearTimeout(pending.runtimeTimer);
    if (pending.cancelTimer !== null) this.runtime.clearTimeout(pending.cancelTimer);
    if (pending.signal !== undefined && pending.abortListener !== undefined) {
      pending.signal.removeEventListener("abort", pending.abortListener);
    }
    this.inFlightBytes -= pending.reservedBytes;
    this.retireRequest(pending.requestId);
  }

  private retireRequest(requestId: string): void {
    this.retired.add(requestId);
    this.retiredQueue.push(requestId);
    while (this.retiredQueue.length > this.quotas.maxRetiredRequestIds) {
      const oldest = this.retiredQueue.shift();
      if (oldest !== undefined) this.retired.delete(oldest);
    }
  }

  private validateExecuteRequest(
    request: ExternalFilterExecuteRequest,
    capability: ExternalFilterCapabilityDescriptor,
  ): void {
    if (!OPERATION_ID_PATTERN.test(request.operationId)) {
      throw new ExternalFilterBridgeError("PROTOCOL_VIOLATION", "invalid operation id");
    }
    if (!Number.isSafeInteger(request.width) || !Number.isSafeInteger(request.height)) {
      throw new ExternalFilterBridgeError("QUOTA_EXCEEDED", "dimensions must be safe integers");
    }
    if (
      request.width <= 0 ||
      request.height <= 0 ||
      request.width > this.quotas.maxWidth ||
      request.height > this.quotas.maxHeight ||
      request.width > capability.maxWidth ||
      request.height > capability.maxHeight
    ) {
      throw new ExternalFilterBridgeError(
        "QUOTA_EXCEEDED",
        `dimensions ${request.width}x${request.height} exceed bridge/provider limits`,
      );
    }
    const expectedBytes = request.width * request.height * 4;
    if (
      !Number.isSafeInteger(expectedBytes) ||
      !(request.pixels instanceof ArrayBuffer) ||
      request.pixels.byteLength !== expectedBytes ||
      request.pixels.byteLength > this.quotas.maxInputBytes ||
      request.pixels.byteLength > capability.maxInputBytes ||
      expectedBytes > this.quotas.maxOutputBytes ||
      expectedBytes > capability.maxOutputBytes
    ) {
      throw new ExternalFilterBridgeError(
        "QUOTA_EXCEEDED",
        `rgba8 input/output byte length is invalid for ${request.width}x${request.height}`,
      );
    }
    const parameters = request.parameters ?? {};
    validateJsonRecord(parameters, "filter parameters");
    const encodedParameters = JSON.stringify(parameters);
    if (utf8ByteLength(encodedParameters) > this.quotas.maxParameterBytes) {
      throw new ExternalFilterBridgeError(
        "QUOTA_EXCEEDED",
        `filter parameters exceed ${this.quotas.maxParameterBytes} bytes`,
      );
    }
    if (
      request.seed !== undefined &&
      (!Number.isSafeInteger(request.seed) || request.seed < 0 || request.seed > 0xffff_ffff)
    ) {
      throw new ExternalFilterBridgeError(
        "PROTOCOL_VIOLATION",
        "seed must be an unsigned 32-bit integer",
      );
    }
    if (
      request.timeoutMs !== undefined &&
      (!Number.isSafeInteger(request.timeoutMs) ||
        request.timeoutMs <= 0 ||
        request.timeoutMs > this.quotas.maxRuntimeMs)
    ) {
      throw new ExternalFilterBridgeError(
        "QUOTA_EXCEEDED",
        `timeout must be in [1, ${this.quotas.maxRuntimeMs}]ms`,
      );
    }
  }

  private assertReady(): void {
    if (this.bridgeState === "ready") return;
    throw new ExternalFilterBridgeError(
      this.bridgeState === "disposed" ? "DISPOSED" : "TRANSPORT_ERROR",
      `external filter bridge is ${this.bridgeState}`,
    );
  }

  private createUniqueId(): string {
    const value = this.idFactory();
    if (!ID_PATTERN.test(value)) {
      throw new ExternalFilterBridgeError(
        "CONFIGURATION_ERROR",
        "idFactory returned an invalid request id",
      );
    }
    if (
      this.pending.has(value) ||
      this.retired.has(value) ||
      this.handshake?.handshakeId === value
    ) {
      throw new ExternalFilterBridgeError(
        "CONFIGURATION_ERROR",
        `idFactory returned duplicate id ${value}`,
      );
    }
    return value;
  }

  private onTransportFailure(
    type: "error" | "messageerror",
    event: ExternalFilterTransportEvent,
  ): void {
    if (this.bridgeState === "disposed" || this.bridgeState === "failed") return;
    this.failFatal(
      new ExternalFilterBridgeError(
        "TRANSPORT_ERROR",
        event.message ?? `external filter transport emitted ${type}`,
        { cause: event.error, retryable: true },
      ),
    );
  }

  private failFatal(error: ExternalFilterBridgeError): void {
    if (this.bridgeState === "disposed" || this.bridgeState === "failed") return;
    this.terminate("failed", error);
  }

  private terminate(
    state: "failed" | "disposed",
    error: ExternalFilterBridgeError,
  ): void {
    const handshake = this.handshake;
    if (handshake !== null) {
      this.runtime.clearTimeout(handshake.timer);
      this.handshake = null;
      handshake.reject(error);
    }
    for (const pending of [...this.pending.values()]) this.failRequest(pending, error);
    this.port.removeEventListener("message", this.onMessageListener);
    this.port.removeEventListener("error", this.onErrorListener);
    this.port.removeEventListener("messageerror", this.onMessageErrorListener);
    if (this.closePortOnDispose) this.port.close?.();
    this.providerDescriptor = null;
    this.retired.clear();
    this.retiredQueue.length = 0;
    this.bridgeState = state;
  }
}

export function connectExternalFilterBridge(
  options: ExternalFilterBridgeOptions,
): Promise<ExternalFilterBridge> {
  return ExternalFilterBridge.connect(options);
}
