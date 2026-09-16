// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { applyDocumentLocale, detectDocumentPreferredLocale } from "@/shared/lib/i18n";

describe("detectDocumentPreferredLocale", () => {
  it("prefers the document lang attribute over an English navigator locale", () => {
    const previousLang = document.documentElement.lang;
    const previousLanguage = Object.getOwnPropertyDescriptor(navigator, "language");
    document.documentElement.lang = "ko";
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "en-US",
    });

    expect(detectDocumentPreferredLocale()).toBe("ko");

    document.documentElement.lang = previousLang;
    if (previousLanguage) {
      Object.defineProperty(navigator, "language", previousLanguage);
    }
  });
  it("applies language and writing direction to the document root", () => {
    const previousLang = document.documentElement.lang;
    const previousDir = document.documentElement.dir;

    applyDocumentLocale("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");

    applyDocumentLocale("en-US");
    expect(document.documentElement.lang).toBe("en-us");
    expect(document.documentElement.dir).toBe("ltr");

    document.documentElement.lang = previousLang;
    document.documentElement.dir = previousDir;
  });

});
