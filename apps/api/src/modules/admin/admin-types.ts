import crypto from "crypto";
import net from "node:net";

import { BadRequestException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { eq, sql, type SQL, type Table } from "drizzle-orm";

import {
  creatorProfiles,
  db,
  dbClient,
  monetizationPlans,
  users,
} from "../../db";
import {
  getAdminEmailWhitelist,
  normalizeAdminEmail,
} from "../../server/admin-emails";
import { invalidateSessionUser } from "../../server/session";
import {
  ensureUserLifecycleSchema,
  normalizeUserAccountStatus,
  type UserAccountStatus,
} from "../../server/user-lifecycle";

export type AdminRole = "admin" | "creator" | "operator" | "user";

export type MemberStatus = UserAccountStatus;

export type RevenueStatus = "pending" | "approved" | "paid" | "rejected" | "revoked";

export type RevenueStatusFilter = RevenueStatus | "all";

export type DashboardResponse = {
  updatedAt: string;
  users: {
    total: number;
    activeLast7d: number;
    activeLast30d: number;
    admins: number;
    creators: number;
  };
  community: {
    fanPosts: number;
    fanReplies: number;
    reviewReplies: number;
    reviews: number;
    userActivity: number;
  };
  monetization: {
    planCount: number;
    activePlanCount: number;
    campaignCount: number;
    revenuePendingCents: number;
    revenueApprovedCents: number;
    revenuePaidCents: number;
    revenueRejectedCents: number;
    revenueRevokedCents: number;
    pendingEvents: number;
    approvedEvents: number;
    paidEvents: number;
    rejectedEvents: number;
    revokedEvents: number;
    periodDays: number;
  };
  currency: string;
};

export const ADMIN_ROLES = new Set<AdminRole>(["admin", "operator"]);

export const MEMBER_STATUSES = new Set<MemberStatus>(["active", "suspended", "deleted"]);

export const REVENUE_STATUSES: ReadonlyArray<RevenueStatus> = ["pending", "approved", "paid", "rejected", "revoked"];

export const REVENUE_STATUS_SET = new Set<RevenueStatus>(REVENUE_STATUSES);

export const DAY_MS = 24 * 60 * 60 * 1000;

export let adminSchemaReady = false;

export function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function normalizeRole(value: string | null | undefined): AdminRole {
  const role = String(value ?? "").toLowerCase();
  if (role === "admin" || role === "operator" || role === "creator") return role;
  return "user";
}

export function parsePositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (floored < min || floored > max) return fallback;
  return floored;
}

export function parsePerks(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 12);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return [];
}

export function parseString(value: unknown, fallback: string, maxLength = 80) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength);
}

export function parseBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes" || normalized === "y";
  }
  return fallback;
}

export const ADMIN_BENCHMARK_ITERATIONS_MIN = 1;
export const ADMIN_BENCHMARK_ITERATIONS_MAX = 10;
export const ADMIN_BENCHMARK_ITERATIONS_DEFAULT = 3;

export function parseIpAddress(value: unknown) {
  if (typeof value !== "string") {
    throw new BadRequestException("IP 주소는 문자열로 입력해 주세요.");
  }
  const trimmed = value.trim();
  if (!trimmed) throw new BadRequestException("IP 주소를 입력해 주세요.");

  if (trimmed.includes("/")) {
    const [address, cidr, ...rest] = trimmed.split("/");
    if (!address || rest.length > 0) throw new BadRequestException("유효한 IP/CIDR 형식이 아닙니다.");

    const addressType = net.isIP(address);
    if (addressType === 0) throw new BadRequestException("유효한 IP 주소를 입력해 주세요.");

    // parseInt accepts trailing junk and decimals (e.g. 24oops -> 24).
    // A security rule must match the entire prefix supplied by the operator.
    if (!/^\d{1,3}$/u.test(cidr ?? "")) {
      throw new BadRequestException("CIDR 범위가 유효하지 않습니다.");
    }
    const parsedCidr = Number(cidr);
    const maxCidr = addressType === 4 ? 32 : 128;
    if (!Number.isInteger(parsedCidr) || parsedCidr < 0 || parsedCidr > maxCidr) {
      throw new BadRequestException("CIDR 범위가 유효하지 않습니다.");
    }
    return `${address}/${parsedCidr}`;
  }

  if (net.isIP(trimmed) === 0) throw new BadRequestException("유효한 IP 주소를 입력해 주세요.");
  return trimmed;
}

