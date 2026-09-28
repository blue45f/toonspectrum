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

/**
 * 사용자별 가상 스튜디오 가구 배치의 서버 정본. 한 행은 (userId, districtKey) 하나다.
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
    primaryKey({ columns: [table.userId, table.districtKey] }),
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
      sql`jsonb_array_length(${table.placements}) <= ${STUDIO_VIRTUAL_MAX_PLACEMENTS}`,
    ),
    check(
      "studio_virtual_space_decoration_layout_world_positive",
      sql`${table.layoutWidth} > 0 AND ${table.layoutHeight} > 0`,
    ),
  ],
);

export type StudioVirtualSpaceDecorationLayoutRow = typeof studioVirtualSpaceDecorationLayouts.$inferSelect;
