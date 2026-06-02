import { defineConfig } from "drizzle-kit";

// PostgreSQL(Neon). 로컬 검증은 docker postgres(:55432), 원격은 Neon(DATABASE_URL, sslmode=require).
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://webdex:webdex@127.0.0.1:55432/webdex",
  },
});
