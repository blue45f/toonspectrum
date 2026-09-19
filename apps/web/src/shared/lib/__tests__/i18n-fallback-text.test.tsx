// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
  useI18n,
  useT,
} from "../i18n-core";

const initial = useI18n.getState();
afterEach(() => { cleanup(); useI18n.setState(initial); });

describe("authored i18n fallback compatibility", () => {
  it("uses explicit fallback only for missing keys and never returns a raw identifier", () => {
    expect(resolveTranslationForDisplay("en", "synthetic.missing-label", [], "Open settings")).toBe("Open settings");
    expect(resolveTranslationForDisplay("en", "synthetic.missing-label", [])).toBe("Missing label");
    expect(resolveTranslationForDisplay("en", "synthetic.missing-label", [], "")).toBe("");
    registerI18nLocaleEntries("en", { "synthetic.authored": "Published label" });
    expect(resolveTranslationForDisplay("en", "synthetic.authored", [], "Old label")).toBe("Published label");
  });

  it("retains translator identity while preserving literal user values during interpolation", () => {
    useI18n.setState({ lang: "en" });
    const { result, rerender } = renderHook(() => useT());
    const translate = result.current;
    expect(translate("synthetic.fallback", "Text {value}")).toBe("Text {value}");
    expect(translate("synthetic.fallback", { value: "{other}", other: "not substituted" }, "Text {value} / {unknown}")).toBe("Text {other} / {unknown}");
    rerender();
    expect(result.current).toBe(translate);
    act(() => useI18n.setState({ translationBundleRevision: useI18n.getState().translationBundleRevision + 1 }));
    expect(result.current).toBe(translate);
    registerI18nLocaleEntries("en", { "synthetic.fallback": "Loaded {value}" });
    expect(translate("synthetic.fallback", { value: "copy" }, "Default")).toBe("Loaded copy");
  });
});
