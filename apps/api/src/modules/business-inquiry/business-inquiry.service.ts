import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import {
  businessInquiryListLimit,
  isBusinessInquiryStatus,
  type BusinessInquiryEntry,
  type BusinessInquiryStatus,
  validateBusinessInquiryInput,
} from "../../../../../packages/core/src/business-inquiry";

import { businessInquiries, db } from "../../db";
import { isOfficialUser } from "../../server/feedback";

const CONSENT_VERSION = "business-inquiry-2026-09-18";
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 12 * 60 * 60 * 1000;
const MAX_PER_EMAIL_PER_WINDOW = 4;

function fingerprint(type: string, email: string, message: string): string {
  return createHash("sha256")
    .update(`${type}\n${email.trim().toLowerCase()}\n${message.trim().replace(/\s+/gu, " ")}`)
    .digest("hex");
}

function toEntry(row: typeof businessInquiries.$inferSelect): BusinessInquiryEntry {
  return {
    id: row.id,
    type: row.type,
    organization: row.organization,
    contactName: row.contactName,
    email: row.email,
    website: row.website,
    message: row.message,
    sourcePath: row.sourcePath,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class BusinessInquiryService {
  async create(input: unknown) {
    const validated = validateBusinessInquiryInput(input);
    // Honeypot submissions receive the normal success shape so bots cannot learn
    // which field caused rejection. Nothing is persisted.
    if (validated.spam) return { received: true } as const;
    if (!validated.value) throw new BadRequestException(validated.error ?? "문의 내용을 확인해 주세요.");

    const value = validated.value;
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
    const duplicateCutoff = new Date(now.getTime() - DUPLICATE_WINDOW_MS);
    const dedupeFingerprint = fingerprint(value.type, value.email, value.message);

    const [recentCountRow, duplicate] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(businessInquiries)
        .where(and(eq(businessInquiries.email, value.email), gte(businessInquiries.createdAt, recentCutoff))),
      db
        .select({ id: businessInquiries.id })
        .from(businessInquiries)
        .where(
          and(
            eq(businessInquiries.fingerprint, dedupeFingerprint),
            gte(businessInquiries.createdAt, duplicateCutoff),
          ),
        )
        .limit(1),
    ]);

    if (duplicate[0]) return { received: true, id: duplicate[0].id } as const;
    if ((recentCountRow[0]?.count ?? 0) >= MAX_PER_EMAIL_PER_WINDOW) {
      throw new HttpException(
        "문의가 연속으로 접수됐어요. 잠시 후 다시 시도해 주세요.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const id = randomUUID();
    await db.insert(businessInquiries).values({
      id,
      type: value.type,
      organization: value.organization,
      contactName: value.contactName,
      email: value.email,
      website: value.website,
      message: value.message,
      sourcePath: value.sourcePath,
      consentVersion: CONSENT_VERSION,
      fingerprint: dedupeFingerprint,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });

    return { received: true, id } as const;
  }

  async listForAdmin(userId: string, statusValue: unknown, limitValue: unknown) {
    await this.requireOperator(userId);
    const status = statusValue === undefined || statusValue === "" ? null : statusValue;
    if (status !== null && !isBusinessInquiryStatus(status)) {
      throw new BadRequestException("문의 상태 필터를 확인해 주세요.");
    }
    const limit = businessInquiryListLimit(limitValue);
    const where = status ? eq(businessInquiries.status, status) : undefined;
    const [rows, countRows] = await Promise.all([
      db.select().from(businessInquiries).where(where).orderBy(desc(businessInquiries.createdAt)).limit(limit),
      db.select({ count: sql<number>`count(*)::int` }).from(businessInquiries).where(where),
    ]);
    return { items: rows.map(toEntry), total: countRows[0]?.count ?? 0 };
  }

  async setStatus(userId: string, inquiryId: string, statusValue: unknown) {
    await this.requireOperator(userId);
    if (!isBusinessInquiryStatus(statusValue)) {
      throw new BadRequestException("변경할 문의 상태를 확인해 주세요.");
    }
    const id = inquiryId.trim();
    if (!id || id.length > 100) throw new BadRequestException("문의 ID를 확인해 주세요.");

    const rows = await db
      .update(businessInquiries)
      .set({ status: statusValue as BusinessInquiryStatus, updatedAt: new Date() })
      .where(eq(businessInquiries.id, id))
      .returning();
    if (!rows[0]) throw new NotFoundException("문의를 찾을 수 없어요.");
    return toEntry(rows[0]);
  }

  private async requireOperator(userId: string) {
    if (!userId || !(await isOfficialUser(userId))) {
      throw new ForbiddenException("운영자 권한이 필요해요.");
    }
  }
}
