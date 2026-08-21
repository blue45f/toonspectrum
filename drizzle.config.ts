import { defineConfig } from "drizzle-kit";

import { normalizePgConnectionStringForTls } from "./apps/api/src/db/pg-connection";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required. Please define it in .env.local");
}
const normalizedDatabaseUrl = normalizePgConnectionStringForTls(databaseUrl);

// PostgreSQL(Neon). 로컬 검증은 docker postgres(:55432), 원격은 Neon(DATABASE_URL, sslmode=verify-full).
export default defineConfig({
  schema: [
    "./apps/api/src/db/schema.ts",
    "./apps/api/src/db/creator-marketplace-resource.schema.ts",
    "./apps/api/src/db/creator-asset-object-storage.schema.ts",
    "./apps/api/src/db/studio-crdt-raster-checkpoint.schema.ts",
    "./apps/api/src/db/studio-raster-asset.schema.ts",
  ],
  out: "./apps/api/src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizedDatabaseUrl,
  },
});
