import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  REALTIME_TICKET_VERSION,
  signRealtimeTicket,
} from "../../../../../deploy/cloudflare-realtime/src/ticket";

import {
  CloudflareStudioRealtimeTicketSignerConfigurationSchema,
  StudioRealtimeTicketSignerDescriptorSchema,
} from "./studio-realtime-ticket.configuration";
import {
  STUDIO_REALTIME_TICKET_MAX_LIFETIME_MS,
  StudioRealtimeTicketCapabilityListSchema,
  StudioRealtimeTicketIdentifierSchema,
  StudioRealtimeTicketOpaqueTokenSchema,
  StudioRealtimeTicketScopeSchema,
  StudioRealtimeTicketWorkloadListSchema,
} from "./studio-realtime-ticket.dto";

import type {
  CloudflareStudioRealtimeTicketSignerConfiguration,
  StudioRealtimeTicketSignerDescriptor,
} from "./studio-realtime-ticket.configuration";
import type {
  StudioRealtimeTicketCapability,
  StudioRealtimeTicketScope,
  StudioRealtimeTicketWorkload,
} from "./studio-realtime-ticket.dto";

export const STUDIO_REALTIME_TICKET_SIGNERS = Symbol(
  "STUDIO_REALTIME_TICKET_SIGNERS",
);

const CloudflareNonceSchema = z
  .string()
  .min(16)
  .max(96)
  .regex(/^[A-Za-z0-9_-]+$/u);

export const StudioRealtimeTicketSignerResultSchema = z
  .object({
    ticket: StudioRealtimeTicketOpaqueTokenSchema,
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((result, context) => {
    const lifetimeMs =
      Date.parse(result.expiresAt) - Date.parse(result.issuedAt);
    if (
      !Number.isFinite(lifetimeMs) ||
      lifetimeMs <= 0 ||
      lifetimeMs > STUDIO_REALTIME_TICKET_MAX_LIFETIME_MS
    ) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "signer returned an unsafe ticket lifetime",
      });
    }
  });

export interface IssueStudioRealtimeTicketSignerInput {
  readonly actorUserId: string;
  readonly sessionVersion: number;
  readonly sessionExpiresAtEpochMs: number;
  readonly sessionId: string;
  readonly scope: StudioRealtimeTicketScope;
  readonly workloads: readonly StudioRealtimeTicketWorkload[];
  readonly capabilities: readonly StudioRealtimeTicketCapability[];
  readonly origin: string | null;
  readonly authorizationExpiresAtEpochMs?: number;
}

export interface StudioRealtimeTicketSignerPort {
  readonly descriptor: StudioRealtimeTicketSignerDescriptor;
  issue(
    input: IssueStudioRealtimeTicketSignerInput,
  ): Promise<z.infer<typeof StudioRealtimeTicketSignerResultSchema>>;
}

export interface StudioRealtimeTicketSignerRuntime {
  readonly nowEpochMs: () => number;
  readonly createNonce: () => string;
}

export class StudioRealtimeTicketSignerUnavailableError extends Error {
  constructor() {
    super("Realtime ticket signer is unavailable.");
    this.name = "StudioRealtimeTicketSignerUnavailableError";
  }
}

function containsAll<Value>(
  granted: readonly Value[],
  requested: readonly Value[],
): boolean {
  const grantSet = new Set(granted);
  return requested.every((value) => grantSet.has(value));
}

/**
 * Cloudflare Durable Object signer. The secret remains private configuration;
 * only the non-secret descriptor is exposed to the routing service.
 */
