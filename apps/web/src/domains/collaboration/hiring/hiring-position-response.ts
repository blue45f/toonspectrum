import { z } from "zod";

import { CREATOR_HIRING_MODELS, CREATOR_HIRING_ROLES } from "../../../../../../packages/contracts/src/creator-hiring";

import type { CreatorHiringModel, CreatorHiringRole, HiringPositionPage } from "../../../../../../packages/contracts/src/creator-hiring";

const roles = Object.keys(CREATOR_HIRING_ROLES) as [CreatorHiringRole, ...CreatorHiringRole[]];
const models = Object.keys(CREATOR_HIRING_MODELS) as [CreatorHiringModel, ...CreatorHiringModel[]];
const text = z.string().max(20000);
const time = z.iso.datetime({ offset: true });
const nonnegative = z.number().finite().nonnegative();
const pageSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(200),
    postId: z.string().min(1).max(200),
    postTitle: text,
    revision: z.number().int().positive(),
    terms: z.object({
      model: z.enum(models), role: z.enum(roles), publicScope: text,
      quantity: nonnegative, quantityUnit: z.enum(["cut", "episode", "page", "task"]),
      startsAt: time, dueAt: time, timeZone: z.string().max(100),
      compensation: z.enum(["paid", "unpaid", "revenue-share"]), currency: z.literal("KRW"),
      minRate: nonnegative, maxRate: nonnegative, rateUnit: z.enum(["hour", "cut", "episode", "task"]),
      tools: z.array(text).max(100), formats: z.array(text).max(100),
      revisionRounds: z.number().int().nonnegative(), acceptanceCriteria: text,
      ndaRequired: z.boolean(), creditPolicy: text,
      portfolioPolicy: z.enum(["allowed", "approval-required", "prohibited"]),
      aiPolicy: z.enum(["allowed", "approval-required", "prohibited"]),
    }),
  })).max(30),
  next: z.string().min(1).max(500).nullable(),
});

/** An optional hiring section must not crash the host post or turn invalid data into an empty result. */
export function parseHiringPositionPage(input: unknown): HiringPositionPage {
  const result = pageSchema.safeParse(input);
  if (!result.success) throw new Error("공개 모집 조건의 응답 형식을 확인하지 못했어요.");
  return result.data;
}
