// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OpenCreationPage } from "./OpenCreationPage";

const request = vi.fn<typeof fetch>();
const response = () => Response.json({ data: [{ id: 101, title: "Verified armor", is_public_domain: true, copyright_notice: null, credit_line: "Collection credit" }] });
const mount = () => render(<MemoryRouter><OpenCreationPage /></MemoryRouter>);
const search = () => fireEvent.click(screen.getByRole("button", { name: "무료 자료 검색" }));
beforeEach(() => { localStorage.clear(); request.mockReset().mockImplementation(async () => response()); vi.stubGlobal("fetch", request); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
test("typing and picking themes do not call providers", () => {
  mount(); fireEvent.change(screen.getByLabelText("찾을 소재"), { target: { value: "갑옷" } });
  fireEvent.click(screen.getByRole("button", { name: /하루 한 장 관찰 드로잉/u }));
  expect(request).not.toHaveBeenCalled();
});
test("explicit search, local board and editable brief preserve provenance", async () => {
  mount(); fireEvent.change(screen.getByLabelText("찾을 소재"), { target: { value: "갑옷" } }); search();
  fireEvent.click(await screen.findByRole("button", { name: "재료 보드에 저장" }));
  fireEvent.change(screen.getByLabelText("작가 메모 (외부 전송 안 함)"), { target: { value: "Private scene note" } });
  fireEvent.click(screen.getByRole("button", { name: "무료 제작 브리프 만들기" }));
  const output = screen.getByLabelText<HTMLTextAreaElement>("제작 브리프 (직접 수정 가능)");
  expect(output.value).toContain("https://www.artic.edu/artworks/101");
  expect(output.value).toContain("Collection credit"); expect(output.value).toContain("Private scene note");
  expect(request).toHaveBeenCalledTimes(1); expect(String(request.mock.calls[0][0])).not.toContain("Private");
  search(); await waitFor(() => expect(screen.getByText(/24시간 캐시/u)).toBeTruthy());
  expect(request).toHaveBeenCalledTimes(1);
});
test("429 imposes a cooldown without automatic retries or paid fallback", async () => {
  request.mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "60" } }));
  mount(); fireEvent.change(screen.getByLabelText("찾을 소재"), { target: { value: "갑옷" } }); search();
  expect((await screen.findByRole("alert")).textContent).toContain("자동 재시도나 유료 전환");
  search(); await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("초 후"));
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "무료 제작 브리프 만들기" }));
  expect(screen.getByLabelText("제작 브리프 (직접 수정 가능)")).toBeTruthy();
});
test("changing the provider cancels the request and ignores a late response", async () => {
  let finish!: (value: Response) => void;
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  mount(); fireEvent.change(screen.getByLabelText("찾을 소재"), { target: { value: "갑옷" } }); search();
  const activeSignal = request.mock.calls[0][1]?.signal;
  fireEvent.change(screen.getByLabelText("무료 제공처"), { target: { value: "wikipedia" } });
  expect(activeSignal?.aborted).toBe(true); finish(response());
  await waitFor(() => expect(screen.getByRole("button", { name: "무료 자료 검색" })).has.property("disabled", false));
  expect(screen.queryByRole("heading", { name: "Verified armor" })).toBeNull();
});
