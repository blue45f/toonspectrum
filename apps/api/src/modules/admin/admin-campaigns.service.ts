import { BadRequestException, Injectable } from "@nestjs/common";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";

import {
  creatorCampaigns,
  db,
  monetizationPlans,
  revenueLedger,
  users,
} from "../../db";

import {
  type CampaignPayload,
  type CampaignQuery,
  type CampaignResponseRow,
  ensureAdminSchema,
  ensureCampaignPlanExists,
  ensureCreatorExists,
  escapeLike,
  logAuditAction,
  parseCampaignPayload,
  parseCampaignQuery,
  parseString,
  requireAdminUser,
  toNumber,
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
        raisedAmountCents: sql<number>`coalesce((
          select sum(${revenueLedger.amountCents})
          from ${revenueLedger}
          where ${revenueLedger.campaignId} = ${creatorCampaigns.id}
            and ${revenueLedger.status} = 'paid'
            and ${revenueLedger.currency} = 'KRW'
        ), 0)`,
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
      .leftJoin(
        monetizationPlans,
        eq(monetizationPlans.id, creatorCampaigns.planId),
      );

    const conditions: SQL[] = [];
    if (parsed.creatorId) {
      conditions.push(eq(creatorCampaigns.creatorId, parsed.creatorId));
    }
    if (parsed.isActive !== null) {
      conditions.push(eq(creatorCampaigns.isActive, parsed.isActive));
    }
    if (parsed.title) {
      conditions.push(
        sql`lower(${creatorCampaigns.title}) like ${`%${escapeLike(parsed.title.toLowerCase())}%`}`,
      );
    }

    const rows = conditions.length
      ? await baseSelect
          .where(and(...conditions))
          .orderBy(desc(creatorCampaigns.updatedAt))
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
    // Raised funds are ledger-derived. Ignore any legacy/admin caller attempting
    // to submit an aggregate directly; new campaigns always begin at zero.
    const parsed = parseCampaignPayload({
      ...payload,
      raisedAmountCents: 0,
    });

    const checks: Promise<void>[] = [ensureCreatorExists(parsed.creatorId)];
    if (parsed.planId) checks.push(ensureCampaignPlanExists(parsed.planId));
    await Promise.all(checks);

    if (parsed.id) {
      const [existing] = await db
        .select({ id: creatorCampaigns.id })
        .from(creatorCampaigns)
        .where(eq(creatorCampaigns.id, parsed.id))
        .limit(1);
      if (!existing) {
        throw new BadRequestException("수정 대상 캠페인을 찾을 수 없습니다.");
      }

      const [updated] = await db
        .update(creatorCampaigns)
        .set({
          creatorId: parsed.creatorId,
          titleId: parsed.titleId,
          planId: parsed.planId,
          title: parsed.title,
          description: parsed.description,
          targetAmountCents: parsed.targetAmountCents,
          isActive: parsed.isActive,
          startsAt: parsed.startsAt,
          endsAt: parsed.endsAt,
          updatedAt: new Date(),
        })
        .where(eq(creatorCampaigns.id, parsed.id))
        .returning();

      void logAuditAction(
        userId,
        "CAMPAIGN_UPDATE",
        "campaign",
        parsed.id,
        {
          creatorId: parsed.creatorId,
          planId: parsed.planId,
          titleId: parsed.titleId,
          title: parsed.title,
          targetAmountCents: parsed.targetAmountCents,
          isActive: parsed.isActive,
        },
      );
      return { ok: true, item: updated ?? null };
    }

    const [inserted] = await db
      .insert(creatorCampaigns)
      .values({
        creatorId: parsed.creatorId,
        titleId: parsed.titleId,
        planId: parsed.planId,
        title: parsed.title,
        description: parsed.description,
        targetAmountCents: parsed.targetAmountCents,
        raisedAmountCents: 0,
        isActive: parsed.isActive,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
      })
      .returning();

    if (inserted) {
      void logAuditAction(
        userId,
        "CAMPAIGN_CREATE",
        "campaign",
        inserted.id,
        {
          creatorId: parsed.creatorId,
          planId: parsed.planId,
          titleId: parsed.titleId,
          title: parsed.title,
          targetAmountCents: parsed.targetAmountCents,
          isActive: parsed.isActive,
        },
      );
    }
    return { ok: true, item: inserted ?? null };
  }

  async deleteCampaign(userId: string, campaignId: string) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const id = parseString(campaignId, "", 64);
    if (!id) throw new BadRequestException("캠페인 id가 필요합니다.");

    const [linkedRevenue] = await db
      .select({ id: revenueLedger.id })
      .from(revenueLedger)
      .where(eq(revenueLedger.campaignId, id))
      .limit(1);
    if (linkedRevenue) {
      throw new BadRequestException(
        "후원 거래가 연결된 캠페인은 삭제할 수 없습니다. 비활성화해 주세요.",
      );
    }

    const [deleted] = await db
      .delete(creatorCampaigns)
      .where(eq(creatorCampaigns.id, id))
      .returning({ id: creatorCampaigns.id });
    if (!deleted?.id) {
      throw new BadRequestException("삭제할 캠페인을 찾을 수 없습니다.");
    }

    void logAuditAction(userId, "CAMPAIGN_DELETE", "campaign", id, {});
    return { ok: true, deletedId: deleted.id };
  }
}
