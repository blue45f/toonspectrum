import { describe, expect, it } from "vitest";

import {
  formatStudioAppSettingsCenterText,
  studioAppSettingsCenterProfileCopyKey,
  studioAppSettingsCenterSearchCopyKey,
} from "./studio-app-settings-center-i18n";

import { resolveTranslation } from "@/shared/lib/i18n";

describe("Studio application settings center i18n", () => {
  it("한국어와 영어 기본 사전을 동기 등록한다", () => {
    expect(resolveTranslation("ko", "studio.settings.center.title")).toBe("애플리케이션 설정");
    expect(resolveTranslation("en", "studio.settings.center.title")).toBe("Application settings");
    expect(resolveTranslation(
      "en",
      studioAppSettingsCenterProfileCopyKey("pen-display", "label"),
    )).toBe("Pen display");
    expect(resolveTranslation(
      "en",
      studioAppSettingsCenterSearchCopyKey("pressure", "label"),
    )).toBe("Pressure curve");
  });

  it("동적 개수와 이름을 안전하게 치환하고 알 수 없는 토큰은 보존한다", () => {
    expect(formatStudioAppSettingsCenterText(
      "{count} changes for {profile}; {unknown}",
      { count: 3, profile: "Balanced" },
    )).toBe("3 changes for Balanced; {unknown}");
  });
});
