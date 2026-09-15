import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createProductionDemoProject } from "../../../../web/src/domains/creator/production-hub/production-demo";
import {
  buildGoogleRawMessage,
  buildMailtoDraft,
  buildProductionCalendarEvents,
  buildProductionCalendarIcs,
  buildProductionGoogleDriveArtifact,
  buildProductionProjectBackup,
  buildProductionProvenanceManifest,
  buildProductionSigningPackage,
  buildProductionTaxInvoiceCsv,
  canonicalJson,
  sha256Digest,
} from "./production-integration-artifacts";
import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
} from "./production-integration-crypto";
import {
  resolveProductionIntegrationConfig,
  safeExternalBaseUrl,
} from "./production-integration-config";

describe("production no-cost integration artifacts", () => {
  it("builds deterministic calendar events and a valid CRLF ICS feed", () => {
    const aggregate = createProductionDemoProject();
    const events = buildProductionCalendarEvents(
      aggregate,
      "https://toonstudio.example",
    );
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.googleCalendarUrl.startsWith(
      "https://calendar.google.com/calendar/render?",
    ))).toBe(true);

    const ics = buildProductionCalendarIcs(
      aggregate,
      "https://toonstudio.example",
    );
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/(?<!\r)\n/u);
  });

  it("exports a hash-only provenance manifest without claiming trusted C2PA signing", () => {
    const aggregate = createProductionDemoProject();
    const manifest = buildProductionProvenanceManifest(aggregate);
    expect(manifest.trust).toBe("hash-only");
    expect(manifest.aggregateDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(manifest.warning).toContain("C2PA 서명이 아닙니다");
    expect(manifest.c2paDraft.assertions.length).toBeGreaterThan(0);
  });

  it("builds portable project, signing, and Drive artifacts without claiming a legal signature", () => {
    const aggregate = createProductionDemoProject();
    const backup = buildProductionProjectBackup(aggregate);
    const signing = buildProductionSigningPackage(aggregate);
    const drive = buildProductionGoogleDriveArtifact(
      aggregate,
      "project-backup",
      "https://toonstudio.example",
    );

    expect(backup.aggregateDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(signing.legalSignatureApplied).toBe(false);
    expect(signing.packageDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(drive.fileName).toMatch(/backup\.json$/u);
    expect(drive.sourceMimeType).toBe("application/json");
    expect(drive.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("exports tax-invoice preparation rows without claiming issuance", () => {
    const csv = buildProductionTaxInvoiceCsv(createProductionDemoProject());
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("manual-export-not-issued");
    expect(csv).toContain("invoiceId");
  });

  it("produces canonical SHA-256 digests and safe local mail drafts", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"y":2},"z":1}',
    );
    expect(sha256Digest("same")).toBe(sha256Digest("same"));
    expect(buildMailtoDraft({
      to: ["artist@example.com"],
      subject: "검토 요청",
      body: "본문",
    })).toContain("mailto:artist%40example.com?");
    const raw = Buffer.from(buildGoogleRawMessage({
      to: ["artist@example.com"],
      subject: "검토 요청",
      body: "본문",
    }), "base64url").toString("utf8");
    expect(raw).toContain("To: artist@example.com");
    expect(raw).toContain("Content-Transfer-Encoding: base64");
  });
});
describe("production integration secret and cost boundaries", () => {
  it("encrypts provider credentials with AES-GCM and rejects the wrong key", () => {
    const key = randomBytes(32);
    const credential = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: "2026-09-15T12:00:00.000Z",
      tokenType: "Bearer",
      scope: "calendar gmail",
    };
    const encrypted = encryptIntegrationCredential(credential, key);
    expect(encrypted).not.toContain("access-token");
    expect(decryptIntegrationCredential(encrypted, key)).toEqual(credential);
    expect(() => decryptIntegrationCredential(encrypted, randomBytes(32)))
      .toThrow();
  });

  it("requires HTTPS externally and permits loopback HTTP only when requested", () => {
    expect(safeExternalBaseUrl("https://example.com/path/"))
      .toBe("https://example.com/path");
    expect(safeExternalBaseUrl("http://example.com")).toBeNull();
    expect(safeExternalBaseUrl("http://127.0.0.1:3000", {
      allowLoopback: true,
    })).toBe("http://127.0.0.1:3000");
    expect(safeExternalBaseUrl("https://user:secret@example.com"))
      .toBeNull();
  });

  it("keeps live Toss payments blocked unless explicitly enabled", () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const config = resolveProductionIntegrationConfig({
      NODE_ENV: "production",
      PRODUCTION_INTEGRATION_ENCRYPTION_KEY: encryptionKey,
      PRODUCTION_GOOGLE_OAUTH_CLIENT_ID: "client",
      PRODUCTION_GOOGLE_OAUTH_CLIENT_SECRET: "secret",
      PRODUCTION_GOOGLE_OAUTH_REDIRECT_URI:
        "https://toonstudio.example/api/production/integrations/google/callback",
      TOSS_PAYMENTS_SECRET_KEY: "live_secret_key",
      PRODUCTION_TOSS_ALLOW_LIVE: "false",
    });
    expect(config.google.configured).toBe(true);
    expect(config.toss.configured).toBe(true);
    expect(config.toss.testMode).toBe(false);
    expect(config.toss.liveAllowed).toBe(false);
  });
});
