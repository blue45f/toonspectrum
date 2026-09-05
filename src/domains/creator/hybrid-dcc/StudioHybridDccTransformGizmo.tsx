import { TransformControls } from "@react-three/drei/core/TransformControls.js";
import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, type ComponentRef, type ReactNode, type RefObject } from "react";

import {
  hashStudioHybridDccObjectTransform,
  type StudioHybridDccObjectTransform,
} from "./studio-hybrid-dcc-object-transform";
import {
  beginStudioHybridDccTransformGesture,
  finishStudioHybridDccTransformGesture,
  type StudioHybridDccTransformGesture,
  type StudioHybridDccTransformGestureSource,
} from "./studio-hybrid-dcc-transform-gesture";
import { resolveStudioHybridDccGizmoSnaps, type StudioHybridDccViewportPreferences } from "./studio-hybrid-dcc-viewport-interaction";

import type { Group } from "three";

function restoreObject(group: Group | null, transform: StudioHybridDccObjectTransform): void {
  if (!group) return;
  group.position.set(...transform.position);
  group.rotation.set(...transform.rotationEulerRad, "XYZ");
  group.scale.set(...transform.scale);
  group.updateMatrixWorld(true);
}

/** Owns a disposable gesture; only successful mouse-up can cross the document commit boundary. */
export function StudioHybridDccTransformGizmo({
  children, objectRef, source, mode, space, preferences, onCommit, onDraggingChange, onNotice,
}: {
  readonly children: ReactNode;
  readonly objectRef: RefObject<Group | null>;
  readonly source: StudioHybridDccTransformGestureSource;
  readonly mode: "translate" | "rotate" | "scale";
  readonly space: "world" | "local";
  readonly preferences: StudioHybridDccViewportPreferences;
  readonly onCommit: (assetId: string, transform: StudioHybridDccObjectTransform) => void;
  readonly onDraggingChange: (dragging: boolean) => void;
  readonly onNotice: (message: string) => void;
}) {
  const control = useRef<ComponentRef<typeof TransformControls>>(null);
  const gesture = useRef<StudioHybridDccTransformGesture | null>(null);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const latest = useRef({ source, objectRef, onCommit, onDraggingChange, onNotice, invalidate });
  latest.current = { source, objectRef, onCommit, onDraggingChange, onNotice, invalidate };
  const snaps = resolveStudioHybridDccGizmoSnaps(preferences);
  const sourceKey = `${source.assetId}:${source.geometryStamp}:${hashStudioHybridDccObjectTransform(source.transform)}`;
  const cancel = useCallback((message: string) => {
    if (!gesture.current) return;
    gesture.current = null;
    if (control.current) {
      control.current.dragging = false;
      control.current.axis = null;
    }
    restoreObject(latest.current.objectRef.current, latest.current.source.transform);
    latest.current.onDraggingChange(false);
    if (message) latest.current.onNotice(message);
    latest.current.invalidate();
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !gesture.current || event.isComposing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel("변형을 취소했습니다. 원본과 되돌리기 기록은 변경되지 않았습니다.");
    };
    const interrupted = () => cancel("중단된 변형을 취소하고 원본 위치로 복원했습니다.");
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", interrupted);
    window.addEventListener("pointercancel", interrupted, true);
    gl.domElement.addEventListener("webglcontextlost", interrupted);
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", interrupted);
      window.removeEventListener("pointercancel", interrupted, true);
      gl.domElement.removeEventListener("webglcontextlost", interrupted);
      cancel("");
    };
  }, [cancel, gl]);
  useEffect(() => {
    cancel("편집 대상이나 변환 설정이 바뀌어 진행 중인 드래그를 취소했습니다.");
  }, [cancel, sourceKey, mode, space, snaps.translationSnap, snaps.rotationSnap, snaps.scaleSnap]);

  return (
    <TransformControls ref={control} mode={mode} space={mode === "scale" ? "local" : space}
      {...snaps} size={0.82}
      onMouseDown={() => {
        try {
          gesture.current = beginStudioHybridDccTransformGesture(latest.current.source);
          latest.current.onDraggingChange(true);
          latest.current.onNotice("변형 중 · Esc 취소");
        } catch (error) {
          latest.current.onNotice(error instanceof Error ? error.message : "변형을 시작하지 못했습니다.");
        }
      }}
      onMouseUp={() => {
        const started = gesture.current;
        if (!started) return;
        gesture.current = null;
        latest.current.onDraggingChange(false);
        const group = latest.current.objectRef.current;
        if (!group) return;
        const result = finishStudioHybridDccTransformGesture(started, latest.current.source, {
          revision: 1,
          position: [group.position.x, group.position.y, group.position.z],
          rotationEulerRad: [group.rotation.x, group.rotation.y, group.rotation.z],
          scale: [group.scale.x, group.scale.y, group.scale.z],
        });
        // Never leave an uncommitted presentation pose behind if an async workspace command fails.
        restoreObject(group, latest.current.source.transform);
        if (result.kind === "commit") {
          try {
            latest.current.onCommit(result.assetId, result.transform);
            latest.current.onNotice("변형을 적용 요청했습니다. 실행 결과는 편집기 상태에서 확인하세요.");
          } catch (error) {
            restoreObject(group, latest.current.source.transform);
            latest.current.onNotice(error instanceof Error ? error.message : "변형 적용에 실패했습니다.");
          }
        } else {
          restoreObject(group, latest.current.source.transform);
          latest.current.onNotice(result.kind === "reject" ? result.message : "변경 없음 · 편집 기록을 추가하지 않았습니다.");
        }
        latest.current.invalidate();
      }}
    >{children}</TransformControls>
  );
}