export class CloudflareStudioRealtimeTicketSigner
implements StudioRealtimeTicketSignerPort {
  readonly descriptor: StudioRealtimeTicketSignerDescriptor;
  private readonly configuration: CloudflareStudioRealtimeTicketSignerConfiguration;
  private readonly runtime: StudioRealtimeTicketSignerRuntime;

  constructor(
    unsafeConfiguration: CloudflareStudioRealtimeTicketSignerConfiguration,
    runtime: StudioRealtimeTicketSignerRuntime = {
      nowEpochMs: Date.now,
      createNonce: randomUUID,
    },
  ) {
    const configuration =
      CloudflareStudioRealtimeTicketSignerConfigurationSchema.safeParse(
        unsafeConfiguration,
      );
    if (!configuration.success) {
      throw new StudioRealtimeTicketSignerUnavailableError();
    }
    this.configuration = configuration.data;
    this.runtime = runtime;
    const descriptor = StudioRealtimeTicketSignerDescriptorSchema.safeParse({
        providerId: configuration.data.providerId,
        provider: configuration.data.provider,
        audience: configuration.data.audience,
        workloads: [...configuration.data.workloads],
        capabilities: [...configuration.data.capabilities],
      });
    if (!descriptor.success) {
      throw new StudioRealtimeTicketSignerUnavailableError();
    }
    this.descriptor = Object.freeze(descriptor.data);
  }

  async issue(
    input: IssueStudioRealtimeTicketSignerInput,
  ): Promise<z.infer<typeof StudioRealtimeTicketSignerResultSchema>> {
    const inputShape = z
      .object({
        actorUserId: StudioRealtimeTicketIdentifierSchema,
        sessionVersion: z.number().int().safe().positive(),
        sessionExpiresAtEpochMs: z.number().int().safe().positive(),
        sessionId: StudioRealtimeTicketIdentifierSchema,
        scope: StudioRealtimeTicketScopeSchema,
        workloads: StudioRealtimeTicketWorkloadListSchema,
        capabilities: StudioRealtimeTicketCapabilityListSchema,
        origin: z.string().url().max(256),
        authorizationExpiresAtEpochMs: z.number().int().positive().optional(),
      })
      .strict()
      .safeParse(input);
    if (
      !inputShape.success ||
      !containsAll(this.descriptor.workloads, inputShape.data.workloads) ||
      !containsAll(this.descriptor.capabilities, inputShape.data.capabilities)
    ) {
      throw new StudioRealtimeTicketSignerUnavailableError();
    }
    let origin: URL;
    try {
      origin = new URL(inputShape.data.origin);
    } catch {
      throw new StudioRealtimeTicketSignerUnavailableError();
    }
    if (
      origin.protocol !== "https:" ||
      origin.origin !== inputShape.data.origin ||
      origin.pathname !== "/" ||
      origin.search !== "" ||
      origin.hash !== "" ||
      origin.username !== "" ||
      origin.password !== ""
    ) {
      throw new StudioRealtimeTicketSignerUnavailableError();
    }

    const issuedAtMs = Math.trunc(this.runtime.nowEpochMs());
    const nonce = this.runtime.createNonce();
    if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs < 0) {
      throw new StudioRealtimeTicketSignerUnavailableError();
    }
    if (!CloudflareNonceSchema.safeParse(nonce).success) {
      throw new StudioRealtimeTicketSignerUnavailableError();
    }
    const authorizationExpiry =
      inputShape.data.authorizationExpiresAtEpochMs ??
      Number.MAX_SAFE_INTEGER;
    const credentialExpiry = Math.min(
      authorizationExpiry,
      inputShape.data.sessionExpiresAtEpochMs,
    );
    const expiresAtMs = Math.min(
      issuedAtMs + this.configuration.ticketTtlSeconds * 1_000,
      credentialExpiry,
    );
    const sessionExpiresAtMs = Math.min(
      issuedAtMs + this.configuration.sessionTtlSeconds * 1_000,
      credentialExpiry,
    );
    if (
      !Number.isSafeInteger(expiresAtMs) ||
      !Number.isSafeInteger(sessionExpiresAtMs) ||
      expiresAtMs <= issuedAtMs ||
      sessionExpiresAtMs < expiresAtMs
    ) {
      throw new StudioRealtimeTicketSignerUnavailableError();
    }

    let ticket: string;
    try {
      const claims = {
        version: REALTIME_TICKET_VERSION,
        issuer: this.configuration.issuer,
        audience: this.configuration.audience,
        subject: inputShape.data.actorUserId,
        sessionVersion: inputShape.data.sessionVersion,
        workId: inputShape.data.scope.workId,
        roomId: inputShape.data.scope.roomId,
        clientId: inputShape.data.sessionId,
        origin: inputShape.data.origin,
        scopes: inputShape.data.workloads,
        nonce,
        issuedAtMs,
        expiresAtMs,
        sessionExpiresAtMs,
      } as Parameters<typeof signRealtimeTicket>[0];
      ticket = await signRealtimeTicket(
        claims,
        this.configuration.hmacSecret,
      );
    } catch {
      throw new StudioRealtimeTicketSignerUnavailableError();
    }

    const result = StudioRealtimeTicketSignerResultSchema.safeParse({
      ticket,
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
    if (!result.success) {
      throw new StudioRealtimeTicketSignerUnavailableError();
    }
    return result.data;
  }
}
