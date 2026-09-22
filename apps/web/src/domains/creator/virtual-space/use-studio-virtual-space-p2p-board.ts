import { useCallback, useEffect, useRef, useState } from "react";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import {
  STUDIO_P2P_BOARD_COLORS,
  STUDIO_P2P_BOARD_MAX_OWN_ENTITIES,
  StudioP2pBoardController,
  type StudioP2pBoardColor,
  type StudioP2pBoardEntity,
  type StudioP2pBoardPoint,
  type StudioP2pBoardScope,
  type StudioP2pBoardSnapshot,
} from "./studio-virtual-space-p2p-board";

const EMPTY: StudioP2pBoardSnapshot = { entities: [], readyPeerIds: [], available: false, canEdit: false };
interface LocalStroke {
  readonly kind: "stroke";
  readonly color: StudioP2pBoardColor;
  readonly width: number;
  readonly points: readonly StudioP2pBoardPoint[];
}
interface LocalNote {
  readonly kind: "note";
  readonly color: StudioP2pBoardColor;
  readonly x: number;
  readonly y: number;
  readonly text: string;
}
type LocalEntity = LocalStroke | LocalNote;
const colorSet = new Set<string>(STUDIO_P2P_BOARD_COLORS);

function storageKey(scope: StudioP2pBoardScope, storageOwnerId: string): string {
  return [
    "toonspectrum:p2p-board:v2",
    scope.worldId,
    scope.boardId,
    scope.contentRevision,
    storageOwnerId,
  ].map(encodeURIComponent).join(":");
}

function validUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validPoint(value: unknown): value is StudioP2pBoardPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return Object.keys(point).length === 2 && validUnit(point.x) && validUnit(point.y);
}

function readLocal(
  scope: StudioP2pBoardScope,
  storageOwnerId: string | null | undefined,
): readonly LocalEntity[] {
  if (typeof localStorage === "undefined" || !storageOwnerId) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(localStorage.getItem(storageKey(scope, storageOwnerId)) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const entities: LocalEntity[] = [];
  for (const value of parsed.slice(0, STUDIO_P2P_BOARD_MAX_OWN_ENTITIES)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    if (typeof item.color !== "string" || !colorSet.has(item.color)) continue;
    const color = item.color as StudioP2pBoardColor;
    if (item.kind === "note") {
      if (!validUnit(item.x) || !validUnit(item.y)
        || typeof item.text !== "string" || !item.text.trim()
        || item.text.length > 160) continue;
      entities.push({
        kind: "note",
        color,
        x: item.x,
        y: item.y,
        text: item.text.trim(),
      });
      continue;
    }
    if (item.kind !== "stroke" || typeof item.width !== "number"
      || !Number.isFinite(item.width) || item.width < 1 || item.width > 20
      || !Array.isArray(item.points) || item.points.length < 2
      || item.points.length > 48 || !item.points.every(validPoint)) continue;
    entities.push({
      kind: "stroke",
      color,
      width: item.width,
      points: item.points,
    });
  }
  return entities;
}
function writeLocal(
  scope: StudioP2pBoardScope,
  entities: readonly StudioP2pBoardEntity[],
  ownerSessionId: string,
  storageOwnerId: string | null | undefined,
): void {
  if (typeof localStorage === "undefined" || !storageOwnerId) return;
  const values: LocalEntity[] = entities
    .filter((entity) => entity.ownerSessionId === ownerSessionId)
    .slice(-STUDIO_P2P_BOARD_MAX_OWN_ENTITIES)
    .map((entity) => entity.kind === "stroke"
      ? {
          kind: "stroke",
          color: entity.color,
          width: entity.width,
          points: entity.points,
        }
      : {
          kind: "note",
          color: entity.color,
          x: entity.x,
          y: entity.y,
          text: entity.text,
        });
  try {
    localStorage.setItem(storageKey(scope, storageOwnerId), JSON.stringify(values));
  } catch {
    // Direct collaboration remains available when local persistence is denied.
  }
}
export function useStudioVirtualSpaceP2pBoard({
  participant,
  port,
  scope,
  storageOwnerId,
  enabled,
}: {
  readonly participant: StudioLiveParticipant | undefined;
  readonly port: StudioLiveDirectPort | null | undefined;
  readonly scope: StudioP2pBoardScope;
  readonly storageOwnerId: string | null | undefined;
  readonly enabled: boolean;
}) {
  const controller = useRef<StudioP2pBoardController | null>(null);
  const [snapshot, setSnapshot] = useState<StudioP2pBoardSnapshot>(EMPTY);

  useEffect(() => {
    setSnapshot(EMPTY);
    if (!enabled || !participant || !port
      || typeof globalThis.crypto?.randomUUID !== "function") return;
    const recovered = readLocal(scope, storageOwnerId);
    const owner = new StudioP2pBoardController(participant, port, scope);
    controller.current = owner;
    let restoring = true;
    const refresh = () => {
      const next = owner.snapshot();
      setSnapshot(next);
      if (!restoring) writeLocal(
        scope,
        next.entities,
        participant.sessionId,
        storageOwnerId,
      );
    };
    const unsubscribe = owner.subscribe(refresh);
    owner.start();
    for (const entity of recovered) {
      if (entity.kind === "stroke") {
        owner.addStroke(entity.points, entity.color, entity.width);
      } else {
        owner.addNote(entity.x, entity.y, entity.text, entity.color);
      }
    }
    restoring = false;
    refresh();
    return () => {
      unsubscribe();
      owner.close();
      if (controller.current === owner) controller.current = null;
    };
  }, [enabled, participant, port, scope, storageOwnerId]);

  const addStroke = useCallback((
    points: readonly StudioP2pBoardPoint[],
    color: StudioP2pBoardColor,
    width?: number,
  ) => controller.current?.addStroke(points, color, width) ?? null, []);
  const addNote = useCallback((
    x: number,
    y: number,
    text: string,
    color: StudioP2pBoardColor,
  ) => controller.current?.addNote(x, y, text, color) ?? null, []);
  const remove = useCallback((id: string) => controller.current?.remove(id) ?? false, []);
  const clearOwn = useCallback(() => controller.current?.clearOwn(), []);

  return { snapshot, addStroke, addNote, remove, clearOwn };
}
