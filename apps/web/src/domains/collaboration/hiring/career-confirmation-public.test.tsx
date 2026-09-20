// @vitest-environment jsdom
import { createHash, webcrypto } from "node:crypto";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { careerConfirmationPublicContent } from "../../../../../../packages/contracts/src/creator-career-confirmation";

import { careerConfirmationClient as client } from "./career-confirmation-client";
import { useCareerPublicConfirmations } from "./use-career-public-confirmations";

import type { CareerConfirmationPublicSummary } from "../../../../../../packages/contracts/src/creator-career-confirmation";
import type { CreatorCareerPublic } from "../../../../../../packages/contracts/src/creator-hiring";

vi.mock("./career-confirmation-client", () => ({ careerConfirmationClient: { publicSummaries: vi.fn() } }));
const item: CreatorCareerPublic = { id: "career", title: "작품", displayName: "작가", role: "lineart", startMonth: "2026-01", endMonth: null, episodeFrom: null, episodeTo: null, scope: "선화", contribution: "기여", portfolioUrl: "https://example.com/work", proof: "self-declared" };
const items = [item];
function summary(): CareerConfirmationPublicSummary { return { careerId: item.id, publicDigest: createHash("sha256").update(careerConfirmationPublicContent(item)).digest("hex"), tier: "counterparty-confirmed", confirmedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), scope: item.scope, contribution: item.contribution, startMonth: item.startMonth, endMonth: item.endMonth }; }
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); vi.mocked(client.publicSummaries).mockResolvedValue([summary()]); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
it("loads one bounded batch, removes revoked results and clears badges while refreshing", async () => {
  const view = renderHook(() => useCareerPublicConfirmations(items));
  await waitFor(() => expect(view.result.current.career?.tier).toBe("counterparty-confirmed"));
  expect(client.publicSummaries).toHaveBeenCalledTimes(1); expect(vi.mocked(client.publicSummaries).mock.calls[0][0]).toEqual(["career"]);
  vi.mocked(client.publicSummaries).mockResolvedValue([]);
  act(() => window.dispatchEvent(new Event("career-confirmation-changed")));
  expect(view.result.current).toEqual({}); await waitFor(() => expect(client.publicSummaries).toHaveBeenCalledTimes(2)); expect(view.result.current).toEqual({});
});
it("discards mismatched career content, expired summaries, hidden tabs and failed checks", async () => {
  vi.mocked(client.publicSummaries).mockResolvedValue([{ ...summary(), publicDigest: "old-version" }]);
  const view = renderHook(() => useCareerPublicConfirmations(items));
  await waitFor(() => expect(client.publicSummaries).toHaveBeenCalled()); expect(view.result.current).toEqual({});
  vi.mocked(client.publicSummaries).mockResolvedValue([{ ...summary(), expiresAt: new Date(0).toISOString() }]);
  act(() => window.dispatchEvent(new Event("focus"))); await waitFor(() => expect(client.publicSummaries).toHaveBeenCalledTimes(2)); expect(view.result.current).toEqual({});
  vi.mocked(client.publicSummaries).mockResolvedValue([summary()]); act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(view.result.current.career).toBeDefined());
  act(() => window.dispatchEvent(new Event("blur"))); expect(view.result.current).toEqual({});
  vi.mocked(client.publicSummaries).mockRejectedValue(new Error("unavailable")); act(() => window.dispatchEvent(new Event("focus"))); await waitFor(() => expect(client.publicSummaries).toHaveBeenCalledTimes(4)); expect(view.result.current).toEqual({});
});
it("aborts stale batches when displayed career content changes", async () => {
  let resolve!: (rows: CareerConfirmationPublicSummary[]) => void;
  vi.mocked(client.publicSummaries).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  const view = renderHook(({ values }) => useCareerPublicConfirmations(values), { initialProps: { values: items } });
  view.rerender({ values: [{ ...item, contribution: "새 버전" }] });
  await act(async () => resolve([summary()]));
  expect(vi.mocked(client.publicSummaries).mock.calls[0][1]?.aborted).toBe(true); expect(view.result.current).toEqual({});
});

it("removes a displayed badge at its local expiry before the next network refresh", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-20T00:00:00Z"));
  const bytes = Uint8Array.from(createHash("sha256").update(careerConfirmationPublicContent(item)).digest()).buffer;
  vi.stubGlobal("crypto", { subtle: { digest: vi.fn().mockResolvedValue(bytes) } });
  vi.mocked(client.publicSummaries).mockResolvedValue([{ ...summary(), expiresAt: new Date(Date.now() + 5000).toISOString() }]);
  try {
    const view = renderHook(() => useCareerPublicConfirmations(items));
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.career?.tier).toBe("counterparty-confirmed");
    act(() => { vi.advanceTimersByTime(5001); });
    expect(view.result.current).toEqual({});
    expect(client.publicSummaries).toHaveBeenCalledTimes(1);
    view.unmount();
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});