export function normalizeAdminBenchmarkQuery(
  iterationsValue: unknown,
  warmupValue: unknown = false,
): { iterations: number; warmup: boolean } {
  const parsed =
    typeof iterationsValue === "number"
      ? iterationsValue
      : Number.parseFloat(String(iterationsValue ?? ""));
  const iterations = Number.isFinite(parsed)
    ? Math.min(
        ADMIN_BENCHMARK_ITERATIONS_MAX,
        Math.max(ADMIN_BENCHMARK_ITERATIONS_MIN, Math.floor(parsed)),
      )
    : ADMIN_BENCHMARK_ITERATIONS_DEFAULT;
  return {
    iterations,
    warmup: parseBool(warmupValue, false),
  };
}

export function isAdminBenchmarkWarmupEnabled(
  warmupOrOptions: boolean | { warmup?: boolean } | undefined,
): boolean {
  if (warmupOrOptions === true) return true;
  if (warmupOrOptions && typeof warmupOrOptions === "object") {
    return warmupOrOptions.warmup === true;
  }
  return false;
}

export type AdminBenchmarkSampleStatus = "ok" | "partial" | "error";

export type AdminBenchmarkAttempt = {
  status: "ok" | "error";
  durationMs: number;
  error?: string;
  sampleSize?: number;
};

export type AdminBenchmarkSample = {
  name: string;
  status: AdminBenchmarkSampleStatus;
  iterations: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  durationMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  stdDevMs: number;
  minMs: number;
  maxMs: number;
  sampleSize?: number;
  error?: string;
};

export function adminBenchmarkPercentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const idx = Math.max(0, Math.min(values.length - 1, Math.ceil(ratio * values.length) - 1));
  return values[idx] ?? 0;
}

export function summarizeAdminBenchmarkSample(
  name: string,
  attempts: AdminBenchmarkAttempt[],
): AdminBenchmarkSample {
  const successes = attempts.filter((entry) => entry.status === "ok");
  const durations = successes.map((entry) => entry.durationMs).sort((a, b) => a - b);
  const sampleSizes = successes
    .map((entry) => entry.sampleSize)
    .filter((size): size is number => typeof size === "number");

  const sumMs = durations.reduce((total, value) => total + value, 0);
  const meanMs = durations.length ? sumMs / durations.length : 0;
  const varianceMs = durations.length
    ? durations.reduce((total, value) => total + Math.pow(value - meanMs, 2), 0) / durations.length
    : 0;
  const stdDevMs = Math.round(Math.sqrt(varianceMs));
  const minMs = durations[0] ?? 0;
  const maxMs = durations[durations.length - 1] ?? 0;
  const avgMs = Math.round(meanMs);
  const successCount = successes.length;
  const errorCount = attempts.length - successCount;
  const errorRate = attempts.length ? Math.round((errorCount / attempts.length) * 1000) / 1000 : 0;
  const sampleSize = sampleSizes[0];

  if (successCount === 0) {
    const firstError = attempts[0]?.error ?? "요청이 모두 실패했습니다.";
    return {
      name,
      status: "error",
      iterations: attempts.length,
      successCount,
      errorCount,
      errorRate,
      durationMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      stdDevMs: 0,
      minMs: 0,
      maxMs: 0,
      error: firstError,
    };
  }

  if (errorCount > 0) {
    return {
      name,
      status: "partial",
      iterations: attempts.length,
      successCount,
      errorCount,
      errorRate,
      durationMs: avgMs,
      p50Ms: adminBenchmarkPercentile(durations, 0.5),
      p95Ms: adminBenchmarkPercentile(durations, 0.95),
      p99Ms: adminBenchmarkPercentile(durations, 0.99),
      stdDevMs,
      minMs,
      maxMs,
      sampleSize,
      error: attempts.find((entry) => entry.error)?.error ?? "일부 요청이 실패했습니다.",
    };
  }

  return {
    name,
    status: "ok",
    iterations: attempts.length,
    successCount,
    errorCount,
    errorRate,
    durationMs: avgMs,
    p50Ms: adminBenchmarkPercentile(durations, 0.5),
    p95Ms: adminBenchmarkPercentile(durations, 0.95),
    p99Ms: adminBenchmarkPercentile(durations, 0.99),
    stdDevMs,
    minMs,
    maxMs,
    sampleSize,
  };
}

