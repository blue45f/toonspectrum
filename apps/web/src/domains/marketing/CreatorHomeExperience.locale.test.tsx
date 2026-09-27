// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreatorHomeExperience } from "./CreatorHomeExperience";
import { defineBilingualAutoText } from "@/shared/lib/i18n-bilingual-copy";
import { registerI18nLocaleEntries, resolveTranslationForDisplay, triggerTranslationBundleUpdate, useI18n } from "@/shared/lib/i18n-core";
import { PRODUCT_IDENTITY, PRODUCT_START_DESTINATIONS } from "@/shared/lib/product-identity";

vi.mock("./use-creator-home-section-navigation", () => ({ useCreatorHomeSectionNavigation: () => undefined }));
vi.mock("@/shared/lib/i18n-runtime-translation", () => ({ loadRuntimeTranslationBundle: vi.fn(async () => false) }));

const SCOPE = "domains.marketing.CreatorHomeExperience";
const initial = useI18n.getState();
const pairs = [
  [SCOPE + ".category", PRODUCT_IDENTITY.ko.category, PRODUCT_IDENTITY.en.category, "制作スタジオ"],
  [SCOPE + ".headline.0", PRODUCT_IDENTITY.ko.headline[0], PRODUCT_IDENTITY.en.headline[0], "企画から公開まで"],
  [SCOPE, "핵심 제작 기능", "Core creation capabilities", "制作の主要機能"],
] as const;
const keys = pairs.map(([scope, ko, en]) => defineBilingualAutoText(scope, ko, en));
const previousJapanese = Object.fromEntries(keys.map((key) => [key, resolveTranslationForDisplay("ja", key)]));

beforeEach(() => {
  useI18n.setState({ lang: "ko", translationBundleRevision: 0 });
  registerI18nLocaleEntries("ja", Object.fromEntries(keys.map((key, index) => [key, pairs[index]![2]])));
});
afterEach(() => {
  cleanup();
  registerI18nLocaleEntries("ja", previousJapanese);
  useI18n.setState({ lang: initial.lang, translationBundleRevision: initial.translationBundleRevision });
});
function registerJapanese() {
  registerI18nLocaleEntries("ja", Object.fromEntries(keys.map((key, index) => [key, pairs[index]![3]])));
  triggerTranslationBundleUpdate();
}
function home() {
  return <MemoryRouter><CreatorHomeExperience /></MemoryRouter>;
}
function expectJapaneseContent() {
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("企画から公開まで");
  expect(screen.getByText("制作スタジオ")).toBeTruthy();
  expect(screen.getByLabelText("制作の主要機能")).toBeTruthy();
}

describe("creator homepage active-locale recovery", () => {
  it.each(["ko", "en"] as const)("retains authored %s identity and navigation", async (lang) => {
    useI18n.setState({ lang });
    await act(async () => { render(home()); });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(PRODUCT_IDENTITY[lang].headline[0]);
    expect(screen.getByText(PRODUCT_IDENTITY[lang].category)).toBeTruthy();
    const primary = document.querySelector(".cf-hero .cf-primary");
    expect(primary?.getAttribute("href")).toBe("/studio/new");
    expect(primary?.textContent).toContain(lang === "ko" ? "새 작품 시작하기" : "Start a new work");
    const launcher = document.querySelector('#creator-start .cf-intent-visual-nav');
    expect(launcher?.querySelectorAll('a')).toHaveLength(PRODUCT_START_DESTINATIONS.length);
    for (const destination of PRODUCT_START_DESTINATIONS) {
      expect(launcher?.querySelector(`a[href="${destination.href}"]`)?.textContent).toContain(destination.label[lang]);
    }
    expect(document.querySelectorAll('#creator-toolkit-title')).toHaveLength(1);
    expect(screen.getByRole('link', { name: lang === 'ko' ? '샘플 검토 체험' : 'Try sample review' }).getAttribute('href')).toBe('/production/projects/sample-project/review');
    expect(document.querySelector('[data-creator-home]')?.getAttribute("lang")).toBe(lang);
  });

  it("renders existing Japanese translations instead of collapsing to English", async () => {
    useI18n.setState({ lang: "ja" });
    registerJapanese();
    await act(async () => { render(home()); });
    expectJapaneseContent();
    expect(document.querySelector('[data-creator-home]')?.getAttribute("lang")).toBe("ja");
  });

  it("refreshes translated identity, labels and accessibility text when a bundle arrives without a language change", async () => {
    useI18n.setState({ lang: "ja" });
    await act(async () => { render(home()); });
    expect(screen.getByText(PRODUCT_IDENTITY.en.category)).toBeTruthy();
    await act(async () => { registerJapanese(); });
    expect(useI18n.getState().lang).toBe("ja");
    expectJapaneseContent();
  });
});
