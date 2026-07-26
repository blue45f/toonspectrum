import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required. Please define it in .env.local");
}

// PostgreSQL(Neon). 로컬 검증은 docker postgres(:55432), 원격은 Neon(DATABASE_URL, sslmode=require).
export default defineConfig({
  schema: [
    "./lib/db/schema.ts",
    "./lib/db/creator-marketplace-resource.schema.ts",
    "./lib/db/studio-crdt-raster-checkpoint.schema.ts",
    "./lib/db/studio-raster-asset.schema.ts",
  ],
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