export function toPlainObject(value: unknown) {
  if (value === null || value === undefined) return {};
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export interface AppConfigPayload {
  monetizationEnabled?: unknown;
  authKakao?: unknown;
  authNaver?: unknown;
  // 콘텐츠 킬스위치(법적 리스크 기능 on/off).
  showCovers?: unknown;
  showPricing?: unknown;
  showAvailability?: unknown;
  showSynopsis?: unknown;
  showRelatedInfo?: unknown;
}

export interface PlanPayload {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  description?: unknown;
  intervalDays?: unknown;
  currency?: unknown;
  priceCents?: unknown;
  perks?: unknown;
  isActive?: unknown;
}

export interface ParsedPlanPayload {
  id?: string;
  code: string;
  name: string;
  description: string;
  intervalDays: number;
  currency: string;
  priceCents: number;
  perks: string[];
  isActive: boolean;
}

export interface CampaignQuery {
  creatorId?: unknown;
  isActive?: unknown;
  title?: unknown;
}

export interface ParsedCampaignQuery {
  creatorId: string | null;
  isActive: boolean | null;
  title: string | null;
}

export interface CampaignPayload {
  id?: unknown;
  creatorId?: unknown;
  titleId?: unknown;
  planId?: unknown;
  title?: unknown;
  description?: unknown;
  targetAmountCents?: unknown;
  raisedAmountCents?: unknown;
  isActive?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
}

export interface RevenueQuery {
  status?: unknown;
}

export interface ParsedRevenueQuery {
  status: RevenueStatusFilter;
}

export interface RevenueStatusPayload {
  status?: unknown;
  note?: unknown;
}

export interface ParsedRevenueStatusPayload {
  id: string;
  status: RevenueStatus;
  note?: string;
}

export interface RevenueSettlePayload {
  settledAt?: unknown;
  note?: unknown;
}

export interface ParsedRevenueSettlePayload {
  id: string;
  settledAt: Date | null;
  note?: string;
}

export interface RevenueEventResponse {
  id: string;
  status: string;
  kind: string;
  amountCents: number;
  currency: string;
  planId: string | null;
  campaignId: string | null;
  payerId: string;
  recipientId: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  settledAt: Date | null;
  createdAt: Date | null;
  metadata: unknown;
  updatedAt?: Date | null;
}

export interface ParsedCampaignPayload {
  id?: string;
  creatorId: string;
  titleId: string | null;
  planId: string | null;
  title: string;
  description: string;
  targetAmountCents: number;
  raisedAmountCents: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface CampaignResponseRow {
  id: string;
  creatorId: string;
  titleId: string | null;
  planId: string | null;
  title: string;
  description: string;
  targetAmountCents: number;
  raisedAmountCents: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  creatorName: string | null;
  creatorEmail: string | null;
  planName: string | null;
  planCode: string | null;
}

export async function requireAdminUser(userId: string): Promise<{ id: string; name: string | null; email: string | null; role: AdminRole }> {
  await ensureUserLifecycleSchema();
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    throw new ForbiddenException("사용자 정보를 확인할 수 없습니다.");
  }
  if (normalizeUserAccountStatus(row.status) !== "active") {
    throw new ForbiddenException("비활성 계정은 관리자 권한을 사용할 수 없습니다.");
  }

  const dbRole = normalizeRole(row.role);
  const email = normalizeAdminEmail(row.email);
  const whitelist = getAdminEmailWhitelist();
  const finalRole: AdminRole = ADMIN_ROLES.has(dbRole) ? dbRole : whitelist.has(email) ? "admin" : dbRole;

  if (whitelist.has(email) && finalRole === "admin" && dbRole !== "admin") {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, row.id));
    invalidateSessionUser(row.id); // 화이트리스트 승격도 권한 변경 — 캐시 즉시 무효화.
  }

  if (!ADMIN_ROLES.has(finalRole)) {
    throw new ForbiddenException("관리자 전용 페이지입니다.");
  }

  return { ...row, role: finalRole };
}

