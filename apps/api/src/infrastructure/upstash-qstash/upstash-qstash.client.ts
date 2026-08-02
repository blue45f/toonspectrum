import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import {
  BackendCapabilityDurableQueueCommandSchema,
  type BackendCapabilityDurableQueueCallOptions,
  type BackendCapabilityDurableQueueCommand,
  type BackendCapabilityDurableQueuePort,
  type BackendCapabilityDurableQueueReadiness,
  type BackendCapabilityDurableQueueSubmission,
} from "../backend-capabilities/backend-capability-durable-queue.port";

import {
  validateUpstashQStashConfig,
  type UpstashQStashConfig,
} from "./upstash-qstash.config";
import {
  UPSTASH_QSTASH_CONTRACT_VERSION,
  UpstashQStashDeliverySchema,
} from "./upstash-qstash.contract";

export { UPSTASH_QSTASH_CONTRACT_VERSION } from "./upstash-qstash.contract";

export const UPSTASH_QSTASH_CONFIG = Symbol("UPSTASH_QSTASH_CONFIG");
export const UPSTASH_QSTASH_RUNTIME = Symbol("UPSTASH_QSTASH_RUNTIME");

export interface UpstashQStashRuntime {
  readonly fetch: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>;
}

const EndpointSchema = z
  .object({
    name: z.string().min(1).max(256).optional(),
    url: z.url({ protocol: /^https$/u }),
  })
  .strip();

const UrlGroupSchema = z
  .object({
    name: z.string().min(1).max(128),
    endpoints: z.array(EndpointSchema).min(1).max(256),
  })
  .strip();

const PublishedMessageSchema = z
  .object({
    messageId: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u),
    deduplicated: z.boolean().optional(),
  })
  .strip();

const PublishResponseSchema = z.union([
  PublishedMessageSchema.transform((message) => [message]),
  z.array(PublishedMessageSchema).min(1).max(256),
]);

class QStashInvalidResponseError extends Error {
  constructor() {
    super("QStash returned an invalid response.");
    this.name = "QStashInvalidResponseError";
  }
}

class QStashCallAbortedError extends Error {
  constructor() {
    super("QStash call aborted.");
    this.name = "QStashCallAbortedError";
  }
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function cancelResponse(response: Response): void {
  try {
    void response.body?.cancel().catch(() => {
      // Provider-controlled stream cancellation must never extend our I/O budget.
    });
  } catch {
    // Best-effort disposal of an untrusted provider response.
  }
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
  signal: AbortSignal
): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/u.test(declared)) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length > maximumBytes) {
      await cancelResponse(response);
      throw new QStashInvalidResponseError();
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    await cancelResponse(response);
    throw new QStashInvalidResponseError();
  }
  if (!response.body) throw new QStashInvalidResponseError();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let aborted = signal.aborted;
  const cancelReader = () => {
    aborted = true;
    void reader.cancel(signal.reason).catch(() => {
      // Best-effort disposal. The abort race below remains authoritative.
    });
  };
  signal.addEventListener("abort", cancelReader, { once: true });
  try {
    while (true) {
      const next = await awaitAbortable(() => reader.read(), signal);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        void reader.cancel().catch(() => {
          // The size violation is authoritative even if provider cleanup stalls.
        });
        throw new QStashInvalidResponseError();
      }
      chunks.push(next.value);
    }
  } finally {
    signal.removeEventListener("abort", cancelReader);
    if (aborted) {
      void reader
        .cancel(signal.reason)
        .catch(() => undefined)
        .finally(() => {
          try {
            reader.releaseLock();
          } catch {
            // A hostile or non-conforming stream may keep a read pending.
          }
        });
    } else {
      try {
        reader.releaseLock();
      } catch {
        // Releasing a non-conforming provider stream is best-effort.
      }
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    ) as unknown;
  } catch {
    throw new QStashInvalidResponseError();
  }
}

