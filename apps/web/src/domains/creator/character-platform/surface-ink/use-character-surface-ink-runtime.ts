import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  addCharacterSurfaceInkStroke,
  createEmptyCharacterSurfaceInkDocument,
  removeCharacterSurfaceInkStroke,
  validateCharacterSurfaceInkDocument,
} from "./character-surface-ink";
import {
  characterSurfaceAnchorFromIntersection,
  characterSurfaceAnchorPosition,
  characterSurfacePointerIntersection,
} from "./character-surface-ink-pointer";
import {
  disposeCharacterSurfaceInkGroup,
  reconcileCharacterSurfaceInkTopology,
  rebuildCharacterSurfaceInkGroup,
} from "./character-surface-ink-three-mesh";
import {
  loadCharacterSurfaceInkDocument,
  parseCharacterSurfaceInkDocument,
  saveCharacterSurfaceInkDocument,
} from "./character-surface-ink-storage";

import type {
  CharacterSurfaceInkAnchor,
  CharacterSurfaceInkDocument,
  CharacterSurfaceInkStroke,
  CharacterSurfaceInkStyle,
} from "./character-surface-ink";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import type { Camera, Group, Scene } from "three";

const SAMPLE_DISTANCE = 0.0025;
const DEFAULT_STYLE: CharacterSurfaceInkStyle = Object.freeze({
  color: "#171717",
  widthMode: "surface",
  baseWidth: 0.008,
  opacity: 1,
  taperStart: 0.08,
  taperEnd: 0.12,
  pressureWidth: 0.65,
  pressureOpacity: 0,
  smoothing: 0.35,
  surfaceOffset: 0.0008,
  cap: "round",
  join: "round",
  frontFacesOnly: true,
});

interface ActiveStroke {
  readonly pointerId: number;
  readonly meshId: string;
  readonly topologyRevision: string;
  readonly anchors: CharacterSurfaceInkAnchor[];
}

export interface CharacterSurfaceInkRuntimeState {
  readonly active: boolean;
  readonly setActive: (active: boolean) => void;
  readonly document: CharacterSurfaceInkDocument;
  readonly style: CharacterSurfaceInkStyle;
  readonly setStyle: (patch: Partial<CharacterSurfaceInkStyle>) => void;
  readonly strokeCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly clear: () => void;
  readonly removeStroke: (strokeId: string) => void;
  readonly exportJson: () => string;
  readonly importJson: (value: string) => boolean;
  readonly notice: string | null;
}

