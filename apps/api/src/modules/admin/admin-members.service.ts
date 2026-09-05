import { BadRequestException, Injectable } from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  db,
  fanPosts,
  ratings,
  reviews,
  revenueLedger,
  users,
} from "../../db";
import { invalidateSessionUser } from "../../server/session";
import {
  ensureUserLifecycleSchema,
  normalizeUserAccountStatus,
  setUserLifecycleStatus,
} from "../../server/user-lifecycle";

import {
  type MemberStatus,
  countFrom,
  ensureAdminSchema,
  escapeLike,
  logAuditAction,
  normalizeRole,
  parseMemberStatus,
  parsePositiveInt,
  parseString,
  requireAdminUser,
  toNumber,
} from "./admin-types";

interface MemberListQuery {
  q?: string | null;
  limit?: number | string | null;
  offset?: number | string | null;
  role?: string | null;
  status?: string | null;
  sort?: string | null;
  direction?: string | null;
}

const MEMBER_ROLE_FILTERS = new Set(["user", "creator", "operator", "admin"]);
const MEMBER_SORT_FIELDS = new Set(["createdAt", "name"]);

function normalizeMemberListQuery(query: MemberListQuery) {
  const limit = parsePositiveInt(query.limit, 50, 1, 200);
  const offset = parsePositiveInt(query.offset, 0, 0, 1_000_000);
  const search = String(query.q ?? "").trim().toLowerCase();
  const rawRole = String(query.role ?? "").trim().toLowerCase();
  const rawStatus = String(query.status ?? "").trim().toLowerCase();
  const rawSort = String(query.sort ?? "createdAt").trim();
  const direction = query.direction === "asc" ? "asc" : "desc";

  if (rawRole && !MEMBER_ROLE_FILTERS.has(rawRole)) {
    throw new BadRequestException({ error: "지원하지 않는 역할 필터예요." });
  }
  const status = rawStatus ? parseMemberStatus(rawStatus) : null;
  if (rawStatus && !status) {
    throw new BadRequestException({ error: "지원하지 않는 상태 필터예요." });
  }

  return {
    limit,
    offset,
    search,
    role: rawRole || null,
    status,
    sort: MEMBER_SORT_FIELDS.has(rawSort) ? rawSort : "createdAt",
    direction,
  } as const;
}

