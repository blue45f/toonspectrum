import { describe, expect, it } from "vitest";

import { auditStudioFonts, type StudioFontManifest } from "./studio-font-audit";

const FONT: StudioFontManifest = Object.freeze({
  id: "dialogue-font",
  family: "Dialogue Sans",
  source: "font-provider",
  coverage: [
    { from: 0x20, to: 0x7e },
    { from: 0xac00, to: 0xd7af },
  ],
  permissions: {
    webtoon: "allowed",
    print: "allowed",
    video: "conditional",
    app: "prohibited",
    ebook: "allowed",
    logo: "conditional",
  },
  attributionRequired: true,
  attributionText: "Font by Example Foundry",
  embeddingAllowed: true,
  expiresAt: "2028-01-01T00:00:00.000Z",
});

describe("Studio font audit", () => {
  it("verifies glyphs, destination rights, embedding and attribution", () => {
    expect(auditStudioFonts({
      manifests: [FONT],
      runs: [{
        id: "dialogue-1",
        fontId: "dialogue-font",
        text: "안녕하세요 Hello",
        destination: "ebook",
        embedsFont: true,
      }],
      now: "2026-09-11T00:00:00.000Z",
    })).toMatchObject({
      status: "allowed",
      findings: [],
      attributionTexts: ["Font by Example Foundry"],
    });
  });

  it("blocks missing glyphs and prohibited app use", () => {
    const report = auditStudioFonts({
      manifests: [FONT],
      runs: [{
        id: "ui-label",
        fontId: "dialogue-font",
        text: "지원 안 됨 𠮷",
        destination: "app",
        embedsFont: true,
      }],
      now: "2026-09-11T00:00:00.000Z",
    });
    expect(report.status).toBe("blocked");
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "glyph-missing", characters: ["𠮷"] }),
      expect.objectContaining({ code: "font-license", severity: "error" }),
    ]));
  });

  it("blocks embedding and expired licenses", () => {
    const report = auditStudioFonts({
      manifests: [{ ...FONT, embeddingAllowed: false, expiresAt: "2025-01-01T00:00:00.000Z" }],
      runs: [{
        id: "book",
        fontId: "dialogue-font",
        text: "본문",
        destination: "ebook",
        embedsFont: true,
      }],
      now: "2026-09-11T00:00:00.000Z",
    });
    expect(report.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "font-embedding",
      "font-expired",
    ]));
  });
});
