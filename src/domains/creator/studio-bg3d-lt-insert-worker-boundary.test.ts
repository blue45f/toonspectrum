import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const editorSource = readFileSync(
  new URL("./StudioBackground3D.tsx", import.meta.url),
  "utf8",
);

function sourceBetween(startMarker: string, endMarker: string): string {
  const start = editorSource.indexOf(startMarker);
  const end = editorSource.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return editorSource.slice(start, end);
}

describe("Studio BG3D interactive LT Worker boundary", () => {
  it("snapshots capture settings and runs LT detection in the existing bounded Worker", () => {
    const insert = sourceBetween(
      "async function handleInsert()",
      "// 선택된 것이 도형(primitives)인지",
    );
    const snapshot = insert.indexOf("const ltSettingsSnapshot: StudioBg3dLtRenderSettings");
    const capture = insert.indexOf("const captured = await captureStudioBg3dRaster(");
    const worker = insert.indexOf("await renderStudioBg3dLtLayersInWorker(");
    const encode = insert.indexOf("const encoded = encodeStudioBg3dLtLayers(rendered.layers)");
    const publish = insert.indexOf("const accepted = onInsert({");

    expect(editorSource).toContain('from "./studio-bg3d-lt-render-worker-client"');
    expect(snapshot).toBeGreaterThanOrEqual(0);
    expect(capture).toBeGreaterThan(snapshot);
    expect(worker).toBeGreaterThan(capture);
    expect(encode).toBeGreaterThan(worker);
    expect(publish).toBeGreaterThan(encode);
    expect(insert).toContain("line: Object.freeze({ ...adapted.document.output.line })");
    expect(insert).toContain("tone: Object.freeze({ ...adapted.document.output.tone })");
    expect(insert).toContain("signal: insertController.signal");
    expect(insert).toContain("timeoutMs: STUDIO_BG3D_LT_INSERT_WORKER_TIMEOUT_MS");
  });

  it("falls back synchronously only for unavailable Workers under the shot-pipeline pixel cap", () => {
    const insert = sourceBetween(
      "async function handleInsert()",
      "// 선택된 것이 도형(primitives)인지",
    );
    const fallback = sourceBetween(
      "const STUDIO_BG3D_LT_INSERT_SYNC_FALLBACK_MAX_PIXELS",
      "function encodeStudioBg3dLtLayers(",
    );

    expect(fallback).toContain("1_048_576");
    expect(insert).toContain('workerFailure.code === "worker-unavailable"');
    expect(insert).toContain(
      "captured.width * captured.height <= STUDIO_BG3D_LT_INSERT_SYNC_FALLBACK_MAX_PIXELS",
    );
    expect(insert).toContain("return renderStudioBg3dLtLayers(ltRenderInput, ltSettingsSnapshot)");
    expect(insert.match(/renderStudioBg3dLtLayers\(/gu)).toHaveLength(1);
    expect(insert).toContain('insertFailure.code === "timeout"');
    expect(insert).toContain("LT 처리 작업을 안전하게 완료하지 못했습니다.");
  });

  it("fences close, unmount, scene replacement, adapter replacement, and stale completions", () => {
    const insert = sourceBetween(
      "async function handleInsert()",
      "// 선택된 것이 도형(primitives)인지",
    );
    const sessionLifecycle = sourceBetween(
      "useLayoutEffect(() => {\n    if (!open) return;\n    const session =",
      "useLayoutEffect(() => {\n    const previous = shotBatchRecoveryScopeRef.current",
    );
    const invalidation = sourceBetween(
      "function invalidateModalAssetSession(): void",
      "const handleViewportReady",
    );
    const capture = insert.indexOf("const captured = await captureStudioBg3dRaster(");
    const worker = insert.indexOf("await renderStudioBg3dLtLayersInWorker(");
    const encode = insert.indexOf("const encoded = encodeStudioBg3dLtLayers(rendered.layers)");
    const publish = insert.indexOf("const accepted = onInsert({");
    const adapterFence = "if (!isInsertCurrent() || captureAdapterIsStale()) return;";
    const afterCaptureFence = insert.indexOf(adapterFence, capture);
    const afterWorkerFence = insert.indexOf(adapterFence, worker);
    const afterEncodeFence = insert.indexOf(adapterFence, encode);

    expect(insert).toContain("const insertController = new AbortController()");
    expect(insert).toContain("const insertSceneEpoch = ltInsertSceneEpochRef.current");
    expect(insert).toContain("ltInsertAbortRef.current === insertController");
    expect(insert).toContain("ltInsertSceneEpochRef.current === insertSceneEpoch");
    expect(insert).toContain("isModalAssetSessionCurrent(session)");
    expect(insert).toContain(
      "const captureAdapterIsStale = () => captureRef.current.adapter !== captureAdapter;",
    );
    expect(insert.match(/captureAdapterIsStale\(\)/gu)).toHaveLength(3);
    expect(afterCaptureFence).toBeGreaterThan(capture);
    expect(afterCaptureFence).toBeLessThan(worker);
    expect(afterWorkerFence).toBeGreaterThan(worker);
    expect(afterWorkerFence).toBeLessThan(encode);
    expect(afterEncodeFence).toBeGreaterThan(encode);
    expect(afterEncodeFence).toBeLessThan(publish);
    expect(insert).toContain("const ownsCurrentInsert =");
    expect(insert).toContain("modalAssetSessionRef.current === session");
    expect(insert).toContain("if (ownsCurrentInsert && componentActiveRef.current)");
    expect(sessionLifecycle).toContain("ltInsertAbortRef.current?.abort()");
    expect(sessionLifecycle).toContain("[customModels, primitives, sceneBaseDocument]");
    expect(sessionLifecycle).toContain("if (open) return;");
    expect(sessionLifecycle).toContain("captureInFlightRef.current = false;");
    expect(sessionLifecycle).toContain("setCaptureBackgroundSnapshot(null)");
    expect(sessionLifecycle).toContain("setIsCapturing(false)");
    expect(sessionLifecycle).toContain("setLineArtPreview(restoreLineArtPreview)");
    expect(invalidation).toContain("ltInsertAbortRef.current?.abort()");
    expect(insert).toContain("장면 또는 출력 설정이 변경되어 LT 변환을 취소했습니다.");
  });

  it("keeps PNG data-URL encoding as an explicit main-thread compatibility boundary", () => {
    const encoder = sourceBetween(
      "Interactive insert compatibility encoder.",
      "function ltOutputFingerprint(",
    );

    expect(encoder).toContain("intentionally remains on the main thread");
    expect(encoder).toContain('document.createElement("canvas")');
    expect(encoder).toContain('canvas.toDataURL("image/png")');
    expect(encoder).not.toContain("TODO");
  });
});