export function parsePlanPayload(body: PlanPayload): ParsedPlanPayload {
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined;
  const code = parseString(body.code, "", 36).toLowerCase();
  const name = parseString(body.name, "", 64);
  const description = parseString(body.description, "", 500);
  const currency = parseString(body.currency, "KRW", 12).toUpperCase() || "KRW";
  const intervalDays = parsePositiveInt(body.intervalDays, 30, 1, 3650);
  const priceCents = parsePositiveInt(body.priceCents, 0, 0, 1_000_000_000);
  const perks = parsePerks(body.perks);
  const isActive = parseBool(body.isActive, true);

  if (!code) throw new BadRequestException("유효한 플랜 코드를 입력해 주세요.");
  if (!name) throw new BadRequestException("플랜 이름을 입력해 주세요.");

  return {
    id,
    code,
    name,
    description,
    intervalDays,
    currency,
    priceCents,
    perks,
    isActive,
  };
}

export function parseCampaignQuery(query: CampaignQuery): ParsedCampaignQuery {
  const creatorId = parseString(query.creatorId, "", 64).trim();
  const title = parseString(query.title, "", 64).trim();
  const isActive = parseBoolOrNull(query.isActive);

  return {
    creatorId: creatorId || null,
    title: title || null,
    isActive,
  };
}

export function parseCampaignPayload(body: CampaignPayload): ParsedCampaignPayload {
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined;
  const creatorId = parseString(body.creatorId, "", 64);
  const titleId = parseString(body.titleId, "", 64);
  const planId = parseString(body.planId, "", 64);
  const title = parseString(body.title, "", 120);
  const description = parseString(body.description, "", 1000);
  const targetAmountCents = parsePositiveInt(body.targetAmountCents, 0, 0, 10_000_000_000);
  const raisedAmountCents = parsePositiveInt(body.raisedAmountCents, 0, 0, 10_000_000_000);
  const isActive = parseBool(body.isActive, true);
  const startsAt = parseCampaignDate(body.startsAt);
  const endsAt = parseCampaignDate(body.endsAt);

  if (!creatorId) throw new BadRequestException("크리에이터 ID가 필요합니다.");
  if (!title) throw new BadRequestException("캠페인 제목을 입력해 주세요.");
  if (startsAt !== null && endsAt !== null && startsAt >= endsAt) {
    throw new BadRequestException("캠페인 기간이 올바르지 않습니다.");
  }

  return {
    id,
    creatorId,
    titleId: titleId || null,
    planId: planId || null,
    title,
    description,
    targetAmountCents,
    raisedAmountCents,
    isActive,
    startsAt,
    endsAt,
  };
}

export function parseRevenueQuery(query: RevenueQuery): ParsedRevenueQuery {
  const status = parseRevenueStatus(query.status) ?? "all";
  return { status };
}

export function parseRevenueStatusPayload(body: RevenueStatusPayload, eventId: string): ParsedRevenueStatusPayload {
  const id = parseString(eventId, "", 64);
  if (!id) throw new BadRequestException("이벤트 ID가 필요합니다.");

  const status = parseRevenueStatus(body.status);
  if (!status) throw new BadRequestException("유효한 수익 상태가 아닙니다.");

  const note = body.note === undefined ? undefined : parseString(body.note, "", 400);

  return {
    id,
    status,
    note,
  };
}

export function parseRevenueSettlePayload(body: RevenueSettlePayload, eventId: string): ParsedRevenueSettlePayload {
  const id = parseString(eventId, "", 64);
  if (!id) throw new BadRequestException("이벤트 ID가 필요합니다.");
  const note = body.note === undefined ? undefined : parseString(body.note, "", 400);
  const settledAt = parseRevenueSettleTimestamp(body.settledAt);

  return {
    id,
    settledAt: settledAt ?? new Date(),
    note,
  };
}

export function parseRevenueSettleTimestamp(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(Math.floor(value));
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return new Date(parsed);
    throw new BadRequestException("정산 일시 형식이 올바르지 않습니다.");
  }
  throw new BadRequestException("정산 일시 형식이 올바르지 않습니다.");
}

export function parseRevenueStatus(value: unknown): RevenueStatus | null {
  const parsed = String(value ?? "").toLowerCase();
  return REVENUE_STATUS_SET.has(parsed as RevenueStatus) ? (parsed as RevenueStatus) : null;
}

