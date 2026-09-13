// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { detectDocumentPreferredLocale } from "@/shared/lib/i18n";

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
});
