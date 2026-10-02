// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseReport } from "../../bench/report/report-schema";
import { BrushLabApp } from "../shell/BrushLabApp";
import { createLabStore } from "../state/lab-store";
import { installCanvasStub } from "../testing/canvas-stub";
import { mockDescriptor, mockEnvironment, unavailableDescriptor } from "../testing/mock-lane";
import { createMockRunner } from "../testing/mock-runner";

import type { LabStore } from "../state/lab-store";
import type { CanvasStubRecorder } from "../testing/canvas-stub";

const registry = [
  mockDescriptor({ id: "cpu-reference", label: "CPU 참조" }),
  mockDescriptor({ id: "canvas2d", label: "Canvas2D", color: [200, 0, 0] }),
  unavailableDescriptor("webgpu-compute", ["webgpu-api-unavailable"], "WebGPU compute"),
  mockDescriptor({ id: "wasm-cpu", label: "wasm CPU", status: "reserved", kind: "candidate" }),
];

let stub: CanvasStubRecorder;
beforeEach(() => {
  stub = installCanvasStub();
});
afterEach(() => {
  cleanup();
  stub.restore();
  vi.restoreAllMocks();
});

function renderCompare(store: LabStore) {
  return render(
    <BrushLabApp registry={registry} env={mockEnvironment()} runner={createMockRunner()} store={store} gallery={null} galleryError="없음" />,
  );
}

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("읽기 실패"));
    reader.readAsText(blob);
  });
}

/** 다운로드 가로채기: createObjectURL로 들어온 Blob과 앵커 파일명을 기록한다. */
function captureDownloads() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    if (b instanceof Blob) blobs.push(b);
    return `blob:lab/${blobs.length}`;
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
  return { blobs, names };
}

