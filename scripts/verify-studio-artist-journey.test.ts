import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  auditStudioArtistJourneyReports,
  createStudioArtistJourneyVerifierPlan,
} from "./verify-studio-artist-journey.mts";

function diff(changedPixels: number, maxChannelDelta = changedPixels > 0 ? 255 : 0) {
  return {
    changedPixels,
    totalPixels: 720 * 1080,
    maxChannelDelta,
  };
}

function lifecycleReport(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    autosave: {
      drawCount: 1,
      stroke: {
        pointCount: 25,
        fingerprint: "a".repeat(64),
      },
    },
    visual: {
      blankToCommitted: diff(2_000),
      blankToUndone: diff(0),
      committedToRedone: diff(2, 1),
      redoneToReloaded: diff(3, 2),
      beforeToAfterReloadExport: diff(0),
    },
    export: {
      beforeReload: {
        width: 1440,
        height: 2160,
        bytes: 4_096,
        backgroundDifferentPixels: 2_000,
        sha256: "b".repeat(64),
      },
      afterReload: {
        width: 1440,
        height: 2160,
        bytes: 4_096,
        backgroundDifferentPixels: 2_000,
        sha256: "b".repeat(64),
      },
      expectedWidth: 1440,
      expectedHeight: 2160,
    },
    browserErrors: {
      messages: [],
      failedResponses: [],
    },
    ...overrides,
  };
}

function qualityEntry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    runtimeBrushId: id,
    capture: {
      brushCursorStyle: "none",
    },
    artifacts: Object.fromEntries(
      ["baseline", "live", "released", "settled"].map(phase => [
        phase,
        {
          absolute: `/tmp/${id}/${phase}.png`,
          relativeToScratch: `${id}/${phase}.png`,
        },
      ])
    ),
    quality: {
      ok: true,
      frames: {
        live: { visiblePixels: 100 },
        released: { visiblePixels: 100 },
        settled: { visiblePixels: 100 },
      },
      transitions: {
        liveToReleased: { from: "live", to: "released" },
        liveToSettled: { from: "live", to: "settled" },
        releasedToSettled: { from: "released", to: "settled" },
      },
    },
    ...overrides,
  };
}

function liveCommitReport(overrides: Record<string, unknown> = {}) {
  const evidence = [qualityEntry("pen"), qualityEntry("gpen")];
  return {
    schemaVersion: 3,
    completed: true,
    expectedPresetCount: 2,
    analyzedPresetCount: 2,
    qualityFailureCount: 0,
    measurementContract: {
      capturesPerBrush: [
        "00-baseline",
        "01-live-pointer-down",
        "02-released-immediate",
        "03-settled-autosaved",
      ],
      identicalCropWithinBrush: true,
    },
    transitionSummary: {
      liveToReleased: { analyzedBrushCount: 2 },
      liveToSettled: { analyzedBrushCount: 2 },
      releasedToSettled: { analyzedBrushCount: 2 },
    },
    evidence,
    ...overrides,
  };
}

