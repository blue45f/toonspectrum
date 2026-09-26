import { createHash, randomBytes } from "node:crypto";

import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import {
  canManageCommunityCafe,
  canModerateCommunityCafe,
  canPublishCommunityCafePost,
  COMMUNITY_CAFE_JOIN_POLICIES,
  COMMUNITY_CAFE_KINDS,
  COMMUNITY_CAFE_POSTING_POLICIES,
  COMMUNITY_CAFE_ROLES,
  COMMUNITY_CAFE_VISIBILITIES,
  communityCafeRoleRank,
} from "../../../../packages/core/src/community-governance";
import {
  communityCafeBans,
  communityCafeInvites,
  communityCafeJoinRequests,
  communityCafeMembers,
  communityCafeModerationLogs,
  communityCafes,
  db,
  fanPostReplies,
  fanPosts,
  users,
} from "../platform/database";
import { createSchemaReadinessCheck } from "./schema-readiness";
import { escapeLikePattern } from "./sql-like";

import type {
  CommunityCafe,
  CommunityCafeBan,
  CommunityCafeInvite,
  CommunityCafeJoinPolicy,
  CommunityCafeJoinRequest,
  CommunityCafeKind,
  CommunityCafeMember,
  CommunityCafeModerationLog,
  CommunityCafePostingPolicy,
  CommunityCafeRole,
  CommunityCafeRule,
  CommunityCafeVisibility,
  CreatedCommunityCafeInvite,
  FanCafeBoard,
  FanCafePost,
} from "../../../../packages/core/src/types";
import type { SQL } from "drizzle-orm";

export type CommunityGovernanceErrorCode =
  | "bad-request"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict";

export class CommunityGovernanceError extends Error {
  readonly code: CommunityGovernanceErrorCode;

  constructor(code: CommunityGovernanceErrorCode, message: string) {
    super(message);
    this.name = "CommunityGovernanceError";
    this.code = code;
  }
}

const MAX_NAME = 40;
const MAX_DESCRIPTION = 500;
const MAX_TAGS = 8;
const MAX_TAG = 24;
const MAX_RULES = 12;
const MAX_RULE_TITLE = 60;
const MAX_RULE_DESCRIPTION = 300;
const MAX_JOIN_MESSAGE = 300;
const MAX_BAN_REASON = 300;
const MAX_OWNED_COMMUNITIES = 5;

const ensureCommunityGovernanceTables = createSchemaReadinessCheck([
  `SELECT "id", "slug", "name", "description", "genre", "kind", "tags",
          "visibility", "joinPolicy", "postingPolicy", "rules", "status",
          "createdBy", "hidden", "createdAt", "updatedAt"
   FROM "community_cafe" WHERE FALSE`,
  `SELECT "cafeId", "userId", "role", "joinedAt"
   FROM "community_cafe_member" WHERE FALSE`,
  `SELECT "id", "cafeId", "userId", "message", "status", "reviewedBy",
          "reviewedAt", "createdAt", "updatedAt"
   FROM "community_cafe_join_request" WHERE FALSE`,
  `SELECT "id", "cafeId", "codeHash", "createdBy", "maxUses", "useCount",
          "expiresAt", "revokedAt", "createdAt"
   FROM "community_cafe_invite" WHERE FALSE`,
  `SELECT "cafeId", "userId", "reason", "bannedBy", "expiresAt", "createdAt"
   FROM "community_cafe_ban" WHERE FALSE`,
  `SELECT "id", "cafeId", "actorId", "action", "targetUserId", "targetPostId",
          "metadata", "createdAt"
   FROM "community_cafe_moderation_log" WHERE FALSE`,
]);

function badRequest(message: string): never {
  throw new CommunityGovernanceError("bad-request", message);
}

function forbidden(message: string): never {
  throw new CommunityGovernanceError("forbidden", message);
}

function notFound(message = "커뮤니티를 찾을 수 없어요."): never {
  throw new CommunityGovernanceError("not-found", message);
}

function conflict(message: string): never {
  throw new CommunityGovernanceError("conflict", message);
}

function cleanInline(value: unknown, max: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function cleanMultiline(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, max);
}

function safeDate(value: Date | number | null | undefined): string {
  return new Date(value ?? Date.now()).toISOString();
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function cleanTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/u)
      : [];
  return [...new Set(raw.map((item) => cleanInline(item, MAX_TAG)).filter(Boolean))].slice(
    0,
    MAX_TAGS,
  );
}

function cleanRules(value: unknown): CommunityCafeRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const record = (item ?? {}) as Record<string, unknown>;
      const title = cleanInline(record.title, MAX_RULE_TITLE);
      const description = cleanMultiline(record.description, MAX_RULE_DESCRIPTION);
      if (!title) return null;
      return {
        id: `rule-${index + 1}`,
        title,
        description,
      } satisfies CommunityCafeRule;
    })
    .filter((item): item is CommunityCafeRule => item !== null)
    .slice(0, MAX_RULES);
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function parseCreateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  errorMessage: string,
): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (!allowed.includes(value as T)) badRequest(errorMessage);
  return value as T;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/gu, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-{2,}/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);
}

function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function activeBanCondition(userId: string): SQL {
  const now = new Date();
  return and(
    eq(communityCafeBans.userId, userId),
    or(isNull(communityCafeBans.expiresAt), gt(communityCafeBans.expiresAt, now)),
  )!;
}

export interface CommunityCafeCreateInput {
  name: string;
  slug?: string;
  description: string;
  genre: string;
  kind: CommunityCafeKind;
  tags: string[];
  visibility: CommunityCafeVisibility;
  joinPolicy: CommunityCafeJoinPolicy;
  postingPolicy: CommunityCafePostingPolicy;
  rules: CommunityCafeRule[];
}

export interface CommunityCafeUpdateInput {
  name?: string;
  description?: string;
  genre?: string;
  kind?: CommunityCafeKind;
  tags?: string[];
  visibility?: CommunityCafeVisibility;
  joinPolicy?: CommunityCafeJoinPolicy;
  postingPolicy?: CommunityCafePostingPolicy;
  rules?: CommunityCafeRule[];
}

export function validateCommunityCafeCreateInput(
  input: unknown,
  allowedGenres: readonly string[],
): CommunityCafeCreateInput {
  const body = (input ?? {}) as Record<string, unknown>;
  const name = cleanInline(body.name, MAX_NAME);
  const description = cleanMultiline(body.description, MAX_DESCRIPTION);
  const genre = cleanInline(body.genre, 30);
  const customSlug = cleanInline(body.slug, 60);
  if (name.length < 2) badRequest("커뮤니티 이름은 2자 이상 입력해 주세요.");
  if (description.length < 2) badRequest("커뮤니티 소개를 2자 이상 입력해 주세요.");
  if (genre && !allowedGenres.includes(genre)) badRequest("지원하지 않는 장르예요.");
  if (customSlug && slugify(customSlug) !== customSlug.toLowerCase()) {
    badRequest("고유 주소는 한글, 영문, 숫자와 하이픈만 사용할 수 있어요.");
  }
  return {
    name,
    slug: customSlug ? slugify(customSlug) : undefined,
    description,
    genre,
    kind: parseCreateEnum(
      body.kind,
      COMMUNITY_CAFE_KINDS,
      "genre",
      "지원하지 않는 커뮤니티 유형이에요.",
    ),
    tags: cleanTags(body.tags),
    visibility: parseCreateEnum(
      body.visibility,
      COMMUNITY_CAFE_VISIBILITIES,
      "public",
      "공개 범위를 확인해 주세요.",
    ),
    joinPolicy: parseCreateEnum(
      body.joinPolicy,
      COMMUNITY_CAFE_JOIN_POLICIES,
      "open",
      "가입 정책을 확인해 주세요.",
    ),
    postingPolicy: parseCreateEnum(
      body.postingPolicy,
      COMMUNITY_CAFE_POSTING_POLICIES,
      "members",
      "게시 정책을 확인해 주세요.",
    ),
    rules: cleanRules(body.rules),
  };
}