function buildMemberConditions(
  normalized: ReturnType<typeof normalizeMemberListQuery>,
): SQL[] {
  const conditions: SQL[] = [];

  if (normalized.search) {
    const pattern = `%${escapeLike(normalized.search)}%`;
    const searchCondition = or(
      sql`lower(coalesce(${users.name}, '')) LIKE ${pattern} ESCAPE '\\'`,
      sql`lower(coalesce(${users.email}, '')) LIKE ${pattern} ESCAPE '\\'`,
      sql`lower(${users.id}) LIKE ${pattern} ESCAPE '\\'`,
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  if (normalized.role) {
    conditions.push(eq(users.role, normalized.role));
  }
  if (normalized.status) {
    conditions.push(eq(users.status, normalized.status));
  }

  return conditions;
}

function spreadsheetSafeCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

@Injectable()
export class AdminMembersService {
  async listUsers(userId: string, query: MemberListQuery = {}) {
    await ensureUserLifecycleSchema();
    await requireAdminUser(userId);

    const normalized = normalizeMemberListQuery(query);
    const conditions = buildMemberConditions(normalized);
    const whereClause =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]
          : and(...conditions);

    let userQuery = db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        suspendedAt: users.suspendedAt,
        suspensionReason: users.suspensionReason,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
        postCount: sql<number>`(
          SELECT count(*) FROM fan_post p WHERE p."userId" = ${users.id}
        )`.as("postCount"),
        reviewCount: sql<number>`(
          SELECT count(*) FROM review r WHERE r."userId" = ${users.id}
        )`.as("reviewCount"),
      })
      .from(users)
      .$dynamic();

    let countQuery = db
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .$dynamic();

    if (whereClause) {
      userQuery = userQuery.where(whereClause);
      countQuery = countQuery.where(whereClause);
    }

    const orderDirection = normalized.direction === "asc" ? asc : desc;
    const orderExpression =
      normalized.sort === "name"
        ? orderDirection(
            sql`lower(coalesce(${users.name}, ${users.email}, ${users.id}))`,
          )
        : orderDirection(users.createdAt);

    const [rows, totalRows] = await Promise.all([
      userQuery
        .orderBy(orderExpression, desc(users.id))
        .limit(normalized.limit)
        .offset(normalized.offset),
      countQuery,
    ]);

    const total = toNumber(totalRows[0]?.total);

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: normalizeRole(row.role),
        status: normalizeUserAccountStatus(row.status),
        suspendedAt: row.suspendedAt
          ? new Date(row.suspendedAt).toISOString()
          : null,
        suspensionReason: row.suspensionReason ?? null,
        deletedAt: row.deletedAt
          ? new Date(row.deletedAt).toISOString()
          : null,
        createdAt: row.createdAt
          ? new Date(row.createdAt).toISOString()
          : null,
        postCount: toNumber(row.postCount),
        reviewCount: toNumber(row.reviewCount),
      })),
      meta: {
        limit: normalized.limit,
        offset: normalized.offset,
        total,
        hasMore: normalized.offset + rows.length < total,
        filters: {
          q: normalized.search,
          role: normalized.role,
          status: normalized.status,
          sort: normalized.sort,
          direction: normalized.direction,
        },
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async setUserRole(
    userId: string,
    targetUserId: string,
    roleValue: unknown,
  ) {
    const admin = await requireAdminUser(userId);
    const role = String(roleValue ?? "").toLowerCase();
    if (!MEMBER_ROLE_FILTERS.has(role)) {
      throw new BadRequestException({ error: "지원하지 않는 역할이에요." });
    }
    if (!targetUserId) {
      throw new BadRequestException({ error: "대상 사용자가 필요해요." });
    }
    if (targetUserId === admin.id) {
      throw new BadRequestException({
        error: "자기 자신의 역할은 변경할 수 없어요.",
      });
    }

    const rows = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, targetUserId))
      .returning({ id: users.id });
    if (!rows.length) {
      throw new BadRequestException({ error: "대상 사용자를 찾을 수 없어요." });
    }

    invalidateSessionUser(targetUserId);
    void logAuditAction(userId, "USER_ROLE_CHANGE", "user", targetUserId, {
      role,
    });
    return { ok: true, id: targetUserId, role };
  }

  async setUserStatus(
    userId: string,
    targetUserId: string,
    statusValue: unknown,
    reasonValue?: unknown,
  ) {
    const admin = await requireAdminUser(userId);
    const status = parseMemberStatus(statusValue);
    if (!status || status === "deleted") {
      throw new BadRequestException({
        error: "지원하지 않는 회원 상태예요.",
      });
    }
    if (!targetUserId) {
      throw new BadRequestException({ error: "대상 사용자가 필요해요." });
    }
    if (targetUserId === admin.id) {
      throw new BadRequestException({
        error: "자기 자신의 상태는 변경할 수 없어요.",
      });
    }

    const reason = parseString(reasonValue, "", 300);
    const row = await setUserLifecycleStatus(targetUserId, status, reason);
    if (!row) {
      throw new BadRequestException({ error: "대상 사용자를 찾을 수 없어요." });
    }

    void logAuditAction(userId, "USER_STATUS_CHANGE", "user", targetUserId, {
      status,
      reason,
    });
    return {
      ok: true,
      id: targetUserId,
      status: normalizeUserAccountStatus(row.status),
      suspendedAt: row.suspendedAt
        ? new Date(row.suspendedAt).toISOString()
        : null,
      suspensionReason: row.suspensionReason ?? null,
      deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
    };
  }

  async deleteUser(
    userId: string,
    targetUserId: string,
    reasonValue?: unknown,
  ) {
    const admin = await requireAdminUser(userId);
    if (!targetUserId) {
      throw new BadRequestException({ error: "대상 사용자가 필요해요." });
    }
    if (targetUserId === admin.id) {
      throw new BadRequestException({ error: "자기 자신은 삭제할 수 없어요." });
    }

    const reason = parseString(reasonValue, "admin soft delete", 300);
    const row = await setUserLifecycleStatus(targetUserId, "deleted", reason);
    if (!row) {
      throw new BadRequestException({ error: "대상 사용자를 찾을 수 없어요." });
    }

    void logAuditAction(userId, "USER_SOFT_DELETE", "user", targetUserId, {
      reason,
    });
    return {
      ok: true,
      id: targetUserId,
      status: "deleted",
      deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
    };
  }

  async getUserDetails(userId: string, targetUserId: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();

    const [target] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        suspendedAt: users.suspendedAt,
        suspensionReason: users.suspensionReason,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
        bio: users.bio,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!target) {
      throw new BadRequestException("해당 회원을 찾을 수 없습니다.");
    }

    const [[reviewsCount, fanPostsCount, ratingsCount], paidRows] =
      await Promise.all([
        Promise.all([
          countFrom(reviews, eq(reviews.userId, targetUserId)),
          countFrom(fanPosts, eq(fanPosts.userId, targetUserId)),
          countFrom(ratings, eq(ratings.userId, targetUserId)),
        ]),
        db
          .select({ amount: revenueLedger.amountCents })
          .from(revenueLedger)
          .where(
            and(
              eq(revenueLedger.payerId, targetUserId),
              eq(revenueLedger.status, "paid"),
            ),
          ),
      ]);

    const totalPaidCents = paidRows.reduce(
      (sum, row) => sum + Number(row.amount ?? 0),
      0,
    );

    return {
      user: {
        ...target,
        role: normalizeRole(target.role),
        status: normalizeUserAccountStatus(target.status),
        suspendedAt: target.suspendedAt
          ? new Date(target.suspendedAt).toISOString()
          : null,
        deletedAt: target.deletedAt
          ? new Date(target.deletedAt).toISOString()
          : null,
        createdAt: target.createdAt
          ? new Date(target.createdAt).toISOString()
          : null,
      },
      activity: {
        reviewsCount: toNumber(reviewsCount),
        fanPostsCount: toNumber(fanPostsCount),
        ratingsCount: toNumber(ratingsCount),
        totalPaidCents,
      },
    };
  }

  async bulkSetUserStatus(
    userId: string,
    userIds: string[],
    statusValue: MemberStatus,
    reasonValue?: string,
  ) {
    const admin = await requireAdminUser(userId);
    const status = parseMemberStatus(statusValue);
    if (!status || status === "deleted") {
      throw new BadRequestException("지원하지 않는 일괄 상태 변경입니다.");
    }
    if (!Array.isArray(userIds) || !userIds.length) {
      throw new BadRequestException("대상 회원을 1명 이상 선택해 주세요.");
    }

    const uniqueIds = Array.from(
      new Set(
        userIds
          .map((id) => String(id ?? "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 200);
    const filteredIds = uniqueIds.filter((id) => id !== admin.id);
    const reason = parseString(reasonValue, "", 300);

    const results = await Promise.all(
      filteredIds.map((id) => setUserLifecycleStatus(id, status, reason)),
    );
    const updatedCount = results.filter(Boolean).length;

    void logAuditAction(
      userId,
      "USER_BULK_STATUS_CHANGE",
      "user",
      null,
      {
        userIds: filteredIds,
        status,
        reason,
        updatedCount,
      },
    );
    return {
      ok: true,
      count: updatedCount,
      requestedCount: uniqueIds.length,
      skippedSelfCount: uniqueIds.length - filteredIds.length,
      missingCount: filteredIds.length - updatedCount,
    };
  }

  async exportUsersCsv(userId: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(5000);

    const header = [
      "ID",
      "Name",
      "Email",
      "Role",
      "Status",
      "CreatedAt",
    ]
      .map(spreadsheetSafeCsvCell)
      .join(",");
    const body = rows
      .map((row) =>
        [
          row.id,
          row.name ?? "",
          row.email ?? "",
          normalizeRole(row.role),
          normalizeUserAccountStatus(row.status),
          row.createdAt ? new Date(row.createdAt).toISOString() : "",
        ]
          .map(spreadsheetSafeCsvCell)
          .join(","),
      )
      .join("\n");

    void logAuditAction(userId, "USER_EXPORT_CSV", "user", null, {
      exportedCount: rows.length,
    });
    return `\uFEFF${header}\n${body}`;
  }
}
