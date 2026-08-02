import { z } from "zod";

import { allowedCorsOrigins } from "../../config/cors";
import { CreatorCollaborationRepository } from "../creator/creator-collaboration.repository";
import { CreatorModule } from "../creator/creator.module";

import {
  STUDIO_REALTIME_SESSION_MAX_TTL_SECONDS,
  type CloudflareStudioRealtimeTicketSignerConfiguration,
} from "./studio-realtime-ticket.configuration";
import {
  CreatorStudioRealtimeTicketAuthorization,
} from "./studio-realtime-ticket.creator-authorization";
import {
  StudioRealtimeTicketIdentifierSchema,
} from "./studio-realtime-ticket.dto";
import { StudioRealtimeTicketModule } from "./studio-realtime-ticket.module";
import {
  CloudflareStudioRealtimeTicketSigner,
} from "./studio-realtime-ticket.provider";

import type { DynamicModule } from "@nestjs/common";

const STUDIO_REALTIME_TICKET_DEFAULT_TTL_SECONDS = 120;
// Keep the edge lease short until logout/ACL revocation has a dedicated control plane. The
// provider reconnects with a fresh cookie-authenticated ticket when this bounded lease ends.
const STUDIO_REALTIME_SESSION_DEFAULT_TTL_SECONDS =
  STUDIO_REALTIME_SESSION_MAX_TTL_SECONDS;

const CanonicalPositiveIntegerStringSchema = z
  .string()
  .regex(/^[1-9]\d*$/u)
  .transform(Number)
  .pipe(z.number().int().safe().positive());

const ExactSecretSchema = z
  .string()
  .min(32)
  .max(4_096)
  .refine((value) => value === value.trim())
  .refine((value) => {
    for (const character of value) {
      const codePoint = character.codePointAt(0) ?? 0;
      if (
        codePoint <= 0x20 ||
        (codePoint >= 0x7f && codePoint <= 0x9f)
      ) {
        return false;
      }
    }
    return true;
  });

const EnabledCloudflareStudioRealtimeEnvironmentSchema = z
  .object({
    enabled: z.literal("true"),
    providerId: StudioRealtimeTicketIdentifierSchema,
    issuer: StudioRealtimeTicketIdentifierSchema,
    audience: StudioRealtimeTicketIdentifierSchema,
    hmacSecret: ExactSecretSchema,
    ticketTtlSeconds: CanonicalPositiveIntegerStringSchema
      .pipe(z.number().max(STUDIO_REALTIME_TICKET_DEFAULT_TTL_SECONDS)),
    sessionTtlSeconds: CanonicalPositiveIntegerStringSchema
      .pipe(z.number().max(STUDIO_REALTIME_SESSION_DEFAULT_TTL_SECONDS)),
  })
  .strict()
  .refine(
    (configuration) =>
      configuration.sessionTtlSeconds >= configuration.ticketTtlSeconds,
    { path: ["sessionTtlSeconds"] },
  );

const CLOUDFLARE_STUDIO_REALTIME_WORKLOADS = [
  "presence",
  "comments",
  "screen-signaling",
] as const;

const CLOUDFLARE_STUDIO_REALTIME_CAPABILITIES = [
  "presence.snapshot-v1",
  "presence.members-v1",
  "presence.cursor-v1",
  "presence.resume-v1",
  "comments.invalidation-v1",
  "comments.resume-v1",
  "screen-signaling.session-v1",
  "screen-signaling.webrtc-v1",
  "screen-signaling.resume-v1",
] as const;

interface EnabledStudioRealtimeTicketDeployment {
  readonly enabled: true;
  readonly signer: CloudflareStudioRealtimeTicketSignerConfiguration;
  readonly allowedOrigins: readonly string[];
}

interface DisabledStudioRealtimeTicketDeployment {
  readonly enabled: false;
}

type StudioRealtimeTicketDeployment =
  | EnabledStudioRealtimeTicketDeployment
  | DisabledStudioRealtimeTicketDeployment;

