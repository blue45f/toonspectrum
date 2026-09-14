import { describe, expect, it } from "vitest";

import { planStudioExportDialogueTxt, preflightStudioExportPackage } from "./studio-export-package-preflight";
import {
  assertStudioExportCaptureComplete,
  formatStudioExportPageSelection,
  resolveStudioExportPageSelection,
} from "./studio-export-page-selection";

describe("selective page delivery", () => {
  it("combines page numbers and ranges into a unique document-ordered selection", () => {
    const result = resolveStudioExportPageSelection(12, "8, 3–5, 1, 4-6, 10~11, 8");
    expect(result).toEqual({ ok: true, indices: [0, 2, 3, 4, 5, 7, 9, 10] });
    if (result.ok) expect(formatStudioExportPageSelection(result.indices)).toBe("페이지 1, 3–6, 8, 10–11");
  });

  it.each(["", " ", "1,", ",1", "1,,2", "0", "13", "5-3", "1.5", "-1", "1e1", "1 2", "1–2–3", "9007199254740993"])(
    "rejects invalid selection %j without exporting other pages",
    (pageSelection) => {
      const result = preflightStudioExportPackage({ pageCount: 12, pageSelection });
      expect(result.canExport).toBe(false);
      expect(result.pageIndices).toEqual([]);
      expect(result.errors[0]?.code).toBe("PAGE_RANGE_INVALID");
    }
  );

  it("accepts pasted punctuation and rejects overly long expressions", () => {
    expect(resolveStudioExportPageSelection(8, " 1 ， 3 — 5 ")).toEqual({ ok: true, indices: [0, 2, 3, 4] });
    expect(resolveStudioExportPageSelection(8, "1,".repeat(3000))).toMatchObject({ ok: false });
  });

  it("uses selected pages for dialogue and overrides the contiguous controls", () => {
    const pages = Array.from({ length: 4 }, (_, index) => ({
      id: `p${index}`,
      elements: [{ id: `b${index}`, type: "bubble" as const, text: `대사${index + 1}`, x: 0, y: 0, width: 100, height: 60 }],
    }));
    const selected = preflightStudioExportPackage({
      pageCount: 4,
      pageRange: { fromIndex: 0, toIndex: 3 },
      pageSelection: "4, 2",
      pagesForDialogue: pages,
    });
    expect(selected.pageIndices).toEqual([1, 3]);
    expect(selected.dialogueTxt?.cueCount).toBe(2);
    expect(selected.dialogueTxt?.text).toContain("대사2");
    expect(selected.dialogueTxt?.text).toContain("대사4");
    expect(selected.dialogueTxt?.text).not.toContain("대사1");
    expect(selected.dialogueTxt?.text).not.toContain("대사3");
    expect(selected.dialogueTxt?.text).toContain("@페이지 2");
    expect(selected.dialogueTxt?.text).toContain("@페이지 4");
    expect(selected.dialogueTxt?.text).not.toContain("@페이지 1");
    expect(preflightStudioExportPackage({ pageCount: 4, pageSelection: "5", pagesForDialogue: pages }).dialogueTxt).toBeNull();
    expect(planStudioExportDialogueTxt({ pages, pageIndices: [] })).toBeNull();
  });

  it("rejects incomplete, extra, sparse, and zero-sized captures before encoding", () => {
    const canvas = { width: 800, height: 1200 } as HTMLCanvasElement;
    expect(() => assertStudioExportCaptureComplete([canvas], 2)).toThrow("2페이지 중 1페이지만");
    expect(() => assertStudioExportCaptureComplete([canvas, canvas], 1)).toThrow("저장을 중단");
    expect(() => assertStudioExportCaptureComplete(new Array<HTMLCanvasElement>(2), 2)).toThrow("캡처 이미지가 비어");
    expect(() => assertStudioExportCaptureComplete([{ width: 0, height: 10 } as HTMLCanvasElement], 1)).toThrow("캡처 이미지가 비어");
    expect(() => assertStudioExportCaptureComplete([canvas, canvas], 2)).not.toThrow();
  });
});
