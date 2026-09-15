// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import { ProductionIntegrationsPanel } from "./ProductionIntegrationsPanel";

const api = vi.hoisted(() => ({
  capabilities: vi.fn(),
  calendar: vi.fn(),
  syncCalendar: vi.fn(),
  disconnectGoogle: vi.fn(),
  connectGoogle: vi.fn(),
  mailto: vi.fn(),
  gmail: vi.fn(),
  drive: vi.fn(),
  backup: vi.fn(),
  signing: vi.fn(),
  provenance: vi.fn(),
  notification: vi.fn(),
  documenso: vi.fn(),
  toss: vi.fn(),
}));

vi.mock("./production-api", () => ({
  getProductionIntegrationCapabilities: api.capabilities,
  getProductionCalendarEvents: api.calendar,
  syncProductionGoogleCalendar: api.syncCalendar,
  disconnectGoogleProduction: api.disconnectGoogle,
  getGoogleProductionConnectUrl: api.connectGoogle,
  createProductionMailtoDraft: api.mailto,
  createProductionGmailDraft: api.gmail,
  uploadProductionGoogleDriveArtifact: api.drive,
  getProductionProjectBackup: api.backup,
  getProductionSigningPackage: api.signing,
  getProductionProvenance: api.provenance,
  sendProductionIntegrationNotification: api.notification,
  createProductionDocumensoEnvelope: api.documenso,
  confirmProductionTossPayment: api.toss,
  productionCalendarIcsUrl: (projectId: string) => `/api/production/projects/${projectId}/integrations/calendar.ics`,
  productionTaxInvoiceCsvUrl: (projectId: string) => `/api/production/projects/${projectId}/integrations/tax-invoices.csv`,
}));

vi.mock("./production-push-client", () => ({
  productionPushSupported: () => true,
  subscribeProductionPush: vi.fn(),
  unsubscribeProductionPush: vi.fn(),
}));

const aggregate = createProductionDemoProject();

function capabilities(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    zeroCostFirst: true,
    costPolicy: "zero-cost-only",
    budget: {
      resetsAt: "2026-09-16T00:00:00.000Z",
      limits: {
        googleCalendarSyncs: 20,
        gmailDrafts: 100,
        googleDriveUploads: 50,
        notifications: 200,
        documensoEnvelopes: 20,
      },
      used: {
        googleCalendarSyncs: 0,
        gmailDrafts: 0,
        googleDriveUploads: 0,
        notifications: 0,
        documensoEnvelopes: 0,
      },
      remaining: {
        googleCalendarSyncs: 20,
        gmailDrafts: 100,
        googleDriveUploads: 50,
        notifications: 200,
        documensoEnvelopes: 20,
      },
    },
    calendar: {
      icsExport: true,
      googleTemplateLinks: true,
      googleApiConfigured: false,
      googleConnected: false,
    },
    email: {
      mailtoDraft: true,
      gmailApiConfigured: false,
      googleConnected: false,
    },
    drive: {
      googleApiConfigured: false,
      googleConnected: false,
      scope: "drive.file",
      artifacts: [
        "project-backup",
        "calendar-ics",
        "provenance-json",
        "tax-invoice-csv",
        "tax-invoice-sheet",
      ],
    },
    notifications: {
      webPush: false,
      vapidPublicKey: null,
      genericWebhook: false,
      discord: false,
      ntfy: false,
    },
    signatures: {
      documensoConfigured: false,
      selfHosted: false,
      hostedAllowed: false,
      manualSigningPackage: true,
      fallback: "download-pdf-and-sign-manually",
    },
    payments: {
      tossConfigured: false,
      mode: "disabled",
    },
    taxInvoice: {
      csvExport: true,
      googleSheetExport: false,
      automaticIssuance: false,
    },
    provenance: {
      hashManifest: true,
      c2paDraft: true,
      trustedCertificateSigning: false,
    },
    ...overrides,
  };
}

async function renderReady(overrides: Record<string, unknown> = {}) {
  api.capabilities.mockResolvedValue(capabilities(overrides));
  api.calendar.mockResolvedValue({ events: [] });
  render(<ProductionIntegrationsPanel aggregate={aggregate} />);
  await screen.findByText("일정 · Google Calendar");
}

beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset();
  api.drive.mockResolvedValue({
    id: "drive-file-1",
    name: "backup.json",
    mimeType: "application/json",
    webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
    created: true,
    digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProductionIntegrationsPanel zero-cost integration UI", () => {
  it("shows local fallbacks and keeps unconfigured external writes disabled", async () => {
    await renderReady();
    expect(screen.getByText("비용 없는 경로를 기본값으로 사용합니다.")).toBeTruthy();
    expect(screen.getByText(/정책 zero-cost-only/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: "ICS 내려받기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "프로젝트 전체 백업" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "수동 서명 패키지" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Google Drive에 저장" }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it("uploads a selected artifact through the connected Drive account", async () => {
    await renderReady({
      drive: {
        googleApiConfigured: true,
        googleConnected: true,
        scope: "drive.file",
        artifacts: [
          "project-backup",
          "calendar-ics",
          "provenance-json",
          "tax-invoice-csv",
          "tax-invoice-sheet",
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Google Drive 백업 종류"), {
      target: { value: "tax-invoice-sheet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Google Drive에 저장" }));
    await waitFor(() => {
      expect(api.drive).toHaveBeenCalledWith(aggregate.projectId, {
        artifact: "tax-invoice-sheet",
      });
    });
    expect((await screen.findByRole("link", { name: "저장된 파일 열기" }))
      .getAttribute("href"))
      .toBe("https://drive.google.com/file/d/drive-file-1/view");
  });

  it("does not expose live payment execution under the zero-cost policy", async () => {
    await renderReady({
      payments: {
        tossConfigured: true,
        mode: "live-blocked",
      },
    });
    fireEvent.change(screen.getByLabelText("Toss paymentKey"), {
      target: { value: "payment-key" },
    });
    fireEvent.change(screen.getByLabelText("Toss orderId"), {
      target: { value: "order_123456" },
    });
    const button = screen.getByRole("button", { name: "결제 검증" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("현재 모드: live-blocked")).toBeTruthy();
  });
});