export function validateCommunityCafeUpdateInput(
  input: unknown,
  allowedGenres: readonly string[],
): CommunityCafeUpdateInput {
  const body = (input ?? {}) as Record<string, unknown>;
  const result: CommunityCafeUpdateInput = {};
  if (Object.hasOwn(body, "name")) {
    const name = cleanInline(body.name, MAX_NAME);
    if (name.length < 2) badRequest("커뮤니티 이름은 2자 이상 입력해 주세요.");
    result.name = name;
  }
  if (Object.hasOwn(body, "description")) {
    const description = cleanMultiline(body.description, MAX_DESCRIPTION);
    if (description.length < 2) badRequest("커뮤니티 소개를 2자 이상 입력해 주세요.");
    result.description = description;
  }
  if (Object.hasOwn(body, "genre")) {
    const genre = cleanInline(body.genre, 30);
    if (genre && !allowedGenres.includes(genre)) badRequest("지원하지 않는 장르예요.");
    result.genre = genre;
  }
  if (Object.hasOwn(body, "kind")) {
    if (!COMMUNITY_CAFE_KINDS.includes(body.kind as CommunityCafeKind)) {
      badRequest("지원하지 않는 커뮤니티 유형이에요.");
    }
    result.kind = body.kind as CommunityCafeKind;
  }
  if (Object.hasOwn(body, "tags")) result.tags = cleanTags(body.tags);
  if (Object.hasOwn(body, "visibility")) {
    if (!COMMUNITY_CAFE_VISIBILITIES.includes(body.visibility as CommunityCafeVisibility)) {
      badRequest("공개 범위를 확인해 주세요.");
    }
    result.visibility = body.visibility as CommunityCafeVisibility;
  }
  if (Object.hasOwn(body, "joinPolicy")) {
    if (!COMMUNITY_CAFE_JOIN_POLICIES.includes(body.joinPolicy as CommunityCafeJoinPolicy)) {
      badRequest("가입 정책을 확인해 주세요.");
    }
    result.joinPolicy = body.joinPolicy as CommunityCafeJoinPolicy;
  }
  if (Object.hasOwn(body, "postingPolicy")) {
    if (!COMMUNITY_CAFE_POSTING_POLICIES.includes(body.postingPolicy as CommunityCafePostingPolicy)) {
      badRequest("게시 정책을 확인해 주세요.");
    }
    result.postingPolicy = body.postingPolicy as CommunityCafePostingPolicy;
  }
  if (Object.hasOwn(body, "rules")) result.rules = cleanRules(body.rules);
  if (Object.keys(result).length === 0) badRequest("변경할 설정이 없어요.");
  return result;
}

interface CafeRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  genre: string;
  kind: string;
  tags: unknown;
  visibility: string;
  joinPolicy: string;
  postingPolicy: string;
  rules: unknown;
  status: string;
  createdBy: string;
  ownerName: string | null;
  memberCount: unknown;
  postCount: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface ViewerState {
  role: CommunityCafeRole | null;
  pendingRequestId: string | null;
  banned: boolean;
}

const memberCountExpression = sql<number>`(
  SELECT count(*) FROM community_cafe_member m
  WHERE m."cafeId" = ${communityCafes.id}
)`;
const postCountExpression = sql<number>`(
  SELECT count(*) FROM fan_post p
  WHERE p.scope = 'cafe'
    AND p."targetId" = ${communityCafes.slug}
    AND p.hidden = false
)`;

function cafeSelection() {
  return {
    id: communityCafes.id,
    slug: communityCafes.slug,
    name: communityCafes.name,
    description: communityCafes.description,
    genre: communityCafes.genre,
    kind: communityCafes.kind,
    tags: communityCafes.tags,
    visibility: communityCafes.visibility,
    joinPolicy: communityCafes.joinPolicy,
    postingPolicy: communityCafes.postingPolicy,
    rules: communityCafes.rules,
    status: communityCafes.status,
    createdBy: communityCafes.createdBy,
    ownerName: users.name,
    memberCount: memberCountExpression.as("memberCount"),
    postCount: postCountExpression.as("postCount"),
    createdAt: communityCafes.createdAt,
    updatedAt: communityCafes.updatedAt,
  };
}

function mapCafe(row: CafeRow, state: ViewerState): CommunityCafe {
  const role = state.banned ? null : state.role;
  const status = row.status === "archived" ? "archived" : "active";
  const visibility = row.visibility === "private" ? "private" : "public";
  const postingPolicy = row.postingPolicy === "staff" ? "staff" : "members";
  const viewerCanViewContent = visibility === "public" || Boolean(role);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    genre: row.genre,
    kind: parseEnum(row.kind, COMMUNITY_CAFE_KINDS, "genre"),
    tags: cleanTags(parseJsonArray<unknown>(row.tags)),
    visibility,
    joinPolicy: parseEnum(row.joinPolicy, COMMUNITY_CAFE_JOIN_POLICIES, "open"),
    postingPolicy,
    rules: cleanRules(parseJsonArray<unknown>(row.rules)),
    status,
    createdBy: row.createdBy,
    ownerName: row.ownerName ?? "알 수 없음",
    memberCount: Number(row.memberCount ?? 0),
    postCount: Number(row.postCount ?? 0),
    createdAt: safeDate(row.createdAt),
    updatedAt: safeDate(row.updatedAt ?? row.createdAt),
    viewerIsMember: Boolean(role),
    viewerRole: role,
    viewerMembershipState: state.banned
      ? "banned"
      : role
        ? "member"
        : state.pendingRequestId
          ? "pending"
          : "none",
    viewerJoinRequestId: state.pendingRequestId,
    viewerCanViewContent,
    viewerCanManage: canManageCommunityCafe(role),
    viewerCanModerate: canModerateCommunityCafe(role),
    viewerCanPost:
      status === "active" && canPublishCommunityCafePost(role, postingPolicy),
  };
}