export function parseMemberStatus(value: unknown): MemberStatus | null {
  const parsed = String(value ?? "").toLowerCase();
  return MEMBER_STATUSES.has(parsed as MemberStatus) ? (parsed as MemberStatus) : null;
}

export function statusLabel(status: RevenueStatus) {
  if (status === "pending") return "대기";
  if (status === "approved") return "승인";
  if (status === "paid") return "지급";
  if (status === "rejected") return "거절";
  return "회수";
}

export function normalizeRevenueEvent(row: RevenueEventResponse) {
  const safeStatus = parseRevenueStatus(row.status) ?? "pending";
  return {
    id: row.id,
    status: safeStatus,
    kind: row.kind,
    amountCents: toNumber(row.amountCents),
    currency: row.currency,
    planId: row.planId ?? null,
    campaignId: row.campaignId ?? null,
    payerId: row.payerId,
    recipientId: row.recipientId,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null,
    reviewNote: row.reviewNote ?? null,
    settledAt: row.settledAt ? new Date(row.settledAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
  };
}

export function canTransitionRevenueStatus(current: RevenueStatus, next: RevenueStatus) {
  if (current === next) return true;
  if (current === "pending") return next === "approved" || next === "rejected";
  if (current === "approved") return next === "paid" || next === "rejected" || next === "revoked";
  if (current === "paid") return next === "revoked";
  return false;
}

export function parseCampaignDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return new Date(Math.floor(value));
  if (value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() > 0) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return new Date(parsed);
    throw new BadRequestException("날짜 형식이 올바르지 않습니다.");
  }
  return null;
}

export function parseBoolOrNull(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "on", "yes", "y"].includes(normalized)) return true;
    if (["0", "false", "off", "no", "n"].includes(normalized)) return false;
  }
  return null;
}

export async function ensureCreatorExists(creatorId: string) {
  const [withProfile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, creatorId))
    .limit(1);

  if (withProfile) return;

  const [withRole] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, creatorId))
    .limit(1);

  if (withRole && withRole.role === "creator") return;
  throw new BadRequestException("지정한 사용자는 크리에이터가 아닙니다.");
}

export async function ensureCampaignPlanExists(planId: string | null) {
  if (!planId) return;
  const [plan] = await db
    .select({ id: monetizationPlans.id })
    .from(monetizationPlans)
    .where(eq(monetizationPlans.id, planId))
    .limit(1);

  if (!plan) throw new BadRequestException("지정한 수익 플랜을 찾을 수 없습니다.");
}

export async function countFrom(table: Table, where?: SQL) {
  const query = db.select({ total: sql<number>`count(*)`.as("total") }).from(table);
  const [row] = where ? await query.where(where) : await query;
  return toNumber(row?.total);
}

export async function countDistinctActiveUsers(from: number) {
  // from은 epoch-ms 숫자. PG timestamp 컬럼과 비교하려면 timestamp로 변환한다.
  const result = await dbClient.execute({
    sql: `
      SELECT COUNT(DISTINCT "userId") AS total
      FROM (
        SELECT "userId" FROM review WHERE "createdAt" >= to_timestamp(? / 1000.0)
        UNION ALL
        SELECT "userId" FROM fan_post WHERE "createdAt" >= to_timestamp(? / 1000.0)
        UNION ALL
        SELECT "userId" FROM fan_post_reply WHERE "createdAt" >= to_timestamp(? / 1000.0)
        UNION ALL
        SELECT "userId" FROM rating WHERE "updatedAt" >= to_timestamp(? / 1000.0)
        UNION ALL
        SELECT "userId" FROM collection WHERE "createdAt" >= to_timestamp(? / 1000.0)
      ) AS active_users
    `,
    args: [from, from, from, from, from],
  });
  const row = (result.rows as Array<{ total?: unknown; [key: string]: unknown }>)[0];
  return toNumber(row?.total ?? (Array.isArray(row) ? row[0] : undefined));
}

