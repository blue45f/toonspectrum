import { z } from "zod";

import {
  STUDIO_REALTIME_TICKET_CAPABILITY_WORKLOAD,
  StudioRealtimeTicketCapabilityListSchema,
  StudioRealtimeTicketIdentifierSchema,
  StudioRealtimeTicketWorkloadListSchema,
} from "./studio-realtime-ticket.dto";

export const STUDIO_REALTIME_SESSION_MAX_TTL_SECONDS = 5 * 60;

export const StudioRealtimeTicketProviderKindSchema = z.enum([
  "cloudflare",
  "supabase",
  "socket-io",
]);

const StudioRealtimeTicketSignerDescriptorSchemaBase = z
  .object({
    providerId: StudioRealtimeTicketIdentifierSchema,
    provider: StudioRealtimeTicketProviderKindSchema,
    audience: StudioRealtimeTicketIdentifierSchema,
    workloads: StudioRealtimeTicketWorkloadListSchema,
    capabilities: StudioRealtimeTicketCapabilityListSchema,
  })
  .strict();

export const StudioRealtimeTicketSignerDescriptorSchema =
  StudioRealtimeTicketSignerDescriptorSchemaBase.superRefine(
    (descriptor, context) => {
      const workloads = new Set(descriptor.workloads);
      for (let index = 0; index < descriptor.capabilities.length; index += 1) {
        const capability = descriptor.capabilities[index];
        if (!workloads.has(STUDIO_REALTIME_TICKET_CAPABILITY_WORKLOAD[capability])) {
          context.addIssue({
            code: "custom",
            path: ["capabilities", index],
            message: "capability is outside the signer's workload contract",
          });
        }
      }
    },
  );

export const CloudflareStudioRealtimeTicketSignerConfigurationSchema =
  StudioRealtimeTicketSignerDescriptorSchemaBase.extend({
    provider: z.literal("cloudflare"),
    issuer: StudioRealtimeTicketIdentifierSchema,
    hmacSecret: z.string().min(32).max(4_096),
    ticketTtlSeconds: z.number().int().min(1).max(120),
    sessionTtlSeconds: z
      .number()
      .int()
      .min(1)
      .max(STUDIO_REALTIME_SESSION_MAX_TTL_SECONDS),
  })
    .strict()
    .superRefine((configuration, context) => {
      if (configuration.sessionTtlSeconds < configuration.ticketTtlSeconds) {
        context.addIssue({
          code: "custom",
          path: ["sessionTtlSeconds"],
          message: "session lifetime cannot be shorter than ticket lifetime",
        });
      }
      const workloads = new Set(configuration.workloads);
      for (let index = 0; index < configuration.capabilities.length; index += 1) {
        const capability = configuration.capabilities[index];
        if (!workloads.has(STUDIO_REALTIME_TICKET_CAPABILITY_WORKLOAD[capability])) {
          context.addIssue({
            code: "custom",
            path: ["capabilities", index],
            message: "capability is outside the signer's workload contract",
          });
        }
      }
    });

export type StudioRealtimeTicketProviderKind = z.infer<
  typeof StudioRealtimeTicketProviderKindSchema
>;
export type StudioRealtimeTicketSignerDescriptor = z.infer<
  typeof StudioRealtimeTicketSignerDescriptorSchema
>;
export type CloudflareStudioRealtimeTicketSignerConfiguration = z.infer<
  typeof CloudflareStudioRealtimeTicketSignerConfigurationSchema
>;