async function loadViewerStates(
  cafeIds: string[],
  viewerId: string | null,
): Promise<Map<string, ViewerState>> {
  const states = new Map<string, ViewerState>();
  for (const cafeId of cafeIds) {
    states.set(cafeId, { role: null, pendingRequestId: null, banned: false });
  }
  if (!viewerId || cafeIds.length === 0) return states;
  const [memberships, requests, bans] = await Promise.all([
    db
      .select({ cafeId: communityCafeMembers.cafeId, role: communityCafeMembers.role })
      .from(communityCafeMembers)
      .where(
        and(
          inArray(communityCafeMembers.cafeId, cafeIds),
          eq(communityCafeMembers.userId, viewerId),
        ),
      ),
    db
      .select({ cafeId: communityCafeJoinRequests.cafeId, id: communityCafeJoinRequests.id })
      .from(communityCafeJoinRequests)
      .where(
        and(
          inArray(communityCafeJoinRequests.cafeId, cafeIds),
          eq(communityCafeJoinRequests.userId, viewerId),
          eq(communityCafeJoinRequests.status, "pending"),
        ),
      ),
    db
      .select({ cafeId: communityCafeBans.cafeId })
      .from(communityCafeBans)
      .where(and(inArray(communityCafeBans.cafeId, cafeIds), activeBanCondition(viewerId))),
  ]);
  for (const membership of memberships) {
    const state = states.get(membership.cafeId);
    if (state) state.role = parseEnum<CommunityCafeRole>(membership.role, COMMUNITY_CAFE_ROLES, "member");
  }
  for (const request of requests) {
    const state = states.get(request.cafeId);
    if (state) state.pendingRequestId = request.id;
  }
  for (const ban of bans) {
    const state = states.get(ban.cafeId);
    if (state) state.banned = true;
  }
  return states;
}

async function selectCafeRowBySlug(slug: string): Promise<CafeRow | null> {
  const [row] = await db
    .select(cafeSelection())
    .from(communityCafes)
    .innerJoin(users, eq(communityCafes.createdBy, users.id))
    .where(and(eq(communityCafes.slug, slug), eq(communityCafes.hidden, false)))
    .limit(1);
  return (row as CafeRow | undefined) ?? null;
}

export async function listGovernedCafes(options: {
  viewerId?: string | null;
  genre?: string | null;
  kind?: string | null;
  query?: string | null;
  sort?: "recent" | "popular";
  mineOnly?: boolean;
  limit?: number;
} = {}): Promise<CommunityCafe[]> {
  await ensureCommunityGovernanceTables();
  const viewerId = options.viewerId ?? null;
  const limit = Math.max(1, Math.min(options.limit ?? 40, 100));
  const genre = cleanInline(options.genre, 30);
  const search = cleanInline(options.query, 80).toLowerCase();
  const kind = COMMUNITY_CAFE_KINDS.includes(options.kind as CommunityCafeKind)
    ? (options.kind as CommunityCafeKind)
    : null;
  if (options.mineOnly && !viewerId) {
    throw new CommunityGovernanceError("unauthorized", "로그인이 필요해요.");
  }

  let whereClause: SQL | undefined = and(
    eq(communityCafes.hidden, false),
    eq(communityCafes.status, "active"),
  );
  const memberExists = viewerId
    ? sql`EXISTS (
        SELECT 1 FROM community_cafe_member viewer_member
        WHERE viewer_member."cafeId" = ${communityCafes.id}
          AND viewer_member."userId" = ${viewerId}
      )`
    : undefined;
  const requestExists = viewerId
    ? sql`EXISTS (
        SELECT 1 FROM community_cafe_join_request viewer_request
        WHERE viewer_request."cafeId" = ${communityCafes.id}
          AND viewer_request."userId" = ${viewerId}
          AND viewer_request.status = 'pending'
      )`
    : undefined;

  if (options.mineOnly) {
    whereClause = and(whereClause, or(memberExists, requestExists));
  } else if (viewerId) {
    whereClause = and(
      whereClause,
      or(eq(communityCafes.visibility, "public"), memberExists),
    );
  } else {
    whereClause = and(whereClause, eq(communityCafes.visibility, "public"));
  }
  if (genre) whereClause = and(whereClause, eq(communityCafes.genre, genre));
  if (kind) whereClause = and(whereClause, eq(communityCafes.kind, kind));
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    whereClause = and(
      whereClause,
      or(
        sql`lower(${communityCafes.name}) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(${communityCafes.description}) LIKE ${pattern} ESCAPE '\\'`,
      ),
    );
  }

  let query = db
    .select(cafeSelection())
    .from(communityCafes)
    .innerJoin(users, eq(communityCafes.createdBy, users.id))
    .$dynamic();
  if (whereClause) query = query.where(whereClause);
  const rows = await query
    .orderBy(
      ...(options.sort === "recent"
        ? [desc(communityCafes.createdAt)]
        : [
            desc(memberCountExpression),
            desc(postCountExpression),
            desc(communityCafes.createdAt),
          ]),
    )
    .limit(limit);
  const typedRows = rows as CafeRow[];
  const states = await loadViewerStates(
    typedRows.map((row) => row.id),
    viewerId,
  );
  return typedRows
    .map((row) =>
      mapCafe(
        row,
        states.get(row.id) ?? {
          role: null,
          pendingRequestId: null,
          banned: false,
        },
      ),
    )
    .filter(
      (cafe) =>
        cafe.visibility === "public" ||
        cafe.viewerMembershipState === "member" ||
        (options.mineOnly && cafe.viewerMembershipState === "pending"),
    );
}

export async function getGovernedCafeBySlug(
  slug: string,
  viewerId: string | null,
): Promise<CommunityCafe | null> {
  await ensureCommunityGovernanceTables();
  const normalizedSlug = cleanInline(slug, 80);
  if (!normalizedSlug) return null;
  const row = await selectCafeRowBySlug(normalizedSlug);
  if (!row) return null;
  const states = await loadViewerStates([row.id], viewerId);
  return mapCafe(
    row,
    states.get(row.id) ?? { role: null, pendingRequestId: null, banned: false },
  );
}

async function requireCafe(slug: string, viewerId: string | null): Promise<CommunityCafe> {
  const cafe = await getGovernedCafeBySlug(slug, viewerId);
  if (!cafe) notFound();
  return cafe;
}

async function requireManageRole(slug: string, actorId: string): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, actorId);
  if (!canManageCommunityCafe(cafe.viewerRole)) {
    forbidden("커뮤니티 관리자만 변경할 수 있어요.");
  }
  return cafe;
}

async function requireModerateRole(slug: string, actorId: string): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, actorId);
  if (!canModerateCommunityCafe(cafe.viewerRole)) {
    forbidden("커뮤니티 운영진만 처리할 수 있어요.");
  }
  return cafe;
}

