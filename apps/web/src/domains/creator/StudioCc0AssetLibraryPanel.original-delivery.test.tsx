// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioCc0AssetLibraryPanel } from "./StudioCc0AssetLibraryPanel";
import { parseStudioCc0Catalog, studioCc0AssetUrl } from "./studio-cc0-asset-delivery";

const loadCatalog = vi.hoisted(() => vi.fn());
vi.mock("./studio-cc0-asset-delivery", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-cc0-asset-delivery")>(),
  loadStudioCc0Catalog: loadCatalog,
}));

const catalog = parseStudioCc0Catalog(JSON.parse(readFileSync(resolve(
  process.cwd(), "apps/web/public/assets/studio/cc0-20260906/manifest.json",
), "utf8"))).filter(({ id }) => [
  "polyhaven-cassette-player",
  "polyhaven-brass-goblets",
  "polyhaven-korean-fire-extinguisher-01",
  "polyhaven-plastic-monobloc-chair-01",
].includes(id));
let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  loadCatalog.mockResolvedValue(catalog);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(createElement(StudioCc0AssetLibraryPanel)); });
  const details = host.querySelector("details")!;
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  loadCatalog.mockReset();
  vi.unstubAllGlobals();
});

describe("CC0 original and optimized download controls", () => {
  it("offers distinct immutable downloads only on the three original-enabled cards", () => {
    expect(host.querySelectorAll("[data-cc0-asset-id]")).toHaveLength(4);
    for (const asset of catalog) {
      const card = host.querySelector(`[data-cc0-asset-id="${asset.id}"]`)!;
      const downloads = [...card.querySelectorAll<HTMLAnchorElement>("a[download]")];
      if (!asset.original) {
        expect(downloads).toHaveLength(1);
        expect(downloads[0]!.textContent).toBe("GLB 받기");
        continue;
      }
      expect(downloads).toHaveLength(2);
      expect(downloads[0]!.textContent).toBe("경량본 받기");
      expect(downloads[0]!.getAttribute("href")).toBe(studioCc0AssetUrl(asset.path));
      expect(downloads[0]!.download).toBe(`${asset.id}.glb`);
      expect(downloads[1]!.textContent).toBe("고품질 원본 받기");
      expect(downloads[1]!.getAttribute("href")).toBe(studioCc0AssetUrl(asset.original.path));
      expect(downloads[1]!.download).toBe(`${asset.id}-original.glb`);
      expect(card.textContent).toContain("144MiB");
      expect(card.textContent).toContain("고품질 모드를 선택한 뒤");
      expect(card.textContent).toContain("다운로드만으로 모드가 바뀌지는 않습니다");
    }
  });

  it("does not claim a quality improvement from lossless cassette deduplication", () => {
    const card = host.querySelector('[data-cc0-asset-id="polyhaven-cassette-player"]')!;
    expect(card.textContent).toContain("두 파일의 화질은 같습니다");
    expect(card.textContent).toContain("중복 텍스처 때문에 메모리를 더 사용합니다");
    const goblets = host.querySelector('[data-cc0-asset-id="polyhaven-brass-goblets"]')!;
    expect(goblets.textContent).toContain("색상·노멀·형상을 유지하고 ORM 텍스처만 줄였습니다");
    expect(goblets.textContent).toContain("다운로드 크기는 더 클 수 있습니다");
  });

  it("uses the same two download links inside the enlarged preview", async () => {
    const asset = catalog.find(({ id }) => id === "polyhaven-brass-goblets")!;
    const previewButton = host.querySelector<HTMLButtonElement>(`[data-cc0-asset-id="${asset.id}"] button`)!;
    await act(async () => { previewButton.click(); });
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    const downloads = [...dialog.querySelectorAll<HTMLAnchorElement>("a[download]")];
    expect(downloads.map((anchor) => anchor.getAttribute("href"))).toEqual([
      studioCc0AssetUrl(asset.path),
      studioCc0AssetUrl(asset.original!.path),
    ]);
    expect(dialog.textContent).toContain("다운로드만으로 모드가 바뀌지는 않습니다");
  });
});
