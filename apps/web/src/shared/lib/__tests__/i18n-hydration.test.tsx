// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useI18n, useT } from "../i18n";
import * as runtimeTranslations from "../i18n-runtime-translation";

const initial = useI18n.getState();
const savedLanguage = localStorage.getItem("toonspectrum-lang");
const documentLanguage = document.documentElement.lang;
const documentDirection = document.documentElement.dir;

afterEach(() => {
  cleanup();
  useI18n.setState(initial);
  if (savedLanguage === null) localStorage.removeItem("toonspectrum-lang");
  else localStorage.setItem("toonspectrum-lang", savedLanguage);
  document.documentElement.lang = documentLanguage;
  document.documentElement.dir = documentDirection;
  vi.restoreAllMocks();
});

it("restores the saved locale before loading its translations on first use", async () => {
  const load = vi.spyOn(runtimeTranslations, "loadRuntimeTranslationBundle")
    .mockResolvedValue(undefined);
  localStorage.setItem("toonspectrum-lang", JSON.stringify({
    state: { lang: "ja" }, version: 0,
  }));

  await act(async () => { await useI18n.persist.rehydrate(); });
  expect(useI18n.getState().lang).toBe("ja");
  expect(document.documentElement.lang).toBe("ja");
  expect(load).not.toHaveBeenCalled();

  renderHook(() => useT());
  expect(load).toHaveBeenCalledWith("ja");
});
