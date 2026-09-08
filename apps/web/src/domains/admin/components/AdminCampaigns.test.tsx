// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminCampaigns } from "./AdminCampaigns";
import type { Campaign } from "./admin-client";

const api = vi.hoisted(() => vi.fn<(path: string, uid: string, options?: RequestInit) => Promise<unknown>>());
vi.mock("./admin-client", async (original) => ({ ...await original<typeof import("./admin-client")>(), adminFetch: api }));
vi.mock("@/shared/lib/i18n", () => ({ useT: () => (key: string) => key }));
const campaign: Campaign = {
  id: "fund/a", creatorId: "creator-a", titleId: "title-a", planId: "plan-a", title: "First campaign",
  description: "Creator funding", targetAmountCents: 100000, raisedAmountCents: 125000, isActive: true,
  startsAt: "2026-09-08T00:00:00.000Z", endsAt: "2026-10-08T00:00:00.000Z", creatorName: "Creator A",
  creatorEmail: null, planName: "Membership", planCode: "PLUS",
};
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
beforeEach(() => { api.mockReset().mockResolvedValue({ items: [] }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openNew() {
  render(<AdminCampaigns uid="actor-a" />);
  fireEvent.click(await screen.findByRole("button", { name: "admin.campaigns.new" }));
}

describe("AdminCampaigns real form and request boundaries", () => {
  it("keeps a loading status, then reports request errors without rendering a create form", async () => {
    const pending = Promise.withResolvers<unknown>(); api.mockReturnValueOnce(pending.promise);
    render(<AdminCampaigns uid="actor-a" />);
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeTruthy();
    await act(async () => pending.reject(new Error("Campaign access denied")));
    expect(screen.getByText("Campaign access denied")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "admin.campaigns.new" })).toBeNull();
  });
  it("validates required fields locally and submits normalized dates, money and optional identity", async () => {
    await openNew();
    fireEvent.click(screen.getByRole("button", { name: "admin.plans.save" }));
    expect(await screen.findByText("Creator ID & title are required.")).toBeTruthy();
    expect(api.mock.calls.filter(([, , options]) => options?.method === "POST")).toHaveLength(0);
    change("admin.campaigns.creatorId", "  creator-b  "); change("admin.campaigns.titleLabel", "  New funding  ");
    change("admin.campaigns.planId", " plan-b "); change("admin.campaigns.workId", " work-b ");
    change("admin.plans.description", " A description "); change("admin.campaigns.targetWon", "1234");
    change("admin.campaigns.startsAt", "2026-09-09"); change("admin.campaigns.endsAt", "2026-09-30");
    fireEvent.click(screen.getByRole("checkbox", { name: "admin.plans.active" }));
    const pending = Promise.withResolvers<unknown>(); api.mockImplementationOnce(() => pending.promise);
    fireEvent.click(screen.getByRole("button", { name: "admin.plans.save" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/campaigns", "actor-a", expect.objectContaining({ method: "POST" })));
    expect((screen.getByRole("button", { name: "admin.plans.saving" }) as HTMLButtonElement).disabled).toBe(true);
    const post = api.mock.calls.find(([, , options]) => options?.method === "POST")!;
    expect(JSON.parse(String(post[2]?.body))).toEqual({ creatorId: "creator-b", titleId: "work-b", planId: "plan-b", title: "New funding", description: "A description", targetAmountCents: 123400, currency: "KRW", isActive: false, startsAt: "2026-09-09T00:00:00.000Z", endsAt: "2026-09-30T00:00:00.000Z" });
    await act(async () => pending.resolve({ ok: true }));
    expect(await screen.findByRole("button", { name: "admin.campaigns.new" })).toBeTruthy();
    expect(api.mock.calls.filter(([, , options]) => !options)).toHaveLength(2);
  });
  it("keeps failed save input for retry and closes only after successful persistence", async () => {
    await openNew(); change("admin.campaigns.creatorId", "creator-b"); change("admin.campaigns.titleLabel", "Retry draft");
    api.mockRejectedValueOnce(new Error("Save rejected"));
    fireEvent.click(screen.getByRole("button", { name: "admin.plans.save" }));
    expect(await screen.findByText("Save rejected")).toBeTruthy();
    expect((screen.getByLabelText("admin.campaigns.titleLabel") as HTMLInputElement).value).toBe(String("Retry draft"));
    fireEvent.click(screen.getByRole("button", { name: "admin.plans.save" }));
    expect(await screen.findByRole("button", { name: "admin.campaigns.new" })).toBeTruthy();
    const posts = api.mock.calls.filter(([, , options]) => options?.method === "POST");
    expect(posts).toHaveLength(2); expect(posts[0][2]?.body).toBe(posts[1][2]?.body);
    expect(JSON.parse(String(posts[1][2]?.body))).toEqual({ creatorId: "creator-b", title: "Retry draft", targetAmountCents: 0, currency: "KRW", isActive: true });
  });
  it("edits the existing campaign identity and preserves optional display fields without overfilling progress", async () => {
    api.mockResolvedValue({ items: [campaign, { ...campaign, id: "empty", title: "No target", targetAmountCents: 0, raisedAmountCents: 0, creatorName: null, planCode: null, titleId: null, description: "", startsAt: null, endsAt: null, isActive: false }] });
    render(<AdminCampaigns uid="actor-a" />);
    const first = (await screen.findByRole("heading", { name: "First campaign" })).closest("article")!;
    expect(within(first).getByText("Creator A · PLUS · title-a")).toBeTruthy();
    expect(within(first).getByText(/\(100%\)/)).toBeTruthy();
    expect(screen.getByText(/\(0%\)/)).toBeTruthy();
    fireEvent.click(within(first).getByRole("button", { name: "admin.plans.tableHeaderAction" }));
    expect((screen.getByLabelText("admin.campaigns.startsAt") as HTMLInputElement).value).toBe(String("2026-09-08"));
    expect((screen.getByLabelText("admin.campaigns.targetWon") as HTMLInputElement).value).toBe(String(1000));
    change("admin.campaigns.titleLabel", "Edited title");
    fireEvent.click(screen.getByRole("button", { name: "admin.plans.save" }));
    await waitFor(() => expect(api.mock.calls.some(([, , options]) => options?.method === "POST")).toBe(true));
    expect(JSON.parse(String(api.mock.calls.find(([, , options]) => options?.method === "POST")![2]?.body))).toMatchObject({ id: "fund/a", creatorId: "creator-a", title: "Edited title", planId: "plan-a", titleId: "title-a" });
    await screen.findByRole("button", { name: "admin.campaigns.new" });
    fireEvent.click(within(screen.getByRole("heading", { name: "No target" }).closest("article")!).getByRole("button", { name: "admin.plans.tableHeaderAction" }));
    expect((screen.getByLabelText("admin.campaigns.startsAt") as HTMLInputElement).value).toBe(String(""));
    expect((screen.getByLabelText("admin.campaigns.workId") as HTMLInputElement).value).toBe(String(""));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "admin.campaigns.new" }));
    expect((screen.getByLabelText("admin.campaigns.titleLabel") as HTMLInputElement).value).toBe(String(""));
    fireEvent.click(screen.getByRole("button", { name: "admin.plans.cancel" }));
    expect(screen.queryByLabelText("admin.campaigns.titleLabel")).toBeNull();
  });
  it("requires delete confirmation and retains a clear error if deletion fails", async () => {
    api.mockResolvedValue({ items: [campaign] }); const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
    render(<AdminCampaigns uid="actor-a" />); const remove = await screen.findByRole("button", { name: "Delete" });
    fireEvent.click(remove); expect(confirm).toHaveBeenCalledWith('"First campaign"');
    expect(api.mock.calls).toHaveLength(1);
    confirm.mockReturnValue(true); api.mockRejectedValueOnce(new Error("Delete denied")); fireEvent.click(remove);
    expect(await screen.findByText("Delete denied")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/campaigns/fund%2Fa", "actor-a", { method: "DELETE" });
  });
  it("reloads after successful deletion and queries a newly authorized actor when uid changes", async () => {
    api.mockResolvedValueOnce({ items: [campaign] }); vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const view = render(<AdminCampaigns uid="actor-a" />); fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("admin.campaigns.empty")).toBeTruthy();
    view.rerender(<AdminCampaigns uid="actor-b" />);
    await waitFor(() => expect(api).toHaveBeenCalledWith("/campaigns", "actor-b"));
    expect(await screen.findByText("admin.campaigns.empty")).toBeTruthy();
  });
});
