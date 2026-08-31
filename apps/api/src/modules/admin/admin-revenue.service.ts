import { BadRequestException, Injectable } from "@nestjs/common";
import { and, desc, eq, ne, sql, type SQL } from "drizzle-orm";

import {
  db,
  monetizationPlans,
  revenueLedger,
} from "../../db";

import { 
  RevenueStatus, toNumber, parsePositiveInt, toPlainObject, parsePlanPayload, 
  parseRevenueQuery, 
  parseRevenueStatusPayload, parseRevenueSettlePayload, 
  parseRevenueStatus, statusLabel, 
  normalizeRevenueEvent, canTransitionRevenueStatus, 
  requireAdminUser, ensureAdminSchema, 
  logAuditAction,
  PlanPayload, RevenueQuery, DAY_MS, RevenueStatusPayload, RevenueSettlePayload
} from "./admin-types";

@Injectable()
export class AdminRevenueService {
async getPlans(userId: string) {
    await ensureAdminSchema();
    await requireAdminUser(userId);

    const rows = await db.select().from(monetizationPlans).orderBy(desc(monetizationPlans.updatedAt));
    return {
      items: rows.map((row) => ({
        ...row,
        perks: row.perks ?? [],
      })),
      currency: "KRW",
    };
  }

async upsertPlan(userId: string, payload: PlanPayload) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const parsed = parsePlanPayload(payload);

    if (parsed.id) {
      const [existing] = await db
        .select({ id: monetizationPlans.id })
        .from(monetizationPlans)
        .where(eq(monetizationPlans.id, parsed.id))
        .limit(1);
      if (!existing) throw new BadRequestException("수정 대상 플랜을 찾을 수 없습니다.");

      const [duplicate] = await db
        .select({ id: monetizationPlans.id })
        .from(monetizationPlans)
        .where(and(eq(monetizationPlans.code, parsed.code), ne(monetizationPlans.id, parsed.id)))
        .limit(1);
      if (duplicate) {
        throw new BadRequestException("동일한 플랜 코드가 이미 존재합니다.");
      }

      const [updated] = await db
        .update(monetizationPlans)
        .set({
          code: parsed.code,
          name: parsed.name,
          description: parsed.description,
          intervalDays: parsed.intervalDays,
          currency: parsed.currency,
          priceCents: parsed.priceCents,
          perks: parsed.perks,
          isActive: parsed.isActive,
          updatedAt: new Date(),
        })
        .where(eq(monetizationPlans.id, parsed.id))
        .returning();

      return {
        ok: true,
        item: updated ?? null,
      };
    }

    const [duplicate] = await db
      .select({ id: monetizationPlans.id })
      .from(monetizationPlans)
      .where(eq(monetizationPlans.code, parsed.code))
      .limit(1);
    if (duplicate) throw new BadRequestException("중복된 플랜 코드입니다.");

    const inserted = await db
      .insert(monetizationPlans)
      .values({
        code: parsed.code,
        name: parsed.name,
        description: parsed.description,
        intervalDays: parsed.intervalDays,
        currency: parsed.currency,
        priceCents: parsed.priceCents,
        perks: parsed.perks,
        isActive: parsed.isActive,
      })
      .returning();

    return {
      ok: true,
      item: inserted[0] ?? null,
    };
  }