// Resolve columns with the runtime connection, without reading account data or
// attempting DDL. Canonical migrations and bootstrap own all schema changes.
const ADMIN_READINESS_COLUMNS = {
  creator_profile: ["id", "userId", "displayName", "profile", "payoutChannel", "payoutHandle", "isVerifiedCreator", "createdAt", "updatedAt"],
  monetization_plan: ["id", "code", "name", "description", "intervalDays", "currency", "priceCents", "perks", "isActive", "createdAt", "updatedAt"],
  creator_campaign: ["id", "creatorId", "titleId", "planId", "title", "description", "targetAmountCents", "raisedAmountCents", "isActive", "startsAt", "endsAt", "createdAt", "updatedAt"],
  revenue_ledger: ["id", "payerId", "recipientId", "planId", "campaignId", "kind", "status", "amountCents", "currency", "metadata", "reviewedBy", "reviewedAt", "reviewNote", "settledAt", "createdAt"],
  admin_audit_logs: ["id", "adminId", "adminEmail", "action", "targetType", "targetId", "details", "createdAt"],
  admin_banned_words: ["id", "word", "category", "createdBy", "createdAt"],
  admin_promos: ["id", "code", "discountType", "discountValue", "maxUses", "usedCount", "isActive", "expiresAt", "createdAt"],
  admin_announcements: ["id", "title", "content", "level", "placement", "targetRole", "isActive", "startsAt", "endsAt", "createdBy", "createdAt"],
  admin_security_policies: ["id", "ipAddress", "reason", "action", "createdBy", "createdAt"],
  admin_content_reports: ["id", "reporterId", "targetType", "targetId", "reason", "status", "resolvedBy", "resolvedAt", "resolutionNote", "createdAt"],
} as const;

const ADMIN_READINESS_INDEXES = [
  ["idx_admin_audit_logs_createdat", "admin_audit_logs"],
  ["idx_admin_audit_logs_action", "admin_audit_logs"],
  ["idx_admin_announcements_active", "admin_announcements"],
  ["idx_admin_reports_status", "admin_content_reports"],
  ["idx_revenue_ledger_createdat", "revenue_ledger"],
  ["idx_revenue_ledger_status_createdat", "revenue_ledger"],
  ["idx_revenue_ledger_reviewedat", "revenue_ledger"],
  ["idx_revenue_ledger_settledat", "revenue_ledger"],
] as const;

let adminSchemaReadiness: Promise<void> | null = null;

async function assertAdminSchemaReadiness(): Promise<void> {
  await ensureUserLifecycleSchema();
  const relations = Object.entries(ADMIN_READINESS_COLUMNS);
  const columns = relations.flatMap(([table, names]) => names.map(name => `"${table}"."${name}"`));
  await dbClient.execute(`SELECT ${columns.join(", ")} FROM ${relations.map(([table]) => `public."${table}"`).join(" CROSS JOIN ")} WHERE FALSE`);

  const missingIndexes = await dbClient.execute(`
    SELECT expected.name
    FROM (VALUES ${ADMIN_READINESS_INDEXES.map(([name, table]) => `('${name}', '${table}')`).join(", ")}) AS expected(name, table_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index AS i
      JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = i.indexrelid
      JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid = i.indrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
      WHERE namespace.nspname = 'public' AND table_relation.relname = expected.table_name
        AND index_relation.relname = expected.name AND i.indisvalid AND i.indisready
    )
  `);
  if (missingIndexes.rows.length > 0) {
    throw new Error("Admin schema is missing required migration indexes");
  }
}

export async function ensureAdminSchema(): Promise<void> {
  const pending = adminSchemaReadiness ??= assertAdminSchemaReadiness();
  try {
    await pending;
    adminSchemaReady = true;
  } catch (cause) {
    if (adminSchemaReadiness === pending) adminSchemaReadiness = null;
    throw new ServiceUnavailableException(
      "관리자 데이터 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.",
      { cause },
    );
  }
}

export async function logAuditAction(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string | null = null,
    details: Record<string, unknown> = {}
  ) {
    try {
      await ensureAdminSchema();
      const admin = await requireAdminUser(adminId);
      const id = crypto.randomUUID();
      await dbClient.execute({
        sql: `INSERT INTO admin_audit_logs (id, "adminId", "adminEmail", action, "targetType", "targetId", details, "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, now())`,
        args: [id, admin.id, admin.email ?? null, action, targetType, targetId, JSON.stringify(details)],
      });
    } catch (err) {
      console.error(`[admin/audit-log] insert failed: ${(err as Error)?.message ?? err}`);
    }
  }
