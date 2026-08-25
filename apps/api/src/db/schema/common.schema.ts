import { sql } from "drizzle-orm";
import { bigserial, check, customType, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});


// SQL cutovers that cannot be represented safely by `drizzle-kit push` record a durable marker
// here. Unlike a column comment, this survives normal schema introspection and data dump/restore,
// so retrying a migration cannot repeat a destructive one-time transition.
export const toonspectrumSchemaMigrations = pgTable(
  "toonspectrum_schema_migration",
  {
    id: text("id").primaryKey(),
    appliedAt: timestamp("appliedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "toonspectrum_schema_migration_id_check",
      sql`length(${t.id}) between 1 and 160`
    ),
  ]
);


// Socket.IO PostgreSQL cluster adapter의 8 KiB 초과·binary packet 임시 본문. 실제 room/presence
// 권위 상태가 아니라 LISTEN/NOTIFY 전달 보조 저장소이며 adapter cleanup 주기 이후 제거된다.
// 이름과 컬럼은 lifecycle-safe PostgreSQL transport의 고정 SQL 계약과 정확히 일치해야 한다.
export const socketIoAttachments = pgTable(
  "socket_io_attachments",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    payload: bytea("payload").notNull(),
  },
  (t) => [index("idx_socket_io_attachments_created_at").on(t.createdAt)]
);
