// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreatorHomeExperience } from "./CreatorHomeExperience";
import { defineBilingualAutoText } from "@/shared/lib/i18n-bilingual-copy";
import { registerI18nLocaleEntries, resolveTranslationForDisplay, triggerTranslationBundleUpdate, useI18n } from "@/shared/lib/i18n-core";
import { PRODUCT_IDENTITY, PRODUCT_START_DESTINATIONS } from "@/shared/lib/product-identity";

vi.mock("@/domains/creator-resources/ProductIntentStart", () => ({ ProductIntentStart: () => null }));
vi.mock("./use-creator-home-section-navigation", () => ({ useCreatorHomeSectionNavigation: () => undefined }));
vi.mock("@/shared/lib/i18n-runtime-translation", () => ({ loadRuntimeTranslationBundle: vi.fn(async () => false) }));

const SCOPE = "domains.marketing.CreatorHomeExperience";
const initial = useI18n.getState();
const plan = PRODUCT_START_DESTINATIONS.find((entry) => entry.id === "plan")!;
const pairs = [
  [SCOPE + ".category", PRODUCT_IDENTITY.ko.category, PRODUCT_IDENTITY.en.category, "制作スタジオ"],
  [SCOPE + ".headline.0", PRODUCT_IDENTITY.ko.headline[0], PRODUCT_IDENTITY.en.headline[0], "企画から公開まで"],
  [SCOPE, "기획", "Planning", "企画"],
  [SCOPE, "기획실 열기", "Open planning", "企画室を開く"],
  [SCOPE, plan.label.ko, plan.label.en, "作品の企画を始める"],
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
  expect(screen.getByText("企画")).toBeTruthy();
  expect(screen.getByText("企画室を開く")).toBeTruthy();
  expect(screen.getByText("作品の企画を始める")).toBeTruthy();
  expect(screen.getByLabelText("制作の主要機能")).toBeTruthy();
  expect(screen.getByText("企画室を開く").closest("a")?.getAttribute("href")).toBe(plan.href);
}

describe("creator homepage active-locale recovery", () => {
  it.each(["ko", "en"] as const)("retains authored %s identity and navigation", async (lang) => {
    useI18n.setState({ lang });
    await act(async () => { render(home()); });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(PRODUCT_IDENTITY[lang].headline[0]);
    expect(screen.getByText(PRODUCT_IDENTITY[lang].category)).toBeTruthy();
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