async function resolveUniqueSlug(name: string, requested?: string): Promise<string> {
  const base = requested || slugify(name);
  if (!base) badRequest("커뮤니티 고유 주소를 만들 수 없어요.");
  let candidate = base;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const [existing] = await db
      .select({ id: communityCafes.id })
      .from(communityCafes)
      .where(eq(communityCafes.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    if (requested) conflict("이미 사용 중인 커뮤니티 주소예요.");
    candidate = `${base.slice(0, 55)}-${randomBytes(3).toString("hex")}`;
  }
  conflict("고유 주소를 만들지 못했습니다. 이름을 바꿔 다시 시도해 주세요.");
}

export async function createGovernedCafe(
  userId: string,
  input: CommunityCafeCreateInput,
): Promise<CommunityCafe> {
  await ensureCommunityGovernanceTables();
  const [owned] = await db
    .select({ count: sql<number>`count(*)` })
    .from(communityCafeMembers)
    .innerJoin(communityCafes, eq(communityCafeMembers.cafeId, communityCafes.id))
    .where(
      and(
        eq(communityCafeMembers.userId, userId),
        eq(communityCafeMembers.role, "owner"),
        eq(communityCafes.status, "active"),
      ),
    );
  if (Number(owned?.count ?? 0) >= MAX_OWNED_COMMUNITIES) {
    conflict(`한 계정은 활성 커뮤니티를 최대 ${MAX_OWNED_COMMUNITIES}개까지 운영할 수 있어요.`);
  }
  const slug = await resolveUniqueSlug(input.name, input.slug);
  const cafeId = crypto.randomUUID();
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(communityCafes).values({
        id: cafeId,
        slug,
        name: input.name,
        description: input.description,
        genre: input.genre,
        kind: input.kind,
        tags: input.tags,
        visibility: input.visibility,
        joinPolicy: input.joinPolicy,
        postingPolicy: input.postingPolicy,
        rules: input.rules,
        status: "active",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(communityCafeMembers).values({
        cafeId,
        userId,
        role: "owner",
        joinedAt: now,
      });
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId,
        actorId: userId,
        action: "community-created",
        metadata: { visibility: input.visibility, joinPolicy: input.joinPolicy },
        createdAt: now,
      });
    });
  } catch (error) {
    if (error instanceof CommunityGovernanceError) throw error;
    if (String(error).toLowerCase().includes("unique")) {
      conflict("이미 사용 중인 커뮤니티 주소예요.");
    }
    throw error;
  }
  const created = await getGovernedCafeBySlug(slug, userId);
  if (!created) throw new Error("Created community could not be read back");
  return created;
}

export async function updateGovernedCafe(
  slug: string,
  actorId: string,
  input: CommunityCafeUpdateInput,
): Promise<CommunityCafe> {
  const cafe = await requireManageRole(slug, actorId);
  if (cafe.status === "archived") forbidden("보관된 커뮤니티 설정은 변경할 수 없어요.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(communityCafes)
      .set({ ...input, updatedAt: now })
      .where(eq(communityCafes.id, cafe.id));
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "settings-updated",
      metadata: { fields: Object.keys(input).join(",") },
      createdAt: now,
    });
  });
  return (await getGovernedCafeBySlug(slug, actorId))!;
}

export async function archiveGovernedCafe(
  slug: string,
  actorId: string,
): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, actorId);
  if (cafe.viewerRole !== "owner") forbidden("소유자만 커뮤니티를 보관할 수 있어요.");
  if (cafe.status === "archived") return cafe;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(communityCafes)
      .set({ status: "archived", updatedAt: now })
      .where(eq(communityCafes.id, cafe.id));
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "community-archived",
      metadata: {},
      createdAt: now,
    });
  });
  return (await getGovernedCafeBySlug(slug, actorId))!;
}

export async function assertCommunityContentAccess(
  slug: string,
  viewerId: string | null,
): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, viewerId);
  if (!cafe.viewerCanViewContent) notFound();
  return cafe;
}

export async function assertCommunityPostingAccess(
  slug: string,
  userId: string,
): Promise<CommunityCafe> {
  const cafe = await assertCommunityContentAccess(slug, userId);
  if (cafe.status !== "active") forbidden("보관된 커뮤니티에는 글이나 댓글을 작성할 수 없어요.");
  if (!cafe.viewerCanPost) {
    forbidden(
      cafe.postingPolicy === "staff"
        ? "운영진만 글과 댓글을 작성할 수 있어요."
        : "가입한 회원만 글과 댓글을 작성할 수 있어요.",
    );
  }
  return cafe;
}

export async function assertCafePostAccess(
  postId: string,
  viewerId: string | null,
): Promise<{ scope: string; targetId: string }> {
  await ensureCommunityGovernanceTables();
  const [post] = await db
    .select({ scope: fanPosts.scope, targetId: fanPosts.targetId })
    .from(fanPosts)
    .where(and(eq(fanPosts.id, postId), eq(fanPosts.hidden, false)))
    .limit(1);
  if (!post) notFound("게시글을 찾을 수 없어요.");
  if (post.scope === "cafe") await assertCommunityContentAccess(post.targetId, viewerId);
  return post;
}

export async function filterAccessibleCafePosts(
  posts: FanCafePost[],
  viewerId: string | null,
): Promise<FanCafePost[]> {
  const cafeSlugs = [...new Set(posts.filter((post) => post.scope === "cafe").map((post) => post.targetId))];
  if (cafeSlugs.length === 0) return posts;
  const rows = await db
    .select({ id: communityCafes.id, slug: communityCafes.slug, visibility: communityCafes.visibility })
    .from(communityCafes)
    .where(
      and(
        inArray(communityCafes.slug, cafeSlugs),
        eq(communityCafes.hidden, false),
      ),
    );
  const states = await loadViewerStates(
    rows.map((row) => row.id),
    viewerId,
  );
  const accessible = new Set(
    rows
      .filter((row) => {
        const state = states.get(row.id);
        return row.visibility === "public" || Boolean(state?.role && !state.banned);
      })
      .map((row) => row.slug),
  );
  return posts.filter((post) => post.scope !== "cafe" || accessible.has(post.targetId));
}

export async function filterAccessibleCafeBoards(
  boards: FanCafeBoard[],
  viewerId: string | null,
): Promise<FanCafeBoard[]> {
  const cafeSlugs = [...new Set(boards.filter((board) => board.scope === "cafe").map((board) => board.targetId))];
  if (cafeSlugs.length === 0) return boards;
  const rows = await db
    .select({ id: communityCafes.id, slug: communityCafes.slug, visibility: communityCafes.visibility })
    .from(communityCafes)
    .where(
      and(
        inArray(communityCafes.slug, cafeSlugs),
        eq(communityCafes.hidden, false),
      ),
    );
  const states = await loadViewerStates(
    rows.map((row) => row.id),
    viewerId,
  );
  const accessible = new Set(
    rows
      .filter((row) => {
        const state = states.get(row.id);
        return row.visibility === "public" || Boolean(state?.role && !state.banned);
      })
      .map((row) => row.slug),
  );
  return boards.filter((board) => board.scope !== "cafe" || accessible.has(board.targetId));
}

