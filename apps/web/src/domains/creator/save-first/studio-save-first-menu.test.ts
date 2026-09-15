import { describe, expect, it } from "vitest";

import type { StudioMainMenuItem } from "../studio-main-menu-model";
import { applyStudioSaveFirstFileMenu } from "./studio-save-first-menu";

function item(id: string, label: string): StudioMainMenuItem {
  return { id, label, onSelect: () => undefined };
}

describe("applyStudioSaveFirstFileMenu", () => {
  it("keeps save first and moves optional publication behind export tools", () => {
    const result = applyStudioSaveFirstFileMenu([
      item("save-draft", "초안 저장"),
      item("publish", "게시"),
      item("import-json", "가져오기"),
      item("export", "내보내기"),
      item("rights-manifest", "권리 명세"),
    ]);

    expect(result.map(({ id }) => id)).toEqual([
      "save-draft",
      "import-json",
      "export",
      "rights-manifest",
      "publish",
    ]);
    expect(result[0]).toMatchObject({ label: "저장하기", separatorAfter: true });
    expect(result.at(-1)).toMatchObject({ label: "ToonSpectrum에 게시…" });
  });

  it("preserves collaborative save wording", () => {
    expect(applyStudioSaveFirstFileMenu([
      item("save-draft", "공동 저장"),
    ])[0]?.label).toBe("공동 저장");
  });
});
