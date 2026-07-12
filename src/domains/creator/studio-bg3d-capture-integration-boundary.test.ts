import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const background3dSource = readFileSync(new URL("./StudioBackground3D.tsx", import.meta.url), "utf8");
const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

describe("Studio 3D asynchronous capture integration boundary", () => {
  it("keeps adapter registration stable when capture UI state rerenders", () => {
    const start = background3dSource.indexOf("function CaptureBridge(");
    const end = background3dSource.indexOf("function SkyClearColorController", start);
    const bridge = background3dSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(bridge).toContain("useEffectEvent(onCaptureUpdate)");
    expect(bridge).toContain("}, [camera, gl, scene]);");
    expect(bridge).not.toContain("[camera, gl, scene, onCaptureUpdate]");
  });

  it("checks adapter identity both before and after asynchronous capture", () => {
    const handleStart = background3dSource.indexOf("async function handleInsert()");
    const handleEnd = background3dSource.indexOf("// 선택된 것이 도형", handleStart);
    const handleInsert = background3dSource.slice(handleStart, handleEnd);
    const staleGuard = "captureRef.current.adapter !== captureAdapter";

    expect(handleStart).toBeGreaterThanOrEqual(0);
    expect(handleEnd).toBeGreaterThan(handleStart);
    expect(handleInsert.split(staleGuard)).toHaveLength(3);
    expect(handleInsert).toContain("await captureStudioBg3dRaster(captureAdapter");
  });

  it("returns insertion rejection so stale, locked, or failed plans keep the modal open", () => {
    const modalStart = studioPageSource.indexOf("<StudioBackground3D");
    const modalEnd = studioPageSource.indexOf("</Suspense>", modalStart);
    const modal = studioPageSource.slice(modalStart, modalEnd);

    expect(modalStart).toBeGreaterThanOrEqual(0);
    expect(modalEnd).toBeGreaterThan(modalStart);
    expect(modal).toContain(
      "if (!mutationTicket || !canApplyStudioMutation(mutationTicket)) return false;"
    );
    expect(modal).toContain("return applyBg3dRenderedImage(result, bg3dInitialElementId);");

    const handleStart = background3dSource.indexOf("async function handleInsert()");
    const handleEnd = background3dSource.indexOf("// 선택된 것이 도형", handleStart);
    const handleInsert = background3dSource.slice(handleStart, handleEnd);
    expect(handleInsert).toContain("if (accepted === false)");
    expect(handleInsert).toContain("편집 문서가 변경되었거나 현재 페이지에 삽입할 수 없습니다.");
  });
});
