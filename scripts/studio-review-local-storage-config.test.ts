// @vitest-environment node
import { readFile, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolvePrivateObjectStoragePlan } from "../apps/api/src/infrastructure/private-object-storage/private-object-storage.config";

import { createIsolatedMarketApiEnvironment } from "./isolated-market-api.mjs";
import { createStudioReviewLocalStorageEnvironment } from "./studio-review-local-storage-config.mjs";
import { createStudioReviewQaCertificates } from "./studio-review-local-storage-runtime.mjs";

describe("owned local Studio review object storage", () => {
  let directory: string;
  const options = () => ({ endpoint: "https://127.0.0.1:59963", runId: "abcdef123456", ownedDirectory: directory,
    accessKeyId: "qaabcdef123456", secretAccessKey: "a".repeat(64) });
  const target = { apiOrigin: "http://127.0.0.1:4355", apiHost: "127.0.0.1", apiPort: 4355,
    databaseUrl: "postgresql://tester:secret@127.0.0.1:59962/studio_review_qa" };
  beforeAll(async () => { directory = await realpath(await createStudioReviewQaCertificates()); });
  afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

  it("preserves the default external-storage boundary even with injected parent credentials", () => {
    const child = createIsolatedMarketApiEnvironment(target, { PRIVATE_OBJECT_STORAGE_ENABLED: "true",
      R2_OBJECT_STORAGE_ENDPOINT: "https://production.invalid", NODE_EXTRA_CA_CERTS: "/production/ca.pem",
      STUDIO_WORK_ASSET_ADMISSION: "enable-immutable-readonly-work-assets-v1", OPENAI_API_KEY: "must-not-reach-child" });
    expect(child).not.toHaveProperty("PRIVATE_OBJECT_STORAGE_ENABLED");
    expect(child).not.toHaveProperty("NODE_EXTRA_CA_CERTS");
    expect(child).not.toHaveProperty("STUDIO_WORK_ASSET_ADMISSION");
    expect(child).not.toHaveProperty("OPENAI_API_KEY");
  });

  it("uses the unchanged production parser with three distinct, run-owned buckets and the actual CA", () => {
    const child = createIsolatedMarketApiEnvironment(target, {}, options());
    const plan = resolvePrivateObjectStoragePlan(child);
    expect(plan?.compatibilityMode).toBe("purpose-routed");
    expect(plan?.s3["cloudflare-r2"]).toMatchObject({ endpoint: options().endpoint, region: "us-east-1",
      buckets: { source: "qa-vs-review-abcdef123456-source", derived: "qa-vs-review-abcdef123456-derived", export: "qa-vs-review-abcdef123456-export" } });
    expect(child.NODE_EXTRA_CA_CERTS).toBe(path.join(directory, "ca.crt"));
    expect(child.API_LOCAL_ENV_FILE_ENABLED).toBe("false");
    expect(child.SUPABASE_OBJECT_STORAGE_ENABLED).toBe("false");
  });

  it.each(["http://127.0.0.1:59963", "https://localhost:59963", "https://192.168.0.10:59963",
    "https://storage.example.test:59963", "https://127.0.0.1", "https://127.0.0.1:443", "https://127.0.0.1:59963/path",
    "https://127.0.0.1:59963?token=secret", "https://127.0.0.1:59963#fragment", "https://127.0.0.1:59963/"])("rejects non-exact owned origin %s", (endpoint) => {
    expect(() => createStudioReviewLocalStorageEnvironment({ ...options(), endpoint })).toThrow();
  });

  it("rejects a storage/API port collision and extra keys rather than permitting env overrides", () => {
    expect(() => createIsolatedMarketApiEnvironment(target, {}, { ...options(), endpoint: target.apiOrigin.replace("http:", "https:") })).toThrow();
    const extra = { ...options(), NODE_TLS_REJECT_UNAUTHORIZED: "0" };
    expect(() => createStudioReviewLocalStorageEnvironment(extra)).toThrow();
    expect(() => createStudioReviewLocalStorageEnvironment({ ...options(), accessKeyId: "operator-production-key" })).toThrow();
  });

  it("rejects a different CA, a symlink certificate, and a non-owned certificate directory", async () => {
    expect(() => createStudioReviewLocalStorageEnvironment({ ...options(), ownedDirectory: "/etc" })).toThrow();
    const caPath = path.join(directory, "ca.crt"), serverPath = path.join(directory, "public.crt"), ca = await readFile(caPath);
    try {
      await writeFile(caPath, await readFile(serverPath));
      expect(() => createStudioReviewLocalStorageEnvironment(options())).toThrow();
      await unlink(caPath); await symlink(serverPath, caPath);
      expect(() => createStudioReviewLocalStorageEnvironment(options())).toThrow();
    } finally { await unlink(caPath); await writeFile(caPath, ca); }
  });
});
