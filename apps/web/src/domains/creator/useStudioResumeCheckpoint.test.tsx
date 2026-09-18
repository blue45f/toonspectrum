// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readStudioResumeCheckpoint,
  writeStudioResumeCheckpoint,
  type StudioResumeCheckpointStorage,
} from "./studio-resume-checkpoint";
import { useStudioResumeCheckpoint } from "./useStudioResumeCheckpoint";

class MemoryStorage implements StudioResumeCheckpointStorage {
  private value: string | null = null;
  getItem() { return this.value; }
  setItem(_key: string, value: string) { this.value = value; }
}

const pages = [
  { id: "page-a", elements: [{ id: "element-a" }] },
  { id: "page-b", elements: [{ id: "element-b" }, { id: "element-c" }] },
] as const;

function installViewportDimensions(node: HTMLDivElement): void {
  Object.defineProperties(node, {
    clientWidth: { configurable: true, get: () => 500 },
    clientHeight: { configurable: true, get: () => 1_000 },
    scrollWidth: { configurable: true, get: () => 2_000 },
    scrollHeight: { configurable: true, get: () => 3_000 },
  });
}

function Harness({ storage }: { readonly storage: StudioResumeCheckpointStorage }) {
  const [pageId, setPageId] = useState("page-a");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [scrollRevision, setScrollRevision] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const updateScrollPosRef = useRef(() => setScrollRevision((value) => value + 1));

  useStudioResumeCheckpoint({
    activePageId: pageId,
    documentKey: "project:p1:document:d1",
    hydrated: true,
    layoutKey: `${pageId}:layout`,
    marqueeIds,
    pages,
    selectedId,
    setCurrentPageId: setPageId,
    setMarqueeIds,
    setSelectedId,
    setZoom,
    storage,
    updateScrollPosRef,
    viewport: {
      left: wrapRef.current?.scrollLeft ?? 0,
      top: wrapRef.current?.scrollTop ?? 0,
      width: 500,
      height: 1_000,
      scrollWidth: 2_000,
      scrollHeight: 3_000,
    },
    wrapRef,
    zoom,
  });

  return (
    <div>
      <div
        ref={(node) => {
          if (node) installViewportDimensions(node);
          wrapRef.current = node;
        }}
        data-testid="viewport"
      />
      <output data-testid="state">
        {JSON.stringify({ pageId, selectedId, marqueeIds, zoom, scrollRevision })}
      </output>
      <button type="button" onClick={() => {
        const node = wrapRef.current;
        if (!node) return;
        node.scrollLeft = 1_200;
        node.scrollTop = 1_500;
        setSelectedId("element-a");
        setMarqueeIds([]);
        setZoom(3);
        setScrollRevision((value) => value + 1);
      }}>change view</button>
    </div>
  );
}

describe("useStudioResumeCheckpoint", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("restores the matching page, valid selection, zoom and relative viewport", async () => {
    const storage = new MemoryStorage();
    writeStudioResumeCheckpoint({
      documentKey: "project:p1:document:d1",
      pageId: "page-b",
      selectedIds: ["element-b", "missing", "element-c"],
      viewport: { scrollX: 0.5, scrollY: 0.25, zoom: 2 },
      updatedAt: Date.now(),
    }, storage);

    render(<Harness storage={storage} />);
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(screen.getByTestId("state").textContent).toBe(JSON.stringify({
      pageId: "page-b",
      selectedId: "element-b",
      marqueeIds: ["element-b", "element-c"],
      zoom: 2,
      scrollRevision: 1,
    }));
    const viewport = screen.getByTestId("viewport");
    expect(viewport.scrollLeft).toBe(750);
    expect(viewport.scrollTop).toBe(500);
  });

  it("persists the latest settled UI state without adding document content", async () => {
    const storage = new MemoryStorage();
    render(<Harness storage={storage} />);
    await act(async () => { await vi.runAllTimersAsync(); });
    await act(async () => {
      screen.getByRole("button", { name: "change view" }).click();
      await vi.advanceTimersByTimeAsync(800);
    });

    const checkpoint = readStudioResumeCheckpoint(
      "project:p1:document:d1",
      storage,
      Date.now(),
    );
    expect(checkpoint).toMatchObject({
      documentKey: "project:p1:document:d1",
      pageId: "page-a",
      selectedIds: ["element-a"],
      viewport: { scrollX: 0.8, scrollY: 0.75, zoom: 3 },
    });
    expect(JSON.stringify(checkpoint)).not.toContain("elements");
  });
});
