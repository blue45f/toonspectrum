import { describe, expect, it } from "vitest";

import snapshot from "./catalog.json";
import {
  filterMaterials, makeMaterialBoard, materialSelectionFromParams, materialShareUrl,
  materialSourceUrl, materialSpecification, MAX_CATALOG_ASSETS, parseMaterialAsset,
  parseMaterialBoard, parseMaterialCatalog, safeMaterialThumbnail, toggleMaterialSelection,
} from "./model";
import type { MaterialAsset, MaterialCatalog } from "./model";
import { MATERIAL_STUDIES } from "./studies";

const catalog = parseMaterialCatalog(snapshot) as MaterialCatalog;
const asset: MaterialAsset = {
  id: "polyhaven:wood_chair", provider: "polyhaven", sourceId: "wood_chair", title: "Wood Chair",
  kind: "model", tags: ["wood", "worn", "indoor"], authors: ["Artist"],
  sourceUrl: "https://polyhaven.com/a/wood_chair",
  thumbnailUrl: "https://cdn.polyhaven.com/asset_img/thumbs/wood_chair.png?width=256&height=256", license: "CC0-1.0",
};
const assets = [asset, { ...asset, id: "polyhaven:brick_wall", sourceId: "brick_wall", title: "Brick Wall", kind: "texture" as const, tags: ["brick", "wall"] }];
const options = { query: "", provider: "all", kind: "all" };

describe("material catalog trust boundary", () => {
  it("validates the real, bounded, both-provider snapshot", () => {
    expect(catalog).not.toBeNull(); expect(catalog.assets.length).toBeGreaterThan(80);
    expect(catalog.assets.length).toBeLessThanOrEqual(MAX_CATALOG_ASSETS);
    expect(new Set(catalog.assets.map((row) => row.provider))).toEqual(new Set(["polyhaven", "ambientcg"]));
    expect(new Set(catalog.assets.map((row) => row.kind))).toEqual(new Set(["texture", "model", "hdri"]));
  });
  it.each([
    { schema: "untrusted" }, { fetchedAt: "not-a-date" }, { fetchedAt: 123 }, { assets: [] },
    { assets: Array.from({ length: MAX_CATALOG_ASSETS + 1 }, () => asset) }, { assets: [asset, asset] }, { assets: [null] },
  ])("rejects malformed catalogs: %j", (patch) => expect(parseMaterialCatalog({ ...catalog, ...patch })).toBeNull());
  it.each([
    { provider: "unknown" }, { kind: "script" }, { license: "copyright" }, { title: "" }, { sourceId: "../../escape" }, { sourceId: "__proto__" }, { id: "wrong" },
    { sourceUrl: "https://polyhaven.com.evil.test/a/wood_chair" }, { sourceUrl: "javascript:alert(1)" }, { sourceUrl: "https://polyhaven.com/a/wood_chair?extra=1" },
  ])("rejects invalid asset identity or rights: %j", (patch) => expect(parseMaterialAsset({ ...asset, ...patch })).toBeNull());
  it("normalizes API text but never copies unknown response fields", () => {
    const parsed = parseMaterialAsset({ ...asset, title: " wood\n chair\u0000 ", tags: ["wood", "wood", null], html: "<script>" });
    expect(parsed?.title).toBe("wood chair"); expect(parsed?.tags).toEqual(["wood"]); expect(parsed).not.toHaveProperty("html");
  });
  it("keeps a safe source when the preview URL is invalid", () => expect(parseMaterialAsset({ ...asset, thumbnailUrl: "https://evil.test/image" })?.thumbnailUrl).toBe(""));
  it.each([
    "http://cdn.polyhaven.com/asset_img/thumbs/wood_chair.png", "https://cdn.polyhaven.com.evil.test/asset_img/thumbs/wood_chair.png",
    // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic URL-userinfo rejection fixture
    "https://user:secret@cdn.polyhaven.com/asset_img/thumbs/wood_chair.png", "https://cdn.polyhaven.com:444/asset_img/thumbs/wood_chair.png",
    "https://cdn.polyhaven.com/asset_img/thumbs/other.png", "https://cdn.polyhaven.com/asset_img/thumbs/wood_chair.png#fragment",
  ])("rejects thumbnail host/path/credential mismatch %s", (url) => expect(safeMaterialThumbnail("polyhaven", "wood_chair", url)).toBe(""));
  it("removes untrusted query parameters", () => expect(safeMaterialThumbnail("polyhaven", "wood_chair", `${asset.thumbnailUrl}&tracking=private`)).toBe(asset.thumbnailUrl));
  it("allows only the exact ambientCG preview path", () => {
    const url = "https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/256-WEBP/Wood001.webp";
    expect(safeMaterialThumbnail("ambientcg", "Wood001", url + "?track=1")).toBe(url);
    expect(safeMaterialThumbnail("ambientcg", "Wood001", url.replace("256-WEBP", "2048-PNG"))).toBe("");
  });
  it("does not construct a source URL for traversal IDs", () => expect(materialSourceUrl("polyhaven", "../bad")).toBe(""));
});

