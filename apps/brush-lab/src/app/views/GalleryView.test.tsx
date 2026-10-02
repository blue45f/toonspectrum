// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SumiError } from "../../engine/core/errors";
import { PRESET_CATALOG } from "../../engine/presets/catalog";
import { BrushLabApp } from "../shell/BrushLabApp";
import { createLabStore } from "../state/lab-store";
import { installCanvasStub } from "../testing/canvas-stub";
import { mockDescriptor, mockEnvironment } from "../testing/mock-lane";
import { createMockRunner } from "../testing/mock-runner";

import type { GalleryRenderer, GalleryRenderResult } from "../../platform/worker-client";
import type { LabStore } from "../state/lab-store";
import type { CanvasStubRecorder } from "../testing/canvas-stub";

const FAILING_PRESET = "fx-glitter";

/** 모의 Worker 클라이언트: 프리셋 1개는 실패시키고 나머지는 작은 썸네일을 돌려준다. */
function mockRenderer() {
  const calls: string[] = [];
  const renderer: GalleryRenderer = {
    render: (presetId, fixtureId, size) => {
      calls.push(presetId);
      if (presetId === FAILING_PRESET) {
        return Promise.reject(new SumiError("worker-error", "모의 Worker 실패"));
      }
      const result: GalleryRenderResult = {
        presetId,
        fixtureId,
        image: { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4).fill(255) },
        pixelHash: `h-${presetId}-${size}`,
        renderMs: 1.5,
        dabCount: 10,
        family: [{ key: "seamScore", value: 0.01, op: "<=", threshold: 0.02, verdict: "PASS" }],
      };
      return Promise.resolve(result);
    },
    dispose: () => {},
  };
  return { renderer, calls };
}

let stub: CanvasStubRecorder;
beforeEach(() => {
  stub = installCanvasStub();
});
afterEach(() => {
  cleanup();
  stub.restore();
});

function renderGallery(store: LabStore, gallery: GalleryRenderer | null, galleryError: string | null = null) {
  return render(
    <BrushLabApp
      registry={[mockDescriptor({ id: "cpu-reference" })]}
      env={mockEnvironment()}
      runner={createMockRunner()}
      store={store}
      gallery={gallery}
      galleryError={galleryError}
      autoProbe={false}
    />,
  );
}

// jsdom 전체 앱 렌더는 CPU를 공유하는 환경(동시 vitest 다수)에서 수 초가 걸릴 수 있어 타임아웃을 넉넉히 둔다.
describe("GalleryView", { timeout: 30_000 }, () => {
  it("모의 Worker 클라이언트로 PRESET_CATALOG 수만큼 카드를 렌더하고 실패는 오류 카드로 남긴다(무음 대체 없음)", async () => {
    const store = createLabStore({ tab: "gallery" });
    const { renderer, calls } = mockRenderer();
    renderGallery(store, renderer);
    const n = PRESET_CATALOG.length;
    const list = screen.getByRole("list", { name: "브러시 가족 갤러리" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(n);
    await screen.findByText(new RegExp(`완료 · ${n - 1}/${n} 완료 · 실패 1 · fixture zigzag 256²`, "u"));
    expect(calls).toHaveLength(n);
    expect(new Set(calls).size).toBe(n);
    expect(store.get().gallery.status).toBe("done");

    const failed = screen.getByTestId(`lab-preset-card-${FAILING_PRESET}`);
    expect(failed.getAttribute("data-status")).toBe("error");
    expect(failed.querySelector('[role="alert"]')?.textContent).toContain("렌더 실패: 모의 Worker 실패");

    const ok = screen.getByTestId("lab-preset-card-pencil-hb");
    expect(ok.getAttribute("data-status")).toBe("done");
    expect(ok.textContent).toContain("h-pencil-hb-256");
    expect(ok.textContent).toContain("1.5 ms");
    expect(ok.textContent).toContain("seamScore");
    expect(ok.textContent).toContain("PASS");
    expect(within(list).getAllByRole("alert")).toHaveLength(1);
    // 썸네일은 putImageData로 올라간다(실패 카드 제외)
    expect(stub.putImageDataCalls).toBeGreaterThanOrEqual(n - 1);

    // 카드에서 A/B 비교로 열기
    const openButtons = screen.getAllByRole("button", { name: "A/B 비교에서 열기" });
    expect(openButtons).toHaveLength(n);
    const card6b = screen.getByTestId("lab-preset-card-pencil-6b");
    fireEvent.click(card6b.querySelector("button")!);
    expect(store.get().presetId).toBe("pencil-6b");
    expect(store.get().tab).toBe("compare");
  });

  it("'다시 렌더'는 갤러리 상태를 비우고 Worker에 전부 다시 요청한다", async () => {
    const store = createLabStore({ tab: "gallery" });
    const { renderer, calls } = mockRenderer();
    renderGallery(store, renderer);
    const n = PRESET_CATALOG.length;
    await waitFor(() => expect(store.get().gallery.status).toBe("done"));
    fireEvent.click(screen.getByRole("button", { name: "다시 렌더" }));
    await waitFor(() => expect(calls).toHaveLength(n * 2));
    await waitFor(() => expect(store.get().gallery.status).toBe("done"));
    expect(Object.keys(store.get().gallery.entries)).toHaveLength(n);
  });

  it("렌더러가 없으면 메인 스레드로 대체하지 않고 사유를 보여준다", () => {
    const store = createLabStore({ tab: "gallery" });
    renderGallery(store, null, "Worker 생성 실패(모의)");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Worker 생성 실패(모의)");
    expect(alert.textContent).toContain("메인 스레드로 대체 렌더하지 않는다");
    expect((screen.getByRole("button", { name: "다시 렌더" }) as HTMLButtonElement).disabled).toBe(true);
    expect(store.get().gallery.status).toBe("idle");
  });
});
