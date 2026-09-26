import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import {
  CREATOR_SUPPORT_CATEGORIES,
  isCreatorSupportStatus,
  validateCreatorSupportApplication,
  validateCreatorSupportOffer,
  type CreatorSupportCategory,
  type CreatorSupportProject,
} from "../../../../../packages/core/src/creator-support";
import {
  creatorSupportApplications,
  creatorSupportOffers,
  db,
  users,
} from "../../platform/database";
import { isOfficialUser } from "../../server/feedback";

import { resolveCreatorSupportPayoutConfig } from "./creator-support.config";

const CONSENT_VERSION = "creator-support-2026-09-18";
const OFFER_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_OFFERS_PER_PROJECT_PER_DAY = 5;
const PAYOUT_STATUSES = new Set([
  "not_ready",
  "contract_required",
  "kyc_required",
  "ready",
  "blocked",
]);

function safeString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function projectFromRow(row: {
  id: string;
  creatorId: string;
  creatorName: string | null;
  category: CreatorSupportCategory;
  title: string;
  story: string;
  intendedUse: string;
  supportNeeds: readonly string[];
  portfolioUrl: string;
  estimatedBudgetWon: number;
  monetarySupportEnabled: boolean;
  payoutStatus: string;
  createdAt: Date;
}): CreatorSupportProject {
  const payoutConfig = resolveCreatorSupportPayoutConfig();
  return {
    id: row.id,
    creatorId: row.creatorId,
    creatorName: row.creatorName?.trim() || "ToonSpectrum Creator",
    category: row.category,
    title: row.title,
    story: row.story,
    intendedUse: row.intendedUse,
    supportNeeds: row.supportNeeds as CreatorSupportProject["supportNeeds"],
    portfolioUrl: row.portfolioUrl,
    estimatedBudgetWon: row.estimatedBudgetWon,
    monetarySupportEnabled:
      payoutConfig.ready
      && row.payoutStatus === "ready"
      && row.monetarySupportEnabled,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class CreatorSupportService {
  async listPublicProjects(categoryValue: unknown) {
    const category =
      typeof categoryValue === "string"
      && (CREATOR_SUPPORT_CATEGORIES as readonly string[]).includes(categoryValue)
        ? categoryValue as CreatorSupportCategory
        : null;
    const where = category
      ? and(
          eq(creatorSupportApplications.status, "approved"),
          eq(creatorSupportApplications.category, category),
        )
      : eq(creatorSupportApplications.status, "approved");
    const rows = await db
      .select({
        id: creatorSupportApplications.id,
        creatorId: creatorSupportApplications.creatorId,
        creatorName: users.name,
        category: creatorSupportApplications.category,
        title: creatorSupportApplications.title,
        story: creatorSupportApplications.story,
        intendedUse: creatorSupportApplications.intendedUse,
        supportNeeds: creatorSupportApplications.supportNeeds,
        portfolioUrl: creatorSupportApplications.portfolioUrl,
        estimatedBudgetWon: creatorSupportApplications.estimatedBudgetWon,
        monetarySupportEnabled: creatorSupportApplications.monetarySupportEnabled,
        payoutStatus: creatorSupportApplications.payoutStatus,
        createdAt: creatorSupportApplications.createdAt,
      })
      .from(creatorSupportApplications)
      .leftJoin(users, eq(users.id, creatorSupportApplications.creatorId))
      .where(where)
      .orderBy(desc(creatorSupportApplications.updatedAt))
      .limit(100);
    return {
      items: rows.map(projectFromRow),
      monetarySupport: resolveCreatorSupportPayoutConfig(),
    };
  }

  async getPublicProject(idValue: string) {
    const id = safeString(idValue, 100);
    const [row] = await db
      .select({
        id: creatorSupportApplications.id,
        creatorId: creatorSupportApplications.creatorId,
        creatorName: users.name,
        category: creatorSupportApplications.category,
        title: creatorSupportApplications.title,
        story: creatorSupportApplications.story,
        intendedUse: creatorSupportApplications.intendedUse,
        supportNeeds: creatorSupportApplications.supportNeeds,
        portfolioUrl: creatorSupportApplications.portfolioUrl,
        estimatedBudgetWon: creatorSupportApplications.estimatedBudgetWon,
        monetarySupportEnabled: creatorSupportApplications.monetarySupportEnabled,
        payoutStatus: creatorSupportApplications.payoutStatus,
        createdAt: creatorSupportApplications.createdAt,
      })
      .from(creatorSupportApplications)
      .leftJoin(users, eq(users.id, creatorSupportApplications.creatorId))
      .where(and(
        eq(creatorSupportApplications.id, id),
        eq(creatorSupportApplications.status, "approved"),
      ))
      .limit(1);
    if (!row) throw new NotFoundException("지원 프로젝트를 찾을 수 없어요.");
    return projectFromRow(row);
  }

  async getMyApplication(userId: string) {
    const uid = await this.requireUser(userId);
    const [row] = await db
      .select()
      .from(creatorSupportApplications)
      .where(eq(creatorSupportApplications.creatorId, uid))
      .orderBy(desc(creatorSupportApplications.updatedAt))
      .limit(1);
    return { item: row ?? null };
  }

  async submitApplication(userId: string, input: unknown) {
    const uid = await this.requireUser(userId);
    const validated = validateCreatorSupportApplication(input);
    if (!validated.ok) throw new BadRequestException(validated.error);
    const value = validated.value;
    const [existing] = await db
      .select()
      .from(creatorSupportApplications)
      .where(eq(creatorSupportApplications.creatorId, uid))
      .orderBy(desc(creatorSupportApplications.updatedAt))
      .limit(1);

    const now = new Date();
    if (existing && ["submitted", "reviewing", "on_hold"].includes(existing.status)) {
      const [updated] = await db
        .update(creatorSupportApplications)
        .set({
          category: value.category,
          ageBand: value.ageBand,
          applicantRole: value.applicantRole,
          title: value.title,
          story: value.story,
          intendedUse: value.intendedUse,
          supportNeeds: value.supportNeeds,
          portfolioUrl: value.portfolioUrl,
          estimatedBudgetWon: value.estimatedBudgetWon,
          guardianConfirmed: value.guardianConfirmed,
          consentVersion: CONSENT_VERSION,
          status: "submitted",
          reviewNote: "",
          reviewedBy: null,
          reviewedAt: null,
          updatedAt: now,
        })
        .where(eq(creatorSupportApplications.id, existing.id))
        .returning();
      return { item: updated ?? existing, updated: true };
    }

    if (existing?.status === "approved") {
      throw new BadRequestException(
        "이미 승인된 지원 프로젝트가 있어요. 변경이 필요하면 운영자에게 문의해 주세요.",
      );
    }

    const [created] = await db
      .insert(creatorSupportApplications)
      .values({
        creatorId: uid,
        category: value.category,
        ageBand: value.ageBand,
        applicantRole: value.applicantRole,
        title: value.title,
        story: value.story,
        intendedUse: value.intendedUse,
        supportNeeds: value.supportNeeds,
        portfolioUrl: value.portfolioUrl,
        estimatedBudgetWon: value.estimatedBudgetWon,
        guardianConfirmed: value.guardianConfirmed,
        consentVersion: CONSENT_VERSION,
        status: "submitted",
        payoutStatus: "not_ready",
        monetarySupportEnabled: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { item: created ?? null, updated: false };
  }

  async submitOffer(userId: string, applicationIdValue: string, input: unknown) {
    const uid = await this.requireUser(userId);
    const applicationId = safeString(applicationIdValue, 100);
    const validated = validateCreatorSupportOffer(input);
    if (!validated.ok) throw new BadRequestException(validated.error);
    if (validated.spam || !validated.value) return { received: true } as const;

    const [project] = await db
      .select({
        id: creatorSupportApplications.id,
        creatorId: creatorSupportApplications.creatorId,
      })
      .from(creatorSupportApplications)
      .where(and(
        eq(creatorSupportApplications.id, applicationId),
        eq(creatorSupportApplications.status, "approved"),
      ))
      .limit(1);
    if (!project) throw new NotFoundException("지원 프로젝트를 찾을 수 없어요.");
    if (project.creatorId === uid) {
      throw new BadRequestException("자신의 프로젝트에는 지원 제안을 보낼 수 없어요.");
    }
    const cutoff = new Date(Date.now() - OFFER_RATE_WINDOW_MS);
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(creatorSupportOffers)
      .where(and(
        eq(creatorSupportOffers.applicationId, applicationId),
        eq(creatorSupportOffers.supporterId, uid),
        gte(creatorSupportOffers.createdAt, cutoff),
      ));
    if ((countRow?.count ?? 0) >= MAX_OFFERS_PER_PROJECT_PER_DAY) {
      throw new HttpException(
        "같은 프로젝트에 지원 제안을 너무 자주 보내고 있어요. 내일 다시 시도해 주세요.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const value = validated.value;
    await db.insert(creatorSupportOffers).values({
      applicationId,
      supporterId: uid,
      type: value.type,
      message: value.message,
      contactEmail: value.contactEmail,
      consentVersion: CONSENT_VERSION,
      status: "new",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { received: true } as const;
  }

  async listMyOffers(userId: string) {
    const uid = await this.requireUser(userId);
    const rows = await db
      .select({
        id: creatorSupportOffers.id,
        applicationId: creatorSupportOffers.applicationId,
        supporterId: creatorSupportOffers.supporterId,
        type: creatorSupportOffers.type,
        message: creatorSupportOffers.message,
        contactEmail: creatorSupportOffers.contactEmail,
        status: creatorSupportOffers.status,
        createdAt: creatorSupportOffers.createdAt,
        projectTitle: creatorSupportApplications.title,
      })
      .from(creatorSupportOffers)
      .innerJoin(
        creatorSupportApplications,
        eq(creatorSupportApplications.id, creatorSupportOffers.applicationId),
      )
      .where(eq(creatorSupportApplications.creatorId, uid))
      .orderBy(desc(creatorSupportOffers.createdAt))
      .limit(200);
    return {
      items: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async listForAdmin(userId: string, statusValue: unknown) {
    await this.requireOperator(userId);
    const status =
      statusValue === undefined || statusValue === ""
        ? null
        : statusValue;
    if (status !== null && !isCreatorSupportStatus(status)) {
      throw new BadRequestException("지원 프로젝트 상태를 확인해 주세요.");
    }
    const where = status
      ? eq(creatorSupportApplications.status, status)
      : undefined;
    const rows = await db
      .select({
        application: creatorSupportApplications,
        creatorName: users.name,
        creatorEmail: users.email,
      })
      .from(creatorSupportApplications)
      .leftJoin(users, eq(users.id, creatorSupportApplications.creatorId))
      .where(where)
      .orderBy(desc(creatorSupportApplications.updatedAt))
      .limit(300);
    return {
      items: rows.map(({ application, creatorName, creatorEmail }) => ({
        ...application,
        creatorName,
        creatorEmail,
      })),
      payout: resolveCreatorSupportPayoutConfig(),
    };
  }
  async reviewForAdmin(userId: string, idValue: string, input: unknown) {
    const operator = await this.requireOperator(userId);
    if (!input || typeof input !== "object") {
      throw new BadRequestException("검토 내용을 확인해 주세요.");
    }
    const body = input as Record<string, unknown>;
    if (!isCreatorSupportStatus(body.status)) {
      throw new BadRequestException("지원 프로젝트 상태를 확인해 주세요.");
    }
    const payoutStatus = safeString(body.payoutStatus, 40) || "not_ready";
    if (!PAYOUT_STATUSES.has(payoutStatus)) {
      throw new BadRequestException("정산 준비 상태를 확인해 주세요.");
    }
    const payoutConfig = resolveCreatorSupportPayoutConfig();
    const requestedMoney = body.monetarySupportEnabled === true;
    if (requestedMoney && (payoutStatus !== "ready" || !payoutConfig.ready)) {
      throw new ServiceUnavailableException(
        "금전 후원은 지급대행 계약·보안키·KYC 준비가 모두 확인된 뒤에만 열 수 있어요.",
      );
    }
    const id = safeString(idValue, 100);
    const now = new Date();
    const [updated] = await db
      .update(creatorSupportApplications)
      .set({
        status: body.status,
        reviewNote: safeString(body.reviewNote, 1000),
        reviewedBy: operator,
        reviewedAt: now,
        payoutStatus,
        monetarySupportEnabled: requestedMoney,
        updatedAt: now,
      })
      .where(eq(creatorSupportApplications.id, id))
      .returning();
    if (!updated) throw new NotFoundException("지원 프로젝트를 찾을 수 없어요.");
    return { item: updated };
  }

  private async requireUser(userId: string) {
    const uid = safeString(userId, 200);
    if (!uid) throw new ForbiddenException("로그인이 필요해요.");
    const [row] = await db.select({ id: users.id }).from(users)
      .where(eq(users.id, uid)).limit(1);
    if (!row) throw new ForbiddenException("유효한 로그인 세션이 필요해요.");
    return uid;
  }
  private async requireOperator(userId: string) {
    const uid = safeString(userId, 200);
    if (!uid || !(await isOfficialUser(uid))) {
      throw new ForbiddenException("운영자 권한이 필요해요.");
    }
    return uid;
  }
}