describe("local Korean search and scene studies", () => {
  it("matches Korean aliases with AND semantics", () => expect(filterMaterials(assets, { ...options, query: "나무 낡은" })).toEqual([asset]));
  it("normalizes full-width and case", () => expect(filterMaterials(assets, { ...options, query: "ＷＯＯＤ" })).toEqual([asset]));
  it.each(["constructor", "__proto__", "prototype"])("does not treat inherited object keys as translations: %s", (query) => expect(filterMaterials(assets, { ...options, query })).toEqual([]));
  it("filters kind and provider without requests", () => {
    expect(filterMaterials(assets, { ...options, kind: "texture" })).toEqual([assets[1]]);
    expect(filterMaterials(assets, { ...options, provider: "ambientcg" })).toEqual([]);
  });
  it("does not invent empty-result recommendations", () => expect(filterMaterials(assets, { ...options, query: "nonexistentabcdef" })).toEqual([]));
  it.each(MATERIAL_STUDIES)("has actual catalog matches and original steps for $id", (study) => {
    expect(study.steps).toHaveLength(4); expect(filterMaterials(catalog.assets, { ...options, study }).length).toBeGreaterThan(0);
  });
});

describe("private-note-free links and bounded board backups", () => {
  it("deduplicates and rejects unknown URL IDs", () => expect(materialSelectionFromParams(new URLSearchParams({ items: `${asset.id},${asset.id},evil` }), assets)).toEqual([asset.id]));
  it("caps URL selection and preserves the current selection at the limit", () => {
    const ids = catalog.assets.slice(0, 14).map((item) => item.id);
    expect(materialSelectionFromParams(new URLSearchParams({ items: ids.join(",") }), catalog.assets)).toHaveLength(12);
    const selected = ids.slice(0, 12); expect(toggleMaterialSelection(selected, ids[12])).toBe(selected); expect(toggleMaterialSelection(selected, ids[0])).toHaveLength(11);
  });
  it("shares only IDs and a guide, never a note or previous URL data", () => {
    const url = new URL(materialShareUrl("https://www.toonstudio.cloud/research/materials?note=secret", [asset.id], "alley"));
    expect([...url.searchParams.keys()]).toEqual(["items", "study"]); expect(url.href).not.toContain("secret");
  });
  it("roundtrips a board and its note", () => {
    const board = makeMaterialBoard([asset.id], "비공개 제작 메모", "alley");
    expect(parseMaterialBoard(JSON.stringify(board), assets, MATERIAL_STUDIES)).toEqual({ board, missing: 0 });
  });
  it("ignores imported URLs and excludes missing assets", () => {
    const board = makeMaterialBoard([asset.id, "unknown:asset"], "memo", "unknown");
    const result = parseMaterialBoard(JSON.stringify({ ...board, sourceUrl: "javascript:alert(1)" }), assets, MATERIAL_STUDIES);
    expect(result.board.selectedIds).toEqual([asset.id]); expect(result.board.studyId).toBe(""); expect(result.missing).toBe(1);
  });
  it.each(["not-json", "[]", "x".repeat(40001), JSON.stringify({ schema: "other" }), JSON.stringify({ ...makeMaterialBoard([], "", ""), note: "x".repeat(4001) }), JSON.stringify({ ...makeMaterialBoard([], "", ""), selectedIds: [123] })])("rejects invalid import without applying it", (text) => expect(() => parseMaterialBoard(text, assets, MATERIAL_STUDIES)).toThrow());
  it("exports source, credit and observation date while escaping markup", () => {
    const text = materialSpecification({ ...catalog, assets: [asset] }, [asset.id], "<script>alert(1)</script>\n# private", MATERIAL_STUDIES[0]);
    expect(text).toContain(asset.sourceUrl); expect(text).toContain("Artist"); expect(text).toContain(catalog.fetchedAt); expect(text).toContain("CC0 1.0");
    expect(text).not.toContain("<script>"); expect(text).toContain("&lt;script&gt;"); expect(text).toContain("이미지·영상 생성 결과가 아닙니다");
  });
});