export async function joinGovernedCafe(
  slug: string,
  userId: string,
  input: { message?: unknown; inviteCode?: unknown } = {},
): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, userId);
  if (cafe.status !== "active") forbidden("보관된 커뮤니티에는 가입할 수 없어요.");
  if (cafe.viewerMembershipState === "banned") forbidden("이 커뮤니티에 가입할 수 없어요.");
  if (cafe.viewerIsMember) return cafe;

  const now = new Date();
  const inviteCode = cleanInline(input.inviteCode, 200);
  const message = cleanMultiline(input.message, MAX_JOIN_MESSAGE);
  if (inviteCode) {
    const codeHash = hashInviteCode(inviteCode);
    await db.transaction(async (tx) => {
      const [invite] = await tx
        .select({ id: communityCafeInvites.id })
        .from(communityCafeInvites)
        .where(
          and(
            eq(communityCafeInvites.cafeId, cafe.id),
            eq(communityCafeInvites.codeHash, codeHash),
            isNull(communityCafeInvites.revokedAt),
            gt(communityCafeInvites.expiresAt, now),
            sql`${communityCafeInvites.useCount} < ${communityCafeInvites.maxUses}`,
          ),
        )
        .limit(1);
      if (!invite) conflict("초대 코드가 유효하지 않거나 만료됐어요.");
      const inserted = await tx
        .insert(communityCafeMembers)
        .values({ cafeId: cafe.id, userId, role: "member", joinedAt: now })
        .onConflictDoNothing()
        .returning({ userId: communityCafeMembers.userId });
      if (inserted.length === 0) return;
      const used = await tx
        .update(communityCafeInvites)
        .set({ useCount: sql`${communityCafeInvites.useCount} + 1` })
        .where(
          and(
            eq(communityCafeInvites.id, invite.id),
            sql`${communityCafeInvites.useCount} < ${communityCafeInvites.maxUses}`,
          ),
        )
        .returning({ id: communityCafeInvites.id });
      if (used.length === 0) conflict("초대 코드의 사용 가능 횟수가 모두 소진됐어요.");
      await tx
        .update(communityCafeJoinRequests)
        .set({ status: "cancelled", updatedAt: now })
        .where(
          and(
            eq(communityCafeJoinRequests.cafeId, cafe.id),
            eq(communityCafeJoinRequests.userId, userId),
            eq(communityCafeJoinRequests.status, "pending"),
          ),
        );
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId: cafe.id,
        actorId: userId,
        action: "member-joined-by-invite",
        targetUserId: userId,
        metadata: { inviteId: invite.id },
        createdAt: now,
      });
    });
    return (await getGovernedCafeBySlug(slug, userId))!;
  }

  if (cafe.joinPolicy === "invite") {
    forbidden("초대 코드가 있어야 가입할 수 있어요.");
  }
  if (cafe.joinPolicy === "approval") {
    const id = cafe.viewerJoinRequestId ?? crypto.randomUUID();
    await db
      .insert(communityCafeJoinRequests)
      .values({
        id,
        cafeId: cafe.id,
        userId,
        message,
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [communityCafeJoinRequests.cafeId, communityCafeJoinRequests.userId],
        set: {
          message,
          status: "pending",
          reviewedBy: null,
          reviewedAt: null,
          updatedAt: now,
        },
      });
    return (await getGovernedCafeBySlug(slug, userId))!;
  }

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(communityCafeMembers)
      .values({ cafeId: cafe.id, userId, role: "member", joinedAt: now })
      .onConflictDoNothing()
      .returning({ userId: communityCafeMembers.userId });
    await tx
      .update(communityCafeJoinRequests)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          eq(communityCafeJoinRequests.cafeId, cafe.id),
          eq(communityCafeJoinRequests.userId, userId),
          eq(communityCafeJoinRequests.status, "pending"),
        ),
      );
    if (inserted.length > 0) {
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId: cafe.id,
        actorId: userId,
        action: "member-joined",
        targetUserId: userId,
        metadata: {},
        createdAt: now,
      });
    }
  });
  return (await getGovernedCafeBySlug(slug, userId))!;
}

export async function leaveOrCancelGovernedCafe(
  slug: string,
  userId: string,
): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, userId);
  const now = new Date();
  if (cafe.viewerRole === "owner") {
    conflict("소유권을 다른 회원에게 이전한 뒤 탈퇴할 수 있어요.");
  }
  if (cafe.viewerJoinRequestId && !cafe.viewerIsMember) {
    await db
      .update(communityCafeJoinRequests)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          eq(communityCafeJoinRequests.id, cafe.viewerJoinRequestId),
          eq(communityCafeJoinRequests.userId, userId),
          eq(communityCafeJoinRequests.status, "pending"),
        ),
      );
    return (await getGovernedCafeBySlug(slug, userId))!;
  }
  if (!cafe.viewerIsMember) return cafe;
  await db.transaction(async (tx) => {
    await tx
      .delete(communityCafeMembers)
      .where(
        and(
          eq(communityCafeMembers.cafeId, cafe.id),
          eq(communityCafeMembers.userId, userId),
        ),
      );
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId: userId,
      action: "member-left",
      targetUserId: userId,
      metadata: {},
      createdAt: now,
    });
  });
  return (await getGovernedCafeBySlug(slug, userId))!;
}

function mapJoinRequest(row: {
  id: string;
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  message: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CommunityCafeJoinRequest {
  const allowed = ["pending", "approved", "rejected", "cancelled"] as const;
  const status = allowed.includes(row.status as (typeof allowed)[number])
    ? (row.status as CommunityCafeJoinRequest["status"])
    : "pending";
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName ?? "알 수 없음",
    userAvatar: row.userAvatar,
    message: row.message,
    status,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? safeDate(row.reviewedAt) : null,
    createdAt: safeDate(row.createdAt),
    updatedAt: safeDate(row.updatedAt),
  };
}

export async function listGovernedCafeJoinRequests(
  slug: string,
  actorId: string,
): Promise<CommunityCafeJoinRequest[]> {
  const cafe = await requireManageRole(slug, actorId);
  const rows = await db
    .select({
      id: communityCafeJoinRequests.id,
      userId: communityCafeJoinRequests.userId,
      userName: users.name,
      userAvatar: users.avatar,
      message: communityCafeJoinRequests.message,
      status: communityCafeJoinRequests.status,
      reviewedBy: communityCafeJoinRequests.reviewedBy,
      reviewedAt: communityCafeJoinRequests.reviewedAt,
      createdAt: communityCafeJoinRequests.createdAt,
      updatedAt: communityCafeJoinRequests.updatedAt,
    })
    .from(communityCafeJoinRequests)
    .innerJoin(users, eq(communityCafeJoinRequests.userId, users.id))
    .where(
      and(
        eq(communityCafeJoinRequests.cafeId, cafe.id),
        eq(communityCafeJoinRequests.status, "pending"),
      ),
    )
    .orderBy(communityCafeJoinRequests.createdAt)
    .limit(200);
  return rows.map(mapJoinRequest);
}

export async function reviewGovernedCafeJoinRequest(
  slug: string,
  requestId: string,
  actorId: string,
  decision: "approve" | "reject",
): Promise<CommunityCafeJoinRequest> {
  const cafe = await requireManageRole(slug, actorId);
  const [request] = await db
    .select({
      id: communityCafeJoinRequests.id,
      userId: communityCafeJoinRequests.userId,
      status: communityCafeJoinRequests.status,
    })
    .from(communityCafeJoinRequests)
    .where(
      and(
        eq(communityCafeJoinRequests.id, requestId),
        eq(communityCafeJoinRequests.cafeId, cafe.id),
      ),
    )
    .limit(1);
  if (!request) notFound("가입 요청을 찾을 수 없어요.");
  if (request.status !== "pending") conflict("이미 처리된 가입 요청이에요.");
  const [ban] = await db
    .select({ userId: communityCafeBans.userId })
    .from(communityCafeBans)
    .where(and(eq(communityCafeBans.cafeId, cafe.id), activeBanCondition(request.userId)))
    .limit(1);
  if (decision === "approve" && ban) conflict("차단된 회원의 가입 요청은 승인할 수 없어요.");
  const now = new Date();
  await db.transaction(async (tx) => {
    if (decision === "approve") {
      await tx
        .insert(communityCafeMembers)
        .values({ cafeId: cafe.id, userId: request.userId, role: "member", joinedAt: now })
        .onConflictDoNothing();
    }
    const updated = await tx
      .update(communityCafeJoinRequests)
      .set({
        status: decision === "approve" ? "approved" : "rejected",
        reviewedBy: actorId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(communityCafeJoinRequests.id, request.id),
          eq(communityCafeJoinRequests.status, "pending"),
        ),
      )
      .returning({ id: communityCafeJoinRequests.id });
    if (updated.length === 0) conflict("다른 운영진이 먼저 처리했어요.");
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: decision === "approve" ? "join-request-approved" : "join-request-rejected",
      targetUserId: request.userId,
      metadata: { requestId: request.id },
      createdAt: now,
    });
  });
  const [row] = await db
    .select({
      id: communityCafeJoinRequests.id,
      userId: communityCafeJoinRequests.userId,
      userName: users.name,
      userAvatar: users.avatar,
      message: communityCafeJoinRequests.message,
      status: communityCafeJoinRequests.status,
      reviewedBy: communityCafeJoinRequests.reviewedBy,
      reviewedAt: communityCafeJoinRequests.reviewedAt,
      createdAt: communityCafeJoinRequests.createdAt,
      updatedAt: communityCafeJoinRequests.updatedAt,
    })
    .from(communityCafeJoinRequests)
    .innerJoin(users, eq(communityCafeJoinRequests.userId, users.id))
    .where(eq(communityCafeJoinRequests.id, request.id))
    .limit(1);
  if (!row) notFound("가입 요청을 찾을 수 없어요.");
  return mapJoinRequest(row);
}

