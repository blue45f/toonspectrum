import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  EMPTY_CREATOR_ROLE_PROFILE,
  type CreatorRoleProfile,
} from "../../../../web/src/shared/lib/creator-role-contract";

// libSQL(SQLite) → PostgreSQL(Neon) 마이그레이션:
//  - integer{mode:"timestamp_ms"} → timestamp({mode:"date"})  (Drizzle가 Date로 주고받음)
//  - integer{mode:"boolean"}      → boolean
//  - text{mode:"json"}            → jsonb
//  - 금액(*Cents)                 → bigint({mode:"number"})  (KRW 큰 금액 int32 오버플로 방지)
//
// 인덱스 정책: lib/server/*.ts 의 실제 조회 패턴(외래키 lookup + createdAt 정렬/커서)에 맞춘
// 보조 인덱스를 스키마에 선언한다. 일부는 런타임 ensure(community.ts·creator.ts)가
// 이미 raw SQL 로 만드는 인덱스의 미러 — drizzle-kit 이 스키마 사실을 알도록 "이름까지 동일"하게
// 선언했다(push 시 중복 생성 없음). (userId, titleId) 류 복합 PK/unique 는 첫 컬럼 prefix 조회를
// 이미 커버하므로 별도 인덱스를 만들지 않는다.

// ── 인증 사용자 테이블 + 확장 컬럼 ──────────────
export const users = pgTable(
  "user",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").unique(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
    role: text("role").notNull().default("user"),
    status: text("status").notNull().default("active"), // active | suspended | deleted | merged
    mergedIntoUserId: text("mergedIntoUserId").references(
      (): AnyPgColumn => users.id,
      { onDelete: "set null" },
    ),
    sessionVersion: integer("sessionVersion").notNull().default(1), // 서버 로그아웃·정지·탈퇴 시 증가해 기존 토큰 무효화
    suspendedAt: timestamp("suspendedAt", { mode: "date" }),
    suspensionReason: text("suspensionReason"),
    deletedAt: timestamp("deletedAt", { mode: "date" }),
    // 확장: 크리덴셜 로그인·프로필
    passwordHash: text("passwordHash"),
    avatar: text("avatar"), // 아바타 컬러 hex
    bio: text("bio"),
    creatorRoleProfile: jsonb("creatorRoleProfile")
      .$type<CreatorRoleProfile>()
      .notNull()
      .default(EMPTY_CREATOR_ROLE_PROFILE),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (u) => [index("idx_user_status_created").on(u.status, u.createdAt)]
);


export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (a) => [
    primaryKey({ columns: [a.provider, a.providerAccountId] }),
    index("idx_account_user").on(a.userId),
    uniqueIndex("idx_account_user_provider_unique").on(a.userId, a.provider),
  ]
);


export const accountMerges = pgTable(
  "account_merge",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sourceUserId: text("sourceUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetUserId: text("targetUserId")
      .references(() => users.id, { onDelete: "set null" }),
    tokenHash: text("tokenHash").notNull(),
    status: text("status").notNull().default("issued"),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
    completedAt: timestamp("completedAt", { mode: "date" }),
    summary: jsonb("summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (m) => [
    uniqueIndex("account_merge_token_hash_unique").on(m.tokenHash),
    index("idx_account_merge_source_status").on(m.sourceUserId, m.status, m.createdAt),
    index("idx_account_merge_target_completed").on(m.targetUserId, m.completedAt),
    index("idx_account_merge_expiry").on(m.status, m.expiresAt),
    check(
      "account_merge_status_check",
      sql`${m.status} in ('issued', 'completed', 'cancelled')`,
    ),
    check(
      "account_merge_distinct_accounts_check",
      sql`${m.targetUserId} is null or ${m.sourceUserId} <> ${m.targetUserId}`,
    ),
    check(
      "account_merge_token_hash_check",
      sql`${m.tokenHash} ~ '^sha256:[0-9a-f]{64}
  ],
);


export const sessions = pgTable(
  "session",
  {
    sessionToken: text("sessionToken").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (s) => [index("idx_session_user").on(s.userId)]
);


export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [
    primaryKey({ columns: [vt.identifier, vt.token] }),
    index("idx_verification_token_token").on(vt.token),
    index("idx_verification_token_expires").on(vt.expires),
  ]
);
`,
    ),
    check(
      "account_merge_expiry_check",
      sql`${m.expiresAt} > ${m.createdAt}`,
    ),
  ],
);


export const sessions = pgTable(
  "session",
  {
    sessionToken: text("sessionToken").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (s) => [index("idx_session_user").on(s.userId)]
);


export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [
    primaryKey({ columns: [vt.identifier, vt.token] }),
    index("idx_verification_token_token").on(vt.token),
    index("idx_verification_token_expires").on(vt.expires),
  ]
);
