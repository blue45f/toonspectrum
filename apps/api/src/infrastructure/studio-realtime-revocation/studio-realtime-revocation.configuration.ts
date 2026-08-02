import { z } from "zod";

import { REALTIME_CONTROL_PATH } from "../../../../../deploy/cloudflare-realtime/src/control";

const ExactSecretSchema = z
  .string()
  .min(32)
  .max(4_096)
  .refine((value) => value === value.trim())
  .refine((value) => {
    for (const character of value) {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint <= 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) {
        return false;
      }
    }
    return true;
  });

const ExactControlUrlSchema = z
  .url({ protocol: /^https$/u })
  .max(2_048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.pathname === REALTIME_CONTROL_PATH &&
        url.search === "" &&
        url.hash === "" &&
        url.username === "" &&
        url.password === "" &&
        url.toString() === value
      );
    } catch {
      return false;
    }
  });

const EnabledConfigurationSchema = z
  .object({
    enabled: z.literal("true"),
    controlUrl: ExactControlUrlSchema,
    controlSecret: ExactSecretSchema,
    timeoutMs: z
      .string()
      .regex(/^[1-9]\d*$/u)
      .transform(Number)
      .pipe(z.number().int().min(500).max(10_000)),
  })
  .strict();

export interface DisabledStudioRealtimeRevocationConfiguration {
  readonly enabled: false;
}

export interface EnabledStudioRealtimeRevocationConfiguration {
  readonly enabled: true;
  readonly controlUrl: string;
  readonly controlSecret: string;
  readonly timeoutMs: number;
}

export type StudioRealtimeRevocationConfiguration =
  | DisabledStudioRealtimeRevocationConfiguration
  | EnabledStudioRealtimeRevocationConfiguration;

export const STUDIO_REALTIME_REVOCATION_CONFIGURATION = Symbol(
  "STUDIO_REALTIME_REVOCATION_CONFIGURATION",
);

export class StudioRealtimeRevocationConfigurationError extends Error {
  constructor() {
    super("Studio realtime revocation configuration is invalid.");
    this.name = "StudioRealtimeRevocationConfigurationError";
  }
}

export function resolveStudioRealtimeRevocationConfiguration(
  environment: NodeJS.ProcessEnv,
): StudioRealtimeRevocationConfiguration {
  const enabled = environment.STUDIO_REALTIME_REVOCATION_ENABLED;
  if (enabled === undefined || enabled === "false") {
    return { enabled: false };
  }
  if (enabled !== "true") {
    throw new StudioRealtimeRevocationConfigurationError();
  }
  const parsed = EnabledConfigurationSchema.safeParse({
    enabled,
    controlUrl: environment.STUDIO_REALTIME_CLOUDFLARE_CONTROL_URL,
    controlSecret: environment.STUDIO_REALTIME_CLOUDFLARE_CONTROL_SECRET,
    timeoutMs:
      environment.STUDIO_REALTIME_CLOUDFLARE_CONTROL_TIMEOUT_MS ?? "3000",
  });
  if (
    !parsed.success ||
    parsed.data.controlSecret ===
      environment.STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET
  ) {
    throw new StudioRealtimeRevocationConfigurationError();
  }
  return {
    enabled: true,
    controlUrl: parsed.data.controlUrl,
    controlSecret: parsed.data.controlSecret,
    timeoutMs: parsed.data.timeoutMs,
  };
}
