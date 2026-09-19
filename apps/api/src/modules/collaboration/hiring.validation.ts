import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import { CREATOR_HIRING_ROLES, HIRING_FORMATS, HIRING_TOOLS } from "../../../../../packages/contracts/src/creator-hiring";

export const hiringId = z.uuid();
export const revision = z.number().int().min(0).max(2147483646);
const text = (max: number, min = 1) => z.string().trim().min(min).max(max).refine((v) => [...v].every((c) => { const n = c.charCodeAt(0); return n >= 32 || n === 9 || n === 10 || n === 13; }));
export const hiringRole = z.enum(Object.keys(CREATOR_HIRING_ROLES) as [keyof typeof CREATOR_HIRING_ROLES, ...(keyof typeof CREATOR_HIRING_ROLES)[]]);
export const unique = <T extends z.ZodType>(schema: T, max: number, min = 0) => z.array(schema).min(min).max(max).refine((v) => new Set(v).size === v.length);
export const toolsSchema = unique(z.enum(HIRING_TOOLS), 12);
export const formatsSchema = unique(z.enum(HIRING_FORMATS), 12);
// Links only. Never fetch these URLs on the server or turn them into embedded media.
export const portfolioUrl = text(500).refine((raw) => {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && !url.hostname.includes(":") && !/^\d+(\.\d+)*$/u.test(url.hostname)
      && url.hostname.includes(".") && !/(^|\.)(localhost|local|internal|test|invalid)$/iu.test(url.hostname);
  } catch { return false; }
});
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u).refine((v) => v >= "1900-01" && v <= "2200-12");
export const resumeContentSchema = z.strictObject({
  penName: text(60), summary: text(1500, 0), roles: unique(hiringRole, 6, 1), tools: toolsSchema, formats: formatsSchema,
  languages: unique(text(30), 8),
  experiences: z.array(z.strictObject({ title: text(100), role: hiringRole, startMonth: month,
    endMonth: month.nullable(), episodeFrom: z.number().int().min(0).max(100000).nullable(),
    episodeTo: z.number().int().min(0).max(100000).nullable(), contribution: text(800),
  }).refine((v) => (!v.endMonth || v.startMonth <= v.endMonth)
    && ((v.episodeFrom === null && v.episodeTo === null) || (v.episodeFrom !== null && v.episodeTo !== null && v.episodeFrom <= v.episodeTo)))).max(20),
  portfolio: z.array(z.strictObject({ title: text(100), url: portfolioUrl, contribution: text(500), permission: z.enum(["owned", "authorized"]) })).max(12),
});
export const resumeInputSchema = z.strictObject({ title: text(100), content: resumeContentSchema, expectedRevision: revision });
export const submissionSchema = z.strictObject({ resumeVersionId: hiringId, portfolioIndexes: unique(z.number().int().min(0).max(11), 12),
  message: text(2500, 20), contact: text(250), consentRevision: z.literal("2026-09-20"),
  expectedPostVersion: revision.refine((v) => v > 0), mutationId: hiringId,
});
export function parseHiring<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException("입력 항목의 형식과 길이를 확인해 주세요.");
  return parsed.data;
}

export const instant = z.iso.datetime({ offset: true }).refine((v) => Number.isFinite(Date.parse(v)));
export const rateUnit = z.enum(["hour", "cut", "episode", "task"]);
const money = z.number().int().min(0).max(1000000000);
export const slotTermsSchema = z.strictObject({
  model: z.enum(["employment", "freelance-task", "co-creation", "partial-collaboration"]), role: hiringRole,
  publicScope: text(1200), quantity: z.number().int().min(1).max(100000), quantityUnit: z.enum(["cut", "episode", "page", "task"]),
  startsAt: instant, dueAt: instant, timeZone: text(80).refine((v) => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } }),
  compensation: z.enum(["paid", "unpaid", "revenue-share"]), currency: z.literal("KRW"), minRate: money, maxRate: money,
  rateUnit, tools: toolsSchema, formats: formatsSchema, revisionRounds: z.number().int().min(0).max(30), acceptanceCriteria: text(1500),
  ndaRequired: z.boolean(), creditPolicy: text(500), portfolioPolicy: z.enum(["allowed", "approval-required", "prohibited"]), aiPolicy: z.enum(["allowed", "approval-required", "prohibited"]),
}).refine((v) => Date.parse(v.dueAt) > Date.parse(v.startsAt) && Date.parse(v.dueAt) - Date.parse(v.startsAt) <= 366 * 86400000
  && v.maxRate >= v.minRate && (v.compensation === "paid" ? v.minRate > 0 : v.minRate === 0 && v.maxRate === 0)
  && (!["employment", "freelance-task"].includes(v.model) || v.compensation === "paid")
  && v.compensation !== "revenue-share");
export const slotInputSchema = z.strictObject({ terms: slotTermsSchema, expectedRevision: revision, expectedPostVersion: revision.refine((v) => v > 0) });
export const slotStateSchema = z.strictObject({ state: z.enum(["open", "paused", "cancelled"]), expectedRevision: revision.refine((v) => v > 0) });
export const availabilitySchema = z.strictObject({ startsAt: instant, endsAt: instant, roles: unique(hiringRole, 6, 1), tools: toolsSchema, formats: formatsSchema,
  capacity: z.number().int().min(1).max(24), minRate: money, rateUnit, discoverable: z.boolean(), notificationOptIn: z.boolean(), expectedRevision: revision,
}).refine((v) => Date.parse(v.startsAt) < Date.parse(v.endsAt));
export const offerInputSchema = z.strictObject({ candidateId: text(128), expectedRevision: revision.refine((v) => v > 0), expiresAt: instant, mutationId: hiringId });
export const mutationSchema = z.strictObject({ mutationId: hiringId });
export const offerActionSchema = z.strictObject({ action: z.enum(["decline", "cancel"]), mutationId: hiringId });
