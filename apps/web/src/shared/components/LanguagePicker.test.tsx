// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguagePicker } from "./LanguagePicker";

import { NORMALIZED_LOCALE_OPTIONS, useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LanguagePicker", () => {
  it("keeps the worldwide catalog out of the closed accessibility tree", () => {
    render(<LanguagePicker value="ko" onChange={() => undefined} />);

    expect(screen.getByRole("button", { name: "언어 선택" }).textContent).toContain("한국어");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(document.querySelectorAll("option")).toHaveLength(0);
  });

  it("shows translated choices first and searches every locale on demand", () => {
    const onChange = vi.fn();
    render(<LanguagePicker value="ko" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "언어 선택" }));
    const initial = screen.getAllByRole("option");
    expect(initial.length).toBeGreaterThan(1);
    expect(initial.length).toBeLessThan(NORMALIZED_LOCALE_OPTIONS.length);

    fireEvent.change(screen.getByRole("searchbox", { name: "언어 검색" }), {
      target: { value: "zh-hant" },
    });
    const traditionalChinese = screen.getByRole("option", { name: /zh-hant/i });
    fireEvent.click(traditionalChinese);

    expect(onChange).toHaveBeenCalledWith("zh-hant");
    expect(screen.queryByRole("dialog", { name: "언어 선택" })).toBeNull();
  });

  it("caps broad results and restores the trigger after Escape", () => {
    render(<LanguagePicker value="ko" onChange={() => undefined} />);
    const trigger = screen.getByRole("button", { name: "언어 선택" });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("searchbox", { name: "언어 검색" }), {
      target: { value: "a" },
    });

    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(60);
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "언어 검색" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "언어 선택" })).toBeNull();
  });
});