describe("Studio artist journey evidence audit", () => {
  it("accepts complete pointer/live/commit/Undo/save/reload/export browser evidence", () => {
    const audit = auditStudioArtistJourneyReports(
      lifecycleReport(),
      liveCommitReport()
    );
    expect(audit).toMatchObject({
      ok: true,
      issues: [],
      coverage: {
        pointer: true,
        live: true,
        commit: true,
        undo: true,
        save: true,
        reload: true,
        export: true,
      },
      liveCommit: {
        expectedBrushes: 2,
        analyzedBrushes: 2,
        livePixelsVerifiedBrushes: 2,
        settledPixelsVerifiedBrushes: 2,
        qualityPassedBrushes: 2,
      },
      lifecycle: {
        committedPixels: 2_000,
        autosavedPointCount: 25,
        reloadChangedPixels: 3,
        exportChangedPixels: 0,
        exportByteIdentical: true,
      },
    });
  });

  it("fails when the real pointer-down live frame is blank", () => {
    const broken = liveCommitReport({
      evidence: [
        qualityEntry("pen", {
          quality: {
            ok: false,
            frames: {
              live: { visiblePixels: 0 },
              released: { visiblePixels: 100 },
              settled: { visiblePixels: 100 },
            },
            transitions: {
              liveToReleased: { from: "live", to: "released" },
              liveToSettled: { from: "live", to: "settled" },
              releasedToSettled: { from: "released", to: "settled" },
            },
          },
        }),
        qualityEntry("gpen"),
      ],
      qualityFailureCount: 1,
    });
    const audit = auditStudioArtistJourneyReports(lifecycleReport(), broken);
    expect(audit.ok).toBe(false);
    expect(audit.coverage.live).toBe(false);
    expect(audit.issues).toContain(
      "live/commit: pen has a missing rendered phase"
    );
  });

  it("does not fail record-only-discrete brushes when live/settled ink is intentionally absent", () => {
    const report = liveCommitReport({
      expectedPresetCount: 1,
      analyzedPresetCount: 1,
      qualityFailureCount: 0,
      evidence: [
        qualityEntry("kneaded-eraser", {
          quality: {
            ok: true,
            policy: {
              kind: "record-only-discrete",
              reason: "intentional discrete carrier",
            },
            frames: {
              live: { visiblePixels: 0 },
              released: { visiblePixels: 100 },
              settled: { visiblePixels: 0 },
            },
            transitions: {
              liveToReleased: { from: "live", to: "released" },
              liveToSettled: { from: "live", to: "settled" },
              releasedToSettled: { from: "released", to: "settled" },
            },
          },
        }),
      ],
      transitionSummary: {
        liveToReleased: { analyzedBrushCount: 1 },
        liveToSettled: { analyzedBrushCount: 1 },
        releasedToSettled: { analyzedBrushCount: 1 },
      },
    });
    const audit = auditStudioArtistJourneyReports(lifecycleReport(), report);
    expect(audit.ok).toBe(true);
    expect(audit.coverage.live).toBe(true);
    expect(audit.coverage.commit).toBe(true);
    expect(audit.liveCommit.livePixelsVerifiedBrushes).toBe(0);
    expect(audit.liveCommit.settledPixelsVerifiedBrushes).toBe(0);
    expect(audit.issues).not.toEqual(
      expect.arrayContaining(["live/commit: kneaded-eraser has a missing rendered phase"]),
    );
  });

  it("fails a missing commit transition and incomplete brush matrix", () => {
    const audit = auditStudioArtistJourneyReports(
      lifecycleReport(),
      liveCommitReport({
        analyzedPresetCount: 1,
        evidence: [qualityEntry("pen")],
      })
    );
    expect(audit.ok).toBe(false);
    expect(audit.coverage.commit).toBe(false);
    expect(audit.issues).toContain(
      "live/commit: analyzed brush count does not match the complete core matrix"
    );
  });

  it("strengthens the lifecycle gate with byte-identical export verification", () => {
    const audit = auditStudioArtistJourneyReports(
      lifecycleReport({
        export: {
          ...lifecycleReport().export,
          afterReload: {
            ...lifecycleReport().export.afterReload,
            sha256: "c".repeat(64),
          },
        },
      }),
      liveCommitReport()
    );
    expect(audit.ok).toBe(false);
    expect(audit.coverage.export).toBe(false);
    expect(audit.issues).toContain(
      "lifecycle: deterministic PNG exports are not byte-identical"
    );
  });

  it("fails autosave corruption, reload drift, browser errors, and export drift together", () => {
    const audit = auditStudioArtistJourneyReports(
      lifecycleReport({
        autosave: {
          drawCount: 2,
          stroke: { pointCount: 1, fingerprint: "invalid" },
        },
        visual: {
          ...lifecycleReport().visual,
          redoneToReloaded: diff(900),
          beforeToAfterReloadExport: diff(1),
        },
        browserErrors: {
          messages: ["page crashed"],
          failedResponses: ["500 /api/unexpected"],
        },
      }),
      liveCommitReport()
    );
    expect(audit.ok).toBe(false);
    expect(audit.coverage).toMatchObject({
      save: false,
      reload: false,
      export: false,
    });
    expect(audit.issues).toEqual(expect.arrayContaining([
      "lifecycle: 1 unexpected console/page errors",
      "lifecycle: 1 unexpected 5xx responses",
      "lifecycle: reload did not restore the saved stroke",
      "lifecycle: PNG export pixels changed across save/reload",
      "lifecycle: autosave does not contain exactly one non-degenerate hashed stroke",
      "lifecycle: pre/post reload PNG exports are not pixel-identical",
    ]));
  });
});

describe("Studio artist journey verifier orchestration", () => {
  it("reuses the existing lifecycle and brush Playwright verifiers", () => {
    const plans = createStudioArtistJourneyVerifierPlan(
      "/repo",
      "/tmp/journey"
    );
    expect(plans).toEqual([
      {
        id: "lifecycle",
        script: "/repo/scripts/verify-studio-lifecycle.mts",
        outputDirectory: "/tmp/journey/lifecycle",
        environment: {
          TOONSPECTRUM_LIFECYCLE_VERIFY_DIR: "/tmp/journey/lifecycle",
        },
      },
      {
        id: "live-commit",
        script: "/repo/scripts/verify-studio-brushes.mts",
        outputDirectory: "/tmp/journey/live-commit",
        environment: {
          TOONSPECTRUM_BRUSH_VERIFY_DIR: "/tmp/journey/live-commit",
          TOONSPECTRUM_BRUSH_LONG_ONLY: "1",
          TOONSPECTRUM_ALL_BRUSH_LONG_MATRIX: "0",
          TOONSPECTRUM_DRAWING_ONLY: "0",
          TOONSPECTRUM_SHAPES_ONLY: "0",
        },
      },
    ]);
  });

  it("does not introduce a second Playwright or production-preview framework", () => {
    const source = readFileSync(
      new URL("./verify-studio-artist-journey.mts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(/from ["']playwright["']/u);
    expect(source).not.toContain("chromium.launch");
    expect(source).not.toContain("vite preview");
    expect(source).toContain("verify-studio-lifecycle.mts");
    expect(source).toContain("verify-studio-brushes.mts");
  });
});
