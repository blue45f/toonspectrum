import { BadRequestException, ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";

import { adminAuditLogs, adminMemberTestAccounts, db, users } from "../../platform/database";

import { requireMemberMutationAdmin } from "./admin-member-policy";
import { ensureAdminSchema, requireAdminUser } from "./admin-types";

export interface TestAccountMutation {
  isTestAccount: boolean;
  expectedIsTestAccount: boolean;
  reason: string;
}

export function parseTestAccountMutation(value: unknown): TestAccountMutation {
  if (!value || typeof value !== "object") throw new BadRequestException("유효한 계정 구분 변경이 필요합니다.");
  const body = value as Record<string, unknown>;
  if (typeof body.isTestAccount !== "boolean" || typeof body.expectedIsTestAccount !== "boolean") {
    throw new BadRequestException("계정 구분과 이전 값은 boolean이어야 합니다.");
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 300) throw new BadRequestException("변경 사유를 1~300자로 입력해 주세요.");
  return { isTestAccount: body.isTestAccount, expectedIsTestAccount: body.expectedIsTestAccount, reason };
}

function missingTable(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== "object") return false;
    if ("code" in current && current.code === "42P01") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

/** 관리자 조회를 재검증한다. 미적용 스키마를 일반 계정(false)으로 오인하지 않는다. */
export async function readMemberTestAccountFlags(actorId: string, ids: string[]) {
  await requireAdminUser(actorId);
  if (!ids.length) return { available: true, flags: new Map<string, boolean>() };
  try {
    const rows = await db.select({ userId: adminMemberTestAccounts.userId, isTestAccount: adminMemberTestAccounts.isTestAccount })
      .from(adminMemberTestAccounts).where(inArray(adminMemberTestAccounts.userId, ids));
    return { available: true, flags: new Map(rows.map((row) => [row.userId, row.isTestAccount])) };
  } catch (error) {
    if (missingTable(error)) return { available: false, flags: new Map<string, boolean>() };
    throw error;
  }
}

/** 계정 구분과 감사 이력을 하나의 트랜잭션으로 저장한다. 인증·과금 권한에 사용하지 않는다. */
export async function setMemberTestAccount(actorId: string, targetUserId: string, value: unknown) {
  const actor = await requireAdminUser(actorId);
  requireMemberMutationAdmin(actor);
  if (!targetUserId || targetUserId.length > 200) throw new BadRequestException("유효한 대상 회원이 필요합니다.");
  const input = parseTestAccountMutation(value);
  await ensureAdminSchema();
  try {
    return await db.transaction(async (tx) => {
      // 구분 행이 아직 없어도 같은 회원의 변경을 직렬화한다.
      const [target] = await tx.select({ id: users.id, status: users.status }).from(users)
        .where(eq(users.id, targetUserId)).for("update");
      if (!target || target.status === "deleted" || target.status === "merged") {
        throw new BadRequestException("변경 가능한 대상 회원을 찾을 수 없습니다.");
      }
      const [previous] = await tx.select({ isTestAccount: adminMemberTestAccounts.isTestAccount })
        .from(adminMemberTestAccounts).where(eq(adminMemberTestAccounts.userId, targetUserId));
      const previousValue = previous?.isTestAccount ?? false;
      if (previousValue !== input.expectedIsTestAccount) {
        throw new ConflictException("다른 관리자가 계정 구분을 변경했습니다. 상세 정보를 다시 열어 확인해 주세요.");
      }
      if (previousValue === input.isTestAccount) return { ok: true, id: targetUserId, isTestAccount: previousValue };
      const updatedAt = new Date();
      await tx.insert(adminMemberTestAccounts).values({ userId: targetUserId, isTestAccount: input.isTestAccount,
        reason: input.reason, updatedBy: actor.id, updatedAt }).onConflictDoUpdate({
        target: adminMemberTestAccounts.userId,
        set: { isTestAccount: input.isTestAccount, reason: input.reason, updatedBy: actor.id, updatedAt },
        setWhere: and(eq(adminMemberTestAccounts.userId, targetUserId), eq(adminMemberTestAccounts.isTestAccount, previousValue)),
      });
      await tx.insert(adminAuditLogs).values({ id: crypto.randomUUID(), adminId: actor.id,
        action: "USER_TEST_ACCOUNT_CHANGE", targetType: "user", targetId: targetUserId,
        details: { previousIsTestAccount: previousValue, isTestAccount: input.isTestAccount, reason: input.reason },
      });
      return { ok: true, id: targetUserId, isTestAccount: input.isTestAccount };
    });
  } catch (error) {
    if (missingTable(error)) throw new ServiceUnavailableException("테스트 계정 구분 마이그레이션이 필요합니다. 기존 계정은 변경하지 않았습니다.");
    throw error;
  }
}
