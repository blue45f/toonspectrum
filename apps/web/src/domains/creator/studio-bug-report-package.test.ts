import { describe, expect, it } from "vitest";

import {
  buildStudioBugReportPackage,
  describeStudioBugReportError,
  sanitizeStudioBugReportFilename,
  stringifyStudioBugReportPackage,
} from "./studio-bug-report-package";
import type { StudioDiagnosticsInput } from "./studio-device-diagnostics";
import type { StudioErrorJournalEntry } from "./studio-error-journal";
import type { StudioReliabilityStatusSnapshot } from "./studio-reliability-status-store";

/** 개인정보가 섞인 최악의 입력. 하나라도 산출물에 남으면 계약 위반이다. */
const LEAKY = {
  email: "artist@example.com",
  workId: "work-9f3a7c21",
  layerName: "주인공 얼굴 클로즈업",
  filePath: "/Users/hjunkim/Desktop/원고-3화.psd",
  // Provider-agnostic, low-entropy fixture: long enough to exercise LONG_TOKEN redaction.
  token: "REDACTION_FIXTURE_00000000000000000000000000000000",
  dataUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg",
  href: "https://toonspectrum.app/studio/work-9f3a7c21?share=secret-token&user=artist",
} as const;

function reliability(detail: string): StudioReliabilityStatusSnapshot {
  return {
    gpu: null,
    save: {
      channel: "save",
      level: "degraded",
      detail,
      updatedAt: 1_700_000_000_000,
    },
    sync: null,
  };
}

function diagnostics(): StudioDiagnosticsInput {
  return {
    timestamp: 1_700_000_000_000,
    userAgent: `Mozilla/5.0 (${LEAKY.email}) AppleWebKit/537.36`,
    language: "ko-KR",
    platform: `MacIntel ${LEAKY.filePath}`,
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 2,
    hardwareConcurrency: 10,
    deviceMemoryGb: 32,
    gpu: {
      api: "webgpu",
      vendor: "Apple",
      renderer: LEAKY.layerName,
      maxTextureSize: 16_384,
    },
    memory: {
      usedJsHeapSizeMb: 512,
      totalJsHeapSizeMb: 768,
      jsHeapSizeLimitMb: 4096,
    },
    features: {
      webgpu: true,
      webgl2: true,
      offscreenCanvas: true,
      webWorker: true,
      sharedArrayBuffer: true,
      wasm: true,
      wasmSimd: true,
      wasmThreads: true,
      opfs: true,
      indexedDb: true,
      fileSystemAccess: true,
      webCodecs: true,
      webXr: false,
    },
    viewport: {
      width: 1440,
      height: 900,
    },
  };
}

function journalEntries(): readonly StudioErrorJournalEntry[] {
  return [
    {
      id: "journal-1",
      timestamp: 1_700_000_000_000,
      source: "window-error",
      name: "Error",
      message: `Failed to save ${LEAKY.filePath} for ${LEAKY.email}`,
      stack: `Error: ${LEAKY.token}\n    at save (${LEAKY.href}:1:1)`,
      context: {
        route: `/studio/${LEAKY.workId}`,
        online: true,
        visibility: "visible",
      },
    },
  ];
}

describe("Studio bug report package", () => {
  it("scrubs identifiers, secrets and image payloads from the downloadable JSON", () => {
    const report = buildStudioBugReportPackage({
      now: 1_700_000_000_000,
      scope: {
        surface: "studio",
        location: {
          pathname: `/studio/${LEAKY.workId}`,
          search: `?share=${LEAKY.token}&email=${LEAKY.email}`,
          hash: `#${LEAKY.dataUri}`,
        },
        documentSummary: {
          pageCount: 3,
          activePageIndex: 1,
          selectedElementCount: 2,
          totalElementCount: 42,
          canvasWidth: 690,
          canvasHeight: 2_000,
          studioMode: "select",
          layout: "classic",
          workspaceId: "workspace-1",
          title: LEAKY.layerName,
          workId: LEAKY.workId,
          image: LEAKY.dataUri,
        },
      },
      diagnostics: diagnostics(),
      reliability: reliability(
        `업로드 실패: ${LEAKY.filePath} ${LEAKY.email} ${LEAKY.token} ${LEAKY.dataUri}`,
      ),
      journal: journalEntries(),
      build: {
        version: "1.2.3",
        commitSha: "abcdef123456",
      },
    });

    const serialized = stringifyStudioBugReportPackage(report);

    for (const leakedValue of Object.values(LEAKY)) {
      expect(serialized).not.toContain(leakedValue);
    }

    expect(serialized).toContain("<redacted-email>");
    expect(serialized).toContain("<redacted-path>");
    expect(serialized).toContain("<redacted-token>");
    expect(serialized).toContain("<redacted-data-uri>");
    expect(report.schemaVersion).toBe("toonspectrum.studio-bug-report.v1");
    expect(report.scope.documentSummary).toMatchObject({
      pageCount: 3,
      activePageIndex: 1,
      selectedElementCount: 2,
      totalElementCount: 42,
      canvasWidth: 690,
      canvasHeight: 2_000,
      studioMode: "select",
      layout: "classic",
      workspaceId: "workspace-1",
    });
    expect(report.scope.documentSummary).not.toHaveProperty("title");
    expect(report.scope.documentSummary).not.toHaveProperty("workId");
    expect(report.scope.documentSummary).not.toHaveProperty("image");
  });

  it("returns a bounded failure message instead of exposing exception payloads", () => {
    const huge = new Error(`failed ${"x".repeat(5_000)} ${LEAKY.email} ${LEAKY.token}`);
    const message = describeStudioBugReportError(huge);

    expect(message.length).toBeLessThanOrEqual(220);
    expect(message).not.toContain(LEAKY.email);
    expect(message).not.toContain(LEAKY.token);
  });

  it("normalizes report filenames without allowing path traversal", () => {
    expect(sanitizeStudioBugReportFilename("../내 작업 / report?.json")).toBe(
      "내-작업-report.json",
    );
    expect(sanitizeStudioBugReportFilename("report.JSON")).toBe("report.JSON");
  });
});
