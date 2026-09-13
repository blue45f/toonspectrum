// @vitest-environment jsdom

import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MarketResourceCard } from "../components/MarketResourceCard";
import { useMarketWishlist } from "../hooks/use-market-wishlist";

import {
  findMergedMarketResourceById,
  getAllMergedMarketResources,
  getCustomPublishedResources,
} from "./market-custom-registry";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

const REGISTRY_KEY = "toonspectrum:market:custom-published";
const WISHLIST_KEY = "toonspectrum:market:wishlist";
const record = CREATOR_MARKETPLACE_STARTER_RECORDS[0];

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("market storage recovery", () => {
  it("ignores corrupt entries without deleting the saved source or valid records", () => {
    const raw = JSON.stringify([null, 42, "old", {}, { id: "legacy" }, record]);
    localStorage.setItem(REGISTRY_KEY, raw);
    expect(getCustomPublishedResources()).toEqual([record]);
    expect(localStorage.getItem(REGISTRY_KEY)).toBe(raw);
    expect(findMergedMarketResourceById(record.id)).toEqual(record);
    expect(() => getAllMergedMarketResources()).not.toThrow();
  });

  it("rejects damaged nested fields and keeps the first valid duplicate", () => {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify([
      { ...record, publisher: null },
      { ...record, tags: [null] },
      { ...record, entries: [null] },
      record,
      { ...record, name: "duplicate" },
    ]));
    expect(getCustomPublishedResources()).toEqual([record]);
  });

  it.each(["not json", "null", "{}", "42"])("tolerates invalid registry %s", (raw) => {
    localStorage.setItem(REGISTRY_KEY, raw);
    expect(getCustomPublishedResources()).toEqual([]);
  });

  it("normalizes legacy wishlist identifiers without clearing other browser data", () => {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify([null, 7, {}, "", "  ", record.id, record.id]));
    localStorage.setItem("unrelated-drawing", "keep me");
    const { result } = renderHook(() => useMarketWishlist());
    expect(result.current.wishlistIds).toEqual([record.id]);
    expect(result.current.wishlistCount).toBe(1);
    expect(result.current.wishlistItems).toEqual([record]);
    expect(localStorage.getItem("unrelated-drawing")).toBe("keep me");
  });

  it("renders a real resource card when legacy registry data previously crashed market", () => {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify([null, { id: "legacy-resource" }]));
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(["legacy-resource", record.id]));
    render(<MemoryRouter><MarketResourceCard record={record} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: `${record.name} 상세 보기` })).toBeTruthy();
    expect(screen.getByRole("button", { name: `${record.name} 찜 해제` })
      .getAttribute("aria-pressed")).toBe("true");
  });
});
