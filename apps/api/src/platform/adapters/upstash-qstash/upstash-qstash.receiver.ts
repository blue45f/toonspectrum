import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { z } from "zod";

import { canonicalJsonStringify } from "../backend-capabilities/backend-capability-gateway-contract";

import {
  UpstashQStashDeliverySchema,
  type UpstashQStashDelivery,
} from "./upstash-qstash.contract";

import type { UpstashCoordinationPort } from "../upstash-coordination/upstash-coordination.port";

const SigningKeySchema = z
  .string()
  .min(32)
  .max(4_096)
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return /\s/u.test(character) || codePoint <= 31 || codePoint === 127;
      })
  );

const ReceiverConfigSchema = z
  .object({
    endpointUrl: z
      .url({ protocol: /^https$/u })
      .refine((value) => {
        const url = new URL(value);
        return (
          url.username === "" &&
          url.password === "" &&
          url.search === "" &&
          url.hash === ""
        );
      }),
    currentSigningKey: SigningKeySchema,
    nextSigningKey: SigningKeySchema,
    maximumBodyBytes: z.number().int().min(1_024).max(1024 * 1_024),
    clockToleranceSeconds: z.number().int().min(0).max(60),
    handlerTimeoutMs: z.number().int().min(100).max(120_000),
    pendingReceiptTtlMs: z.number().int().min(1_000).max(15 * 60_000),
    completedReceiptTtlMs: z
      .number()
      .int()
      .min(11 * 60_000)
      .max(7 * 24 * 60 * 60_000),
  })
  .strict()
  .refine((value) => value.currentSigningKey !== value.nextSigningKey, {
    path: ["nextSigningKey"],
    message: "QStash rotation keys must differ",
  });

export type UpstashQStashReceiverConfig = z.infer<
  typeof ReceiverConfigSchema
>;

export interface UpstashQStashReceiverRuntime {
  readonly nowEpochSeconds: () => number;
  readonly claimToken: () => string;
}

export interface UpstashQStashHandlers {
  readonly expireOrphanAssets: (
    delivery: Extract<UpstashQStashDelivery, { workload: "cleanup" }>,
    options: { readonly signal: AbortSignal }
  ) => Promise<void>;
  readonly publishComplete: (
    delivery: Extract<UpstashQStashDelivery, { workload: "notification" }>,
    options: { readonly signal: AbortSignal }
  ) => Promise<void>;
}

export type UpstashQStashReceiverResult =
  | { readonly outcome: "accepted"; readonly idempotencyKey: string }
  | { readonly outcome: "duplicate"; readonly idempotencyKey: string }
  | {
      readonly outcome: "deferred";
      readonly retryable: true;
      readonly errorCode: "QSTASH_RECEIVER_BUSY" | "QSTASH_HANDLER_FAILED";
    }
  | {
      readonly outcome: "rejected";
      readonly retryable: false;
      readonly errorCode:
        | "QSTASH_BODY_TOO_LARGE"
        | "QSTASH_INVALID_BODY"
        | "QSTASH_INVALID_SIGNATURE"
        | "QSTASH_REPLAY_CONFLICT";
    };

const defaultRuntime: UpstashQStashReceiverRuntime = {
  nowEpochSeconds: () => Math.floor(Date.now() / 1_000),
  claimToken: () => randomBytes(32).toString("base64url"),
};

const JwtHeaderSchema = z
  .object({ alg: z.literal("HS256"), typ: z.literal("JWT").optional() })
  .passthrough();
const JwtPayloadSchema = z
  .object({
    iss: z.literal("Upstash"),
    sub: z.string().min(1).max(2_048),
    exp: z.number().int(),
    nbf: z.number().int(),
    iat: z.number().int(),
    jti: z.string().min(1).max(512),
    body: z.string().min(43).max(46).regex(/^[A-Za-z0-9_-]+={0,2}$/u),
  })
  .passthrough();

