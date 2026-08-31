import { BadRequestException, Injectable } from "@nestjs/common";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";

import {
  creatorCampaigns,
  db,
  monetizationPlans,
  users,
} from "../../db";

import { 
  toNumber, escapeLike, parseString, parseCampaignQuery, parseCampaignPayload, requireAdminUser, ensureCreatorExists, ensureCampaignPlanExists, 
  ensureAdminSchema, 
  CampaignQuery, CampaignPayload, CampaignResponseRow
} from "./admin-types";

@Injectable()
export class AdminCampaignsService {
async getCampaigns(userId: string, query: CampaignQuery = {}) {
    await ensureAdminSchema();
    await requireAdminUser(userId);

    const parsed = parseCampaignQuery(query);

    const baseSelect = db
      .select({
        id: creatorCampaigns.id,
        creatorId: creatorCampaigns.creatorId,
        titleId: creatorCampaigns.titleId,
        planId: creatorCampaigns.planId,
        title: creatorCampaigns.title,
        description: creatorCampaigns.description,
        targetAmountCents: creatorCampaigns.targetAmountCents,
        raisedAmountCents: creatorCampaigns.raisedAmountCents,
        isActive: creatorCampaigns.isActive,
        startsAt: creatorCampaigns.startsAt,
        endsAt: creatorCampaigns.endsAt,
        createdAt: creatorCampaigns.createdAt,
        updatedAt: creatorCampaigns.updatedAt,
        creatorName: users.name,
        creatorEmail: users.email,
        planName: monetizationPlans.name,
        planCode: monetizationPlans.code,
      })
      .from(creatorCampaigns)
      .leftJoin(users, eq(users.id, creatorCampaigns.creatorId))
      .leftJoin(monetizationPlans, eq(monetizationPlans.id, creatorCampaigns.planId));

    const conditions: SQL[] = [];
    if (parsed.creatorId) conditions.push(eq(creatorCampaigns.creatorId, parsed.creatorId));
    if (parsed.isActive !== null) conditions.push(eq(creatorCampaigns.isActive, parsed.isActive));
    if (parsed.title) {
      conditions.push(sql`lower(${creatorCampaigns.title}) like ${"%" + escapeLike(parsed.title.toLowerCase()) + "%"}`);
    }

    const rows = conditions.length
      ? await baseSelect.where(and(...conditions)).orderBy(desc(creatorCampaigns.updatedAt))
      : await baseSelect.orderBy(desc(creatorCampaigns.updatedAt));

    return {
      items: rows.map((row: CampaignResponseRow) => ({
        ...row,
        creatorId: String(row.creatorId),
        titleId: row.titleId ?? null,
        planId: row.planId ?? null,
        description: String(row.description ?? ""),
        targetAmountCents: toNumber(row.targetAmountCents),
        raisedAmountCents: toNumber(row.raisedAmountCents),
        isActive: Boolean(row.isActive),
        startsAt: row.startsAt ? String(row.startsAt) : null,
        endsAt: row.endsAt ? String(row.endsAt) : null,
        createdAt: String(row.createdAt),
        updatedAt: String(row.updatedAt),
        creatorName: row.creatorName ?? null,
        creatorEmail: row.creatorEmail ?? null,
        planName: row.planName ?? null,
        planCode: row.planCode ?? null,
      })),
      currency: "KRW",
    };
  }

  async upsertCampaign(userId: string, payload: CampaignPayload) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const parsed = parseCampaignPayload(payload);

    const checks: Promise<void>[] = [ensureCreatorExists(parsed.creatorId)];
    if (parsed.planId) checks.push(ensureCampaignPlanExists(parsed.planId));
    await Promise.all(checks);

    if (parsed.id) {
      const [existing] = await db
        .select({ id: creatorCampaigns.id })
        .from(creatorCampaigns)
        .where(eq(creatorCampaigns.id, parsed.id))
        .limit(1);
      if (!existing) throw new BadRequestException("수정 대상 캠페인을 찾을 수 없습니다.");

      const [updated] = await db
        .update(creatorCampaigns)
        .set({
          creatorId: parsed.creatorId,
          titleId: parsed.titleId,
          planId: parsed.planId,
          title: parsed.title,
          description: parsed.description,
          targetAmountCents: parsed.targetAmountCents,
          raisedAmountCents: parsed.raisedAmountCents,
          isActive: parsed.isActive,
          startsAt: parsed.startsAt,
          endsAt: parsed.endsAt,
          updatedAt: new Date(),
        })
        .where(eq(creatorCampaigns.id, parsed.id))
        .returning();

      return {
        ok: true,
        item: updated ?? null,
      };
    }

    const inserted = await db
      .insert(creatorCampaigns)
      .values({
        creatorId: parsed.creatorId,
        titleId: parsed.titleId,
        planId: parsed.planId,
        title: parsed.title,
        description: parsed.description,
        targetAmountCents: parsed.targetAmountCents,
        raisedAmountCents: parsed.raisedAmountCents,
        isActive: parsed.isActive,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
      })
      .returning();

    return {
      ok: true,
      item: inserted[0] ?? null,
    };
  }

async deleteCampaign(userId: string, campaignId: string) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const id = parseString(campaignId, "", 64);
    if (!id) throw new BadRequestException("캠페인 id가 필요합니다.");

    const [deleted] = await db
      .delete(creatorCampaigns)
      .where(eq(creatorCampaigns.id, id))
      .returning({ id: creatorCampaigns.id });

    if (!deleted?.id) throw new BadRequestException("삭제할 캠페인을 찾을 수 없습니다.");

    return { ok: true, deletedId: deleted.id };
  }
}
