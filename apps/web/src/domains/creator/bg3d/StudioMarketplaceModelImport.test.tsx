// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioCc0ModelFile } from "../studio-cc0-asset-delivery";
import { StudioMarketplaceModelImport } from "./StudioMarketplaceModelImport";

vi.mock("../studio-cc0-asset-delivery", async (importOriginal) => ({
  ...await importOriginal<typeof import("../studio-cc0-asset-delivery")>(),
  createStudioCc0ModelFile: vi.fn(),
}));
const modelId = "polyhaven-painted-wooden-chair-01";
beforeEach(() => vi.mocked(createStudioCc0ModelFile).mockReset());
afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("exact market model import", () => {
  it("hands the verified file and CC0 rights to the existing scene importer", async () => {
    const file = new File(["test"], "chair.glb");
    vi.mocked(createStudioCc0ModelFile).mockResolvedValue(file);
    const onImport = vi.fn(async () => true);
    render(<StudioMarketplaceModelImport modelId={modelId} scopeKey="page-1" disabled={false} onImport={onImport} />);
    fireEvent.click(screen.getByRole("button", { name: "선택한 마켓 모델 가져오기" }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith([file], expect.objectContaining({ status: "public-domain", commercialUse: true, licenseName: "CC0 1.0" }), expect.any(AbortSignal)));
    expect(createStudioCc0ModelFile).toHaveBeenCalledWith(expect.objectContaining({ id: modelId }), expect.any(AbortSignal));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("장면에 배치했습니다"));
  });
  it.each(["scope", "unmount", "cancel"])("does not import a late file after %s", async (action) => {
    const pending = deferred<File>();
    vi.mocked(createStudioCc0ModelFile).mockReturnValue(pending.promise);
    const onImport = vi.fn(async () => true);
    const view = render(<StudioMarketplaceModelImport modelId={modelId} scopeKey="page-1" disabled={false} onImport={onImport} />);
    fireEvent.click(screen.getByRole("button", { name: "선택한 마켓 모델 가져오기" }));
    if (action === "scope") view.rerender(<StudioMarketplaceModelImport modelId={modelId} scopeKey="page-2" disabled={false} onImport={onImport} />);
    if (action === "unmount") view.unmount();
    if (action === "cancel") fireEvent.click(screen.getByRole("button", { name: "가져오기 취소" }));
    expect(vi.mocked(createStudioCc0ModelFile).mock.calls[0]?.[1]?.aborted).toBe(true);
    pending.resolve(new File(["test"], "chair.glb"));
    await pending.promise;
    await waitFor(() => expect(onImport).not.toHaveBeenCalled());
  });
  it("rejects a late file when the scene became locked", async () => {
    const pending = deferred<File>();
    vi.mocked(createStudioCc0ModelFile).mockReturnValue(pending.promise);
    const onImport = vi.fn(async () => true);
    const view = render(<StudioMarketplaceModelImport modelId={modelId} scopeKey="page-1" disabled={false} onImport={onImport} />);
    fireEvent.click(screen.getByRole("button", { name: "선택한 마켓 모델 가져오기" }));
    view.rerender(<StudioMarketplaceModelImport modelId={modelId} scopeKey="page-1" disabled onImport={onImport} />);
    pending.resolve(new File(["test"], "chair.glb"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("잠금"));
    expect(onImport).not.toHaveBeenCalled();
  });
});