function fingerprint(...parts: string[]): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(parts.join("\0")).digest("hex")}`;
}

function decodeSegment(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/u.test(segment)) throw new Error("invalid JWT");
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.from(segment, "base64url")
  );
  return JSON.parse(decoded) as unknown;
}

function equalText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function verifiesWithKey(
  signed: string,
  signature: string,
  key: string
): boolean {
  const expected = createHmac("sha256", key).update(signed).digest("base64url");
  return equalText(expected, signature);
}

function verifySignature(
  signature: string,
  rawBody: Uint8Array,
  config: UpstashQStashReceiverConfig,
  now: number
): void {
  if (signature.length > 8_192 || /\s/u.test(signature)) {
    throw new Error("invalid signature");
  }
  const parts = signature.split(".");
  if (parts.length !== 3) throw new Error("invalid signature");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("invalid signature");
  }
  const header = JwtHeaderSchema.parse(decodeSegment(encodedHeader));
  if ("crit" in header || "jku" in header || "jwk" in header || "x5u" in header) {
    throw new Error("unsupported JWT header");
  }
  const signed = `${encodedHeader}.${encodedPayload}`;
  if (
    !verifiesWithKey(signed, encodedSignature, config.currentSigningKey) &&
    !verifiesWithKey(signed, encodedSignature, config.nextSigningKey)
  ) {
    throw new Error("invalid signature");
  }
  const payload = JwtPayloadSchema.parse(decodeSegment(encodedPayload));
  const tolerance = config.clockToleranceSeconds;
  if (
    payload.sub !== config.endpointUrl ||
    now > payload.exp + tolerance ||
    now + tolerance < payload.nbf ||
    payload.iat > now + tolerance ||
    payload.exp < payload.nbf
  ) {
    throw new Error("invalid claims");
  }
  const actualBodyHash = createHash("sha256")
    .update(rawBody)
    .digest("base64url");
  if (!equalText(actualBodyHash, payload.body.replace(/=+$/u, ""))) {
    throw new Error("invalid body hash");
  }
}

function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("QStash handler timed out")),
    timeoutMs
  );
  timeout.unref?.();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(controller.signal.reason);
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          reject(error);
        }
      )
      .finally(() => {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", onAbort);
      });
  });
}

/**
 * A transport-neutral QStash consumer boundary. It deliberately exposes no controller or arbitrary
 * handler map: the owning worker must supply the two fixed handlers and pass the untouched raw body.
 */
export class UpstashQStashReceiver {
  private readonly config: UpstashQStashReceiverConfig;

  constructor(
    config: UpstashQStashReceiverConfig,
    private readonly coordination: UpstashCoordinationPort,
    private readonly handlers: UpstashQStashHandlers,
    private readonly runtime: UpstashQStashReceiverRuntime = defaultRuntime
  ) {
    this.config = Object.freeze(ReceiverConfigSchema.parse(config));
  }

  async verifyReadiness(): Promise<boolean> {
    try {
      return await this.coordination.ping();
    } catch {
      return false;
    }
  }

  async receive(
    signature: string,
    rawBody: Uint8Array
  ): Promise<UpstashQStashReceiverResult> {
    if (rawBody.byteLength > this.config.maximumBodyBytes) {
      return {
        outcome: "rejected",
        retryable: false,
        errorCode: "QSTASH_BODY_TOO_LARGE",
      };
    }
    try {
      verifySignature(
        signature,
        rawBody,
        this.config,
        this.runtime.nowEpochSeconds()
      );
    } catch {
      return {
        outcome: "rejected",
        retryable: false,
        errorCode: "QSTASH_INVALID_SIGNATURE",
      };
    }

    let delivery: UpstashQStashDelivery;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
      delivery = UpstashQStashDeliverySchema.parse(JSON.parse(text) as unknown);
    } catch {
      return {
        outcome: "rejected",
        retryable: false,
        errorCode: "QSTASH_INVALID_BODY",
      };
    }

    const requestFingerprint = fingerprint(canonicalJsonStringify(delivery));
    const receiptId = createHash("sha256")
      .update(delivery.tenantId)
      .update("\0")
      .update(delivery.workload)
      .update("\0")
      .update(delivery.idempotencyKey)
      .digest("hex");
    const receiptKey = `qstash:${receiptId}`;
    const claimToken = this.runtime.claimToken();
    const reservation = await this.coordination.reserveIdempotencyReceipt({
      scope: "async-job",
      operation: "qstash.consume",
      idempotencyKey: receiptKey,
      requestFingerprint,
      claimToken,
      ttlMs: this.config.pendingReceiptTtlMs,
    });
    if (!reservation.reserved) {
      if (reservation.state === "completed") {
        return { outcome: "duplicate", idempotencyKey: delivery.idempotencyKey };
      }
      if (reservation.state === "request-conflict") {
        return {
          outcome: "rejected",
          retryable: false,
          errorCode: "QSTASH_REPLAY_CONFLICT",
        };
      }
      return {
        outcome: "deferred",
        retryable: true,
        errorCode: "QSTASH_RECEIVER_BUSY",
      };
    }

    try {
      await withTimeout(
        (signal) =>
          delivery.workload === "cleanup"
            ? this.handlers.expireOrphanAssets(delivery, { signal })
            : this.handlers.publishComplete(delivery, { signal }),
        this.config.handlerTimeoutMs
      );
    } catch {
      return {
        outcome: "deferred",
        retryable: true,
        errorCode: "QSTASH_HANDLER_FAILED",
      };
    }

    const completion = await this.coordination.completeIdempotencyReceipt({
      scope: "async-job",
      operation: "qstash.consume",
      idempotencyKey: receiptKey,
      requestFingerprint,
      claimToken,
      outcomeFingerprint: fingerprint("completed", requestFingerprint),
      ttlMs: this.config.completedReceiptTtlMs,
    });
    if (completion.outcome === "completed") {
      return { outcome: "accepted", idempotencyKey: delivery.idempotencyKey };
    }
    if (completion.outcome === "duplicate") {
      return { outcome: "duplicate", idempotencyKey: delivery.idempotencyKey };
    }
    return {
      outcome: "deferred",
      retryable: true,
      errorCode: "QSTASH_HANDLER_FAILED",
    };
  }
}
