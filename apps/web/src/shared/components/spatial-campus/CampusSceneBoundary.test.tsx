// @vitest-environment jsdom
import { lazy, Suspense } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_RENDER_FAILURE_EVENT } from "@/shared/lib/render-failure-event";
import { CampusSceneBoundary } from "./CampusSceneBoundary";

const fallback = <p role="alert">Scene unavailable; the task stays open</p>;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function BrokenScene(): never { throw new Error("Failed to fetch dynamically imported module: /private?token=do-not-record"); }
describe("optional scene fault isolation", () => {
  it("keeps the same input and reports only a sanitized recoverable error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = vi.fn();
    window.addEventListener(STUDIO_RENDER_FAILURE_EVENT, failure);
    const shell = (broken: boolean) => <><CampusSceneBoundary resetKey="market" fallback={fallback}>
      {broken ? <BrokenScene /> : <div>Scene ready</div>}
    </CampusSceneBoundary><textarea aria-label="unchanged task" /></>;
    const view = render(shell(false));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Keep my unsaved work" } });
    view.rerender(shell(true));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBe(input);
    expect((input as HTMLTextAreaElement).value).toBe("Keep my unsaved work");
    const detail = (failure.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail.surface).toBe("campus-scene");
    expect(detail.error.message).toBe("Optional campus scene unavailable");
    expect(detail.componentStack).toBeNull();
    window.removeEventListener(STUDIO_RENDER_FAILURE_EVENT, failure);
  });
  it("recovers on a different district without a full-document reload", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = render(<CampusSceneBoundary resetKey="market" fallback={fallback}><BrokenScene /></CampusSceneBoundary>);
    expect(screen.getByRole("alert")).toBeTruthy();
    view.rerender(<CampusSceneBoundary resetKey="library" fallback={fallback}><div>Next district</div></CampusSceneBoundary>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Next district")).toBeTruthy();
  });
  it("contains a rejected lazy scene import without unmounting its sibling task", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Rejected = lazy(() => Promise.reject(new Error("Loading chunk failed")));
    render(<><CampusSceneBoundary resetKey="fortune" fallback={fallback}>
      <Suspense fallback={<p>Loading scene</p>}><Rejected /></Suspense>
    </CampusSceneBoundary><textarea aria-label="live work" defaultValue="keep" /></>);
    const input = screen.getByRole("textbox");
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toBe(input);
    expect((input as HTMLTextAreaElement).value).toBe("keep");
  });
});