export async function listGovernedCafeMembers(
  slug: string,
  actorId: string,
): Promise<CommunityCafeMember[]> {
  const cafe = await requireModerateRole(slug, actorId);
  const rows = await db
    .select({
      userId: communityCafeMembers.userId,
      name: users.name,
      avatar: users.avatar,
      role: communityCafeMembers.role,
      joinedAt: communityCafeMembers.joinedAt,
    })
    .from(communityCafeMembers)
    .innerJoin(users, eq(communityCafeMembers.userId, users.id))
    .where(eq(communityCafeMembers.cafeId, cafe.id))
    .orderBy(
      sql`CASE ${communityCafeMembers.role}
        WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'moderator' THEN 3 ELSE 4 END`,
      communityCafeMembers.joinedAt,
    )
    .limit(1000);
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name ?? "알 수 없음",
    avatar: row.avatar,
    role: parseEnum<CommunityCafeRole>(row.role, COMMUNITY_CAFE_ROLES, "member"),
    joinedAt: safeDate(row.joinedAt),
  }));
}

export async function updateGovernedCafeMemberRole(
  slug: string,
  targetUserId: string,
  actorId: string,
  nextRole: CommunityCafeRole,
): Promise<CommunityCafeMember> {
  const cafe = await requireManageRole(slug, actorId);
  if (!COMMUNITY_CAFE_ROLES.includes(nextRole)) badRequest("지원하지 않는 역할이에요.");
  if (nextRole === "owner") badRequest("소유권 이전 기능을 사용해 주세요.");
  if (targetUserId === actorId) conflict("자신의 역할은 직접 변경할 수 없어요.");
  const [target] = await db
    .select({ role: communityCafeMembers.role })
    .from(communityCafeMembers)
    .where(
      and(
        eq(communityCafeMembers.cafeId, cafe.id),
        eq(communityCafeMembers.userId, targetUserId),
      ),
    )
    .limit(1);
  if (!target) notFound("회원을 찾을 수 없어요.");
  const targetRole = parseEnum<CommunityCafeRole>(target.role, COMMUNITY_CAFE_ROLES, "member");
  if (targetRole === "owner") forbidden("소유자의 역할은 소유권 이전으로만 변경할 수 있어요.");
  if (cafe.viewerRole !== "owner" && (targetRole === "admin" || nextRole === "admin")) {
    forbidden("관리자 역할은 소유자만 변경할 수 있어요.");
  }
  if (communityCafeRoleRank(cafe.viewerRole) <= communityCafeRoleRank(targetRole)) {
    forbidden("자신과 같거나 높은 역할의 회원은 변경할 수 없어요.");
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(communityCafeMembers)
      .set({ role: nextRole })
      .where(
        and(
          eq(communityCafeMembers.cafeId, cafe.id),
          eq(communityCafeMembers.userId, targetUserId),
        ),
      );
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "member-role-updated",
      targetUserId,
      metadata: { previousRole: targetRole, nextRole },
      createdAt: now,
    });
  });
  const members = await listGovernedCafeMembers(slug, actorId);
  const updated = members.find((member) => member.userId === targetUserId);
  if (!updated) notFound("회원을 찾을 수 없어요.");
  return updated;
}

export async function transferGovernedCafeOwnership(
  slug: string,
  targetUserId: string,
  actorId: string,
): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, actorId);
  if (cafe.viewerRole !== "owner") forbidden("소유자만 소유권을 이전할 수 있어요.");
  if (targetUserId === actorId) conflict("이미 커뮤니티 소유자예요.");
  const [target] = await db
    .select({ role: communityCafeMembers.role })
    .from(communityCafeMembers)
    .where(
      and(
        eq(communityCafeMembers.cafeId, cafe.id),
        eq(communityCafeMembers.userId, targetUserId),
      ),
    )
    .limit(1);
  if (!target) notFound("소유권을 받을 회원을 찾을 수 없어요.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(communityCafeMembers)
      .set({
        role: sql`CASE
          WHEN ${communityCafeMembers.userId} = ${targetUserId} THEN 'owner'
          WHEN ${communityCafeMembers.userId} = ${actorId} THEN 'admin'
          ELSE ${communityCafeMembers.role}
        END`,
      })
      .where(
        and(
          eq(communityCafeMembers.cafeId, cafe.id),
          inArray(communityCafeMembers.userId, [actorId, targetUserId]),
        ),
      );
    await tx
      .update(communityCafes)
      .set({ createdBy: targetUserId, updatedAt: now })
      .where(eq(communityCafes.id, cafe.id));
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "ownership-transferred",
      targetUserId,
      metadata: { previousOwnerId: actorId },
      createdAt: now,
    });
  });
  return (await getGovernedCafeBySlug(slug, actorId))!;
}

function normalizeExpiry(value: unknown): Date | null {
  const raw = cleanInline(value, 80);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    badRequest("차단 만료 시각은 현재 이후여야 해요.");
  }
  const max = Date.now() + 366 * 24 * 60 * 60_000;
  if (parsed.getTime() > max) badRequest("차단 기간은 최대 1년까지 설정할 수 있어요.");
  return parsed;
}

