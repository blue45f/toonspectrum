import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveProductionIntegrationConfig } from "./production-integration-config";
import {
  createDocumensoEnvelope,
  ProductionDocumensoDistributionError,
  documensoFailureState,
} from "./production-documenso-provider";
import {
  googleAuthorizationUrl,
  uploadGoogleDriveArtifact,
} from "./production-google-workspace";
import { ProductionExternalHttpError } from "./production-integration-http";
import { sendProductionNotification } from "./production-notification-provider";
import { confirmTossPayment } from "./production-toss-provider";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("production external providers", () => {
  it("uses the official Toss confirmation boundary with test keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      paymentKey: "test-payment-key",
      orderId: "order_123456",
      status: "DONE",
      currency: "KRW",
      totalAmount: 120_000,
      approvedAt: "2026-09-15T12:00:00.000Z",
      receipt: { url: "https://dashboard.tosspayments.com/receipt/test" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = resolveProductionIntegrationConfig({
      TOSS_PAYMENTS_SECRET_KEY: "test_placeholder_key",
    });
    const result = await confirmTossPayment({
      config,
      request: {
        mutationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        paymentKey: "test-payment-key",
        orderId: "order_123456",
        amount: 120_000,
        invoiceId: "invoice-1",
      },
    });
    expect(result.status).toBe("DONE");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.tosspayments.com/v1/payments/confirm");
    expect(new Headers(init.headers).get("authorization")).toMatch(/^Basic /u);
    expect(JSON.parse(String(init.body))).toEqual({
      paymentKey: "test-payment-key",
      orderId: "order_123456",
      amount: 120_000,
    });
  });

  it("blocks live Toss credentials unless the deployment explicitly opts in", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const config = resolveProductionIntegrationConfig({
      TOSS_PAYMENTS_SECRET_KEY: "live_placeholder_key",
      PRODUCTION_TOSS_ALLOW_LIVE: "false",
    });
    await expect(confirmTossPayment({
      config,
      request: {
        mutationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        paymentKey: "live-payment-key",
        orderId: "order_123456",
        amount: 120_000,
        invoiceId: "invoice-1",
      },
    })).rejects.toThrow("toss_live_payment_disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
describe("production signature and notification providers", () => {
  it("creates a Documenso envelope and distributes only after creation succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "envelope-1", status: "DRAFT" }))
      .mockResolvedValueOnce(jsonResponse({ id: "envelope-1", status: "PENDING" }));
    vi.stubGlobal("fetch", fetchMock);
    const config = resolveProductionIntegrationConfig({
      DOCUMENSO_BASE_URL: "https://sign.example.com/api/v2",
      DOCUMENSO_API_TOKEN: "api-token",
    });
    const result = await createDocumensoEnvelope({
      config,
      metadata: {
        mutationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "제작 계약",
        distribute: true,
        recipients: [{
          email: "artist@example.com",
          name: "작가",
          role: "SIGNER",
          fields: [],
        }],
      },
      file: {
        buffer: Buffer.from("%PDF-1.7\nminimal"),
        mimetype: "application/pdf",
        originalname: "agreement.pdf",
        size: Buffer.byteLength("%PDF-1.7\nminimal"),
      },
    });
    expect(result).toMatchObject({
      envelope: { id: "envelope-1" },
      distributed: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://sign.example.com/api/v2/envelope/create",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://sign.example.com/api/v2/envelope/envelope-1/distribute",
    );
  });

  it("preserves an uncertain Documenso result when distribution fails after creation", () => {
    const failure = documensoFailureState(
      new ProductionDocumensoDistributionError(
        "envelope-uncertain",
        new ProductionExternalHttpError(
          "external_timeout",
          null,
          true,
        ),
      ),
    );
    expect(failure).toEqual({
      uncertain: true,
      code: "external_timeout",
      externalId: "envelope-uncertain",
    });
  });

  it("sends a signed generic webhook without exposing the secret in its body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accepted: true }));
    vi.stubGlobal("fetch", fetchMock);
    const config = resolveProductionIntegrationConfig({
      PRODUCTION_GENERIC_WEBHOOK_URL: "https://hooks.example.com/production",
      PRODUCTION_GENERIC_WEBHOOK_SECRET: "server-only-secret",
    });
    const result = await sendProductionNotification({
      config,
      projectId: "project-1",
      projectTitle: "샘플 프로젝트",
      notification: {
        mutationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        channel: "generic-webhook",
        title: "검수 요청",
        body: "새 제출본을 확인해 주세요.",
        url: "/production/projects/project-1/review",
      },
      subscriptions: [],
    });
    expect(result.sent).toBe(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("x-toonspectrum-signature")).toMatch(
      /^sha256=[0-9a-f]{64}$/u,
    );
    expect(String(init.body)).not.toContain("server-only-secret");
  });
});

describe("Google Workspace authorization", () => {
  it("requests only calendar event, Gmail draft, OpenID and email scopes", () => {
    const config = resolveProductionIntegrationConfig({
      NODE_ENV: "production",
      PRODUCTION_INTEGRATION_ENCRYPTION_KEY:
        Buffer.alloc(32, 7).toString("base64"),
      PRODUCTION_GOOGLE_OAUTH_CLIENT_ID: "client-id",
      PRODUCTION_GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
      PRODUCTION_GOOGLE_OAUTH_REDIRECT_URI:
        "https://toonstudio.example/api/production/integrations/google/callback",
    });
    const url = new URL(googleAuthorizationUrl(config, "oauth-state"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/drive.file",
    ]);
  });
});

describe("Google Drive no-cost artifact upload", () => {
  it("uses a multipart upload and converts CSV to a new Sheet", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({
        id: "drive-file-1",
        name: "tax-invoices",
        mimeType: "application/vnd.google-apps.spreadsheet",
        webViewLink: "https://docs.google.com/spreadsheets/d/drive-file-1",
      }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await uploadGoogleDriveArtifact({
      config: resolveProductionIntegrationConfig({}),
      credential: {} as never,
      projectId: "project-1",
      artifact: "tax-invoice-sheet",
      fileName: "tax-invoices",
      sourceMimeType: "text/csv",
      googleMimeType: "application/vnd.google-apps.spreadsheet",
      content: "invoiceId,amount\ninvoice-1,120000\n",
    });
    expect(result).toMatchObject({
      id: "drive-file-1",
      created: true,
      mimeType: "application/vnd.google-apps.spreadsheet",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("drive/v3/files?");
    expect(init.method).toBeUndefined();
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(uploadUrl).toContain("upload/drive/v3/files?uploadType=multipart");
    expect(uploadInit.method).toBe("POST");
    expect(new Headers(uploadInit.headers).get("content-type"))
      .toMatch(/^multipart\/related; boundary=/u);
    expect(String(uploadInit.body)).toContain(
      "application/vnd.google-apps.spreadsheet",
    );
    expect(String(uploadInit.body)).toContain("invoice-1,120000");
  });

  it("reuses an exact converted Sheet digest without creating a duplicate", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ files: [{
      id: "drive-sheet-existing",
      name: "tax-invoices",
      mimeType: "application/vnd.google-apps.spreadsheet",
      webViewLink: "https://docs.google.com/spreadsheets/d/drive-sheet-existing",
    }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadGoogleDriveArtifact({
      config: resolveProductionIntegrationConfig({}),
      credential: {} as never,
      projectId: "project-1",
      artifact: "tax-invoice-sheet",
      fileName: "tax-invoices",
      sourceMimeType: "text/csv",
      googleMimeType: "application/vnd.google-apps.spreadsheet",
      content: "invoiceId,amount\ninvoice-1,120000\n",
    });

    expect(result).toMatchObject({
      id: "drive-sheet-existing",
      created: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(String(fetchMock.mock.calls[0]?.[0])))
      .toContain("toonspectrumContentDigest");
  });
});

describe("zero-cost provider policy", () => {
  it("keeps hosted Documenso disabled unless explicitly permitted", () => {
    const blocked = resolveProductionIntegrationConfig({
      DOCUMENSO_BASE_URL: "https://app.documenso.com/api/v2",
      DOCUMENSO_API_TOKEN: "configured-value",
    });
    expect(blocked.documenso.configured).toBe(false);
    expect(blocked.documenso.selfHosted).toBe(false);

    const stillBlocked = resolveProductionIntegrationConfig({
      DOCUMENSO_BASE_URL: "https://app.documenso.com/api/v2",
      DOCUMENSO_API_TOKEN: "configured-value",
      PRODUCTION_DOCUMENSO_ALLOW_HOSTED: "true",
    });
    expect(stillBlocked.costPolicy).toBe("zero-cost-only");
    expect(stillBlocked.documenso.configured).toBe(false);

    const allowed = resolveProductionIntegrationConfig({
      DOCUMENSO_BASE_URL: "https://app.documenso.com/api/v2",
      DOCUMENSO_API_TOKEN: "configured-value",
      PRODUCTION_DOCUMENSO_ALLOW_HOSTED: "true",
      PRODUCTION_INTEGRATION_COST_POLICY: "explicit-cost-enabled",
    });
    expect(allowed.documenso.configured).toBe(true);
    expect(allowed.documenso.hostedAllowed).toBe(true);
  });

  it("requires both cost policy and live opt-in before enabling live payments", () => {
    const blocked = resolveProductionIntegrationConfig({
      TOSS_PAYMENTS_SECRET_KEY: "live_placeholder_key",
      PRODUCTION_TOSS_ALLOW_LIVE: "true",
    });
    expect(blocked.costPolicy).toBe("zero-cost-only");
    expect(blocked.toss.liveAllowed).toBe(false);

    const enabled = resolveProductionIntegrationConfig({
      TOSS_PAYMENTS_SECRET_KEY: "live_placeholder_key",
      PRODUCTION_TOSS_ALLOW_LIVE: "true",
      PRODUCTION_INTEGRATION_COST_POLICY: "explicit-cost-enabled",
    });
    expect(enabled.toss.liveAllowed).toBe(true);
  });
});