function awaitAbortable<T>(
  start: () => Promise<T>,
  signal: AbortSignal,
  disposeLateValue?: (value: T) => void | Promise<void>
): Promise<T> {
  if (signal.aborted) return Promise.reject(new QStashCallAbortedError());

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(new QStashCallAbortedError());
    };
    signal.addEventListener("abort", onAbort, { once: true });

    let operation: Promise<T>;
    try {
      operation = start();
    } catch (error) {
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(error);
      return;
    }

    operation.then(
      (value) => {
        if (settled) {
          if (disposeLateValue) {
            void Promise.resolve(disposeLateValue(value)).catch(() => {
              // Best-effort disposal of a response that arrived after timeout/abort.
            });
          }
          return;
        }
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

interface AbortScope {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
}

function createAbortScope(
  timeoutMs: number,
  upstream?: AbortSignal
): AbortScope {
  const controller = new AbortController();
  const abortFromUpstream = () =>
    controller.abort(upstream?.reason ?? new Error("QStash call aborted"));
  if (upstream?.aborted) abortFromUpstream();
  else upstream?.addEventListener("abort", abortFromUpstream, { once: true });

  const timeout = setTimeout(
    () => controller.abort(new Error("QStash call timed out")),
    timeoutMs
  );
  timeout.unref?.();
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      upstream?.removeEventListener("abort", abortFromUpstream);
    },
  };
}

function logicalJobId(command: BackendCapabilityDurableQueueCommand): string {
  const digest = createHash("sha256")
    .update(UPSTASH_QSTASH_CONTRACT_VERSION)
    .update("\0")
    .update(command.tenantId)
    .update("\0")
    .update(command.workload)
    .update("\0")
    .update(command.idempotencyKey)
    .digest("hex");
  return `qstash:${digest}`;
}

function rejected(
  errorCode: string,
  retryable: boolean
): BackendCapabilityDurableQueueSubmission {
  return { outcome: "rejected", retryable, errorCode };
}

