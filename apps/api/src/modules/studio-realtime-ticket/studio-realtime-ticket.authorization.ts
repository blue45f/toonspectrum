import { Injectable } from "@nestjs/common";
import { z } from "zod";

import {
  IssueStudioRealtimeTicketSchema,
  StudioRealtimeTicketIdentifierSchema,
} from "./studio-realtime-ticket.dto";

import type {
  IssueStudioRealtimeTicket,
} from "./studio-realtime-ticket.dto";

export const STUDIO_REALTIME_TICKET_AUTHORIZATION = Symbol(
  "STUDIO_REALTIME_TICKET_AUTHORIZATION",
);

const StudioRealtimeTicketCreatorCapabilitiesSchema = z
  .object({
    view: z.boolean(),
    comment: z.boolean(),
    edit: z.boolean(),
    manageMembers: z.boolean(),
  })
  .strict();

const StudioRealtimeTicketRoleSchema = z.enum([
  "owner",
  "admin",
  "editor",
  "commenter",
  "viewer",
]);

const StudioRealtimeTicketCanonicalOriginSchema = z
  .string()
  .url()
  .max(256)
  .refine((value) => normalizeStudioRealtimeTicketOrigin(value) === value);

export const StudioRealtimeTicketAuthorizationDecisionSchema =
  z.discriminatedUnion("allowed", [
    z.object({ allowed: z.literal(false) }).strict(),
    IssueStudioRealtimeTicketSchema.safeExtend({
      allowed: z.literal(true),
      actorUserId: StudioRealtimeTicketIdentifierSchema,
      origin: StudioRealtimeTicketCanonicalOriginSchema.nullable(),
      role: StudioRealtimeTicketRoleSchema,
      creatorCapabilities: StudioRealtimeTicketCreatorCapabilitiesSchema,
      authorizationEpoch: z.iso.datetime({ offset: true }),
      authorizationExpiresAt: z.iso.datetime({ offset: true }).optional(),
    }).strict(),
  ]);

export interface StudioRealtimeTicketAuthorizationInput
extends IssueStudioRealtimeTicket {
  readonly actorUserId: string;
  /**
   * Canonical HTTP(S) browser origin, or null for a non-browser client.
   * The operational adapter must explicitly authorize either form.
   */
  readonly origin: string | null;
}

export type StudioRealtimeTicketAuthorizationDecision = z.infer<
  typeof StudioRealtimeTicketAuthorizationDecisionSchema
>;

export interface StudioRealtimeTicketAuthorizationPort {
  authorize(
    input: StudioRealtimeTicketAuthorizationInput,
  ): Promise<StudioRealtimeTicketAuthorizationDecision>;
}

/**
 * An omitted creator ACL/origin adapter is never interpreted as public access.
 */
@Injectable()
export class DenyAllStudioRealtimeTicketAuthorization
implements StudioRealtimeTicketAuthorizationPort {
  async authorize(): Promise<StudioRealtimeTicketAuthorizationDecision> {
    return { allowed: false };
  }
}

export function normalizeStudioRealtimeTicketOrigin(
  value: string | undefined,
): string | null {
  if (value === undefined || value.length === 0 || value !== value.trim()) {
    return null;
  }
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.origin !== value
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
