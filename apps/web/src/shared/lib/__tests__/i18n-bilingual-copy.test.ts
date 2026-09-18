import { describe, expect, it, vi } from "vitest";

import {
  formatI18nTemplate,
  translateBilingualText,
  translateParallelBilingualCopy,
} from "../i18n-bilingual-copy";

describe("legacy bilingual copy bridge", () => {
  it("preserves locale-invariant tokens without invoking the translator", () => {
    const t = vi.fn((key: string) => key);
    expect(translateBilingualText(t, "test", { ko: "3D", en: "3D" })).toBe("3D");
    expect(t).not.toHaveBeenCalled();
  });

  it("preserves invariant leaves inside parallel copy trees", () => {
    const t = vi.fn((key: string) => `translated:${key}`);
    const copy = translateParallelBilingualCopy(t, "testTree", {
      ko: { format: "PSD", title: "프로젝트" },
      en: { format: "PSD", title: "Project" },
    });
    expect(copy.format).toBe("PSD");
    expect(copy.title).toMatch(/^translated:legacyUi\./u);
    expect(t).toHaveBeenCalledTimes(1);
  });

  it("keeps placeholders explicit until runtime interpolation", () => {
    expect(formatI18nTemplate("Saved {project} to {provider}.", {
      project: "Episode 01",
      provider: "Drive",
    })).toBe("Saved Episode 01 to Drive.");
  });
});
