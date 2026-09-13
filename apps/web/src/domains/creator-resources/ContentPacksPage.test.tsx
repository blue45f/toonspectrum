// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentPacksPage } from "./ContentPacksPage";
import { CREATOR_WORKSPACE_KEY } from "@/shared/lib/creator-workspace-persistence";

const request = vi.fn<typeof fetch>();
const resource = { id: "aic:42", provider: "aic", title: "Museum armor", creator: "Maker", sourceUrl: "https://www.artic.edu/artworks/42", license: "CC0", credit: "Collection", fetchedAt: "2026-09-13T10:00:00Z", description: "" };
const response = () => Response.json({ provider: "aic", page: 1, status: "ready", items: [resource], hasMore: false, message: "Official source", fetchedAt: resource.fetchedAt });
const mount = (search = "") => render(<MemoryRouter initialEntries={[`/research/packs${search}`]}><ContentPacksPage /></MemoryRouter>);
beforeEach(() => {
  localStorage.clear(); request.mockReset().mockImplementation(async () => response()); vi.stubGlobal("fetch", request);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { locks: { request: async (_key: string, _options: unknown, operation: () => unknown) => operation() } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("free content creation page", () => {
  it("has no initial provider requests and changes themes and formats without network calls", () => {
    mount(); expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /금 간 그릇의 기억/u }));
    fireEvent.change(screen.getByLabelText("산출물 형식"), { target: { value: "world" } });
    expect(screen.getByText(/세계관 설정 워크시트/u)).toBeTruthy(); expect(request).not.toHaveBeenCalled();
  });
  it("searches on demand, saves a source and uses selected credits in the brief", async () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "갑옷 검색" }));
    fireEvent.click(await screen.findByRole("button", { name: "보드에 저장" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CREATOR_WORKSPACE_KEY)!).saved).toHaveLength(1));
    fireEvent.click(screen.getByRole("checkbox", { name: /Museum armor/u }));
    expect(screen.getByText(/원문: https:\/\/www.artic.edu\/artworks\/42/u)).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1); expect(String(request.mock.calls[0][0])).toContain("provider=aic");
  });
  it("keeps the local brief available during an outage and supports explicit retry", async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 503 })); mount("?q=armor");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "브리프 Markdown 내보내기" })).has.property("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "Museum armor" })).toBeTruthy();
  });
  it("rejects invalid queries before calling the API", async () => {
    mount("?q=x"); expect((await screen.findByRole("alert")).textContent).toContain("2~80자"); expect(request).not.toHaveBeenCalled();
  });
});
