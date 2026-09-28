import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { STUDIO_VIRTUAL_MAX_PLACEMENTS } from "@toonstudio/contracts/studio-virtual-space-placement-contract";

import { users } from "./auth.schema";

// CHECK DDL은 bind parameter를 받지 않으므로 컴파일 시 확정된 정수만 리터럴로 넣는다.
// 요청이나 환경변수에서 받은 값을 이 SQL 조각에 전달해서는 안 된다.
const STUDIO_VIRTUAL_MAX_PLACEMENTS_SQL = sql.raw(String(STUDIO_VIRTUAL_MAX_PLACEMENTS));

/**
 * 사용자별 가상 스튜디오 가구 배치의 서버 정본. 한 행은 (userId, scopeKey) 하나다.
 * scopeKey는 (projectId, worldScope, authoringMode)에서 온다. 같은 district라도
 * 프로젝트나 개인/공유 모드가 다르면 다른 배치이므로 districtKey로 묶으면 안 된다.
 *
 * revision은 낙관적 동시성 토큰이다. 클라이언트가 보낸 expectedRevision이 이 값과
 * 다르면 덮어쓰지 않고 409로 거절한다. 조용히 뒤엎으면 한 기기의 드래그가 다른
 * 기기의 배치를 지우기 때문이다.
 *
 * placements는 검증기(shared contract)를 통과한 값만 저장되므로, 여기 다시 확인할
 * 형식 검증은 하지 않는다. 허용 목록이 바뀌면 contract 테스트가 먼저 멈춘다.
 */
export const studioVirtualSpaceDecorationLayouts = pgTable(
  "studio_virtual_space_decoration_layout",
  {
    userId: text("userId").notNull(),
    // (projectId, worldScope, authoringMode)로 만든 불투명 범위 키.
    scopeKey: text("scopeKey").notNull(),
    districtKey: text("districtKey").notNull(),
    presetKey: text("presetKey").notNull().default("minimal"),
    presentationMode: text("presentationMode").notNull().default("minimal"),
    placements: jsonb("placements").notNull().default(sql`'[]'::jsonb`),
    revision: integer("revision").notNull().default(0),
    layoutWidth: integer("layoutWidth").notNull().default(1280),
    layoutHeight: integer("layoutHeight").notNull().default(960),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.scopeKey] }),
    // 계정이 사라지면 배치를 읽을 사람이 없으므로 DB가 함께 지운다.
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "studio_virtual_space_decoration_layout_user_fkey",
    }).onDelete("cascade"),
    index("studio_virtual_space_decoration_layout_user_idx").on(table.userId),
    check(
      "studio_virtual_space_decoration_layout_revision_non_negative",
      sql`${table.revision} >= 0`,
    ),
    check(
      "studio_virtual_space_decoration_layout_placements_capped",
      sql`jsonb_array_length(${table.placements}) <= ${STUDIO_VIRTUAL_MAX_PLACEMENTS_SQL}`,
    ),
    check(
      "studio_virtual_space_decoration_layout_world_positive",
      sql`${table.layoutWidth} > 0 AND ${table.layoutHeight} > 0`,
    ),
  ],
);

/**
 * 사용자가 직접 올린 가구 한 건. 바이트는 private object storage에 있고, 이 행은
 * 그 가구가 누구의 것인지와 렌더에 필요한 메타데이터만 담는다.
 *
 * objectPath 는 저장소가 돌려준 불투명 참조다. 클라이언트가 경로를 조립하지 않는다.
 */
export const studioVirtualSpaceCustomFurniture = pgTable(
  "studio_virtual_space_custom_furniture",
  {
    id: text("id").notNull().primaryKey(),
    userId: text("userId").notNull(),
    name: text("name").notNull(),
    mimeType: text("mimeType").notNull(),
    objectPath: text("objectPath").notNull(),
    digest: text("digest").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** 서명 읽기 URL을 만들 때 저장소가 요구하는 실제 바이트 수. */
    byteLength: integer("byteLength").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // 누가 올렸는지 알아야 다른 사람이 그 가구를 배치하지 못한다.
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "studio_virtual_space_custom_furniture_user_fkey",
    }).onDelete("cascade"),
    index("studio_virtual_space_custom_furniture_user_idx").on(table.userId),
    check(
      "studio_virtual_space_custom_furniture_dimensions_positive",
      sql`${table.width} > 0 AND ${table.height} > 0 AND ${table.byteLength} > 0`,
    ),
  ],
);

export type StudioVirtualSpaceCustomFurnitureRow = typeof studioVirtualSpaceCustomFurniture.$inferSelect;
