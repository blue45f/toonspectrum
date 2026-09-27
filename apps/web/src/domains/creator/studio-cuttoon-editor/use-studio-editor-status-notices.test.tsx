// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useStudioEditorStatusNotices } from "./use-studio-editor-status-notices";

describe("편집기 상태 안내 소유권", () => {
  it("오프라인 성공은 일반 안내를 덮지 않고 따로 닫는다", () => {
    const { result } = renderHook(() => useStudioEditorStatusNotices("document-a", "owner-a"));
    act(() => {
      result.current.setStatusNotice("계정 설치 확인이 필요합니다.");
      result.current.offlineSceneNotice.report("기기에 보호했습니다.");
    });
    expect(result.current.statusNotice).toBe("계정 설치 확인이 필요합니다.");
    expect(result.current.offlineSceneNotice.viewProps.offlineSceneNotice).toBe("기기에 보호했습니다.");
    act(() => result.current.offlineSceneNotice.viewProps.dismissOfflineSceneNotice());
    expect(result.current.offlineSceneNotice.viewProps.offlineSceneNotice).toBeNull();
    expect(result.current.statusNotice).toBe("계정 설치 확인이 필요합니다.");
  });

  it.each([
    { documentKey: "document-b", ownerId: "owner-a" },
    { documentKey: "document-a", ownerId: "owner-b" },
    { documentKey: "document-a", ownerId: null },
  ])("다른 문서나 소유자에게 이전 안내를 전달하지 않는다: %j", (next) => {
    const { result, rerender } = renderHook(
      ({ documentKey, ownerId }: { documentKey: string; ownerId: string | null }) => useStudioEditorStatusNotices(documentKey, ownerId),
      { initialProps: { documentKey: "document-a", ownerId: "owner-a" } as { documentKey: string; ownerId: string | null } },
    );
    const oldReport = result.current.offlineSceneNotice.report;
    act(() => oldReport("이전 문서에 보호했습니다."));
    rerender(next);
    expect(result.current.offlineSceneNotice.viewProps.offlineSceneNotice).toBeNull();
    act(() => oldReport("늦게 도착한 이전 문서 안내"));
    expect(result.current.offlineSceneNotice.viewProps.offlineSceneNotice).toBeNull();
    act(() => result.current.offlineSceneNotice.report("현재 문서에 보호했습니다."));
    expect(result.current.offlineSceneNotice.viewProps.offlineSceneNotice).toBe("현재 문서에 보호했습니다.");
    act(() => oldReport("현재 안내 이후 도착한 이전 문서 안내"));
    expect(result.current.offlineSceneNotice.viewProps.offlineSceneNotice).toBe("현재 문서에 보호했습니다.");
  });
});
