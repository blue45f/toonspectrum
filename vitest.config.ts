import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

// Load DATABASE_URL from .env.local if present, without polluting other env vars
const envPath = path.resolve(root, ".env.local");
if (existsSync(envPath)) {
  try {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^DATABASE_URL=(.+)$/m);
    if (match && match[1]) {
      process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // Ignore
  }
}

// Fallback for tests if still undefined
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://webdex@localhost:5432/webdex";
}

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
    },
  },
  test: {
    environment: "node",
  },
});
