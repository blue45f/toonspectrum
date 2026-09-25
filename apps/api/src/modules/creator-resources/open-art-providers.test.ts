import { describe, expect, it, vi } from "vitest";
import { openArtUrl } from "./open-art-providers";
import { createResourceEngine } from "./resource-engine";
import { parseResource, parseSearchResult, parseWorkspace } from "@toonspectrum/core/creator-resources";
import { parseProviderAvailability, providerAvailability } from "../../../../web/src/shared/lib/creator-resource-workflow";
import { localizeReferenceProviderQuery } from "../../../../../packages/core/src/reference-query-language";

const stamp = "2026-09-13T10:00:00.000Z";
const artwork = { id: 42, title: "Armor", is_public_domain: true, copyright_notice: null, image_id: "abcde-123456", credit_line: "Collection", artist_display: "Maker" };
const cleveland = { id: 42, title: "Vase", url: "https://www.clevelandart.org/art/1", share_license_status: "CC0", copyright: null, images: { web: { url: "https://openaccess-cdn.clevelandart.org/1/1_web.jpg" } }, creators: [{ description: "Maker" }] };
const body = (data: unknown[], provider = "aic", total = data.length) => provider === "aic" ? { pagination: { total }, data } : { info: { total }, data };
const engine = (fetcher: typeof fetch) => createResourceEngine({ fetch: fetcher, env: () => ({}), now: () => Date.parse(stamp) });

describe("keyless museum adapters", () => {
  it("uses fixed hosts, bounded pages, fields, and explicit rights filters", () => {
    const aic = openArtUrl("aic", "armor & q=other", 2);
    expect(aic.hostname).toBe("api.artic.edu"); expect(aic.searchParams.get("q")).toBe("armor & q=other");
    expect(aic.searchParams.get("limit")).toBe("12"); expect(aic.searchParams.get("query[term][is_public_domain]")).toBe("true");
    expect(aic.searchParams.get("fields")).not.toContain("description");
    const cma = openArtUrl("cleveland", "vase", 2);
    expect(cma.searchParams.get("skip")).toBe("12"); expect(cma.searchParams.has("cc0")).toBe(true);
  });
  it.each(["aic", "cleveland"])("normalizes %s into the shared board with canonical credit", async (provider) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body([provider === "aic" ? artwork : cleveland], provider)));
    const result = await engine(fetcher).search({ provider, q: "armor" });
    expect(result.status).toBe("ready"); expect(result.items).toHaveLength(1); expect(result.items[0].license).toBe("CC0");
    expect(parseSearchResult(result)).not.toBeNull(); expect(result.items[0].fetchedAt).toBe(stamp);
    expect(parseWorkspace(JSON.stringify({ version: 1, saved: result.items, story: {}, checks: [] })).saved).toHaveLength(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", credentials: "omit" });
  });
  it("excludes unknown rights, contradictory copyrights, unsafe images and duplicate IDs", async () => {
    const rows = [artwork, artwork, { ...artwork, id: 2, is_public_domain: false }, { ...artwork, id: 3, copyright_notice: "Reserved" }, { ...artwork, id: 4, image_id: "../../evil" }];
    const result = await engine(vi.fn<typeof fetch>().mockResolvedValue(Response.json(body(rows)))).search({ provider: "aic", q: "armor" });
    expect(result.status).toBe("partial"); expect(result.items).toHaveLength(1);
    const cmaRows = [cleveland, { ...cleveland, id: 2, share_license_status: "Copyrighted" }, { ...cleveland, id: 3, images: { web: { url: "https://evil.test/x" } } }];
    const cma = await engine(vi.fn<typeof fetch>().mockResolvedValue(Response.json(body(cmaRows, "cleveland")))).search({ provider: "cleveland", q: "vase" });
    expect(cma.items).toHaveLength(1); expect(cma.status).toBe("partial");
  });
  it("never trusts image hosts or a forged CC0 flag from another provider", () => {
    const resource = { provider: "aic", id: "aic:42", title: "Art", sourceUrl: "https://www.artic.edu/artworks/42", license: "CC0", fetchedAt: stamp, imageUrl: "https://evil.test/x" };
    expect(parseResource(resource)?.imageUrl).toBeUndefined();
    expect(parseResource({ ...resource, sourceUrl: "https://www.artic.edu.evil.test/42" })).toBeNull();
  });
  it("caches duplicate calls and does not cache malformed response shapes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: [], pagination: { total: -1 } })).mockImplementation(async () => Response.json(body([artwork])));
    const api = engine(fetcher);
    expect((await api.search({ provider: "aic", q: "armor" })).status).toBe("unavailable");
    expect((await api.search({ provider: "aic", q: "armor" })).status).toBe("ready");
    await api.search({ provider: "aic", q: "armor" }); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retains the last-page ceiling and only translates museum vocabularies", async () => {
    const api = engine(vi.fn<typeof fetch>().mockImplementation(async () => Response.json(body([artwork], "aic", 1000))));
    expect((await api.search({ provider: "aic", q: "armor", page: 20 })).hasMore).toBe(false);
    expect(localizeReferenceProviderQuery({ provider: "aic", q: "갑옷" }).q).toBe("armor");
    expect(localizeReferenceProviderQuery({ provider: "cleveland", q: "도자기" }).q).toBe("ceramics");
    expect(localizeReferenceProviderQuery({ provider: "kakao", q: "갑옷" }).q).toBe("갑옷");
  });
  it("accepts complete old and new status contracts during staggered rollout", () => {
    const all = providerAvailability({ kakao: false, bizinfo: false, googlebooks: false, googlefonts: false });
    expect(all).toHaveLength(26); expect(parseProviderAvailability(all)).toHaveLength(26);
    expect(parseProviderAvailability(all.slice(0, 5))).toHaveLength(5);
    expect(parseProviderAvailability(all.slice(0, 7))).toHaveLength(7);
    expect(parseProviderAvailability(all.slice(0, 9))).toHaveLength(9);
    expect(parseProviderAvailability(all.slice(0, 13))).toHaveLength(13);
    expect(parseProviderAvailability(all.slice(0, 14))).toHaveLength(14);
    expect(parseProviderAvailability(all.slice(0, 18))).toHaveLength(18);
    expect(parseProviderAvailability(all.slice(0, 12))).toBeNull();
  });
  it("enforces a shared per-host request ceiling across client identifiers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(body([])));
    const api = engine(fetcher);
    for (let index = 0; index < 30; index++) expect((await api.search({ provider: "aic", q: `term-${index}` }, `client-${index}`)).status).toBe("ready");
    expect((await api.search({ provider: "aic", q: "over-limit" }, "another-client")).status).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(30);
  });
});
