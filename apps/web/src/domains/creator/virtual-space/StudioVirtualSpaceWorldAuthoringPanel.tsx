import {
  Copy,
  Download,
  Plus,
  RotateCcw,
  Undo2,
  Redo2,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  parseStudioWorldAuthoringImport,
  studioWorldManifestToTiledMap,
  writeStudioWorldAuthoringDraft,
} from "./studio-virtual-space-world-authoring";
import {
  studioWorldRoomAt,
  validateStudioWorldManifest,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
  type StudioWorldNpcDefinition,
  type StudioWorldPortalDefinition,
  type StudioWorldPropDefinition,
  type StudioWorldRect,
  type StudioWorldRoomDefinition,
  type StudioWorldSpawnDefinition,
} from "./studio-virtual-space-world-manifest";
import { resolveStudioWorldSpawn } from "./studio-virtual-space-world-pathfinding";

import { patchStudioWorldProp, useStudioWorldEditHistory } from "./studio-virtual-space-world-edit-history";

type AuthoringSection =
  | "rooms"
  | "props"
  | "colliders"
  | "interactions"
  | "portals"
  | "spawns"
  | "npcs";

const SECTIONS: readonly AuthoringSection[] = [
  "rooms",
  "props",
  "colliders",
  "interactions",
  "portals",
  "spawns",
  "npcs",
];

const ACTIONS = [
  "community",
  "story",
  "comic",
  "canvas",
  "review",
  "assets",
  "assistant",
  "live",
] as const;

function uniqueId(prefix: string, existing: readonly { readonly id: string }[]): string {
  const used = new Set(existing.map((item) => item.id));
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function replaceAt<T>(items: readonly T[], index: number, item: T): readonly T[] {
  return items.map((candidate, candidateIndex) => candidateIndex === index ? item : candidate);
}

function removeAt<T>(items: readonly T[], index: number): readonly T[] {
  return items.filter((_, candidateIndex) => candidateIndex !== index);
}

function insertAfter<T>(items: readonly T[], index: number, item: T): readonly T[] {
  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
}

function downloadJson(name: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function Field({
  label,
  children,
  className,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <label className={cn("grid min-w-0 gap-1 text-[0.62rem] font-bold text-fg-3", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  className,
}: {
  readonly label: string;
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
  readonly className?: string;
}) {
  return (
    <Field label={label} className={className}>
      <input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-9 min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none focus:border-accent"
      />
    </Field>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  optional = false,
}: {
  readonly label: string;
  readonly value: number | undefined;
  readonly onChange: (value: number | undefined) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly optional?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          if (optional && event.target.value === "") {
            onChange(undefined);
            return;
          }
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? next : undefined);
        }}
        className="min-h-9 min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none focus:border-accent"
      />
    </Field>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  allowEmpty = false,
}: {
  readonly label: string;
  readonly value: T | undefined;
  readonly options: readonly T[];
  readonly onChange: (value: T | undefined) => void;
  readonly allowEmpty?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value ? event.target.value as T : undefined)}
        className="min-h-9 min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none focus:border-accent"
      >
        {allowEmpty ? <option value="">—</option> : null}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </Field>
  );
}

function GeometryFields({
  x,
  y,
  width,
  height,
  onChange,
  includeSize = true,
}: {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly onChange: (patch: { x?: number; y?: number; width?: number; height?: number }) => void;
  readonly includeSize?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <NumberField label="X" value={x} onChange={(value) => value != null && onChange({ x: value })} />
      <NumberField label="Y" value={y} onChange={(value) => value != null && onChange({ y: value })} />
      {includeSize ? (
        <>
          <NumberField label="Width" value={width} min={1} onChange={(value) => value != null && onChange({ width: value })} />
          <NumberField label="Height" value={height} min={1} onChange={(value) => value != null && onChange({ height: value })} />
        </>
      ) : null}
    </div>
  );
}

