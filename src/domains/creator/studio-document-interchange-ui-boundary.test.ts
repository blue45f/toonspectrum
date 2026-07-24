import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

function sourceSection(
  contents: string,
  startMarker: string,
  endMarker: string,
): string {
  const start = contents.indexOf(startMarker);
  const end = contents.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Source boundary markers were not found: ${startMarker} -> ${endMarker}`);
  }
  return contents.slice(start, end);
}

const studioPage = source("./StudioPage.tsx");
const menubar = source("./StudioMenubarContent.tsx");
const menuCatalogue = source("./studio-main-menu-groups.ts");
const archiveApply = source("./studio-archive-import-apply.ts");
const deviceProfile = source("./studio-document-import-device-profile.ts");
const interchangeCommit = source("./studio-document-interchange-commit.ts");
const interchangePreview = source("./studio-document-interchange-preview.ts");

describe("Studio document interchange UI boundary", () => {
  // 회귀 가드(2026-07-24): 가져오기 파일 입력이 "프로젝트 도구" 패널(projectActionsOpen) 조건 안에
  // 들어가 있으면, 파일 메뉴의 가져오기 항목이 부르는 ref.current?.click()이 패널이 닫혀 있을 때
  // null 이라 조용히 무시된다(실측된 "가져오기 아무 반응 없음" 버그). 네 입력은 반드시 패널 게이트
  // 앞(=항상 마운트)에 있어야 한다.
  it("always mounts the four import file inputs, not gated behind projectActionsOpen", () => {
    const gate = menubar.indexOf("projectActionsOpen &&");
    expect(gate).toBeGreaterThan(0);
    for (const ref of [
      "ref={projectImportInputRef}",
      "ref={projectArchiveImportInputRef}",
      "ref={psdImportInputRef}",
      "ref={interchangeImportInputRef}",
    ]) {
      const at = menubar.indexOf(ref);
      expect(at, `${ref} must exist`).toBeGreaterThan(0);
      // 첫 등장이 패널 게이트보다 앞서야 항상 렌더된다.
      expect(at, `${ref} must render before the projectActionsOpen gate`).toBeLessThan(gate);
    }
    // 파일 메뉴 요청 핸들러가 각 ref 를 클릭한다.
    expect(studioPage).toContain(
      "requestProjectImport: () => projectImportInputRef.current?.click()",
    );
    expect(studioPage).toContain(
      "requestPsdImport: () => psdImportInputRef.current?.click()",
    );
  });

  it("connects the ORA/CBZ menu command to one format-scoped file input", () => {
    const menuItem = sourceSection(
      menuCatalogue,
      'id: "import-ora-cbz"',
      'id: "project"',
    );
    const input = sourceSection(
      menubar,
      "ref={interchangeImportInputRef}",
      "{interchangeImportStatus ?",
    );

    expect(menuItem).toContain("state.interchangeImportBusy");
    expect(menuItem).toContain("state.collaborationDocumentLocked");
    expect(menuItem).toContain("ui.requestInterchangeImport()");
    expect(studioPage).toContain(
      "requestInterchangeImport: () => interchangeImportInputRef.current?.click()",
    );
    expect(input).toContain('accept=".ora,.cbz,image/openraster,application/vnd.comicbook+zip"');
    expect(input).toContain("handleImportInterchangeArchive(event)");
    expect(input).toContain('aria-label="OpenRaster 또는 CBZ 가져오기"');
  });

  it("loads archive codecs and the loss adapter only after selection and makes parsing cancellable", () => {
    const cancelFlow = sourceSection(
      studioPage,
      "function cancelInterchangeImport()",
      "async function handleImportInterchangeArchive",
    );
    const importFlow = sourceSection(
      studioPage,
      "async function handleImportInterchangeArchive",
      "// PSD 레이어 가져오기",
    );

    expect(cancelFlow).toContain("interchangeImportAbortRef.current?.abort()");
    expect(cancelFlow).toContain("setInterchangeImportBusy(false)");
    expect(importFlow).toContain("const controller = new AbortController()");
    expect(importFlow).toContain('import("./studio-document-interchange-commit")');
    expect(importFlow).toContain('import("./studio-document-import-device-profile")');
    expect(importFlow).toContain("inspectStudioDocumentInterchangeArchive(file, {");
    expect(interchangeCommit).toContain('import("./studio-openraster-interchange")');
    expect(interchangeCommit).toContain('import("./studio-cbz-interchange")');
    expect(interchangeCommit).toContain('import("./studio-document-interchange-preview")');
    expect(interchangePreview).not.toContain('from "./studio-archive-import-apply"');
    expect(interchangeCommit).not.toContain('from "./studio-pages"');
    expect(interchangeCommit).toContain("importStudioOpenRaster(file, {");
    expect(interchangeCommit).toContain("limits: options.openRasterLimits");
    expect(interchangeCommit).toContain("importStudioCbz(file, {");
    expect(interchangeCommit).toContain("limits: options.cbzLimits");
    expect(importFlow).toContain("signal: controller.signal");
    expect(importFlow).toContain("controller.signal.aborted");
    expect(importFlow).toContain("interchangeImportAbortRef.current !== controller");
    expect(importFlow).toContain("documentImportOperationRef.current !== null");
    expect(importFlow).toContain('kind: "archive-inspect"');
  });

  it("routes PSD through the shared loss preview instead of a native confirm dialog", () => {
    const psdFlow = sourceSection(
      studioPage,
      "async function handleImportPsd",
      "function dismissPendingInterchangeImport",
    );

    expect(psdFlow).toContain('import("./studio-document-interchange-preview")');
    expect(psdFlow).toContain("createStudioPsdImportLossPreview(file.name, result");
    expect(psdFlow).toContain('setPendingInterchangeImport({ kind: "psd"');
    expect(psdFlow).not.toMatch(/\b(?:globalThis\.)?confirm\s*\(/u);
  });

  it("keeps ORA placement selectable while importing every CBZ image as a new page batch", () => {
    const applyFlow = sourceSection(
      studioPage,
      "async function applyPendingInterchangeImport",
      "const pendingBrushDelete =",
    );
    const openRasterApply = sourceSection(
      interchangeCommit,
      'pending.kind === "ora"',
      "const drafts = await runtime.prepareStudioCbzImportPages",
    );
    const cbzApply = sourceSection(
      interchangeCommit,
      "const drafts = await runtime.prepareStudioCbzImportPages",
      "return {\n    pages,",
    );

    expect(applyFlow).toContain('import("./studio-document-interchange-commit")');
    expect(applyFlow).toContain("prepareStudioDocumentInterchangeCommit(pending");
    expect(applyFlow).toContain("commitImportedPages(draft.pages)");
    expect(interchangeCommit).toContain('import("./studio-archive-import-apply")');
    expect(openRasterApply).toContain('options.choice === "current-page"');
    expect(openRasterApply).toContain("elements: [...page.elements, ...draft.elements]");
    expect(openRasterApply).toContain("const page = importedPage(draft, options)");
    expect(openRasterApply).toContain("pages.splice(index + 1, 0, page)");

    expect(cbzApply).toContain("const addedPages = drafts.map");
    expect(cbzApply).toContain("pages.splice(index + 1, 0, ...addedPages)");
    expect(interchangeCommit).toContain("selectedPageId: addedPages[0].id");
    expect(cbzApply).not.toContain("options.choice");
  });

  it("renders one shared loss dialog and preserves mobile/desktop project embed budgets", () => {
    const dialog = sourceSection(
      studioPage,
      "{pendingInterchangeImport ? (",
      "{pendingBrushDelete ? (",
    );

    expect(studioPage).toContain('import("./StudioInterchangeLossPreviewDialog")');
    expect(dialog).toContain("<LazyStudioInterchangeLossPreviewDialog");
    expect(dialog).toContain("preview={pendingInterchangeImport.preview}");
    expect(dialog).toContain('pendingInterchangeImport.kind === "cbz"');
    expect(dialog).toContain(": STUDIO_INTERCHANGE_IMPORT_PLACEMENT_CHOICES");
    expect(dialog).toContain("onConfirm={(choiceId) => void applyPendingInterchangeImport(choiceId)}");
    expect(dialog).toContain("onCancel={dismissPendingInterchangeImport}");
    expect(studioPage).toContain("studioDocumentImportDeviceProfile(isMobile, pages.length)");
    expect(studioPage).toContain("openRasterLimits: deviceProfile.openRasterLimits");
    expect(studioPage).toContain("cbzLimits: deviceProfile.cbzLimits");
    expect(studioPage).toContain("maxEmbeddedBytes: deviceProfile.maxEmbeddedBytes");
    expect(studioPage).toContain("nextPages.length > STUDIO_PROJECT_MAX_PAGES");
    expect(studioPage).toContain("page.canvasH > STUDIO_PROJECT_MAX_CANVAS_HEIGHT");
    expect(deviceProfile).toContain("(mobile ? 64 : 128) * MiB");
    expect(deviceProfile).toContain("Math.floor(maxEmbeddedBytes * 3 / 4) - 64 * 1024");
    expect(deviceProfile).toContain("STUDIO_PROJECT_MAX_PAGES - currentPageCount");
    expect(archiveApply).toContain("const DEFAULT_MAX_EMBEDDED_BYTES = 128 * 1024 * 1024");
  });
});
