import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const jsonExportStart = pageSource.indexOf("async function handleExportProject()");
const jsonExportEnd = pageSource.indexOf(
  "async function handleExportProjectArchive(",
  jsonExportStart,
);
const jsonExportSource = pageSource.slice(jsonExportStart, jsonExportEnd);
const importStart = pageSource.indexOf("function handleImportProject(");
const importEnd = pageSource.indexOf(
  "async function handleImportProjectArchive(",
  importStart,
);
const jsonImportSource = pageSource.slice(importStart, importEnd);
const archiveExportStart = pageSource.indexOf(
  "async function handleExportProjectArchive(",
);
const archiveExportEnd = pageSource.indexOf(
  "function handleImportProject(",
  archiveExportStart,
);
const archiveExportSource = pageSource.slice(archiveExportStart, archiveExportEnd);

describe("Studio JSON VRM surface-paint availability boundary", () => {
  it("never treats a failed JSON portability inspection as zero paint artifacts", () => {
    expect(jsonExportStart).toBeGreaterThanOrEqual(0);
    expect(jsonExportEnd).toBeGreaterThan(jsonExportStart);
    expect(jsonExportSource).toContain(
      'import("./studio-vrm-texture-paint-project-library")',
    );
    expect(jsonExportSource).toContain(
      'readonly status: "none"',
    );
    expect(jsonExportSource).toContain(
      'readonly status: "hash-only"',
    );
    expect(jsonExportSource).toContain(
      'readonly status: "unavailable"',
    );
    expect(jsonExportSource).not.toMatch(
      /\.then\(\(plan\) => plan\.artifacts\.length,\s*\(\) => 0\)/u,
    );
    const inspection = jsonExportSource.indexOf(
      "await collectStudioVrmTexturePaintProjectPlan(",
    );
    const download = jsonExportSource.indexOf("link.click()");
    expect(inspection).toBeGreaterThanOrEqual(0);
    expect(download).toBeGreaterThan(inspection);
    expect(jsonExportSource).toContain(
      'texturePaintPortability.status === "unavailable"',
    );
    expect(jsonExportSource).toContain(
      "이 JSON만으로 3D 재편집이 가능하다고 보장할 수 없으므로",
    );
  });

  it("keeps the availability audit behind the existing analyzable dynamic import", () => {
    expect(importStart).toBeGreaterThanOrEqual(0);
    expect(importEnd).toBeGreaterThan(importStart);
    expect(jsonImportSource).toContain(
      '{ auditStudioVrmTexturePaintProjectLibraryAvailability }',
    );
    expect(jsonImportSource).toContain(
      'import("./studio-vrm-texture-paint-project-library")',
    );
    expect(jsonImportSource).toContain(
      "await auditStudioVrmTexturePaintProjectLibraryAvailability({",
    );
    expect(jsonImportSource).not.toContain(
      "await exportStudioVrmTexturePaintProjectLibrary({",
    );
    expect(jsonImportSource).not.toMatch(
      /auditStudioVrmTexturePaintProjectLibraryAvailability\([\s\S]*?\)\.catch\(/u,
    );
  });

  it("warns explicitly for both missing artifacts and unavailable browser storage", () => {
    expect(jsonImportSource).toContain(
      'texturePaintAvailability.status === "unresolved"',
    );
    expect(jsonImportSource).toContain(
      'texturePaintAvailability.status === "unavailable"',
    );
    expect(jsonImportSource).toContain("이 기기에 없습니다");
    expect(jsonImportSource).toContain("로컬 저장소를 확인할 수 없습니다");
  });

  it("passes the mobile archive budget into the paint bridge before archive building", () => {
    expect(archiveExportStart).toBeGreaterThanOrEqual(0);
    expect(archiveExportEnd).toBeGreaterThan(archiveExportStart);
    const paintExport = archiveExportSource.indexOf(
      "await exportStudioVrmTexturePaintProjectLibrary({",
    );
    const archiveBuild = archiveExportSource.indexOf(
      "await buildStudioProjectArchiveWithVerifiedBg3dModels({",
    );
    expect(paintExport).toBeGreaterThanOrEqual(0);
    expect(archiveBuild).toBeGreaterThan(paintExport);
    expect(archiveExportSource.slice(paintExport, archiveBuild)).toContain(
      "limits: isMobile ? MOBILE_PROJECT_ARCHIVE_LIMITS : undefined",
    );
  });
});
