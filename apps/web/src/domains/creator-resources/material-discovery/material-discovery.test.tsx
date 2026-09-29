// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MaterialAsset } from "../material-atlas/model";
import { MaterialAdvantageBanner } from "./MaterialAdvantageBanner";
import { MaterialFilterChips } from "./MaterialFilterChips";
import { MaterialFirstVisitGuide } from "./MaterialFirstVisitGuide";
import { MaterialSearchAutocomplete } from "./MaterialSearchAutocomplete";
import { MaterialTrendingCarousel } from "./MaterialTrendingCarousel";
import { buildTrendingMaterials } from "./material-search-ux";
import catalogData from "../material-atlas/catalog.json";
import { parseMaterialCatalog } from "../material-atlas/model";

const catalog = parseMaterialCatalog(catalogData);
const assets = catalog ? catalog.assets : [];
const sample: MaterialAsset = assets[0] ?? {
  id: "ambientcg:x", provider: "ambientcg", sourceId: "x", title: "X", kind: "texture",
  tags: [], authors: [], sourceUrl: "https://ambientcg.com/a/x", thumbnailUrl: "", license: "CC0-1.0",
};

afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals(); });

describe("material discovery components", () => {
  it("어드밴티지 배너가 핵심 수치와 장점 3가지를 보여준다", () => {
    render(<MaterialAdvantageBanner assetCount={141} providerCount={2} />);
    expect(screen.getByRole("heading", { name: /배경·소품 고민은 여기서 끝내세요/ })).toBeTruthy();
    expect(screen.getByRole("list", { name: /핵심 수치/ })).toBeTruthy();
    expect(screen.getByText(/유료 생성 API 없이 바로 쓰는/)).toBeTruthy();
    expect(screen.getByText(/한글 검색 지원/)).toBeTruthy();
    expect(screen.getByText(/클릭 한 번으로 장면 보드에/)).toBeTruthy();
  });

  it("트렌딩 캐러셀이 순위를 매겨 보여주고 선택을 전달한다", () => {
    const onSelect = vi.fn();
    const trending = buildTrendingMaterials(assets, 4);
    render(<MaterialTrendingCarousel assets={trending} onSelect={onSelect} />);
    expect(screen.getByRole("heading", { name: /지금 뜨는 소재/ })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(trending.length);
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(trending[0]);
    fireEvent.click(screen.getByRole("button", { name: "다음 트렌딩 소재" }));
  });

  it("필터 칩이 제공처·종류를 원클릭으로 바꾼다", () => {
    const onProvider = vi.fn(); const onKind = vi.fn();
    render(<MaterialFilterChips provider="all" kind="all" counts={{ provider: { polyhaven: 10 }, kind: { texture: 20 } }} onProvider={onProvider} onKind={onKind} />);
    fireEvent.click(screen.getByRole("button", { name: /Poly Haven/ }));
    expect(onProvider).toHaveBeenCalledWith("polyhaven");
    fireEvent.click(screen.getByRole("button", { name: /3D 소품/ }));
    expect(onKind).toHaveBeenCalledWith("model");
    expect(screen.getByRole("button", { name: /모든 제공처/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("검색창이 자동완성과 인기·최근 검색어를 제안한다", () => {
    const onChange = vi.fn(); const onSubmit = vi.fn();
    render(<MaterialSearchAutocomplete value="" assets={assets} onChange={onChange} onSubmitSearch={onSubmit} />);
    const input = screen.getByLabelText("검색어") as HTMLInputElement;
    expect(input.placeholder).toContain("벚꽃 배경");
    fireEvent.focus(input);
    expect(screen.getByRole("listbox", { name: /검색어 제안/ })).toBeTruthy();
    expect(screen.getByText("인기 검색어")).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /나무/ }));
    expect(onSubmit).toHaveBeenCalledWith("나무");
  });

  it("검색어 입력 시 태그 자동완성을 보여준다", () => {
    const onChange = vi.fn(); const onSubmit = vi.fn();
    render(<MaterialSearchAutocomplete value="wo" assets={assets} onChange={onChange} onSubmitSearch={onSubmit} />);
    fireEvent.focus(screen.getByLabelText("검색어"));
    expect(screen.getByRole("listbox", { name: /검색어 제안/ })).toBeTruthy();
    expect(screen.getByText("추천 검색어")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("첫 방문 가이드가 한 번만 표시되고 닫힌다", () => {
    vi.useFakeTimers();
    const { rerender } = render(<MaterialFirstVisitGuide />);
    expect(screen.getByRole("note", { name: /첫 방문 안내/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(screen.queryByRole("note")).toBeNull();
    rerender(<MaterialFirstVisitGuide />);
    expect(screen.queryByRole("note")).toBeNull();
    vi.useRealTimers();
  });

  it("샘플 에셋이 유효하다", () => {
    expect(sample.id).toBeTruthy();
  });
});
