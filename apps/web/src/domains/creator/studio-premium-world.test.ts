import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_ENVIRONMENT_ASSETS } from "./bg3d/studio-bg3d-environment-catalog";
import { parseStudioCc0Catalog } from "./studio-cc0-asset-delivery";
import {
  isTrustedStudioCc0Source,
  STUDIO_PREMIUM_WORLD_SOURCE_URL,
} from "./studio-cc0-source-policy";

const publicRoot = fileURLToPath(new URL("../../../public/", import.meta.url));
const manifestRelativePath = "assets/studio/cc0-20260906/manifest.json";
const read = (relative: string) => readFileSync(path.join(publicRoot, relative));
const manifest = JSON.parse(read(manifestRelativePath).toString("utf8")) as {
  readonly schema: unknown;
  readonly assets: Array<Record<string, unknown> & {
    id: string;
    license: Record<string, unknown>;
  }>;
};
const catalog = parseStudioCc0Catalog(manifest);
const publishedPremiumAssets = catalog.filter((asset) => asset.id.startsWith("ts-world-"));

// Unrelated GitHub URLs must never become a trusted asset provider.
describe("premium world provenance boundary", () => {
  it("admits only the exact reviewed first-party generator", () => {
    expect(isTrustedStudioCc0Source("ToonSpectrum", STUDIO_PREMIUM_WORLD_SOURCE_URL)).toBe(true);
    for (const url of [
      `${STUDIO_PREMIUM_WORLD_SOURCE_URL}?raw=1`,
      `${STUDIO_PREMIUM_WORLD_SOURCE_URL}#forged`,
      STUDIO_PREMIUM_WORLD_SOURCE_URL.replace("blue45f", "another-owner"),
      STUDIO_PREMIUM_WORLD_SOURCE_URL.replace("https:", "http:"),
      STUDIO_PREMIUM_WORLD_SOURCE_URL.replace("github.com", "github.com.evil.example"),
      "https://polyhaven.com/a/fake",
      "not a URL",
    ]) {
      expect(isTrustedStudioCc0Source("ToonSpectrum", url)).toBe(false);
    }
    expect(isTrustedStudioCc0Source("Other", STUDIO_PREMIUM_WORLD_SOURCE_URL)).toBe(false);
  });

  it("retains the existing external source policy", () => {
    expect(isTrustedStudioCc0Source("Poly Haven", "https://polyhaven.com/a/wood_table_001")).toBe(true);
    expect(isTrustedStudioCc0Source("Kenney", "https://kenney.nl/assets/furniture-kit")).toBe(true);
    // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic URL-userinfo rejection fixture
    expect(isTrustedStudioCc0Source("Poly Haven", "https://user:secret@polyhaven.com/a/test")).toBe(false);
    expect(isTrustedStudioCc0Source("Poly Haven", "https://polyhaven.com:8443/a/test")).toBe(false);
  });
});

describe("premium world publication boundary", () => {
  it("keeps candidates out of immutable catalogs until explicit visual and runtime evidence exists", () => {
    expect(publishedPremiumAssets).toEqual([]);
    expect(
      STUDIO_BG3D_ENVIRONMENT_ASSETS.filter((asset) => asset.id.startsWith("ts-world-")),
    ).toEqual([]);
    expect(
      existsSync(path.join(publicRoot, "assets/3d/environments/premium-world-v1/manifest.json")),
    ).toBe(false);
    expect(
      existsSync(path.join(publicRoot, "assets/studio/premium-world-v1/manifest.json")),
    ).toBe(false);
  });

  it("rejects a forged first-party source even when the entry claims visual review", () => {
    const template = manifest.assets[0];
    expect(template).toBeDefined();
    const candidate = structuredClone(template!);
    candidate.id = "ts-world-forged-candidate";
    candidate.visualReviewed = true;
    candidate.license = {
      ...candidate.license,
      provider: "ToonSpectrum",
      sourceUrl: "https://github.com/other-owner/unrelated/blob/main/asset.py",
    };

    expect(() =>
      parseStudioCc0Catalog({ schema: manifest.schema, assets: [candidate] }),
    ).toThrow("확인되지 않은 에셋 공급처");
  });
});
