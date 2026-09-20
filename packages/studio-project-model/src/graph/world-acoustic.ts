import { z } from "zod";

export const STUDIO_ACOUSTIC_RESOURCE_PREFIX = "studio-acoustic:";
export const STUDIO_ACOUSTIC_SESSION_MS = 15_000;
export const STUDIO_ACOUSTIC_MAX_SESSIONS = 24;
const id = z.string().min(1).max(160).refine((value) => value === value.trim() && [...value].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127));
const uuid = z.uuid();
export const studioAcousticWorldPinSchema = z.object({ worldId: id, revisionId: id, contentHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
export const studioAcousticDoorChangeSchema = z.object({
  world: studioAcousticWorldPinSchema, zoneId: id, expectedDoorEpoch: uuid.nullable(), open: z.boolean(),
  allowedUserIds: z.array(id).max(24).refine((ids) => new Set(ids).size === ids.length),
}).strict();
export const studioAcousticSessionOpenSchema = z.object({
  world: studioAcousticWorldPinSchema, zoneId: id, doorEpoch: uuid,
  connectionId: id.max(128), clientInstanceId: id.max(80), expectedSessionEpoch: uuid.nullable(),
}).strict();
export const studioAcousticSessionReadSchema = z.object({ sessionEpoch: uuid }).strict();
export const studioAcousticSessionRenewSchema = studioAcousticSessionReadSchema.extend({ expectedLeaseRevision: z.string().regex(/^[1-9][0-9]{0,18}$/u) });
export const studioAcousticCoreBindingSchema = z.object({ connectionId: id.max(128), clientInstanceId: id.max(80), joinedAt: z.string().datetime() }).strict();
export const studioAcousticSessionLeaseSchema = z.object({
  kind: z.literal("acoustic-session-lease-only"), world: studioAcousticWorldPinSchema, zoneId: id, doorId: id, doorEpoch: uuid,
  sessionEpoch: uuid, leaseRevision: z.string().regex(/^[1-9][0-9]{0,18}$/u), expiresAt: z.string().datetime(), binding: studioAcousticCoreBindingSchema,
}).strict();
export type StudioAcousticWorldPin = z.infer<typeof studioAcousticWorldPinSchema>;
export type StudioAcousticDoorChange = z.infer<typeof studioAcousticDoorChangeSchema>;
export type StudioAcousticSessionOpen = z.infer<typeof studioAcousticSessionOpenSchema>;
export type StudioAcousticSessionRenew = z.infer<typeof studioAcousticSessionRenewSchema>;
export type StudioAcousticCoreBinding = z.infer<typeof studioAcousticCoreBindingSchema>;
export type StudioAcousticSessionLease = z.infer<typeof studioAcousticSessionLeaseSchema>;
