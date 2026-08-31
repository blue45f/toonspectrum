import { BadRequestException, Injectable } from "@nestjs/common";
import { and, desc, eq, or, sql } from "drizzle-orm";

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
  MemberStatus, toNumber, escapeLike, normalizeRole, parsePositiveInt, parseString, parseMemberStatus, requireAdminUser, countFrom, ensureAdminSchema, 
  logAuditAction
} from "./admin-types";

@Injectable()
export class AdminMembersService {
async listUsers(userId: string, query: { q?: string | null; limit?: number | string | null } = {}) {
    await ensureUserLifecycleSchema();
    await requireAdminUser(userId);
    const limit = parsePositiveInt(query.limit, 50, 1, 200);
    const search = String(query.q ?? "").trim().toLowerCase();

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
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      const cond = or(
        sql`lower(coalesce(${users.name}, '')) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(coalesce(${users.email}, '')) LIKE ${pattern} ESCAPE '\\'`
      );
      if (cond) userQuery = userQuery.where(cond);
    }

    const rows = await userQuery.orderBy(desc(users.createdAt)).limit(limit);
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: normalizeRole(row.role),
        status: normalizeUserAccountStatus(row.status),
        suspendedAt: row.suspendedAt ? new Date(row.suspendedAt).toISOString() : null,
        suspensionReason: row.suspensionReason ?? null,
        deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
        postCount: toNumber(row.postCount),
        reviewCount: toNumber(row.reviewCount),
      })),
      meta: { limit, generatedAt: new Date().toISOString() },
    };
  }

async setUserRole(userId: string, targetUserId: string, roleValue: unknown) {
    const admin = await requireAdminUser(userId);
    const role = String(roleValue ?? "").toLowerCase();
    if (!["user", "creator", "operator", "admin"].includes(role)) {
      throw new BadRequestException({ error: "지원하지 않는 역할이에요." });
    }
    if (!targetUserId) throw new BadRequestException({ error: "대상 사용자가 필요해요." });
    if (targetUserId === admin.id) {
      throw new BadRequestException({ error: "자기 자신의 역할은 변경할 수 없어요." });
    }
    const rows = await db.update(users).set({ role }).where(eq(users.id, targetUserId)).returning({ id: users.id });
    if (!rows.length) throw new BadRequestException({ error: "대상 사용자를 찾을 수 없어요." });
    // 권한 변경 즉시 세션 마이크로캐시 무효화 — isAdminUser 가 다음 요청부터 새 역할을 본다.
    invalidateSessionUser(targetUserId);
    return { ok: true, id: targetUserId, role };
  }

async setUserStatus(userId: string, targetUserId: string, statusValue: unknown, reasonValue?: unknown) {
    const admin = await requireAdminUser(userId);
    const status = parseMemberStatus(statusValue);
    if (!status || status === "deleted") {
      throw new BadRequestException({ error: "지원하지 않는 회원 상태예요." });
    }
    if (!targetUserId) throw new BadRequestException({ error: "대상 사용자가 필요해요." });
    if (targetUserId === admin.id) {
      throw new BadRequestException({ error: "자기 자신의 상태는 변경할 수 없어요." });
    }
    const row = await setUserLifecycleStatus(targetUserId, status, parseString(reasonValue, "", 300));
    if (!row) throw new BadRequestException({ error: "대상 사용자를 찾을 수 없어요." });
    return {
      ok: true,
      id: targetUserId,
      status: normalizeUserAccountStatus(row.status),
      suspendedAt: row.suspendedAt ? new Date(row.suspendedAt).toISOString() : null,
      suspensionReason: row.suspensionReason ?? null,
      deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
    };
  }

async deleteUser(userId: string, targetUserId: string, reasonValue?: unknown) {
    const admin = await requireAdminUser(userId);
    if (!targetUserId) throw new BadRequestException({ error: "대상 사용자가 필요해요." });
    if (targetUserId === admin.id) {
      throw new BadRequestException({ error: "자기 자신은 삭제할 수 없어요." });
    }
    const row = await setUserLifecycleStatus(targetUserId, "deleted", parseString(reasonValue, "admin soft delete", 300));
    if (!row) throw new BadRequestException({ error: "대상 사용자를 찾을 수 없어요." });
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

    if (!target) throw new BadRequestException("해당 회원을 찾을 수 없습니다.");

    const [[reviewsCount, fanPostsCount, ratingsCount], paidRows] = await Promise.all([
      Promise.all([
        countFrom(reviews, eq(reviews.userId, targetUserId)),
        countFrom(fanPosts, eq(fanPosts.userId, targetUserId)),
        countFrom(ratings, eq(ratings.userId, targetUserId)),
      ]),
      db
        .select({ amount: revenueLedger.amountCents })
        .from(revenueLedger)
        .where(and(eq(revenueLedger.payerId, targetUserId), eq(revenueLedger.status, "paid"))),
    ]);

    const totalPaidCents = paidRows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0);

    return {
      user: target,
      activity: {
        reviewsCount,
        fanPostsCount,
        ratingsCount,
        totalPaidCents,
      },
    };
  }

async bulkSetUserStatus(userId: string, userIds: string[], status: MemberStatus, reason?: string) {
    const admin = await requireAdminUser(userId);
    if (!Array.isArray(userIds) || !userIds.length) {
      throw new BadRequestException("대상 회원을 1명 이상 선택해 주세요.");
    }
    const filteredIds = userIds.filter((id) => id !== admin.id);
    await Promise.all(filteredIds.map((id) => setUserLifecycleStatus(id, status, reason)));
    void logAuditAction(userId, "USER_BULK_STATUS_CHANGE", "user", null, { userIds: filteredIds, status, reason });
    return { ok: true, count: filteredIds.length };
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

    const header = "ID,Name,Email,Role,Status,CreatedAt\n";
    const body = rows
      .map(
        (r) =>
          `"${r.id}","${(r.name ?? "").replace(/"/g, '""')}","${(r.email ?? "").replace(/"/g, '""')}","${r.role}","${r.status}","${r.createdAt ? new Date(r.createdAt).toISOString() : ""}"`
      )
      .join("\n");

    return header + body;
  }
}
