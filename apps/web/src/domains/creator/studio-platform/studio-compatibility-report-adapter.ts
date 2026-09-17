import {
  validateStudioCompatibilityReport,
  type StudioCompatibilityItemV1,
  type StudioCompatibilityOutcome,
  type StudioCompatibilityReportV1,
} from "@toonspectrum/studio-project-model";

import type {
  StudioImportCompatibilityReport,
  StudioImportFidelityGrade,
} from "../studio-import-compatibility-report";

const GRADE_OUTCOME: Readonly<
  Record<StudioImportFidelityGrade, StudioCompatibilityOutcome>
> = Object.freeze({
  N: "preserved",
  A: "preserved",
  B: "converted",
  C: "approximated",
  D: "rasterized",
  P: "opaque-preserved",
  X: "blocked",
});

function canonicalIdentity(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 240);
  return normalized || fallback;
}

function fidelityItem(input: {
  readonly reportId: string;
  readonly category: string;
  readonly grade: StudioImportFidelityGrade;
  readonly targetObjectType: string;
}): StudioCompatibilityItemV1 {
  const outcome = GRADE_OUTCOME[input.grade];
  return Object.freeze({
    version: 1,
    id: canonicalIdentity(`${input.reportId}:${input.category}`, "compatibility-item"),
    category: input.category,
    sourcePath: `fidelity/${input.category}`,
    outcome,
    targetObjectType: outcome === "blocked" ? null : input.targetObjectType,
    reason: `Source fidelity grade ${input.grade} maps to ${outcome}.`,
  });
}

export function adaptStudioImportCompatibilityReport(input: {
  readonly report: StudioImportCompatibilityReport;
  readonly parserVersion: string;
  readonly createdAt: string;
}): StudioCompatibilityReportV1 {
  const reportId = canonicalIdentity(
    `compat:${input.report.format}:${input.report.sourceHash.slice(-16)}`,
    "compatibility-report",
  );
  const items: StudioCompatibilityItemV1[] = [
    fidelityItem({
      reportId,
      category: "geometry",
      grade: input.report.fidelity.geometry,
      targetObjectType: "scene-geometry",
    }),
    fidelityItem({
      reportId,
      category: "material",
      grade: input.report.fidelity.material,
      targetObjectType: "scene-material",
    }),
    fidelityItem({
      reportId,
      category: "rig-animation",
      grade: input.report.fidelity.rigAnimation,
      targetObjectType: "scene-rig-animation",
    }),
    fidelityItem({
      reportId,
      category: "semantic-history",
      grade: input.report.fidelity.semanticHistory,
      targetObjectType: "scene-semantic-history",
    }),
  ];

  for (const [index, unsupported] of input.report.unsupportedEntities.entries()) {
    items.push(Object.freeze({
      version: 1,
      id: canonicalIdentity(`${reportId}:unsupported:${index}`, `unsupported-${index}`),
      category: unsupported.kind,
      sourcePath: `unsupported/${index}`,
      outcome: "blocked",
      targetObjectType: null,
      reason: unsupported.name
        ? `${unsupported.name}: ${unsupported.reason}`
        : unsupported.reason,
    }));
  }

  const report: StudioCompatibilityReportV1 = Object.freeze({
    version: 1,
    id: reportId,
    sourceFormat: input.report.format,
    sourceDigest: input.report.sourceHash,
    preservedOriginalBlobDigest: input.report.sourceHash,
    parserId: canonicalIdentity(input.report.parser, "studio-import-parser"),
    parserVersion: input.parserVersion,
    createdAt: input.createdAt,
    items: Object.freeze(items),
    committed: input.report.committed,
  });

  const issues = validateStudioCompatibilityReport(report);
  if (issues.length > 0) {
    throw new Error(`Compatibility report adaptation failed: ${issues.join(", ")}`);
  }
  return report;
}
