import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PrivateObjectReferenceSchema, isLocatedPrivateObjectReference } from "../apps/api/src/platform/adapters/private-object-storage/private-object-storage.contract";
import { isCreatorAssetLicenseId, creatorAssetLicenseOf } from "../packages/contracts/src/creator-asset-contract";
import { CreatorMarketplaceResourceLicenseSchema } from "../packages/contracts/src/creator-marketplace-resource-contract";

const baseline = JSON.parse(readFileSync(new URL("./production-migration-history-baseline.json", import.meta.url), "utf8")) as { checksums: Record<string, string> };
const sql = readFileSync(new URL("../apps/api/src/platform/database/migrations/0093_release_brand_compatibility.sql", import.meta.url), "utf8");

describe("운영 이력과 브랜드 호환성", () => {
  it("이미 적용된 91개 SQL의 바이트를 변경하지 않는다", () => {
    expect(Object.keys(baseline.checksums)).toHaveLength(91);
    for (const [id, expected] of Object.entries(baseline.checksums)) {
      const file = readFileSync(new URL(`../apps/api/src/platform/database/migrations/${id}.sql`, import.meta.url));
      expect(createHash("sha256").update(file).digest("hex"), id).toBe(expected);
    }
  });
  it("운영 사용권 toonspectrum-standard를 원문 그대로 읽는다", () => {
    const license = "toonspectrum-standard";
    expect(CreatorMarketplaceResourceLicenseSchema.parse(license)).toBe(license);
    expect(isCreatorAssetLicenseId(license)).toBe(true);
    expect(creatorAssetLicenseOf(license).shortLabel).toBe("표준 사용권");
  });
  it("운영 객체 참조 toonspectrum.private-object-storage.v2의 해시와 provider를 보존한다", () => {
    const contractVersion = "toonspectrum.private-object-storage.v2";
    const digest = "a".repeat(64);
    const input = { contractVersion, providerId: "cloudflare-r2", purpose: "derived", digest: `sha256:${digest}`, objectPath: `sha256/aa/${digest}`, byteLength: 4, contentType: "image/png" };
    const object = PrivateObjectReferenceSchema.parse(input);
    expect(object).toEqual(input);
    expect(isLocatedPrivateObjectReference(object)).toBe(true);
  });
  it("전진 마이그레이션은 원장과 기존 데이터 해시를 다시 쓰지 않는다", () => {
    expect([...sql].every((character) => character.charCodeAt(0) >= 32 || ["\t", "\r", "\n"].includes(character))).toBe(true);
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).not.toMatch(/UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|DISABLE\s+TRIGGER/iu);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(sql).toContain("studio_review_voice_note_release_bounds");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OR DELETE");
  });
});
