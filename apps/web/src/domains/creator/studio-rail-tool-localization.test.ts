import { describe, expect, it } from "vitest";

import {
  localizeStudioRailShellText,
  localizeStudioRailToolLabel,
  studioRailShortcutSuffix,
} from "./studio-rail-tool-localization";

const ko: Record<string, string> = {
  "studio.settings.tool.select": "선택",
  "studio.settings.tool.hand": "화면 이동",
  "studio.settings.tool.fill": "색 채우기",
  "studio.settings.tool.eyedropper": "색 가져오기",
};
const t = (key: string) => ko[key] ?? key;

describe("studio rail tool localization", () => {
  it("uses the same plain Korean names as settings", () => {
    expect(localizeStudioRailToolLabel({
      toolId: "hand",
      authoredLabel: "핸드 (팬)",
      lang: "ko",
      t,
    })).toBe("화면 이동");
    expect(localizeStudioRailToolLabel({
      toolId: "fill",
      authoredLabel: "채우기 (G)",
      lang: "ko",
      t,
    })).toBe("색 채우기 (G)");
    expect(localizeStudioRailToolLabel({
      toolId: "eyedropper",
      authoredLabel: "스포이드 (I / Alt+클릭)",
      lang: "ko",
      t,
    })).toBe("색 가져오기 (I / Alt+클릭)");
  });

  it("keeps key hints but drops synonym-only suffixes", () => {
    expect(studioRailShortcutSuffix("선택 (V)")).toBe("V");
    expect(studioRailShortcutSuffix("스포이드 (I / Alt+클릭)")).toBe("I / Alt+클릭");
    expect(studioRailShortcutSuffix("핸드 (팬)")).toBeNull();
  });

  it("keeps shell labels authored in Korean", () => {
    expect(localizeStudioRailShellText("그리기", "ko", t)).toBe("그리기");
  });
});
