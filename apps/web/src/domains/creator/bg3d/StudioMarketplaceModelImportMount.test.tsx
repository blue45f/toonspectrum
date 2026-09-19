// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioMarketplaceModelImportMount } from "./StudioMarketplaceModelImportMount";

const loaded = vi.hoisted(() => vi.fn());
vi.mock("./StudioMarketplaceModelImport", () => {
  loaded();
  return { StudioMarketplaceModelImport: ({ modelId, scopeKey }: { modelId: string; scopeKey: string }) => <p>{modelId}:{scopeKey}</p> };
});
afterEach(cleanup);
describe("selected market model lazy boundary", () => {
  it("does not load the catalogue component without a selected model", () => {
    const view = render(<StudioMarketplaceModelImportMount modelId={null} scopeKey="page" disabled={false} onImport={vi.fn(async () => true)} />);
    expect(view.container.textContent).toBe("");
    expect(loaded).not.toHaveBeenCalled();
  });
  it("loads on explicit selection, forwards changes and removes a cleared selection", async () => {
    const onImport = vi.fn(async () => true);
    const view = render(<StudioMarketplaceModelImportMount modelId="model-1" scopeKey="page-1" disabled={false} onImport={onImport} />);
    await waitFor(() => expect(screen.getByText("model-1:page-1")).toBeTruthy());
    expect(loaded).toHaveBeenCalledTimes(1);
    view.rerender(<StudioMarketplaceModelImportMount modelId="model-1" scopeKey="page-2" disabled={false} onImport={onImport} />);
    expect(screen.getByText("model-1:page-2")).toBeTruthy();
    view.rerender(<StudioMarketplaceModelImportMount modelId={null} scopeKey="page-2" disabled={false} onImport={onImport} />);
    expect(view.container.textContent).toBe("");
  });
});