@Injectable()
export class UpstashQStashDurableQueuePort
  implements BackendCapabilityDurableQueuePort
{
  private readonly config: UpstashQStashConfig;
  private readonly runtime: UpstashQStashRuntime;

  constructor(
    @Inject(UPSTASH_QSTASH_CONFIG)
    config: UpstashQStashConfig,
    @Inject(UPSTASH_QSTASH_RUNTIME)
    runtime: UpstashQStashRuntime
  ) {
    this.config = validateUpstashQStashConfig(config);
    this.runtime = runtime;
  }

  async verifyReadiness(
    options: BackendCapabilityDurableQueueCallOptions = {}
  ): Promise<BackendCapabilityDurableQueueReadiness> {
    const scope = createAbortScope(this.config.timeoutMs, options.signal);
    try {
      const response = await awaitAbortable(
        () =>
          this.runtime.fetch(
            `${this.config.apiBaseUrl}/v2/topics/${encodeURIComponent(
              this.config.urlGroup
            )}`,
            {
              method: "GET",
              headers: {
                authorization: `Bearer ${this.config.publishToken}`,
                accept: "application/json",
              },
              redirect: "error",
              credentials: "omit",
              referrerPolicy: "no-referrer",
              signal: scope.signal,
            }
          ),
        scope.signal,
        cancelResponse
      );
      if (response.status === 404) {
        await cancelResponse(response);
        return { ready: false, reason: "not-configured" };
      }
      if (!response.ok) {
        await cancelResponse(response);
        return { ready: false, reason: "unreachable" };
      }
      if (response.status !== 200) {
        await cancelResponse(response);
        return { ready: false, reason: "unsupported" };
      }

      const raw = await readBoundedJson(
        response,
        this.config.maximumResponseBytes,
        scope.signal
      );
      const parsed = UrlGroupSchema.safeParse(raw);
      if (
        !parsed.success ||
        parsed.data.name !== this.config.urlGroup ||
        parsed.data.endpoints.some((endpoint) => {
          const url = new URL(endpoint.url);
          return Boolean(url.username || url.password);
        })
      ) {
        return { ready: false, reason: "unsupported" };
      }
      return {
        ready: true,
        providerIds: ["upstash-qstash"],
        workloads: ["cleanup", "notification"],
      };
    } catch (error) {
      if (error instanceof QStashInvalidResponseError) {
        return { ready: false, reason: "unsupported" };
      }
      return { ready: false, reason: "unreachable" };
    } finally {
      scope.dispose();
    }
  }

  async submit(
    command: BackendCapabilityDurableQueueCommand,
    options: BackendCapabilityDurableQueueCallOptions = {}
  ): Promise<BackendCapabilityDurableQueueSubmission> {
    const parsed = BackendCapabilityDurableQueueCommandSchema.safeParse(command);
    if (!parsed.success || parsed.data.providerId !== "upstash-qstash") {
      return rejected("QSTASH_INVALID_COMMAND", false);
    }

    const admitted = parsed.data;
    const jobId = logicalJobId(admitted);
    const delivery = {
      contractVersion: UPSTASH_QSTASH_CONTRACT_VERSION,
      providerId: admitted.providerId,
      tenantId: admitted.tenantId,
      workload: admitted.workload,
      idempotencyKey: admitted.idempotencyKey,
      createdAt: admitted.createdAt,
      task: admitted.task,
    };
    const body = JSON.stringify(delivery);
    if (byteLength(body) > this.config.maximumRequestBytes) {
      return rejected("QSTASH_PAYLOAD_TOO_LARGE", false);
    }
    const parsedDelivery = UpstashQStashDeliverySchema.safeParse(delivery);
    if (!parsedDelivery.success) {
      return rejected("QSTASH_INVALID_COMMAND", false);
    }

    const deduplicationId = jobId.slice("qstash:".length);
    const scope = createAbortScope(this.config.timeoutMs, options.signal);
    try {
      const response = await awaitAbortable(
        () =>
          this.runtime.fetch(
            `${this.config.apiBaseUrl}/v2/publish/${encodeURIComponent(
              this.config.urlGroup
            )}`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${this.config.publishToken}`,
                accept: "application/json",
                "content-type": "application/json",
                "upstash-deduplication-id": deduplicationId,
                "upstash-label": `toonspectrum-${admitted.workload}`,
                "upstash-redact-fields": "body",
                "upstash-retries": String(this.config.retries),
                "upstash-timeout": `${this.config.deliveryTimeoutSeconds}s`,
              },
              body: JSON.stringify(parsedDelivery.data),
              redirect: "error",
              credentials: "omit",
              referrerPolicy: "no-referrer",
              signal: scope.signal,
            }
          ),
        scope.signal,
        cancelResponse
      );

      if (!response.ok) {
        const retryable =
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500;
        await cancelResponse(response);
        return rejected(
          retryable ? "QSTASH_TEMPORARILY_UNAVAILABLE" : "QSTASH_REJECTED",
          retryable
        );
      }
      if (response.status !== 200 && response.status !== 202) {
        await cancelResponse(response);
        return rejected("QSTASH_INVALID_RESPONSE", true);
      }

      const raw = await readBoundedJson(
        response,
        this.config.maximumResponseBytes,
        scope.signal
      );
      const published = PublishResponseSchema.safeParse(raw);
      if (!published.success) {
        return rejected("QSTASH_INVALID_RESPONSE", true);
      }
      if (
        response.status === 202 &&
        published.data.some((message) => message.deduplicated === false)
      ) {
        return rejected("QSTASH_INVALID_RESPONSE", true);
      }
      const duplicate =
        response.status === 202 ||
        published.data.every((message) => message.deduplicated === true);
      return duplicate
        ? { outcome: "duplicate", jobId }
        : { outcome: "accepted", jobId };
    } catch (error) {
      if (error instanceof QStashInvalidResponseError) {
        return rejected("QSTASH_INVALID_RESPONSE", true);
      }
      return rejected("QSTASH_UNREACHABLE", true);
    } finally {
      scope.dispose();
    }
  }
}
