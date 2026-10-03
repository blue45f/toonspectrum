import { describe, expect, it } from "vitest";

import { PRODUCT_DECISION_CHECKS, PRODUCT_PRINCIPLE_GROUPS } from "./product-principles";

describe("creator-first product principles", () => {
  it("publishes four groups and twelve unique decision principles", () => {
    const ids: string[] = [];
    for (const group of PRODUCT_PRINCIPLE_GROUPS) {
      for (const principle of group.principles) ids.push(principle.id);
    }

    expect(PRODUCT_PRINCIPLE_GROUPS).toHaveLength(4);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every public principle complete in Korean and English", () => {
    for (const group of PRODUCT_PRINCIPLE_GROUPS) {
      for (const locale of ["ko", "en"] as const) {
        expect(group[locale].tab.trim(), `${group.id}.${locale}.tab`).not.toBe("");
        // 탭 이름은 모바일 분할 버튼(4개) 한 줄에 들어가야 하므로 짧게 둔다.
        expect(group[locale].tab.length, `${group.id}.${locale}.tab`).toBeLessThanOrEqual(16);
        expect(group[locale].eyebrow.trim(), `${group.id}.${locale}.eyebrow`).not.toBe("");
        expect(group[locale].title.trim(), `${group.id}.${locale}.title`).not.toBe("");
        expect(group[locale].body.trim(), `${group.id}.${locale}.body`).not.toBe("");
      }

      for (const principle of group.principles) {
        for (const locale of ["ko", "en"] as const) {
          expect(principle[locale].title.trim(), `${principle.id}.${locale}.title`).not.toBe("");
          expect(principle[locale].body.trim(), `${principle.id}.${locale}.body`).not.toBe("");
          expect(principle[locale].practice.trim(), `${principle.id}.${locale}.practice`).not.toBe("");
        }
      }
    }
  });

  it("uses the same six decision checks in both supported page languages", () => {
    expect(PRODUCT_DECISION_CHECKS.ko).toHaveLength(6);
    expect(PRODUCT_DECISION_CHECKS.en).toHaveLength(6);
  });
});
