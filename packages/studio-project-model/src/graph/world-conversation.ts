import { z } from "zod";

import { studioAcousticCoreBindingSchema, studioAcousticWorldPinSchema } from "./world-acoustic";

export const STUDIO_ACOUSTIC_CONVERSATION_EVENT = "studio:acoustic:invalidate";
export const STUDIO_ACOUSTIC_INVITATION_MS = 30_000;
export const STUDIO_ACOUSTIC_MAX_CONVERSATIONS = 24;
const id = z.string().trim().min(1).max(160);
const epochs = z.array(z.uuid()).min(2).max(4).refine(values => new Set(values).size === values.length);
export const studioConversationProposeSchema = z.object({ conversationId:z.uuid(), selfSessionEpoch:z.uuid(), memberSessionEpochs:epochs }).strict()
  .refine(value => value.memberSessionEpochs.includes(value.selfSessionEpoch));
export const studioConversationReadSchema = z.object({ conversationId:z.uuid(), selfSessionEpoch:z.uuid() }).strict();
export const studioConversationChangeSchema = studioConversationReadSchema.extend({ expectedRevisionId:id,
  action:z.enum(["accept","decline","cancel","leave","block"]), targetSessionEpoch:z.uuid().optional() }).strict()
  .refine(value => value.action === "block" ? value.targetSessionEpoch !== undefined && value.targetSessionEpoch !== value.selfSessionEpoch : value.targetSessionEpoch === undefined);
export const studioConversationRenewSchema=studioConversationReadSchema.extend({expectedRevisionId:id,expectedLeaseRevision:z.string().regex(/^[1-9][0-9]{0,18}$/u)}).strict();
export const studioConversationMemberSchema = z.object({ sessionEpoch:z.uuid(), binding:studioAcousticCoreBindingSchema, accepted:z.boolean() }).strict();
export const studioConversationReasonSchema = z.enum(["declined","cancelled","left","blocked","expired","authority_lost","binding_lost"]);
export const studioConversationSnapshotSchema = z.object({ kind:z.literal("acoustic-conversation-consent"),conversationId:z.uuid(),revisionId:id,
  world:studioAcousticWorldPinSchema,zoneId:id,doorId:id,doorEpoch:z.uuid(),status:z.enum(["pending","active","revoked"]),
  members:z.array(studioConversationMemberSchema).min(2).max(4),expiresAt:z.string().datetime(),reason:studioConversationReasonSchema.nullable(),
  leaseRevision:z.string().regex(/^[1-9][0-9]{0,18}$/u).nullable(),
}).strict();
// This event is only an invalidation hint to one fixed connection/epoch. It grants no media access.
export const studioConversationInvalidationSchema = z.object({ version:z.literal(1),workId:id,conversationId:z.uuid(),selfSessionEpoch:z.uuid() }).strict();
export type StudioConversationPropose = z.infer<typeof studioConversationProposeSchema>;
export type StudioConversationRead = z.infer<typeof studioConversationReadSchema>;
export type StudioConversationChange = z.infer<typeof studioConversationChangeSchema>;
export type StudioConversationRenew = z.infer<typeof studioConversationRenewSchema>;
export type StudioConversationSnapshot = z.infer<typeof studioConversationSnapshotSchema>;
export type StudioConversationReason = z.infer<typeof studioConversationReasonSchema>;
export type StudioConversationInvalidation = z.infer<typeof studioConversationInvalidationSchema>;
