import { z } from "zod";

import { hiringId, instant, revision, unique } from "../collaboration/hiring.validation";

export const roomInputSchema = z.strictObject({ title: z.string().trim().min(1).max(100), kind: z.enum(["interview", "meeting"]),
  applicationId: hiringId.nullable(), teamId: hiringId.nullable(), participantIds: unique(z.string().min(1).max(128), 11, 1), startsAt: instant, endsAt: instant,
}).refine((v) => (v.kind === "interview" ? v.applicationId !== null && v.teamId === null && v.participantIds.length === 1 : v.teamId !== null && v.applicationId === null)
  && Date.parse(v.endsAt) > Date.parse(v.startsAt) && Date.parse(v.endsAt) - Date.parse(v.startsAt) <= 4 * 3600000);
export const roomEpochSchema = z.strictObject({ expectedEpoch: revision.refine((v) => v > 0) });
export const roomHostSchema = z.strictObject({ expectedEpoch: revision.refine((v) => v > 0), action: z.enum(["admit", "remove", "end"]), targetAccountId: z.string().min(1).max(128).nullable() });
export const roomMessageSchema = z.strictObject({ expectedEpoch: revision.refine((v) => v > 0), audience: z.enum(["lobby", "admitted"]), text: z.string().trim().min(1).max(2000) });
