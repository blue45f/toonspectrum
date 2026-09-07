// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStudio3dAssetQualityMode,
  resetStudio3dAssetQualityMode,
} from "./studio-3d-asset-quality-session";
import { Studio3dAssetQualityPanel } from "./Studio3dAssetQualityPanel";

function deferredCheckpoint() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>(accept => { resolve = accept; });
  return { promise, resolve };
}

function requestHighQuality(): void {
  fireEvent.click(screen.getByRole("button", { name: "고품질 · 현재 실행만" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "장면 사본 저장 후 고품질 사용" }));
}

describe("Studio3dAssetQualityPanel", () => {
  beforeEach(() => {
    resetStudio3dAssetQualityMode();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    resetStudio3dAssetQualityMode();
  });

  it("keeps auto until explicit acknowledgement and a successful checkpoint", async () => {
    const checkpoint = deferredCheckpoint();
    const save = vi.fn(() => checkpoint.promise);
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} onBeforeEnable={save} />);
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    fireEvent.click(screen.getByRole("button", { name: "고품질 · 현재 실행만" }));
    expect((screen.getByRole("button", { name: "장면 사본 저장 후 고품질 사용" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "장면 사본 저장 후 고품질 사용" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    await act(async () => { checkpoint.resolve(true); await checkpoint.promise; });
    expect(getStudio3dAssetQualityMode()).toBe("high");
    fireEvent.click(screen.getByRole("button", { name: "자동 · 기본" }));
    expect(getStudio3dAssetQualityMode()).toBe("auto");
  });

  it.each([false, "throw"])("does not enable high when checkpoint fails (%s)", async failure => {
    const save = vi.fn(async () => {
      if (failure === "throw") throw new Error("storage unavailable");
      return false;
    });
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} onBeforeEnable={save} />);
    requestHighQuality();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("저장"));
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    expect((screen.getByRole("button", { name: "장면 사본 저장 후 고품질 사용" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("explicitly skips a checkpoint for an empty background scene", async () => {
    const save = vi.fn(async () => true);
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene onBeforeEnable={save} />);
    fireEvent.click(screen.getByRole("button", { name: "고품질 · 현재 실행만" }));
    expect(screen.getByText(/현재 배경 장면이 비어 있어 사본 저장은 생략/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "확인 후 고품질 사용" }));
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
    expect(save).not.toHaveBeenCalled();
  });

  it("cancels a pending enable when the retained editor closes and permits a fresh attempt", async () => {
    const first = deferredCheckpoint();
    const save = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(true);
    const props = { disabled: false, emptyScene: false, onBeforeEnable: save };
    const view = render(<Studio3dAssetQualityPanel {...props} active />);
    requestHighQuality();
    view.rerender(<Studio3dAssetQualityPanel {...props} active={false} />);
    view.rerender(<Studio3dAssetQualityPanel {...props} active />);
    expect(screen.queryByRole("button", { name: "장면 사본 저장 중" })).toBeNull();
    await act(async () => { first.resolve(true); await first.promise; });
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    requestHighQuality();
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
  });

  it("cancels a pending checkpoint on WebGL context loss without retaining the saving state", async () => {
    const checkpoint = deferredCheckpoint();
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} onBeforeEnable={() => checkpoint.promise} />);
    requestHighQuality();
    fireEvent(document, new Event("webglcontextlost"));
    expect(screen.queryByRole("button", { name: "장면 사본 저장 중" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("GPU");
    await act(async () => { checkpoint.resolve(true); await checkpoint.promise; });
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    expect((screen.getByRole("button", { name: "고품질 · 현재 실행만" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("resets high on WebGPU device loss and prevents opt-in while the loss remains", async () => {
    const props = { active: true, disabled: false, emptyScene: false, onBeforeEnable: vi.fn(async () => true) };
    const view = render(<Studio3dAssetQualityPanel {...props} />);
    requestHighQuality();
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
    view.rerender(<Studio3dAssetQualityPanel {...props} deviceLostMessage="device lost" />);
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    expect((screen.getByRole("button", { name: "고품질 · 현재 실행만" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not opt in after unmount even if a save later succeeds", async () => {
    const checkpoint = deferredCheckpoint();
    const view = render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} onBeforeEnable={() => checkpoint.promise} />);
    requestHighQuality();
    view.unmount();
    await act(async () => { checkpoint.resolve(true); await checkpoint.promise; });
    expect(getStudio3dAssetQualityMode()).toBe("auto");
  });
});