export class StudioRealtimeTicketConfigurationError extends Error {
  constructor() {
    super("Studio realtime ticket configuration is invalid.");
    this.name = "StudioRealtimeTicketConfigurationError";
  }
}

/**
 * Reads only the exact server-side keys owned by this integration. Enabling the
 * route with a partial, weak, or non-canonical configuration aborts bootstrap
 * without reflecting the invalid value or HMAC secret.
 */
export function resolveStudioRealtimeTicketDeployment(
  environment: NodeJS.ProcessEnv,
): StudioRealtimeTicketDeployment {
  const enabled = environment.STUDIO_REALTIME_TICKET_ENABLED;
  if (enabled === undefined || enabled === "false") {
    return { enabled: false };
  }
  if (enabled !== "true") {
    throw new StudioRealtimeTicketConfigurationError();
  }

  const configuration =
    EnabledCloudflareStudioRealtimeEnvironmentSchema.safeParse({
      enabled,
      providerId:
        environment.STUDIO_REALTIME_CLOUDFLARE_PROVIDER_ID,
      issuer:
        environment.STUDIO_REALTIME_CLOUDFLARE_TICKET_ISSUER,
      audience:
        environment.STUDIO_REALTIME_CLOUDFLARE_TICKET_AUDIENCE,
      hmacSecret:
        environment.STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET,
      ticketTtlSeconds:
        environment.STUDIO_REALTIME_CLOUDFLARE_TICKET_TTL_SECONDS ??
        String(STUDIO_REALTIME_TICKET_DEFAULT_TTL_SECONDS),
      sessionTtlSeconds:
        environment.STUDIO_REALTIME_CLOUDFLARE_SESSION_TTL_SECONDS ??
        String(STUDIO_REALTIME_SESSION_DEFAULT_TTL_SECONDS),
    });
  if (!configuration.success) {
    throw new StudioRealtimeTicketConfigurationError();
  }
  const httpsOrigins = allowedCorsOrigins(environment).filter((origin) =>
    origin.startsWith("https://"),
  );
  if (httpsOrigins.length === 0) {
    throw new StudioRealtimeTicketConfigurationError();
  }

  return {
    enabled: true,
    allowedOrigins: httpsOrigins,
    signer: {
      providerId: configuration.data.providerId,
      provider: "cloudflare",
      issuer: configuration.data.issuer,
      audience: configuration.data.audience,
      hmacSecret: configuration.data.hmacSecret,
      ticketTtlSeconds: configuration.data.ticketTtlSeconds,
      sessionTtlSeconds: configuration.data.sessionTtlSeconds,
      workloads: [...CLOUDFLARE_STUDIO_REALTIME_WORKLOADS],
      capabilities: [...CLOUDFLARE_STUDIO_REALTIME_CAPABILITIES],
    },
  };
}

/**
 * Returns null while explicitly disabled, so no ticket route is mounted. Once
 * enabled, configuration is validated synchronously and all authorization and
 * signing dependencies are installed through Nest DI.
 */
export function createStudioRealtimeTicketDynamicModule(
  environment: NodeJS.ProcessEnv,
): DynamicModule | null {
  const deployment =
    resolveStudioRealtimeTicketDeployment(environment);
  if (!deployment.enabled) {
    return null;
  }

  return StudioRealtimeTicketModule.forRootAsync({
    imports: [CreatorModule],
    authorization: {
      inject: [CreatorCollaborationRepository],
      useFactory: (
        collaborationRepository: CreatorCollaborationRepository,
      ) =>
        new CreatorStudioRealtimeTicketAuthorization(
          collaborationRepository,
          {
            providerIds: [deployment.signer.providerId],
            allowedOrigins: deployment.allowedOrigins,
          },
        ),
    },
    signers: {
      useFactory: () => [
        new CloudflareStudioRealtimeTicketSigner(
          deployment.signer,
        ),
      ],
    },
  });
}
