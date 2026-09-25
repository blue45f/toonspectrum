import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  readFreeDatabaseFederation,
  validateFreeDatabaseFederation,
} from "./free-database-federation.mjs";

const policy = JSON.parse(
  readFileSync(new URL("../config/free-database-federation.json", import.meta.url), "utf8"),
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("free database federation", () => {
  it("저장소 밖에서 호출해도 정책과 배포 manifest를 검증한다", () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./verify-free-database-federation.mjs", import.meta.url))], {
      cwd: tmpdir(), encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Free database federation verified:");
  });

  it("MongoDB가 자동 생성하는 식별자와 문자열 작업 ID를 허용한다", () => {
    const { $jsonSchema: schema } = JSON.parse(readFileSync(
      new URL("../deploy/federated-data-plane/mongodb/ai-jobs.validator.json", import.meta.url), "utf8",
    ));
    expect(schema.additionalProperties).toBe(false);
    for (const required of schema.required) expect(Object.hasOwn(schema.properties, required)).toBe(true);
    expect(schema.properties._id.bsonType).toEqual(expect.arrayContaining(["objectId", "string"]));
  });

  it("commits a credential-free maximum-traffic federation", () => {
    expect(validateFreeDatabaseFederation(policy)).toEqual([]);
    expect(readFreeDatabaseFederation()).toEqual(policy);
    expect(Object.keys(policy.providers).length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(policy.shards).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(policy.routes).length).toBeGreaterThanOrEqual(30);
    expect(JSON.stringify(policy)).not.toMatch(/sk-|BEGIN PRIVATE KEY|password\s*[:=]/iu);
  });

  it("uses all five TiDB Starter instances as independent authority shards", () => {
    const shards = Object.values(policy.shards).filter(
      (shard) => shard.provider === "tidb-cloud-starter",
    );
    expect(shards).toHaveLength(5);
    expect(shards.flatMap((shard) => shard.domains)).toEqual(
      expect.arrayContaining(["identity", "creator-projects", "marketplace", "community", "collaboration"]),
    );
  });

  it("uses all ten D1 databases without pretending account-wide traffic quota multiplies", () => {
    expect(policy.providers["cloudflare-d1"].quotaScope).toBe("cloudflare-account");
    const total = Object.values(policy.shards)
      .filter((shard) => shard.provider === "cloudflare-d1")
      .reduce((sum, shard) => sum + shard.virtualShardCount, 0);
    expect(total).toBe(10);
    expect(policy.shards["d1-edge-index"].virtualShardCount).toBe(8);
    expect(policy.shards["d1-analytics-buffer"].virtualShardCount).toBe(2);
  });

  it("rejects paid overflow and authoritative write fallback", () => {
    const changed = clone(policy);
    changed.automaticPaidOverflow = true;
    changed.routes["critical-ledger-write"].candidates.push("tidb-commerce");
    expect(validateFreeDatabaseFederation(changed)).toEqual(
      expect.arrayContaining([
        "automaticPaidOverflow must remain false",
        "routes.critical-ledger-write authoritative writes must have exactly one authority shard",
      ]),
    );
  });

  it("keeps BigQuery Sandbox on batch ingestion only", () => {
    const changed = clone(policy);
    changed.providers["bigquery-sandbox"].ingestionMode = "streaming";
    expect(validateFreeDatabaseFederation(changed)).toContain(
      "providers.bigquery-sandbox.ingestionMode must remain batch-only",
    );
  });

  it("rejects stale/unsafe provider caps and unknown shards", () => {
    const changed = clone(policy);
    changed.providers["aws-dynamodb-free"].applicationHardCapRatio = 0.95;
    changed.routes["analytics-read"].candidates.push("missing-shard");
    expect(validateFreeDatabaseFederation(changed)).toEqual(
      expect.arrayContaining([
        "providers.aws-dynamodb-free.applicationHardCapRatio must be a ratio in (0, 0.8]",
        "routes.analytics-read references an unknown shard missing-shard",
      ]),
    );
  });
});