function entityLabel(
  manifest: StudioVirtualSpaceWorldManifest,
  section: AuthoringSection,
  index: number,
): string {
  switch (section) {
    case "rooms": return manifest.rooms[index]?.id ?? `room-${index + 1}`;
    case "props": return manifest.props[index]?.id ?? `prop-${index + 1}`;
    case "colliders": return `collider-${index + 1}`;
    case "interactions": return manifest.interactions[index]?.id ?? `interaction-${index + 1}`;
    case "portals": return manifest.portals[index]?.id ?? `portal-${index + 1}`;
    case "spawns": return manifest.spawns[index]?.id ?? `spawn-${index + 1}`;
    case "npcs": return manifest.npcs[index]?.id ?? `npc-${index + 1}`;
  }
}

function sectionLength(manifest: StudioVirtualSpaceWorldManifest, section: AuthoringSection): number {
  return manifest[section].length;
}

export function StudioVirtualSpaceWorldAuthoringPanel({
  projectId,
  manifest,
  onChange,
  onReset,
  disabled = false,
  basePublishedRevisionId,
}: {
  readonly disabled?: boolean;
  readonly basePublishedRevisionId?: string | null;
  readonly projectId: string;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly onChange: (manifest: StudioVirtualSpaceWorldManifest) => void;
  readonly onReset: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceWorldAuthoringPanel");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [section, setSection] = useState<AuthoringSection>("rooms");
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const edits = useStudioWorldEditHistory({ manifest, projectId, basePublishedRevisionId, disabled, onChange });
  const importEpoch = useRef(0);
  const [moveStep, setMoveStep] = useState(8);
  useEffect(() => {
    importEpoch.current += 1;
    return () => { importEpoch.current += 1; };
  }, [manifest, projectId, basePublishedRevisionId, disabled]);
  const sectionLabel = (value: AuthoringSection) => ({
    rooms: bt("방", "Rooms"), props: bt("소품", "Props"), colliders: bt("충돌 영역", "Colliders"),
    interactions: bt("상호작용", "Interactions"), portals: bt("이동 지점", "Portals"),
    spawns: bt("시작 위치", "Spawn points"), npcs: bt("도우미 캐릭터", "NPCs"),
  })[value];
  const errors = useMemo(() => validateStudioWorldManifest(manifest), [manifest]);
  const roomIds = useMemo(() => manifest.rooms.map((room) => room.id), [manifest.rooms]);

  const handleHistoryKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (disabled || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !(event.ctrlKey || event.metaKey) || event.altKey) return;
        if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
        const key = event.key.toLowerCase();
        const redo = (key === "z" && event.shiftKey) || key === "y";
        if (key !== "z" && key !== "y") return;
        event.preventDefault();
        event.stopPropagation();
        if (redo) edits.redo(); else edits.undo();
        setMessage(null);
  };

  const setManifest = (next: StudioVirtualSpaceWorldManifest) => {
    edits.change(next);
    setMessage(null);
  };

  const addEntity = () => {
    const center = { x: manifest.width / 2, y: manifest.height / 2 };
    const safeCenter = resolveStudioWorldSpawn(manifest, center) ?? center;
    let next = manifest;
    const nextIndex = sectionLength(manifest, section);
    switch (section) {
      case "rooms": {
        const room: StudioWorldRoomDefinition = {
          id: uniqueId("room", manifest.rooms),
          labelKo: "새 방",
          labelEn: "New Room",
          x: Math.max(0, center.x - 120),
          y: Math.max(0, center.y - 90),
          width: 240,
          height: 180,
        };
        next = { ...manifest, rooms: [...manifest.rooms, room] };
        break;
      }
      case "props": {
        const prop: StudioWorldPropDefinition = {
          id: uniqueId("prop", manifest.props),
          kind: "decor",
          x: center.x,
          y: center.y,
          scale: 1,
          depth: "y-sort",
        };
        next = { ...manifest, props: [...manifest.props, prop] };
        break;
      }
      case "colliders": {
        const collider: StudioWorldRect = { x: center.x - 50, y: center.y - 20, width: 100, height: 40 };
        next = { ...manifest, colliders: [...manifest.colliders, collider] };
        break;
      }
      case "interactions": {
        const interaction: StudioWorldInteractionDefinition = {
          id: uniqueId("interaction", manifest.interactions),
          zoneId: studioWorldRoomAt(manifest, safeCenter),
          point: safeCenter,
          radius: 64,
          labelKo: "새 상호작용",
          labelEn: "New Interaction",
          action: "community",
        };
        next = { ...manifest, interactions: [...manifest.interactions, interaction] };
        break;
      }
      case "portals": {
        const portal: StudioWorldPortalDefinition = {
          id: uniqueId("portal", manifest.portals),
          point: safeCenter,
          radius: 40,
          targetRoomId: manifest.spawns[0]
            ? studioWorldRoomAt(manifest, manifest.spawns[0].point)
            : roomIds[0],
        };
        next = { ...manifest, portals: [...manifest.portals, portal] };
        break;
      }
      case "spawns": {
        const spawn: StudioWorldSpawnDefinition = {
          id: uniqueId("spawn", manifest.spawns),
          point: safeCenter,
          facing: "down",
        };
        next = { ...manifest, spawns: [...manifest.spawns, spawn] };
        break;
      }
      case "npcs": {
        const npc: StudioWorldNpcDefinition = {
          id: uniqueId("npc", manifest.npcs),
          skinKey: "pink",
          point: safeCenter,
          roomId: studioWorldRoomAt(manifest, safeCenter),
          facing: "down",
          scale: 1,
          speed: 72,
          behavior: "idle",
        };
        next = { ...manifest, npcs: [...manifest.npcs, npc] };
        break;
      }
    }
    setManifest(next);
    setSelected(nextIndex);
  };

  const duplicateEntity = () => {
    const index = Math.min(selected, Math.max(0, sectionLength(manifest, section) - 1));
    let next = manifest;
    switch (section) {
      case "rooms": {
        const source = manifest.rooms[index];
        if (!source) return;
        const item = { ...source, id: uniqueId(source.id + "-copy", manifest.rooms), x: source.x + 18, y: source.y + 18 };
        next = { ...manifest, rooms: insertAfter(manifest.rooms, index, item) };
        break;
      }
      case "props": {
        const source = manifest.props[index];
        if (!source) return;
        const item = {
          ...source,
          id: uniqueId(source.id + "-copy", manifest.props),
          x: source.x + 18,
          y: source.y + 18,
          collider: source.collider ? { ...source.collider, x: source.collider.x + 18, y: source.collider.y + 18 } : undefined,
        };
        next = { ...manifest, props: insertAfter(manifest.props, index, item) };
        break;
      }
      case "colliders": {
        const source = manifest.colliders[index];
        if (!source) return;
        next = { ...manifest, colliders: insertAfter(manifest.colliders, index, { ...source, x: source.x + 18, y: source.y + 18 }) };
        break;
      }
      case "interactions": {
        const source = manifest.interactions[index];
        if (!source) return;
        const item = { ...source, id: uniqueId(source.id + "-copy", manifest.interactions), point: { x: source.point.x + 18, y: source.point.y + 18 } };
        next = { ...manifest, interactions: insertAfter(manifest.interactions, index, item) };
        break;
      }
      case "portals": {
        const source = manifest.portals[index];
        if (!source) return;
        const item = { ...source, id: uniqueId(source.id + "-copy", manifest.portals), point: { x: source.point.x + 18, y: source.point.y + 18 } };
        next = { ...manifest, portals: insertAfter(manifest.portals, index, item) };
        break;
      }
      case "spawns": {
        const source = manifest.spawns[index];
        if (!source) return;
        const item = { ...source, id: uniqueId(source.id + "-copy", manifest.spawns), point: { x: source.point.x + 18, y: source.point.y + 18 } };
        next = { ...manifest, spawns: insertAfter(manifest.spawns, index, item) };
        break;
      }
      case "npcs": {
        const source = manifest.npcs[index];
        if (!source) return;
        const item = { ...source, id: uniqueId(source.id + "-copy", manifest.npcs), point: { x: source.point.x + 18, y: source.point.y + 18 } };
        next = { ...manifest, npcs: insertAfter(manifest.npcs, index, item) };
        break;
      }
    }
    setManifest(next);
    setSelected(index + 1);
  };

  const deleteEntity = () => {
    const index = Math.min(selected, Math.max(0, sectionLength(manifest, section) - 1));
    if ((section === "rooms" && manifest.rooms.length <= 1) || (section === "spawns" && manifest.spawns.length <= 1)) {
      setMessage(bt("마지막 방/스폰은 삭제할 수 없습니다.", "The final room/spawn cannot be deleted."));
      return;
    }
    const next = {
      ...manifest,
      [section]: removeAt(manifest[section] as readonly unknown[], index),
    } as StudioVirtualSpaceWorldManifest;
    setManifest(next);
    setSelected(Math.max(0, index - 1));
  };

  const updateRoom = (patch: Partial<StudioWorldRoomDefinition>) => {
    const item = manifest.rooms[selected];
    if (!item) return;
    setManifest({ ...manifest, rooms: replaceAt(manifest.rooms, selected, { ...item, ...patch }) });
  };
  const updateProp = (patch: Partial<StudioWorldPropDefinition>) => {
    const item = manifest.props[selected];
    if (!item) return;
    setManifest({ ...manifest, props: replaceAt(manifest.props, selected, patchStudioWorldProp(item, patch)) });
  };
  const updateCollider = (patch: Partial<StudioWorldRect>) => {
    const item = manifest.colliders[selected];
    if (!item) return;
    setManifest({ ...manifest, colliders: replaceAt(manifest.colliders, selected, { ...item, ...patch }) });
  };
  const updateInteraction = (patch: Partial<StudioWorldInteractionDefinition>) => {
    const item = manifest.interactions[selected];
    if (!item) return;
    setManifest({ ...manifest, interactions: replaceAt(manifest.interactions, selected, { ...item, ...patch }) });
  };
  const updatePortal = (patch: Partial<StudioWorldPortalDefinition>) => {
    const item = manifest.portals[selected];
    if (!item) return;
    setManifest({ ...manifest, portals: replaceAt(manifest.portals, selected, { ...item, ...patch }) });
  };
  const updateSpawn = (patch: Partial<StudioWorldSpawnDefinition>) => {
    const item = manifest.spawns[selected];
    if (!item) return;
    setManifest({ ...manifest, spawns: replaceAt(manifest.spawns, selected, { ...item, ...patch }) });
  };
  const updateNpc = (patch: Partial<StudioWorldNpcDefinition>) => {
    const item = manifest.npcs[selected];
    if (!item) return;
    setManifest({ ...manifest, npcs: replaceAt(manifest.npcs, selected, { ...item, ...patch }) });
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled) return;
    const epoch = ++importEpoch.current;
    try {
      const raw = await file.text();
      if (epoch !== importEpoch.current) return;
      const imported = parseStudioWorldAuthoringImport(raw, manifest);
      setManifest(imported);
      setSelected(0);
      setMessage(bt("월드 JSON을 불러왔습니다.", "World JSON imported."));
    } catch (error) {
      if (epoch !== importEpoch.current) return;
      setMessage(error instanceof Error ? error.message : bt("월드 JSON을 불러오지 못했습니다.", "Could not import world JSON."));
    }
  };

  const renderEditor = () => {
    if (section === "rooms") {
      const item = manifest.rooms[selected];
      if (!item) return null;
      return (
        <>
          <TextField label="ID" value={item.id} onChange={(id) => updateRoom({ id })} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Label KO" value={item.labelKo} onChange={(labelKo) => updateRoom({ labelKo })} />
            <TextField label="Label EN" value={item.labelEn} onChange={(labelEn) => updateRoom({ labelEn })} />
          </div>
          <GeometryFields {...item} onChange={updateRoom} />
          <SelectField label="Default action" value={item.action} options={ACTIONS} allowEmpty onChange={(action) => updateRoom({ action })} />
        </>
      );
    }
    if (section === "props") {
      const item = manifest.props[selected];
      if (!item) return null;
      return (
        <>
          <TextField label="ID" value={item.id} onChange={(id) => updateProp({ id })} />
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Kind" value={item.kind} options={["decor", "solid", "interactive", "portal"] as const} onChange={(kind) => kind && updateProp({ kind })} />
            <SelectField label="Depth" value={item.depth} options={["fixed", "y-sort", "foreground"] as const} onChange={(depth) => updateProp({ depth })} />
          </div>
          <GeometryFields x={item.x} y={item.y} width={item.width} height={item.height} onChange={updateProp} />
          <div role="group" aria-label={bt("소품 위치 조정", "Move prop")} className="grid grid-cols-2 gap-2">
            <Field label={bt("이동 간격", "Move increment")}>
              <select value={moveStep} onChange={(event) => setMoveStep(Number(event.target.value))} className="min-h-11 rounded-lg border border-line bg-card px-2 text-xs">
                {[1, 8, 16, 32].map((step) => <option key={step} value={step}>{step}px</option>)}
              </select>
            </Field>
            <p className="text-xs text-fg-3">{bt("충돌 영역도 함께 이동합니다.", "The collider moves with this prop.")}</p>
            <button onKeyDown={handleHistoryKeyDown} type="button" className="min-h-11" onClick={() => updateProp({ x: item.x - moveStep })}>{bt("왼쪽으로", "Move left")}</button>
            <button onKeyDown={handleHistoryKeyDown} type="button" className="min-h-11" onClick={() => updateProp({ x: item.x + moveStep })}>{bt("오른쪽으로", "Move right")}</button>
            <button onKeyDown={handleHistoryKeyDown} type="button" className="min-h-11" onClick={() => updateProp({ y: item.y - moveStep })}>{bt("위로", "Move up")}</button>
            <button onKeyDown={handleHistoryKeyDown} type="button" className="min-h-11" onClick={() => updateProp({ y: item.y + moveStep })}>{bt("아래로", "Move down")}</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Asset key" value={item.assetKey} onChange={(assetKey) => updateProp({ assetKey: assetKey || undefined })} />
            <TextField label="Asset URL" value={item.assetUrl} onChange={(assetUrl) => updateProp({ assetUrl: assetUrl || undefined })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Scale" value={item.scale} min={0.05} step={0.05} optional onChange={(scale) => updateProp({ scale })} />
            <NumberField label="Rotation" value={item.rotation} step={1} optional onChange={(rotation) => updateProp({ rotation })} />
            <NumberField label="Alpha" value={item.alpha} min={0} max={1} step={0.05} optional onChange={(alpha) => updateProp({ alpha })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Action" value={item.action} options={ACTIONS} allowEmpty onChange={(action) => updateProp({ action })} />
            <NumberField label="Interaction radius" value={item.interactionRadius} min={1} optional onChange={(interactionRadius) => updateProp({ interactionRadius })} />
          </div>
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg-2">
            <input
              type="checkbox"
              checked={Boolean(item.collider)}
              onChange={(event) => updateProp({
                collider: event.target.checked
                  ? item.collider ?? { x: item.x, y: item.y, width: item.width ?? 64, height: item.height ?? 32 }
                  : undefined,
              })}
            />
            Collider
          </label>
          {item.collider ? (
            <GeometryFields {...item.collider} onChange={(patch) => updateProp({ collider: { ...item.collider!, ...patch } })} />
          ) : null}
        </>
      );
    }
    if (section === "colliders") {
      const item = manifest.colliders[selected];
      return item ? <GeometryFields {...item} onChange={updateCollider} /> : null;
    }
    if (section === "interactions") {
      const item = manifest.interactions[selected];
      if (!item) return null;
      return (
        <>
          <TextField label="ID" value={item.id} onChange={(id) => updateInteraction({ id })} />
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Room" value={item.zoneId} options={roomIds} onChange={(zoneId) => zoneId && updateInteraction({ zoneId })} />
            <SelectField label="Action" value={item.action} options={ACTIONS} onChange={(action) => action && updateInteraction({ action })} />
          </div>
          <GeometryFields x={item.point.x} y={item.point.y} includeSize={false} onChange={(patch) => updateInteraction({ point: { ...item.point, ...patch } })} />
          <NumberField label="Radius" value={item.radius} min={1} onChange={(radius) => radius != null && updateInteraction({ radius })} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Label KO" value={item.labelKo} onChange={(labelKo) => updateInteraction({ labelKo })} />
            <TextField label="Label EN" value={item.labelEn} onChange={(labelEn) => updateInteraction({ labelEn })} />
          </div>
        </>
      );
    }
    if (section === "portals") {
      const item = manifest.portals[selected];
      if (!item) return null;
      return (
        <>
          <TextField label="ID" value={item.id} onChange={(id) => updatePortal({ id })} />
          <GeometryFields x={item.point.x} y={item.point.y} includeSize={false} onChange={(patch) => updatePortal({ point: { ...item.point, ...patch } })} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Radius" value={item.radius} min={1} onChange={(radius) => radius != null && updatePortal({ radius })} />
            <SelectField
              label="Target room"
              value={item.targetRoomId}
              options={roomIds}
              allowEmpty
              onChange={(targetRoomId) => updatePortal({ targetRoomId, targetPoint: undefined })}
            />
          </div>
          <TextField label="Route href" value={item.href} onChange={(href) => updatePortal({ href: href || undefined })} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Target X" value={item.targetPoint?.x} optional onChange={(x) => updatePortal({ targetPoint: x == null ? undefined : { x, y: item.targetPoint?.y ?? item.point.y } })} />
            <NumberField label="Target Y" value={item.targetPoint?.y} optional onChange={(y) => updatePortal({ targetPoint: y == null ? undefined : { x: item.targetPoint?.x ?? item.point.x, y } })} />
          </div>
        </>
      );
    }
    if (section === "spawns") {
      const item = manifest.spawns[selected];
      if (!item) return null;
      return (
        <>
          <TextField label="ID" value={item.id} onChange={(id) => updateSpawn({ id })} />
          <GeometryFields x={item.point.x} y={item.point.y} includeSize={false} onChange={(patch) => updateSpawn({ point: { ...item.point, ...patch } })} />
          <SelectField label="Facing" value={item.facing} options={["down", "left", "right", "up"] as const} onChange={(facing) => updateSpawn({ facing })} />
        </>
      );
    }
    const item = manifest.npcs[selected];
    if (!item) return null;
    return (
      <>
        <TextField label="ID" value={item.id} onChange={(id) => updateNpc({ id })} />
        <div className="grid grid-cols-2 gap-2">
          <SelectField label="Room" value={item.roomId} options={roomIds} onChange={(roomId) => roomId && updateNpc({ roomId })} />
          <SelectField label="Facing" value={item.facing} options={["down", "left", "right", "up"] as const} onChange={(facing) => updateNpc({ facing })} />
        </div>
        <GeometryFields x={item.point.x} y={item.point.y} includeSize={false} onChange={(patch) => updateNpc({ point: { ...item.point, ...patch } })} />
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Skin key" value={item.skinKey} onChange={(skinKey) => updateNpc({ skinKey })} />
          <SelectField label="Behavior" value={item.behavior} options={["idle", "talk", "draw", "review", "patrol"] as const} onChange={(behavior) => updateNpc({ behavior })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Scale" value={item.scale} min={0.05} step={0.05} optional onChange={(scale) => updateNpc({ scale })} />
          <NumberField label="Speed" value={item.speed} min={1} optional onChange={(speed) => updateNpc({ speed })} />
        </div>
      </>
    );
  };

  const count = sectionLength(manifest, section);
  const safeSelected = Math.min(selected, Math.max(0, count - 1));

  useEffect(() => {
    if (count === 0 && selected !== 0) {
      setSelected(0);
      return;
    }
    if (count > 0 && selected >= count) setSelected(count - 1);
  }, [count, selected]);

  return (
    <section className="studio-vspace-authoring" data-studio-world-authoring="true" data-space-interactive="true">
      <fieldset disabled={disabled} aria-label={bt("공간 초안", "World draft")} className="min-w-0 border-0 p-0"
>
      <div className="studio-vspace-authoring-head">
        <div>
          <p>WORLD AUTHORING</p>
          <h2>{bt("Virtual Studio 월드 편집", "Virtual Studio world editor")}</h2>
          <span>{manifest.width} × {manifest.height} · v{manifest.version}</span>
        </div>
        <div className="studio-vspace-authoring-actions">
          <button onKeyDown={handleHistoryKeyDown} type="button" className="min-h-11" disabled={!edits.canUndo} aria-keyshortcuts="Control+Z Meta+Z" onClick={() => { edits.undo(); setMessage(null); }}>
            <Undo2 size={14} aria-hidden /> {bt("실행 취소", "Undo")}
          </button>
          <button onKeyDown={handleHistoryKeyDown} type="button" className="min-h-11" disabled={!edits.canRedo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" onClick={() => { edits.redo(); setMessage(null); }}>
            <Redo2 size={14} aria-hidden /> {bt("다시 실행", "Redo")}
          </button>
          <button onKeyDown={handleHistoryKeyDown}
            type="button"
            onClick={() => {
              const ok = writeStudioWorldAuthoringDraft(projectId, manifest, basePublishedRevisionId);
              setMessage(ok ? bt("브라우저 초안을 저장했습니다.", "Browser draft saved.") : bt("초안을 저장하지 못했습니다.", "Could not save draft."));
            }}
          >
            <Save size={14} aria-hidden /> {bt("초안 저장", "Save draft")}
          </button>
          <button onKeyDown={handleHistoryKeyDown} type="button" onClick={() => downloadJson(`${manifest.id}.json`, studioWorldManifestToTiledMap(manifest))}>
            <Download size={14} aria-hidden /> Tiled JSON
          </button>
          <button onKeyDown={handleHistoryKeyDown} type="button" onClick={() => inputRef.current?.click()}>
            <Upload size={14} aria-hidden /> {bt("가져오기", "Import")}
          </button>
          <button onKeyDown={handleHistoryKeyDown} type="button" onClick={onReset}>
            <RotateCcw size={14} aria-hidden /> {bt("원본 복원", "Reset")}
          </button>
          <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
        </div>
      </div>

      {errors.length ? (
        <div className="studio-vspace-authoring-errors" role="alert">
          <strong>{bt("현재 월드에 수정이 필요한 항목이 있습니다.", "The current world needs fixes.")}</strong>
          <ul>{errors.slice(0, 5).map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      ) : null}
      {message ? <p className="studio-vspace-authoring-message" role="status">{message}</p> : null}

      <div className="studio-vspace-authoring-body">
        <nav className="studio-vspace-authoring-sections" aria-label={bt("월드 편집 레이어", "World authoring layers")}>
          {SECTIONS.map((item) => (
            <button onKeyDown={handleHistoryKeyDown}
              key={item}
              type="button"
              data-active={section === item || undefined}
              onClick={() => { setSection(item); setSelected(0); setMessage(null); }}
            >
              <span>{sectionLabel(item)}</span>
              <b>{sectionLength(manifest, item)}</b>
            </button>
          ))}
        </nav>

        <div className="studio-vspace-authoring-list">
          <div className="studio-vspace-authoring-list-head">
            <strong>{sectionLabel(section)}</strong>
            <button onKeyDown={handleHistoryKeyDown} type="button" onClick={addEntity}><Plus size={14} aria-hidden /> {bt("추가", "Add")}</button>
          </div>
          <div className="studio-vspace-authoring-scroll">
            {count ? Array.from({ length: count }, (_, index) => (
              <button onKeyDown={handleHistoryKeyDown}
                key={`${section}-${entityLabel(manifest, section, index)}-${index}`}
                type="button"
                data-active={safeSelected === index || undefined}
                onClick={() => setSelected(index)}
              >
                <span>{entityLabel(manifest, section, index)}</span>
                <small>#{index + 1}</small>
              </button>
            )) : <p>{bt("아직 항목이 없습니다.", "No items yet.")}</p>}
          </div>
          {count ? (
            <div className="studio-vspace-authoring-list-actions">
              <button onKeyDown={handleHistoryKeyDown} type="button" onClick={duplicateEntity}><Copy size={13} aria-hidden /> {bt("복제", "Duplicate")}</button>
              <button onKeyDown={handleHistoryKeyDown} type="button" className="is-danger" onClick={deleteEntity}><Trash2 size={13} aria-hidden /> {bt("삭제", "Delete")}</button>
            </div>
          ) : null}
        </div>

        <div className="studio-vspace-authoring-editor">
          {renderEditor()}
        </div>
      </div>
      </fieldset>
    </section>
  );
}
