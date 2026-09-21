import { z } from "zod";

import { canonicalJson } from "../ir/digest";

import { isoTimestampSchema, studioEntityIdSchema } from "./ids";
import { reviewPolicyCommandSchema, reviewPolicyPinSchema } from "./review-policy";

const version = z.number().int().positive().max(2_147_483_647);
export const reviewPolicyHistoryQuerySchema = z.object({ beforeStateVersion: z.union([version, z.string().regex(/^[1-9]\d{0,9}$/u).transform(Number).pipe(version)]).optional() }).strict();
export const reviewPolicyHistoryEntrySchema = z.object({
  id: studioEntityIdSchema, policyVersion: version, stateVersion: version,
  actorId: studioEntityIdSchema, createdAt: isoTimestampSchema, command: reviewPolicyCommandSchema,
}).strict().refine((entry) => entry.id === entry.command.id && entry.stateVersion === entry.command.expectedStateVersion + 1
  && entry.policyVersion === entry.command.expectedPolicyVersion + (entry.command.type === "configure" ? 1 : 0), "History identity or sequence mismatch");
export const reviewPolicyHistoryResponseSchema = z.object({
  pin: reviewPolicyPinSchema, actorId: studioEntityIdSchema,
  entries: z.array(reviewPolicyHistoryEntrySchema).max(25), nextBeforeStateVersion: version.nullable(),
}).strict().refine((page) => page.entries.every((entry, index) => canonicalJson(entry.command.pin) === canonicalJson(page.pin)
  && (index === 0 || entry.stateVersion < page.entries[index - 1]!.stateVersion))
  && (page.nextBeforeStateVersion === null || (page.entries.length === 25 && page.nextBeforeStateVersion === page.entries.at(-1)!.stateVersion)), "History page mismatch");
export type ReviewPolicyHistoryQuery = z.infer<typeof reviewPolicyHistoryQuerySchema>;
export type ReviewPolicyHistoryResponse = z.infer<typeof reviewPolicyHistoryResponseSchema>;