export async function banGovernedCafeMember(
  slug: string,
  targetUserId: string,
  actorId: string,
  input: { reason?: unknown; expiresAt?: unknown },
): Promise<CommunityCafeBan> {
  const cafe = await requireModerateRole(slug, actorId);
  if (targetUserId === actorId) conflict("자신을 차단할 수 없어요.");
  const [targetUser] = await db
    .select({ id: users.id, name: users.name, avatar: users.avatar })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!targetUser) notFound("사용자를 찾을 수 없어요.");
  const [membership] = await db
    .select({ role: communityCafeMembers.role })
    .from(communityCafeMembers)
    .where(
      and(
        eq(communityCafeMembers.cafeId, cafe.id),
        eq(communityCafeMembers.userId, targetUserId),
      ),
    )
    .limit(1);
  const targetRole = membership
    ? parseEnum<CommunityCafeRole>(membership.role, COMMUNITY_CAFE_ROLES, "member")
    : null;
  if (targetRole === "owner") forbidden("커뮤니티 소유자는 차단할 수 없어요.");
  if (
    targetRole &&
    communityCafeRoleRank(cafe.viewerRole) <= communityCafeRoleRank(targetRole)
  ) {
    forbidden("자신과 같거나 높은 역할의 회원은 차단할 수 없어요.");
  }
  const reason = cleanMultiline(input.reason, MAX_BAN_REASON);
  if (reason.length < 2) badRequest("차단 사유를 2자 이상 입력해 주세요.");
  const expiresAt = normalizeExpiry(input.expiresAt);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(communityCafeBans)
      .values({ cafeId: cafe.id, userId: targetUserId, reason, bannedBy: actorId, expiresAt, createdAt: now })
      .onConflictDoUpdate({
        target: [communityCafeBans.cafeId, communityCafeBans.userId],
        set: { reason, bannedBy: actorId, expiresAt, createdAt: now },
      });
    await tx
      .delete(communityCafeMembers)
      .where(
        and(
          eq(communityCafeMembers.cafeId, cafe.id),
          eq(communityCafeMembers.userId, targetUserId),
        ),
      );
    await tx
      .update(communityCafeJoinRequests)
      .set({ status: "rejected", reviewedBy: actorId, reviewedAt: now, updatedAt: now })
      .where(
        and(
          eq(communityCafeJoinRequests.cafeId, cafe.id),
          eq(communityCafeJoinRequests.userId, targetUserId),
          eq(communityCafeJoinRequests.status, "pending"),
        ),
      );
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "member-banned",
      targetUserId,
      metadata: { reason, expiresAt: expiresAt?.toISOString() ?? null },
      createdAt: now,
    });
  });
  const bans = await listGovernedCafeBans(slug, actorId);
  const ban = bans.find((item) => item.userId === targetUserId);
  if (!ban) throw new Error("Created community ban could not be read back");
  return ban;
}

export async function listGovernedCafeBans(
  slug: string,
  actorId: string,
): Promise<CommunityCafeBan[]> {
  const cafe = await requireModerateRole(slug, actorId);
  const rows = await db
    .select({
      userId: communityCafeBans.userId,
      userName: users.name,
      userAvatar: users.avatar,
      reason: communityCafeBans.reason,
      bannedBy: communityCafeBans.bannedBy,
      expiresAt: communityCafeBans.expiresAt,
      createdAt: communityCafeBans.createdAt,
    })
    .from(communityCafeBans)
    .innerJoin(users, eq(communityCafeBans.userId, users.id))
    .where(
      and(
        eq(communityCafeBans.cafeId, cafe.id),
        or(isNull(communityCafeBans.expiresAt), gt(communityCafeBans.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(communityCafeBans.createdAt))
    .limit(500);
  const actorIds = [...new Set(rows.map((row) => row.bannedBy).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds))
    : [];
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name ?? "알 수 없음"]));
  return rows.map((row) => ({
    userId: row.userId,
    userName: row.userName ?? "알 수 없음",
    userAvatar: row.userAvatar,
    reason: row.reason,
    bannedBy: row.bannedBy,
    bannedByName: row.bannedBy ? actorNames.get(row.bannedBy) ?? "알 수 없음" : "탈퇴한 운영진",
    expiresAt: row.expiresAt ? safeDate(row.expiresAt) : null,
    createdAt: safeDate(row.createdAt),
  }));
}

export async function unbanGovernedCafeMember(
  slug: string,
  targetUserId: string,
  actorId: string,
): Promise<{ removed: boolean }> {
  const cafe = await requireModerateRole(slug, actorId);
  const now = new Date();
  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(communityCafeBans)
      .where(
        and(
          eq(communityCafeBans.cafeId, cafe.id),
          eq(communityCafeBans.userId, targetUserId),
        ),
      )
      .returning({ userId: communityCafeBans.userId });
    if (rows.length > 0) {
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId: cafe.id,
        actorId,
        action: "member-unbanned",
        targetUserId,
        metadata: {},
        createdAt: now,
      });
    }
    return rows.length > 0;
  });
  return { removed };
}

function parseInviteExpiry(value: unknown): Date {
  const days = Math.max(1, Math.min(Number(value) || 7, 30));
  return new Date(Date.now() + days * 24 * 60 * 60_000);
}

function mapInvite(
  row: {
    id: string;
    createdBy: string | null;
    creatorName: string | null;
    maxUses: number;
    useCount: number;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
  },
): CommunityCafeInvite {
  return {
    id: row.id,
    createdBy: row.createdBy,
    creatorName: row.creatorName ?? "탈퇴한 운영진",
    maxUses: row.maxUses,
    useCount: row.useCount,
    expiresAt: safeDate(row.expiresAt),
    revokedAt: row.revokedAt ? safeDate(row.revokedAt) : null,
    createdAt: safeDate(row.createdAt),
  };
}

export async function listGovernedCafeInvites(
  slug: string,
  actorId: string,
): Promise<CommunityCafeInvite[]> {
  const cafe = await requireManageRole(slug, actorId);
  const rows = await db
    .select({
      id: communityCafeInvites.id,
      createdBy: communityCafeInvites.createdBy,
      creatorName: users.name,
      maxUses: communityCafeInvites.maxUses,
      useCount: communityCafeInvites.useCount,
      expiresAt: communityCafeInvites.expiresAt,
      revokedAt: communityCafeInvites.revokedAt,
      createdAt: communityCafeInvites.createdAt,
    })
    .from(communityCafeInvites)
    .leftJoin(users, eq(communityCafeInvites.createdBy, users.id))
    .where(eq(communityCafeInvites.cafeId, cafe.id))
    .orderBy(desc(communityCafeInvites.createdAt))
    .limit(200);
  return rows.map(mapInvite);
}

export async function createGovernedCafeInvite(
  slug: string,
  actorId: string,
  input: { maxUses?: unknown; expiresInDays?: unknown },
): Promise<CreatedCommunityCafeInvite> {
  const cafe = await requireManageRole(slug, actorId);
  if (cafe.status !== "active") forbidden("보관된 커뮤니티에서는 초대를 만들 수 없어요.");
  const maxUses = Math.max(1, Math.min(Math.floor(Number(input.maxUses) || 1), 100));
  const expiresAt = parseInviteExpiry(input.expiresInDays);
  const code = randomBytes(24).toString("base64url");
  const now = new Date();
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(communityCafeInvites).values({
      id,
      cafeId: cafe.id,
      codeHash: hashInviteCode(code),
      createdBy: actorId,
      maxUses,
      useCount: 0,
      expiresAt,
      createdAt: now,
    });
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "invite-created",
      metadata: { inviteId: id, maxUses, expiresAt: expiresAt.toISOString() },
      createdAt: now,
    });
  });
  const [actor] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);
  return {
    id,
    createdBy: actorId,
    creatorName: actor?.name ?? "알 수 없음",
    maxUses,
    useCount: 0,
    expiresAt: expiresAt.toISOString(),
    revokedAt: null,
    createdAt: now.toISOString(),
    code,
    sharePath: `/community/cafes/${encodeURIComponent(slug)}?invite=${encodeURIComponent(code)}`,
  };
}

