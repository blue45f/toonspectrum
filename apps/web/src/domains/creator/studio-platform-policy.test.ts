import { describe, expect, it } from "vitest";

import {
  selectStudioPlatformPolicy,
  studioPlatformPolicyToExportProfile,
  validateStudioPlatformPolicies,
  type StudioPlatformPolicy,
} from "./studio-platform-policy";

const POLICIES: readonly StudioPlatformPolicy[] = [
  {
    id: "platform-a-2026",
    platformId: "platform-a",
    version: "2026-01",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: "2027-01-01T00:00:00.000Z",
    target: "webtoon-platform",
    allowedFormats: ["png", "jpg"],
    exactWidth: 800,
    maxSegmentHeight: 12_800,
    maxFileSizeBytes: 20 * 1024 * 1024,
    minimumTextPx: 18,
    allowedColorSpaces: ["srgb"],
    supportedLocales: ["ko", "en"],
    requireReadingOrder: true,
    requireRightsClearance: true,
    requireAiDisclosure: true,
    requireAltText: false,
    requireCaptions: false,
  },
  {
    id: "platform-a-2027",
    platformId: "platform-a",
    version: "2027-01",
    effectiveFrom: "2027-01-01T00:00:00.000Z",
    effectiveUntil: null,
    target: "webtoon-platform",
    allowedFormats: ["png", "jpg", "webp"],
    exactWidth: 1080,
    maxSegmentHeight: 16_000,
    maxFileSizeBytes: 30 * 1024 * 1024,
    minimumTextPx: 20,
    allowedColorSpaces: ["srgb"],
    supportedLocales: ["ko", "en", "ja"],
    requireReadingOrder: true,
    requireRightsClearance: true,
    requireAiDisclosure: true,
    requireAltText: true,
    requireCaptions: false,
  },
];

describe("Studio platform policy", () => {
  it("selects the policy active on the requested date", () => {
    expect(validateStudioPlatformPolicies(POLICIES)).toEqual([]);
    expect(selectStudioPlatformPolicy(
      POLICIES,
      "platform-a",
      "2026-09-11T00:00:00.000Z",
    )).toMatchObject({ status: "active", policy: { version: "2026-01" } });
    expect(selectStudioPlatformPolicy(
      POLICIES,
      "platform-a",
      "2025-09-11T00:00:00.000Z",
    )).toMatchObject({ status: "upcoming", policy: { version: "2026-01" } });
  });

  it("converts a versioned platform policy into an export profile", () => {
    expect(studioPlatformPolicyToExportProfile(POLICIES[1]!)).toMatchObject({
      id: "webtoon-platform",
      policyVersion: "2027-01",
      exactWidth: 1080,
      allowedFormats: ["png", "jpg", "webp"],
      requireAltText: true,
    });
  });

  it("rejects overlapping policy windows", () => {
    expect(validateStudioPlatformPolicies([
      POLICIES[0]!,
      { ...POLICIES[1]!, effectiveFrom: "2026-12-01T00:00:00.000Z" },
    ])).toContain("policy-overlap");
  });
});