async getRevenue(userId: string, days: number, query: RevenueQuery = {}) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const normalizedDays = parsePositiveInt(days, 30, 1, 365);
    const parsedQuery = parseRevenueQuery(query);

    const now = Date.now();
    const from = now - normalizedDays * DAY_MS;
    // timestamp 컬럼은 epoch-ms 숫자와 비교 불가 — Date로 바인딩(대시보드와 동일 수정).
    const where: SQL[] = [sql`${revenueLedger.createdAt} >= ${new Date(from)}`];
    if (parsedQuery.status !== "all") where.push(eq(revenueLedger.status, parsedQuery.status));
    const whereClause = where.length === 1 ? where[0] : and(...where);

    const [periodSummary, plans, events] = await Promise.all([
      db
      .select({
        pendingAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'pending' then ${revenueLedger.amountCents} else 0 end), 0)`.as("pendingAmount"),
        approvedAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'approved' then ${revenueLedger.amountCents} else 0 end), 0)`.as("approvedAmount"),
        paidAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'paid' then ${revenueLedger.amountCents} else 0 end), 0)`.as("paidAmount"),
        rejectedAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'rejected' then ${revenueLedger.amountCents} else 0 end), 0)`.as("rejectedAmount"),
        revokedAmount: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'revoked' then ${revenueLedger.amountCents} else 0 end), 0)`.as("revokedAmount"),
        pendingEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'pending' then 1 else 0 end), 0)`.as("pendingEvents"),
        approvedEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'approved' then 1 else 0 end), 0)`.as("approvedEvents"),
        paidEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'paid' then 1 else 0 end), 0)`.as("paidEvents"),
        rejectedEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'rejected' then 1 else 0 end), 0)`.as("rejectedEvents"),
        revokedEvents: sql<number>`coalesce(sum(case when ${revenueLedger.status} = 'revoked' then 1 else 0 end), 0)`.as("revokedEvents"),
      })
      .from(revenueLedger)
      .where(whereClause),

      db
      .select({
        planId: revenueLedger.planId,
        planName: sql<string>`max(${monetizationPlans.name})`.as("planName"),
        events: sql<number>`count(*)`.as("events"),
        amountCents: sql<number>`coalesce(sum(${revenueLedger.amountCents}), 0)`.as("amountCents"),
      })
      .from(revenueLedger)
      .leftJoin(monetizationPlans, eq(monetizationPlans.id, revenueLedger.planId))
        .where(whereClause)
        .groupBy(revenueLedger.planId)
        .orderBy(desc(sql<number>`coalesce(sum(${revenueLedger.amountCents}), 0)`))
        .limit(10),

      db
      .select({
        id: revenueLedger.id,
        status: revenueLedger.status,
        kind: revenueLedger.kind,
        amountCents: revenueLedger.amountCents,
        currency: revenueLedger.currency,
        planId: revenueLedger.planId,
        campaignId: revenueLedger.campaignId,
        payerId: revenueLedger.payerId,
        recipientId: revenueLedger.recipientId,
        reviewedBy: revenueLedger.reviewedBy,
        reviewedAt: revenueLedger.reviewedAt,
        reviewNote: revenueLedger.reviewNote,
        settledAt: revenueLedger.settledAt,
        createdAt: revenueLedger.createdAt,
        updatedAt: revenueLedger.createdAt,
        metadata: revenueLedger.metadata,
      })
      .from(revenueLedger)
      .orderBy(desc(revenueLedger.createdAt))
      .where(whereClause)
      .limit(24),
    ]);

    const summary = periodSummary ?? {};
    return {
      period: {
        from: new Date(from).toISOString(),
        to: new Date(now).toISOString(),
        days: normalizedDays,
      },
      currency: "KRW",
      summary: {
        pendingAmountCents: toNumber(summary.pendingAmount),
        approvedAmountCents: toNumber(summary.approvedAmount),
        paidAmountCents: toNumber(summary.paidAmount),
        rejectedAmountCents: toNumber(summary.rejectedAmount),
        revokedAmountCents: toNumber(summary.revokedAmount),
        pendingEvents: toNumber(summary.pendingEvents),
        approvedEvents: toNumber(summary.approvedEvents),
        paidEvents: toNumber(summary.paidEvents),
        rejectedEvents: toNumber(summary.rejectedEvents),
        revokedEvents: toNumber(summary.revokedEvents),
        totalEvents:
          toNumber(summary.pendingEvents) +
          toNumber(summary.approvedEvents) +
          toNumber(summary.paidEvents) +
          toNumber(summary.rejectedEvents) +
          toNumber(summary.revokedEvents),
      },
      plans: plans.map((plan) => ({
        planId: plan.planId,
        planName: (plan.planName as string | null) ?? null,
        events: toNumber(plan.events),
        amountCents: toNumber(plan.amountCents),
      })),
      events: events.map((event) => ({
        ...event,
        metadata: toPlainObject(event.metadata),
        status: parseRevenueStatus(event.status) ?? "pending",
        reviewedBy: event.reviewedBy ? String(event.reviewedBy) : null,
        reviewedAt: event.reviewedAt ? new Date(event.reviewedAt).toISOString() : null,
        reviewNote: event.reviewNote ?? null,
        settledAt: event.settledAt ? new Date(event.settledAt).toISOString() : null,
        createdAt: event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString(),
      })),
      generatedAt: new Date().toISOString(),
    };
  }

async setRevenueStatus(userId: string, eventId: string, payload: RevenueStatusPayload) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const parsed = parseRevenueStatusPayload(payload, eventId);

    const [row] = await db
      .select({
        id: revenueLedger.id,
        status: revenueLedger.status,
      })
      .from(revenueLedger)
      .where(eq(revenueLedger.id, parsed.id))
      .limit(1);

    if (!row?.id) throw new BadRequestException("수익 이벤트를 찾을 수 없습니다.");
    const currentStatus = parseRevenueStatus(row.status);
    if (!currentStatus) throw new BadRequestException("수익 이벤트 상태가 손상되어 있습니다.");
    if (!canTransitionRevenueStatus(currentStatus, parsed.status)) {
      throw new BadRequestException(`${statusLabel(currentStatus)} 상태는 ${statusLabel(parsed.status)}로 바로 변경할 수 없습니다.`);
    }

    const updates: Record<string, unknown> = {
      status: parsed.status,
      reviewedBy: userId,
      reviewedAt: new Date(),
      ...(parsed.note !== undefined ? { reviewNote: parsed.note } : {}),
    };
    if (parsed.status !== "paid") updates.settledAt = null;

    const updatedRows = await db
      .update(revenueLedger)
      .set(updates)
      .where(eq(revenueLedger.id, parsed.id))
      .returning();
    if (!updatedRows[0]) throw new BadRequestException("상태 변경에 실패했습니다.");

    const [full] = await db
      .select()
      .from(revenueLedger)
      .where(eq(revenueLedger.id, parsed.id))
      .limit(1);

    if (!full) {
      throw new BadRequestException("상태 반영 후 이벤트를 읽어오지 못했습니다.");
    }

    return {
      ok: true,
      event: normalizeRevenueEvent(full),
    };
  }

async settleRevenueEvent(userId: string, eventId: string, payload: RevenueSettlePayload) {
    await ensureAdminSchema();
    await requireAdminUser(userId);
    const parsed = parseRevenueSettlePayload(payload, eventId);

    const [row] = await db
      .select({ id: revenueLedger.id, status: revenueLedger.status })
      .from(revenueLedger)
      .where(eq(revenueLedger.id, parsed.id))
      .limit(1);

    if (!row?.id) throw new BadRequestException("수익 이벤트를 찾을 수 없습니다.");
    const currentStatus = parseRevenueStatus(row.status);
    if (!currentStatus) throw new BadRequestException("수익 이벤트 상태가 손상되어 있습니다.");
    if (currentStatus !== "paid") {
      throw new BadRequestException("정산은 지급 완료 상태에서만 처리할 수 있습니다.");
    }

    const updatedRows = await db
    .update(revenueLedger)
      .set({
        settledAt: parsed.settledAt,
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNote: parsed.note ?? undefined,
      })
      .where(eq(revenueLedger.id, parsed.id))
      .returning();
    const updated = updatedRows[0];
    if (!updated) throw new BadRequestException("정산 처리에 실패했습니다.");
    const [full] = await db
      .select()
      .from(revenueLedger)
      .where(eq(revenueLedger.id, parsed.id))
      .limit(1);
    if (!full) throw new BadRequestException("정산 처리 후 이벤트를 읽어오지 못했습니다.");

    return {
      ok: true,
      event: normalizeRevenueEvent(full),
    };
  }

async exportRevenueCsv(userId: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    const rows = await db
      .select({
        id: revenueLedger.id,
        payerId: revenueLedger.payerId,
        recipientId: revenueLedger.recipientId,
        kind: revenueLedger.kind,
        status: revenueLedger.status,
        amountCents: revenueLedger.amountCents,
        currency: revenueLedger.currency,
        settledAt: revenueLedger.settledAt,
        createdAt: revenueLedger.createdAt,
      })
      .from(revenueLedger)
      .orderBy(desc(revenueLedger.createdAt))
      .limit(5000);

    const header = "ID,PayerID,RecipientID,Kind,Status,AmountCents,Currency,SettledAt,CreatedAt\n";
    const body = rows
      .map(
        (r) =>
          `"${r.id}","${r.payerId}","${r.recipientId}","${r.kind}","${r.status}",${r.amountCents},"${r.currency}","${r.settledAt ? new Date(r.settledAt).toISOString() : ""}","${r.createdAt ? new Date(r.createdAt).toISOString() : ""}"`
      )
      .join("\n");

    return header + body;
  }

async bulkSetRevenueStatus(userId: string, eventIds: string[], status: RevenueStatus, note?: string) {
    await requireAdminUser(userId);
    if (!Array.isArray(eventIds) || !eventIds.length) {
      throw new BadRequestException("대상 정산건을 선택해 주세요.");
    }
    await Promise.all(eventIds.map((id) => this.setRevenueStatus(userId, id, { status, note })));
    void logAuditAction(userId, "REVENUE_BULK_STATUS_CHANGE", "revenue", null, { eventIds, status, note });
    return { ok: true, count: eventIds.length };
  }
}
