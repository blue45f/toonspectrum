import type {
  RealtimeChannel,
  RealtimePayload,
} from "./protocol";

const IDEMPOTENCY_FINGERPRINT_CONTEXT =
  "toonspectrum/realtime-receipt/idempotency/v1\n";
const REQUEST_FINGERPRINT_CONTEXT =
  "toonspectrum/realtime-receipt/request/v1\n";

export interface PublishReceiptFingerprintInput {
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly channel: RealtimeChannel;
  readonly payload: RealtimePayload;
}

export interface PublishReceiptFingerprints {
  readonly idempotencyFingerprint: string;
  readonly requestFingerprint: string;
}

function canonicalize(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(record[key])}`,
      )
      .join(",")}}`;
  }
  throw new TypeError(
    "Realtime receipt fingerprint input is not canonical JSON",
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createPublishReceiptFingerprints(
  input: PublishReceiptFingerprintInput,
): Promise<PublishReceiptFingerprints> {
  const [idempotencyFingerprint, requestFingerprint] =
    await Promise.all([
      sha256Hex(
        `${IDEMPOTENCY_FINGERPRINT_CONTEXT}${input.idempotencyKey}`,
      ),
      sha256Hex(
        `${REQUEST_FINGERPRINT_CONTEXT}${canonicalize({
          actorId: input.actorId,
          channel: input.channel,
          clientId: input.clientId,
          idempotencyKey: input.idempotencyKey,
          payload: input.payload,
        })}`,
      ),
    ]);
  return { idempotencyFingerprint, requestFingerprint };
}