// jsdom 전체 앱 렌더는 CPU를 공유하는 환경(동시 vitest 다수)에서 수 초가 걸릴 수 있어 타임아웃을 넉넉히 둔다.
describe("CompareView", { timeout: 30_000 }, () => {
  it("파라미터 변경은 저장소 오버라이드와 configHash를 갱신하고 초기화로 되돌린다", () => {
    const store = createLabStore({ tab: "compare", laneA: "cpu-reference", laneB: "canvas2d", canvasSize: 256 });
    renderCompare(store);
    const hashEl = screen.getByTestId("lab-config-hash");
    const baseHash = hashEl.textContent;
    expect(baseHash).toMatch(/configHash\(fnv1a64\): [0-9a-f]{16}/u);

    fireEvent.change(screen.getByLabelText(/크기\(px\)/u), { target: { value: "33" } });
    expect(store.get().overrides.sizePx).toBe(33);
    expect(hashEl.textContent).not.toBe(baseHash);
    expect(screen.getByLabelText(/크기\(px\)/u).getAttribute("aria-valuetext")).toBe("33");

    fireEvent.change(screen.getByLabelText("팁 텍스처"), { target: { value: "noise" } });
    expect(store.get().overrides.kind).toBe("noise");
    fireEvent.change(screen.getByLabelText("샘플링 필터"), { target: { value: "anisotropic" } });
    expect(store.get().overrides.filter).toBe("anisotropic");
    fireEvent.click(screen.getByLabelText("종이 그레인"));
    expect(typeof store.get().overrides.grain).toBe("boolean");
    fireEvent.click(screen.getByLabelText("습식(젖음·번짐) 베타"));
    expect(typeof store.get().overrides.wetBeta).toBe("boolean");
    fireEvent.change(screen.getByLabelText(/안정화 강도/u), { target: { value: "0.8" } });
    expect(store.get().overrides.stabilizer).toBe(0.8);
    expect(screen.getByText(/spring 팔로워 백엔드/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "오버라이드 초기화" }));
    expect(store.get().overrides).toEqual({});
    expect(hashEl.textContent).toBe(baseHash);

    // 프리셋 변경은 오버라이드를 비운다
    fireEvent.change(screen.getByLabelText(/크기\(px\)/u), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("프리셋"), { target: { value: "ink-g-pen" } });
    expect(store.get().presetId).toBe("ink-g-pen");
    expect(store.get().overrides).toEqual({});
    expect(hashEl.textContent).not.toBe(baseHash);

    // fixture·캔버스·시드
    fireEvent.change(screen.getByLabelText("fixture"), { target: { value: "spiral" } });
    expect(store.get().fixtureId).toBe("spiral");
    fireEvent.change(screen.getByLabelText("캔버스"), { target: { value: "512" } });
    expect(store.get().canvasSize).toBe(512);
    fireEvent.change(screen.getByLabelText("시드"), { target: { value: "42" } });
    expect(store.get().seed).toBe(42);
  });

  it("모의 레인으로 A/B를 실행하면 지표 표·임계값·판정·비교 표가 채워지고 캔버스에 결과가 올라간다", async () => {
    const store = createLabStore({ tab: "compare", laneA: "cpu-reference", laneB: "canvas2d", canvasSize: 256 });
    renderCompare(store);
    await screen.findByText(/probe 4\/4/u);
    expect(screen.getByText("A/B를 실행하면 지표·임계값·판정이 여기에 표시된다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "A/B 실행" }));
    await waitFor(() => expect(store.get().running).toBe(false), { timeout: 10_000 });
    expect(store.get().errors).toEqual([]);
    await screen.findByTestId("lab-metric-render.determinism");

    const row = screen.getByTestId("lab-metric-render.determinism");
    expect(row.textContent).toContain(">= 1");
    expect(row.textContent).toContain("PASS");
    expect(screen.getByTestId("lab-metric-render.edgeStaircaseEnergy").textContent).toContain("UNAVAILABLE");
    expect(screen.getByTestId("lab-verdict-a").textContent).toBe("UNAVAILABLE");
    // B는 A를 참조로 비교한 지표(IoU 1)가 추가되고, 종합 판정은 리포트의 verdict와 같다
    expect(screen.getByTestId("lab-metric-render.coverageIoU").textContent).toContain("1");
    expect(store.get().results.reportB?.referenceLaneId).toBe("cpu-reference");
    expect(screen.getByTestId("lab-verdict-b").textContent).toBe(store.get().results.reportB?.verdict);
    expect(screen.getByText(/측정 불가 지표 사유 \d+건/u)).toBeTruthy();
    expect((screen.getByLabelText(/결정성 재실행/u) as HTMLInputElement).checked).toBe(true);

    // 비교 표: 다른 색의 모의 레인이므로 픽셀 해시가 다르다
    const compare = screen.getByRole("table", { name: "A/B 비교" });
    expect(compare.textContent).toContain("다름");
    expect(compare.textContent).toContain("커버리지 IoU");
    expect(store.get().results.comparison?.iou).toBe(1);
    expect(store.get().results.comparison?.hashEqual).toBe(false);
    expect(store.get().reports).toHaveLength(2);
    expect(screen.getByTestId("lab-run-status").textContent).toBe("fixture 리플레이 결과");
    // A·B·차이맵 캔버스에 putImageData
    expect(stub.putImageDataCalls).toBeGreaterThanOrEqual(3);
    expect(stub.lastImage?.width).toBe(256);
    const hashA = store.get().results.reportA?.pixelHash;
    expect(screen.getByRole("img", { name: new RegExp(`A 레인\\(CPU 참조\\) 결과 — pixelHash ${hashA}`, "u") })).toBeTruthy();
    // 리포트 탭에도 2개가 쌓인다
    fireEvent.click(screen.getByRole("tab", { name: "리포트" }));
    expect(screen.getByText("세션 리포트 (2)")).toBeTruthy();
    expect(screen.getByTestId("lab-report-raw").textContent).toContain('"labSchemaVersion":"1.0.0"');
  });

  it("다운로드 버튼은 스키마 유효 JSON과 PNG Blob을 만든다", async () => {
    const store = createLabStore({ tab: "compare", laneA: "cpu-reference", laneB: "canvas2d", canvasSize: 256 });
    renderCompare(store);
    const dl = captureDownloads();
    const jsonA = screen.getByRole("button", { name: "JSON 다운로드 (A)" });
    expect((jsonA as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "A/B 실행" }));
    await waitFor(() => expect(store.get().running).toBe(false), { timeout: 10_000 });
    expect(store.get().errors).toEqual([]);
    await waitFor(() => expect((jsonA as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(jsonA);
    expect(dl.names[0]).toMatch(/^pencil-hb-cpu-reference-\d{8}\.json$/u);
    expect(dl.blobs[0]?.type).toBe("application/json");
    const parsed = parseReport(JSON.parse(await blobText(dl.blobs[0]!)));
    expect(parsed.laneId).toBe("cpu-reference");
    expect(parsed.presetId).toBe("pencil-hb");
    expect(parsed.pixelHash).toBe(store.get().results.reportA?.pixelHash);

    fireEvent.click(screen.getByRole("button", { name: "PNG 다운로드 (B)" }));
    expect(dl.names[1]).toMatch(/^pencil-hb-canvas2d-\d{8}\.png$/u);
    expect(dl.blobs[1]?.type).toBe("image/png");
    expect(dl.blobs[1]?.size).toBe(16 + 256 * 256 * 4);
    fireEvent.click(screen.getByRole("button", { name: "차이맵 PNG" }));
    expect(dl.names[2]).toBe("diff-cpu-reference-vs-canvas2d.png");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
  });

  it("unavailable 레인 B로 실행하면 사유 코드가 오류 목록에 남고 B는 비며 레인 선택은 바뀌지 않는다", async () => {
    const store = createLabStore({ tab: "compare", laneA: "cpu-reference", laneB: "webgpu-compute", canvasSize: 256 });
    renderCompare(store);
    await screen.findByText(/probe 4\/4/u);
    fireEvent.click(screen.getByRole("button", { name: "A/B 실행" }));
    await waitFor(() => expect(store.get().running).toBe(false), { timeout: 10_000 });
    expect(store.get().results.a).not.toBeNull();
    const errors = screen.getByRole("list", { name: "오류 목록" });
    expect(errors.textContent).toContain("webgpu-api-unavailable");
    expect(errors.textContent).toContain("자동 전환하지 않는다");
    expect(store.get().laneB).toBe("webgpu-compute");
    expect(store.get().results.b).toBeNull();
    expect(screen.getByRole("img", { name: /B 레인\(WebGPU compute\) 결과 — 결과 없음/u })).toBeTruthy();
    expect(screen.getByTestId("lab-verdict-b").textContent).toBe("—");
    expect((screen.getByRole("button", { name: "JSON 다운로드 (B)" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "차이맵 PNG" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("실시간 입력 토글은 레인 A 캔버스를 입력 영역으로 바꾸고, reserved 레인이면 오류와 함께 꺼진다", async () => {
    const store = createLabStore({ tab: "compare", laneA: "cpu-reference", laneB: "canvas2d", canvasSize: 256 });
    renderCompare(store);
    await screen.findByText(/probe 4\/4/u);
    const liveToggle = (): HTMLElement => screen.getByRole("checkbox", { name: /^실시간 입력\(/u });
    fireEvent.click(liveToggle());
    expect(store.get().liveCapture).toBe(true);
    await screen.findByText("실시간 입력");
    expect(screen.getByTestId("lab-stage-A").getAttribute("aria-label")).toContain("실시간 입력 영역");
    expect(screen.getByRole("button", { name: "실시간 캔버스 비우기" })).toBeTruthy();
    fireEvent.click(liveToggle());
    expect(store.get().liveCapture).toBe(false);

    act(() => {
      store.set({ laneA: "wasm-cpu" });
    });
    fireEvent.click(liveToggle());
    await waitFor(() => expect(store.get().liveCapture).toBe(false));
    expect(store.get().errors.at(-1)).toMatchObject({ laneId: "wasm-cpu", code: "not-implemented" });
  });
});
