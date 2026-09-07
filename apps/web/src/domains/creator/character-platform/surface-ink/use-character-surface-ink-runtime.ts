import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  addCharacterSurfaceInkStroke,
  createEmptyCharacterSurfaceInkDocument,
  markCharacterSurfaceInkTopology,
  removeCharacterSurfaceInkStroke,
} from "./character-surface-ink";
import {
  characterSurfaceAnchorFromIntersection,
  characterSurfaceAnchorPosition,
  characterSurfacePointerIntersection,
} from "./character-surface-ink-pointer";
import {
  disposeCharacterSurfaceInkGroup,
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

function safeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `ink:${crypto.randomUUID()}`;
  return `ink:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

export function useCharacterSurfaceInkRuntime({
  h,
  modelKey,
  revisionKey,
}: {
  readonly h: StudioVrmPoserHost;
  readonly modelKey: string;
  readonly revisionKey: string;
}): CharacterSurfaceInkRuntimeState {
  const [active, setActiveState] = useState(false);
  const [document, setDocument] = useState<CharacterSurfaceInkDocument>(() => createEmptyCharacterSurfaceInkDocument());
  const [style, setStyleState] = useState<CharacterSurfaceInkStyle>(DEFAULT_STYLE);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const historyRef = useRef<{ past: CharacterSurfaceInkDocument[]; future: CharacterSurfaceInkDocument[] }>({ past: [], future: [] });
  const activeStrokeRef = useRef<ActiveStroke | null>(null);
  const groupRef = useRef<Group | null>(null);
  const documentRef = useRef(document);
  const styleRef = useRef(style);

  useEffect(() => { documentRef.current = document; }, [document]);
  useEffect(() => { styleRef.current = style; }, [style]);

  useEffect(() => {
    setActiveState(false);
    historyRef.current = { past: [], future: [] };
    setHistoryRevision((value) => value + 1);
    try {
      setDocument(markCharacterSurfaceInkTopology(loadCharacterSurfaceInkDocument(modelKey), modelKey));
      setNotice(null);
    } catch (error) {
      setDocument(createEmptyCharacterSurfaceInkDocument());
      setNotice(error instanceof Error ? error.message : "3D 펜선을 읽지 못했습니다.");
    }
  }, [modelKey]);

  useEffect(() => {
    try {
      saveCharacterSurfaceInkDocument(modelKey, document);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "3D 펜선을 저장하지 못했습니다.");
    }
  }, [document, modelKey]);

  useEffect(() => {
    const capture = h.captureRef?.current;
    if (!capture?.scene) return;
    const scene = capture.scene as Scene;
    groupRef.current = rebuildCharacterSurfaceInkGroup(scene, document);
    return () => {
      if (groupRef.current) disposeCharacterSurfaceInkGroup(groupRef.current);
      groupRef.current = null;
    };
  }, [document, h.captureRef, revisionKey]);

  const commitDocument = useCallback((next: CharacterSurfaceInkDocument) => {
    historyRef.current.past.push(documentRef.current);
    if (historyRef.current.past.length > 80) historyRef.current.past.shift();
    historyRef.current.future = [];
    setDocument(next);
    setHistoryRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!active) return;
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
      const hit = characterSurfacePointerIntersection(event, canvas, scene, camera);
      return hit ? characterSurfaceAnchorFromIntersection(hit, modelKey, event.pressure) : null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
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
      const stroke: CharacterSurfaceInkStroke = Object.freeze({
        strokeId: safeId(),
        meshAssetId: current.meshId,
        topologyRevision: current.topologyRevision,
        anchors: Object.freeze(current.anchors),
        style: Object.freeze({ ...styleRef.current }),
        status: "valid",
      });
      commitDocument(addCharacterSurfaceInkStroke(documentRef.current, "default", stroke));
      setNotice(`3D 펜선 ${current.anchors.length}개 표면점을 저장했습니다.`);
    };

    const onPointerUp = (event: PointerEvent) => finish(event, false);
    const onPointerCancel = (event: PointerEvent) => finish(event, true);
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove, true);
    canvas.addEventListener("pointerup", onPointerUp, true);
    canvas.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      activeStrokeRef.current = null;
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove, true);
      canvas.removeEventListener("pointerup", onPointerUp, true);
      canvas.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [active, commitDocument, h.captureRef, modelKey]);

  const undo = useCallback(() => {
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.push(documentRef.current);
    setDocument(previous);
    setHistoryRevision((value) => value + 1);
  }, []);

  const redo = useCallback(() => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(documentRef.current);
    setDocument(next);
    setHistoryRevision((value) => value + 1);
  }, []);

  const clear = useCallback(() => {
    if (documentRef.current.layers.every((layer) => layer.strokes.length === 0)) return;
    commitDocument(createEmptyCharacterSurfaceInkDocument());
    setNotice("모든 3D 펜선을 지웠습니다.");
  }, [commitDocument]);

  const removeStroke = useCallback((strokeId: string) => {
    commitDocument(removeCharacterSurfaceInkStroke(documentRef.current, strokeId));
  }, [commitDocument]);

  const importJson = useCallback((value: string): boolean => {
    try {
      commitDocument(markCharacterSurfaceInkTopology(parseCharacterSurfaceInkDocument(value), modelKey));
      setNotice("3D 펜선 문서를 불러왔습니다.");
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "3D 펜선 문서를 불러오지 못했습니다.");
      return false;
    }
  }, [commitDocument, modelKey]);

  const setActive = useCallback((next: boolean) => {
    setActiveState(next);
    setNotice(next ? "뷰포트의 캐릭터 표면에 직접 그리세요." : null);
  }, []);

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
    canUndo: historyRef.current.past.length > 0 && historyRevision >= 0,
    canRedo: historyRef.current.future.length > 0 && historyRevision >= 0,
    undo,
    redo,
    clear,
    removeStroke,
    exportJson: () => JSON.stringify(documentRef.current, null, 2),
    importJson,
    notice,
  });
}