function safeId(): string | null {
  try {
    const random = globalThis.crypto;
    if (typeof random?.randomUUID === "function") return `ink:${random.randomUUID()}`;
    if (typeof random?.getRandomValues !== "function") return null;
    const bytes = random.getRandomValues(new Uint8Array(16));
    return `ink:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}

export function useCharacterSurfaceInkRuntime({
  h,
  modelKey,
  revisionKey,
  authoringDocument,
  authoringReady = true,
  authoringEditable = true,
  onDocumentChange,
  authoringUndo,
  authoringRedo,
  authoringCanUndo = false,
  authoringCanRedo = false,
}: {
  readonly h: StudioVrmPoserHost;
  readonly modelKey: string;
  readonly revisionKey: string;
  readonly authoringDocument?: CharacterSurfaceInkDocument;
  readonly authoringReady?: boolean;
  readonly authoringEditable?: boolean;
  readonly onDocumentChange?: (document: CharacterSurfaceInkDocument) => boolean | void;
  readonly authoringUndo?: () => void;
  readonly authoringRedo?: () => void;
  readonly authoringCanUndo?: boolean;
  readonly authoringCanRedo?: boolean;
}): CharacterSurfaceInkRuntimeState {
  const [active, setActiveState] = useState(false);
  const [localDocument, setDocument] = useState<CharacterSurfaceInkDocument>(() => createEmptyCharacterSurfaceInkDocument());
  const controlled = authoringDocument !== undefined;
  const document = authoringDocument ?? localDocument;
  const [loadedModelKey, setLoadedModelKey] = useState<string | null>(null);
  const [style, setStyleState] = useState<CharacterSurfaceInkStyle>(DEFAULT_STYLE);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const historyRef = useRef<{ past: CharacterSurfaceInkDocument[]; future: CharacterSurfaceInkDocument[] }>({ past: [], future: [] });
  const activeStrokeRef = useRef<ActiveStroke | null>(null);
  const documentRef = useRef(document);
  const styleRef = useRef(style);
  const onDocumentChangeRef = useRef(onDocumentChange);

  const ready = controlled ? authoringReady : loadedModelKey === modelKey;
  const editable = ready && (!controlled || authoringEditable);
  useEffect(() => { documentRef.current = document; }, [document]);
  useEffect(() => { styleRef.current = style; }, [style]);
  useEffect(() => { onDocumentChangeRef.current = onDocumentChange; }, [onDocumentChange]);

  useEffect(() => {
    setActiveState(false);
    activeStrokeRef.current = null;
    if (controlled) return;
    let current = true;
    setLoadedModelKey(null);
    setDocument(createEmptyCharacterSurfaceInkDocument());
    historyRef.current = { past: [], future: [] };
    setHistoryRevision((value) => value + 1);
    void loadCharacterSurfaceInkDocument(modelKey).then((loaded) => {
      if (!current) return;
      setDocument(loaded);
      setLoadedModelKey(modelKey);
      setNotice(null);
    }).catch((error: unknown) => {
      if (current) setNotice(error instanceof Error ? error.message : "3D 펜선을 읽지 못했습니다.");
    });
    return () => { current = false; };
  }, [controlled, modelKey]);

  useEffect(() => {
    if (controlled || loadedModelKey !== modelKey) return;
    let current = true;
    void saveCharacterSurfaceInkDocument(modelKey, document).catch((error: unknown) => {
      if (current) setNotice(`3D 펜선이 저장되지 않았습니다: ${error instanceof Error ? error.message : "SQLite 저장 실패"}`);
    });
    return () => { current = false; };
  }, [controlled, document, loadedModelKey, modelKey]);

  useEffect(() => {
    if (!ready || h.status !== "ready") return;
    const capture = h.captureRef?.current;
    if (!capture?.scene) return;
    const scene = capture.scene as Scene;
    const modelRoot = h.vrm?.scene;
    let group: Group | null = null;
    const clearGroup = () => {
      if (!group) return;
      disposeCharacterSurfaceInkGroup(group);
      group = null;
      h.texturePaintInvalidateRef?.current?.();
    };
    const rebuild = () => {
      clearGroup();
      if (modelRoot && scene.getObjectById(modelRoot.id) !== modelRoot) return;
      const reconciled = reconcileCharacterSurfaceInkTopology(document, modelKey, scene);
      if (reconciled !== document && !controlled) {
        documentRef.current = reconciled;
        setDocument(reconciled);
        return;
      }
      // V3 미리보기의 파생 상태는 원본 문서나 별도 저장소에 쓰지 않는다.
      if (controlled && reconciled.layers.some((layer) => layer.strokes.some((stroke) => stroke.status !== "valid"))) {
        setNotice("표면 구조가 바뀐 펜선은 원본을 보존하고 표시를 중지했습니다. 원래 모델을 복원하면 다시 표시됩니다.");
      }
      group = rebuildCharacterSurfaceInkGroup(scene, reconciled, modelRoot ?? scene);
      h.texturePaintInvalidateRef?.current?.();
    };
    // R3F can attach the primitive after the host becomes ready without replacing the capture scene.
    modelRoot?.addEventListener("added", rebuild);
    modelRoot?.addEventListener("removed", clearGroup);
    rebuild();
    return () => {
      modelRoot?.removeEventListener("added", rebuild);
      modelRoot?.removeEventListener("removed", clearGroup);
      clearGroup();
    };
  }, [controlled, document, h.captureRef, h.captureSceneGeneration, h.status, h.texturePaintInvalidateRef, h.vrm, ready, modelKey, revisionKey]);

  const commitDocument = useCallback((next: CharacterSurfaceInkDocument): boolean => {
    if (!editable) {
      setNotice(ready ? "미리보기를 적용하거나 취소한 뒤 펜선을 편집할 수 있습니다." : "저장된 3D 펜선을 읽은 뒤 편집할 수 있습니다.");
      return false;
    }
    const validated = validateCharacterSurfaceInkDocument(next);
    if (controlled) {
      if (!onDocumentChangeRef.current || onDocumentChangeRef.current(validated) === false) return false;
      documentRef.current = validated;
      return true;
    }
    historyRef.current.past.push(documentRef.current);
    if (historyRef.current.past.length > 80) historyRef.current.past.shift();
    historyRef.current.future = [];
    documentRef.current = validated;
    setDocument(validated);
    setHistoryRevision((value) => value + 1);
    return true;
  }, [controlled, editable, ready]);

  useEffect(() => {
    if (!active || !editable) return;
    const capture = h.captureRef?.current;
    const canvas = capture?.gl?.domElement as HTMLCanvasElement | undefined;
    const scene = capture?.scene as Scene | undefined;
    const camera = capture?.camera as Camera | undefined;
    if (!canvas || !scene || !camera) {
      setNotice("3D 장면이 준비된 뒤 펜선을 사용할 수 있습니다.");
      setActiveState(false);
      return;
    }

    const sample = (event: PointerEvent): CharacterSurfaceInkAnchor | null => {
      const hit = characterSurfacePointerIntersection(event, canvas, scene, camera, h.vrm?.scene ?? null);
      return hit ? characterSurfaceAnchorFromIntersection(hit, modelKey, event.pressure) : null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || activeStrokeRef.current) return;
      const anchor = sample(event);
      if (!anchor) {
        setNotice("그릴 수 있는 캐릭터 표면을 찾지 못했습니다.");
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      canvas.setPointerCapture?.(event.pointerId);
      activeStrokeRef.current = {
        pointerId: event.pointerId,
        meshId: anchor.meshAssetId,
        topologyRevision: anchor.topologyRevision,
        anchors: [anchor],
      };
      setNotice("캐릭터 표면을 따라 그리는 중입니다.");
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = activeStrokeRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const anchor = sample(event);
      if (!anchor || anchor.meshAssetId !== current.meshId) return;
      if (anchor.topologyRevision !== current.topologyRevision) {
        finish(event, true);
        setNotice("그리는 동안 표면 구조가 바뀌어 펜선을 취소했습니다. 기존 펜선은 보존했습니다.");
        return;
      }
      const previous = current.anchors.at(-1);
      if (previous) {
        const previousPosition = characterSurfaceAnchorPosition(previous, scene);
        const nextPosition = characterSurfaceAnchorPosition(anchor, scene);
        if (previousPosition && nextPosition && previousPosition.distanceTo(nextPosition) < SAMPLE_DISTANCE) return;
      }
      if (current.anchors.length < 4_096) current.anchors.push(anchor);
    };

    const finish = (event: PointerEvent, cancelled: boolean) => {
      const current = activeStrokeRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      activeStrokeRef.current = null;
      try { canvas.releasePointerCapture?.(event.pointerId); } catch { /* optional */ }
      if (cancelled || current.anchors.length < 2) {
        setNotice(cancelled ? "3D 펜선을 취소했습니다." : "선을 조금 더 길게 그려 주세요.");
        return;
      }
      const strokeId = safeId();
      if (!strokeId) {
        setNotice("3D 펜선 식별자를 만들 수 없습니다. 브라우저의 보안 기능을 확인해 주세요.");
        return;
      }
      const stroke: CharacterSurfaceInkStroke = Object.freeze({
        strokeId,
        meshAssetId: current.meshId,
        topologyRevision: current.topologyRevision,
        anchors: Object.freeze(current.anchors),
        style: Object.freeze({ ...styleRef.current }),
        status: "valid",
      });
      try {
        if (commitDocument(addCharacterSurfaceInkStroke(documentRef.current, "default", stroke))) {
          setNotice(`3D 펜선 ${current.anchors.length}개 표면점을 저장했습니다.`);
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "3D 펜선을 저장하지 못했습니다.");
      }
    };

    const onPointerUp = (event: PointerEvent) => finish(event, false);
    const onPointerCancel = (event: PointerEvent) => finish(event, true);
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove, true);
    canvas.addEventListener("pointerup", onPointerUp, true);
    canvas.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      const pointerId = activeStrokeRef.current?.pointerId;
      activeStrokeRef.current = null;
      if (pointerId !== undefined && canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove, true);
      canvas.removeEventListener("pointerup", onPointerUp, true);
      canvas.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [active, commitDocument, editable, h.captureRef, h.captureSceneGeneration, h.vrm, modelKey]);

  const undo = useCallback(() => {
    if (controlled) { authoringUndo?.(); return; }
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.push(documentRef.current);
    documentRef.current = previous;
    setDocument(previous);
    setHistoryRevision((value) => value + 1);
  }, [authoringUndo, controlled]);

  const redo = useCallback(() => {
    if (controlled) { authoringRedo?.(); return; }
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(documentRef.current);
    documentRef.current = next;
    setDocument(next);
    setHistoryRevision((value) => value + 1);
  }, [authoringRedo, controlled]);

  const clear = useCallback(() => {
    if (documentRef.current.layers.every((layer) => layer.strokes.length === 0)) return;
    if (!commitDocument(createEmptyCharacterSurfaceInkDocument())) return;
    setNotice("모든 3D 펜선을 지웠습니다.");
  }, [commitDocument]);

  const removeStroke = useCallback((strokeId: string) => {
    commitDocument(removeCharacterSurfaceInkStroke(documentRef.current, strokeId));
  }, [commitDocument]);

  const importJson = useCallback((value: string): boolean => {
    try {
      if (!commitDocument(parseCharacterSurfaceInkDocument(value))) return false;
      setNotice("3D 펜선 문서를 불러왔습니다.");
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "3D 펜선 문서를 불러오지 못했습니다.");
      return false;
    }
  }, [commitDocument]);

  const setActive = useCallback((next: boolean) => {
    if (next && !editable) {
      setNotice(ready ? "미리보기를 적용하거나 취소한 뒤 펜선을 편집할 수 있습니다." : "저장된 3D 펜선을 읽은 뒤 편집할 수 있습니다.");
      return;
    }
    setActiveState(next);
    setNotice(next ? "뷰포트의 캐릭터 표면에 직접 그리세요." : null);
  }, [editable, ready]);

  const setStyle = useCallback((patch: Partial<CharacterSurfaceInkStyle>) => {
    setStyleState((current) => Object.freeze({ ...current, ...patch }));
  }, []);

  const strokeCount = useMemo(() => document.layers.reduce((total, layer) => total + layer.strokes.length, 0), [document]);

  return Object.freeze({
    active,
    setActive,
    document,
    style,
    setStyle,
    strokeCount,
    canUndo: controlled ? authoringCanUndo : historyRef.current.past.length > 0 && historyRevision >= 0,
    canRedo: controlled ? authoringCanRedo : historyRef.current.future.length > 0 && historyRevision >= 0,
    undo,
    redo,
    clear,
    removeStroke,
    exportJson: () => JSON.stringify(documentRef.current, null, 2),
    importJson,
    notice,
  });
}