export async function revokeGovernedCafeInvite(
  slug: string,
  inviteId: string,
  actorId: string,
): Promise<{ revoked: boolean }> {
  const cafe = await requireManageRole(slug, actorId);
  const now = new Date();
  const revoked = await db.transaction(async (tx) => {
    const rows = await tx
      .update(communityCafeInvites)
      .set({ revokedAt: now })
      .where(
        and(
          eq(communityCafeInvites.id, inviteId),
          eq(communityCafeInvites.cafeId, cafe.id),
          isNull(communityCafeInvites.revokedAt),
        ),
      )
      .returning({ id: communityCafeInvites.id });
    if (rows.length > 0) {
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId: cafe.id,
        actorId,
        action: "invite-revoked",
        metadata: { inviteId },
        createdAt: now,
      });
    }
    return rows.length > 0;
  });
  return { revoked };
}

export async function listGovernedCafeModerationLogs(
  slug: string,
  actorId: string,
  limit = 100,
): Promise<CommunityCafeModerationLog[]> {
  const cafe = await requireModerateRole(slug, actorId);
  const rows = await db
    .select({
      id: communityCafeModerationLogs.id,
      actorId: communityCafeModerationLogs.actorId,
      action: communityCafeModerationLogs.action,
      targetUserId: communityCafeModerationLogs.targetUserId,
      targetPostId: communityCafeModerationLogs.targetPostId,
      metadata: communityCafeModerationLogs.metadata,
      createdAt: communityCafeModerationLogs.createdAt,
    })
    .from(communityCafeModerationLogs)
    .where(eq(communityCafeModerationLogs.cafeId, cafe.id))
    .orderBy(desc(communityCafeModerationLogs.createdAt))
    .limit(Math.max(1, Math.min(limit, 200)));
  const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds))
    : [];
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name ?? "알 수 없음"]));
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorId ? actorNames.get(row.actorId) ?? "알 수 없음" : "탈퇴한 운영진",
    action: row.action,
    targetUserId: row.targetUserId,
    targetPostId: row.targetPostId,
    metadata: (row.metadata ?? {}) as Record<string, string | number | boolean | null>,
    createdAt: safeDate(row.createdAt),
  }));
}

export async function deleteGovernedCommunityPost(
  postId: string,
  userId: string,
): Promise<{ deleted: boolean }> {
  await ensureCommunityGovernanceTables();
  return db.transaction(async (tx) => {
    const [post] = await tx
      .select({
        id: fanPosts.id,
        scope: fanPosts.scope,
        targetId: fanPosts.targetId,
        ownerId: fanPosts.userId,
      })
      .from(fanPosts)
      .where(eq(fanPosts.id, postId))
      .limit(1);
    if (!post) return { deleted: false };

    let staffOverride = false;
    let cafeId: string | null = null;
    if (post.ownerId !== userId) {
      if (post.scope !== "cafe") {
        forbidden("작성자만 삭제할 수 있어요.");
      }
      const [staff] = await tx
        .select({
          cafeId: communityCafes.id,
          role: communityCafeMembers.role,
        })
        .from(communityCafes)
        .innerJoin(
          communityCafeMembers,
          and(
            eq(communityCafeMembers.cafeId, communityCafes.id),
            eq(communityCafeMembers.userId, userId),
          ),
        )
        .where(
          and(
            eq(communityCafes.slug, post.targetId),
            eq(communityCafes.hidden, false),
          ),
        )
        .limit(1);
      const role = staff
        ? parseEnum<CommunityCafeRole>(staff.role, COMMUNITY_CAFE_ROLES, "member")
        : null;
      if (!staff || !canModerateCommunityCafe(role)) {
        forbidden("작성자 또는 커뮤니티 운영진만 삭제할 수 있어요.");
      }
      staffOverride = true;
      cafeId = staff.cafeId;
    }

    const deleted = await tx
      .delete(fanPosts)
      .where(eq(fanPosts.id, postId))
      .returning({ id: fanPosts.id });
    if (deleted.length === 0) return { deleted: false };

    if (staffOverride && cafeId) {
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId,
        actorId: userId,
        action: "post-removed",
        targetUserId: post.ownerId,
        targetPostId: postId,
        metadata: {},
        createdAt: new Date(),
      });
    }
    return { deleted: true };
  });
}

export async function deleteGovernedCommunityReply(
  postId: string,
  replyId: string,
  userId: string,
): Promise<{ deleted: boolean; soft: boolean }> {
  await ensureCommunityGovernanceTables();
  return db.transaction(async (tx) => {
    const [reply] = await tx
      .select({
        id: fanPostReplies.id,
        ownerId: fanPostReplies.userId,
        scope: fanPosts.scope,
        targetId: fanPosts.targetId,
      })
      .from(fanPostReplies)
      .innerJoin(fanPosts, eq(fanPostReplies.postId, fanPosts.id))
      .where(
        and(
          eq(fanPostReplies.id, replyId),
          eq(fanPostReplies.postId, postId),
        ),
      )
      .limit(1);
    if (!reply) return { deleted: false, soft: false };

    let staffOverride = false;
    let cafeId: string | null = null;
    if (reply.ownerId !== userId) {
      if (reply.scope !== "cafe") {
        forbidden("작성자만 삭제할 수 있어요.");
      }
      const [staff] = await tx
        .select({
          cafeId: communityCafes.id,
          role: communityCafeMembers.role,
        })
        .from(communityCafes)
        .innerJoin(
          communityCafeMembers,
          and(
            eq(communityCafeMembers.cafeId, communityCafes.id),
            eq(communityCafeMembers.userId, userId),
          ),
        )
        .where(
          and(
            eq(communityCafes.slug, reply.targetId),
            eq(communityCafes.hidden, false),
          ),
        )
        .limit(1);
      const role = staff
        ? parseEnum<CommunityCafeRole>(staff.role, COMMUNITY_CAFE_ROLES, "member")
        : null;
      if (!staff || !canModerateCommunityCafe(role)) {
        forbidden("작성자 또는 커뮤니티 운영진만 삭제할 수 있어요.");
      }
      staffOverride = true;
      cafeId = staff.cafeId;
    }

    const [child] = await tx
      .select({ id: fanPostReplies.id })
      .from(fanPostReplies)
      .where(eq(fanPostReplies.parentId, replyId))
      .limit(1);
    if (child) {
      const updated = await tx
        .update(fanPostReplies)
        .set({ deletedAt: new Date(), text: "" })
        .where(eq(fanPostReplies.id, replyId))
        .returning({ id: fanPostReplies.id });
      if (updated.length === 0) return { deleted: false, soft: false };
    } else {
      const deleted = await tx
        .delete(fanPostReplies)
        .where(eq(fanPostReplies.id, replyId))
        .returning({ id: fanPostReplies.id });
      if (deleted.length === 0) return { deleted: false, soft: false };
    }

    if (staffOverride && cafeId) {
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId,
        actorId: userId,
        action: "reply-removed",
        targetUserId: reply.ownerId,
        targetPostId: postId,
        metadata: { replyId },
        createdAt: new Date(),
      });
    }
    return { deleted: true, soft: Boolean(child) };
  });
}
