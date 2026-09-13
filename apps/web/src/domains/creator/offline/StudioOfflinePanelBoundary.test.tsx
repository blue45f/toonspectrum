// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lazy, Suspense, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioOfflinePanelBoundary } from "./StudioOfflinePanelBoundary";

function ThrowingPanel(): never { throw new Error("Optional panel unavailable"); }
function DrawingDocument() {
  const [strokes, setStrokes] = useState(0);
  return <button type="button" onClick={() => { setStrokes((value) => value + 1); }}>그린 획 {strokes}</button>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("offline panel fault isolation", () => {
  it("keeps the drawing document editable when the optional panel throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<><DrawingDocument /><StudioOfflinePanelBoundary><ThrowingPanel /></StudioOfflinePanelBoundary></>);
    fireEvent.click(screen.getByRole("button", { name: "그린 획 0" }));
    expect(screen.getByRole("button", { name: "그린 획 1" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("편집기는 유지됩니다");
    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "그린 획 1" })).toBeTruthy();
  });

  it("isolates a rejected optional lazy import without reloading the editor", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const LazyPanel = lazy(async () => { throw new Error("Offline chunk missing"); });
    render(<><DrawingDocument /><StudioOfflinePanelBoundary><Suspense fallback={null}><LazyPanel /></Suspense></StudioOfflinePanelBoundary></>);
    fireEvent.click(screen.getByRole("button", { name: "그린 획 0" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("button", { name: "그린 획 1" })).toBeTruthy();
  });
});
