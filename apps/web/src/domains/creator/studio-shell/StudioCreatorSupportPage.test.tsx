// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StudioCreatorSupportPage } from "./StudioCreatorSupportPage";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: () => undefined }));
const BrowserURL = URL;
beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("URL", class extends BrowserURL {
    static createObjectURL = vi.fn(() => "blob:local-support-export");
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear(); });

describe("support request local draft/export status", () => {
  it.each([false, true])("reports persistence truthfully when storage is blocked=%s", (blocked) => {
    if (blocked) vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(<MemoryRouter><StudioCreatorSupportPage /></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox", { name: "도움이 필요한 내용" }), { target: { value: "Review my draft" } });
    fireEvent.click(screen.getByRole("button", { name: "요청 브리프 저장·내보내기" }));
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    if (blocked) {
      expect(screen.queryByText("브라우저에 초안을 저장했습니다.")).toBeNull();
      expect(screen.getByRole("status").textContent).toContain("저장하지 못했습니다");
      expect(window.localStorage.getItem("toonstudio:creator-support-request:v1")).toBeNull();
    } else {
      expect(screen.getByText("브라우저에 초안을 저장했습니다.")).toBeTruthy();
      expect(JSON.parse(window.localStorage.getItem("toonstudio:creator-support-request:v1")!))
        .toMatchObject({ version: 1, summary: "Review my draft" });
    }
  });
});
