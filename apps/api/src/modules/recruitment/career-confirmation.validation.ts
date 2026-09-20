import { z } from "zod";

import { hiringId, revision, unique } from "../collaboration/hiring.validation";

const account = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/u);
const selection = { careerId: hiringId, versionId: hiringId, teamId: hiringId, targetAccountId: account };
export const confirmationPreviewSchema = z.strictObject(selection);
export const confirmationRequestSchema = z.strictObject({ ...selection, sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  requesterMembershipRevision: revision.refine((v) => v > 0), targetMembershipRevision: revision.refine((v) => v > 0),
  consent: z.literal("exact-version-2026-09-20"), mutationId: hiringId });
export const confirmationActionSchema = z.strictObject({ action: z.enum(["confirmed", "declined", "revoked"]), expectedRevision: revision.refine((v) => v > 0), mutationId: hiringId });
export const confirmationListSchema = z.strictObject({ direction: z.enum(["sent", "received"]), after: hiringId.optional() });
export const confirmationCollaboratorsSchema = z.strictObject({ after: z.string().max(400).regex(/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/u).optional() });
export const confirmationPublicSchema = z.strictObject({ careerIds: unique(hiringId, 50, 1) });
