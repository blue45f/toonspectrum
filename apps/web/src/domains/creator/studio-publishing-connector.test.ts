import { describe, expect, it } from "vitest";

import {
  createStudioPublishReceipt,
  planStudioPublish,
  validateStudioPublishConnector,
  type StudioPublishConnector,
  type StudioPublishRequest,
} from "./studio-publishing-connector";

import type { StudioExportPreflightResult } from "./studio-export-preflight";

const CONNECTOR: StudioPublishConnector = Object.freeze<StudioPublishConnector>({
  id: "webtoon-api",
  platformName: "Webtoon API",
  mode: "direct-api",
  policyVersion: "2026-09",
  capabilities: ["publish", "schedule", "localization", "analytics", "comments"],
  supportedLocales: ["ko", "en", "ja"],
  credentialsRequired: true,
});

const PREFLIGHT: StudioExportPreflightResult = Object.freeze<StudioExportPreflightResult>({
  target: "webtoon-platform",
  policyVersion: "2026-09",
  status: "pass",
  blockingCount: 0,
  warningCount: 0,
  findings: [],
  summaryKo: "준비 완료",
  summaryEn: "Ready",
});

const REQUEST: StudioPublishRequest = Object.freeze<StudioPublishRequest>({
  projectId: "project-1",
  documentId: "document-1",
  locales: ["ko", "en"],
  scheduledAt: null,
  credentialsAvailable: true,
  externalWriteConfirmed: false,
  requestedAt: "2026-09-11T00:00:00.000Z",
});

describe("Studio publishing connector", () => {
  it("requires an explicit confirmation before a direct external write", () => {
    const confirmation = planStudioPublish(CONNECTOR, PREFLIGHT, REQUEST);
    expect(confirmation).toMatchObject({
      status: "confirmation",
      action: "publish-now",
      publishLocales: ["ko", "en"],
    });
    const readyRequest = { ...REQUEST, externalWriteConfirmed: true };
    const ready = planStudioPublish(CONNECTOR, PREFLIGHT, readyRequest);
    expect(ready.status).toBe("ready");
    expect(createStudioPublishReceipt(CONNECTOR, readyRequest, ready, {
      receiptId: "publish-1",
      createdAt: "2026-09-11T00:01:00.000Z",
      externalReference: "episode-100",
    })).toMatchObject({
      id: "publish-1",
      externalReference: "episode-100",
      locales: ["ko", "en"],
    });
  });

  it("blocks failed preflight and missing credentials", () => {
    expect(planStudioPublish(CONNECTOR, {
      ...PREFLIGHT,
      status: "blocked",
      blockingCount: 1,
    }, {
      ...REQUEST,
      credentialsAvailable: false,
    })).toMatchObject({
      status: "blocked",
      blockingReasons: expect.arrayContaining([
        "preflight-blocked",
        "credentials-required",
      ]),
    });
  });

  it("excludes unsupported languages without silently changing the request", () => {
    const plan = planStudioPublish(CONNECTOR, PREFLIGHT, {
      ...REQUEST,
      locales: ["ko", "fr"],
      externalWriteConfirmed: true,
    });
    expect(plan.publishLocales).toEqual(["ko"]);
    expect(plan.unsupportedLocales).toEqual(["fr"]);
    expect(plan.warnings).toContain("unsupported-locales-excluded");
  });

  it("uses package and manual connectors without pretending to publish", () => {
    const packageConnector: StudioPublishConnector = {
      ...CONNECTOR,
      id: "package-only",
      mode: "package",
      capabilities: ["localization"],
      credentialsRequired: false,
    };
    expect(planStudioPublish(packageConnector, PREFLIGHT, REQUEST)).toMatchObject({
      status: "ready",
      action: "build-package",
    });
    const manualConnector: StudioPublishConnector = {
      ...packageConnector,
      id: "manual-upload",
      mode: "manual",
    };
    expect(planStudioPublish(manualConnector, PREFLIGHT, REQUEST).action).toBe(
      "show-instructions",
    );
  });

  it("rejects inconsistent connector declarations", () => {
    expect(validateStudioPublishConnector({
      ...CONNECTOR,
      capabilities: ["analytics"],
    })).toContain("direct-publish-capability");
  });
});
