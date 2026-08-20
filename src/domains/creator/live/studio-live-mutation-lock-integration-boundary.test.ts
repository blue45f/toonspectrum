import { describe, expect, it } from "vitest";

import { readStudioCuttoonEditorSource } from "../studio-cuttoon-editor/read-studio-cuttoon-editor-source";

// 병합 명령은 layer/studio-layer-operations 로 추출됐다 — 통합 소스로 페이지+추출 본문을 함께 스캔한다.
const pageSource = readStudioCuttoonEditorSource();

function sourceBetween(startToken: string, endToken: string): string {
  const start = pageSource.indexOf(startToken);
  const end = pageSource.indexOf(endToken, start + startToken.length);
  expect(start, `missing start token: ${startToken}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing end token: ${endToken}`).toBeGreaterThan(start);
  return pageSource.slice(start, end);
}

describe("StudioPage authoritative mutation-lock integration boundary", () => {
  it("commits async edits only after the all-or-nothing coordinator succeeds", () => {
    const acquire = sourceBetween(
      "async function beginLiveResourceEditAsync(",
      "function beginLiveResourceEdit(",
    );

    expect(acquire).toContain("replaceStudioLiveMutationLocks({");
    expect(acquire).toContain("previouslyHeld: studioLiveHeldResourcesRef.current");
    expect(acquire).toContain("nextResources: resources");
    expect(acquire).toContain("if (result.ok) releaseStudioLiveMutationLocks(room, result.held)");
    expect(acquire).toContain("studioLiveHeldResourcesRef.current = [...result.held]");
    expect(acquire).toContain("if (!result.ok)");
    expect(acquire.indexOf("studioLiveHeldResourcesRef.current = [...result.held]")).toBeLessThan(
      acquire.lastIndexOf("return true"),
    );
  });

  it("keeps non-server gestures fail-closed while allowing optimistic server lease warmup", () => {
    const begin = sourceBetween(
      "function beginLiveResourceEdit(",
      "function endLiveResourceEdit()",
    );

    expect(begin).toContain('if (room.mode !== "server")');
    expect(begin).toContain("selfHoldsStudioLiveLock(locks, resource, room.participant.sessionId)");
    expect(begin).toContain("void beginLiveResourceEditAsync(elementIds");
    expect(begin).toContain("const key = JSON.stringify(resources)");
    expect(begin).toContain("return true;");
  });

  it("routes canvas drag and text edits through the intent-aware soft-lock gate", () => {
    expect(pageSource).toContain("gateStudioCanvasMutation({");
    expect(pageSource).toContain('intent: StudioCanvasMutationIntent = "transform"');
    expect(pageSource).toContain('intent: StudioCanvasMutationIntent = "drag"');
    expect(pageSource).toContain('beginLiveResourceEditAsync([id], "text-edit")');
  });

  it("uses the async gate for durable actions and invalidates leases on end or room change", () => {
    const merge = sourceBetween(
      "async function commitLayerMergePlan(",
      "function handleLayerNavigatorAction(",
    );
    const text = sourceBetween("async function startEditText(", "function commitEditText(");
    const end = sourceBetween("function endLiveResourceEdit()", "function commitTextTransformEnd(");
    const roomChange = sourceBetween(
      "const handleStudioLiveRoomChange = useCallback(",
      "const handleStudioCrdtAuthoritativeSaveBarrierChange",
    );

    expect(merge).toContain("await beginLiveResourceEditAsync(result.plan.removeIds)");
    expect(text).toContain('await beginLiveResourceEditAsync([id], "text-edit")');
    for (const cleanup of [end, roomChange]) {
      expect(cleanup).toContain("++studioLiveMutationGenerationRef.current");
      expect(cleanup).toContain("releaseStudioLiveMutationLocks(");
    }
    expect(roomChange).toContain("studioLivePendingMutationRef.current = null");
  });
});
