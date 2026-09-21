import { useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { validateStudioWorldManifest, type StudioVirtualSpaceWorldManifest as World } from "./studio-virtual-space-world-manifest";
import { alignStudioWorldLayout, duplicateStudioWorldLayoutProps, resizeStudioWorldLayoutProp, rotateStudioWorldLayout,
  studioWorldLayoutPointer, studioWorldLayoutTargets, translateStudioWorldLayout, WORLD_LAYOUT_SELECTION_LIMIT,
  type WorldLayoutEdit, type WorldLayoutKind, type WorldLayoutTarget } from "./studio-world-layout-edit";

const control = "min-h-11 max-w-full rounded-lg border border-line bg-card px-3 text-sm disabled:opacity-50";
interface Gesture { readonly pointerId: number; readonly base: World; readonly scope: string; readonly keys: readonly string[];
  readonly kind: WorldLayoutKind; readonly start: { x: number; y: number }; readonly anchor: { x: number; y: number } }
export function StudioWorldVisualEditor({ world, scope, disabled, onChange, onUndo, onRedo }: {
  readonly world: World; readonly scope: string; readonly disabled: boolean; readonly onChange: (world: World) => void;
  readonly onUndo: () => void; readonly onRedo: () => void;
}) {
  const bt = useBilingual("StudioWorldVisualEditor"), id = useId();
  const [kind, setKind] = useState<WorldLayoutKind>("props"), [keys, setKeys] = useState<string[]>([]);
  const [grid, setGrid] = useState(16), [zoom, setZoom] = useState(1), [showGeometry, setShowGeometry] = useState(true);
  const [locked, setLocked] = useState<string[]>([]), [message, setMessage] = useState("");
  const [preview, setPreview] = useState<World | null>(null), [gestureActive, setGestureActive] = useState(false);
  const [width, setWidth] = useState("64"), [height, setHeight] = useState("64");
  const svg = useRef<SVGSVGElement>(null), gesture = useRef<Gesture | null>(null);
  const acceptedWorld = useRef(world);
  const latest = useRef({ world, scope, disabled }); latest.current = { world, scope, disabled };
  const targets = useMemo(() => studioWorldLayoutTargets(world, kind), [world, kind]);
  const chosen = keys.map((key) => targets.find((item) => item.key === key)).filter((item): item is WorldLayoutTarget => Boolean(item));
  const frozen = disabled || chosen.some((item) => !item.movable || locked.includes(item.key));
  const cancel = () => { gesture.current = null; setPreview(null); setGestureActive(false); };
  useLayoutEffect(() => {
    cancel();
    // Index-addressed geometry must never retarget an old selection after an external replacement.
    if (acceptedWorld.current !== world) { setKeys([]); setLocked([]); setWidth("64"); setHeight("64"); }
    acceptedWorld.current = world;
  }, [world, scope, disabled]);
  useLayoutEffect(() => { setKeys([]); setLocked([]); setMessage(""); }, [scope]);
  useLayoutEffect(() => {
    const blur = () => cancel(); window.addEventListener("blur", blur);
    return () => { gesture.current = null; window.removeEventListener("blur", blur); };
  }, []);
  const failMessage = (reason: string) => reason === "baked-art" ? bt("배경에 그려진 가구는 직접 움직일 수 없습니다. 별도 이미지 소품을 추가하세요.", "Painted background furniture cannot be moved. Add a separate image prop.")
    : reason === "rotation" || reason === "size" ? bt("충돌 영역이 있는 소품은 회전·크기를 자동 변경하지 않습니다. 구조 속성을 함께 편집하세요.", "Props with colliders cannot be rotated/resized automatically. Edit the related structural properties together.")
      : bt("선택·월드 경계·공간 연결을 확인하세요. 초안은 변경하지 않았습니다.", "Check the selection, world boundaries and access paths. The draft was not changed.");
  const commit = (result: WorldLayoutEdit, expected: World = world) => {
    if (latest.current.disabled || latest.current.world !== expected || latest.current.scope !== scope) { cancel(); return; }
    if (!result.ok) { setMessage(failMessage(result.reason)); return; }
    const errors = validateStudioWorldManifest(result.world);
    if (errors.length) { setMessage(`${bt("공간 검증에 실패해 적용하지 않았습니다.", "World validation failed; nothing was applied.")} ${errors.slice(0, 3).join(" · ")}`); return; }
    if (result.world === expected) return;
    acceptedWorld.current = result.world;
    onChange(result.world); setMessage(bt("한 번의 배치 변경을 적용했습니다. 실행 취소할 수 있습니다.", "Applied one layout change. It can be undone."));
  };
  const select = (item: WorldLayoutTarget, multiple = false) => {
    cancel(); setMessage("");
    setKeys((current) => multiple ? current.includes(item.key) ? current.filter((key) => key !== item.key)
      : current.length < WORLD_LAYOUT_SELECTION_LIMIT ? [...current, item.key] : current : [item.key]);
    if (item.kind === "props") { const prop = world.props[item.index]!; setWidth(String(prop.width ?? 64)); setHeight(String(prop.height ?? 64)); }
  };
  const point = (event: PointerEvent) => {
    const rect = svg.current?.getBoundingClientRect();
    return rect ? studioWorldLayoutPointer({ x: event.clientX, y: event.clientY }, { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, world) : null;
  };
  const begin = (event: PointerEvent<SVGGElement>, item: WorldLayoutTarget) => {
    if (event.button !== 0 || disabled || gesture.current || event.isPrimary === false) return;
    event.stopPropagation();
    if (event.shiftKey) { select(item, true); return; }
    const nextKeys = keys.includes(item.key) ? keys : [item.key];
    setKeys([...nextKeys]); setMessage("");
    if (!item.movable || nextKeys.some((key) => locked.includes(key) || !targets.find((target) => target.key === key)?.movable)) { setMessage(failMessage("baked-art")); return; }
    const start = point(event); if (!start) return;
    event.preventDefault(); svg.current?.focus({ preventScroll: true });
    gesture.current = { pointerId: event.pointerId, base: world, scope, keys: nextKeys, kind, start, anchor: item };
    svg.current?.setPointerCapture?.(event.pointerId); setGestureActive(true);
  };
  const proposed = (event: PointerEvent): WorldLayoutEdit | null => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || current.base !== latest.current.world || current.scope !== latest.current.scope || latest.current.disabled) return null;
    const end = point(event); if (!end) return { ok: false, reason: "bounds" };
    if (Math.hypot(end.x - current.start.x, end.y - current.start.y) < 0.5) return { ok: true, world: current.base };
    const snap = (value: number) => grid ? Math.round(value / grid) * grid : value;
    return translateStudioWorldLayout(current.base, current.kind, current.keys,
      snap(current.anchor.x + end.x - current.start.x) - current.anchor.x,
      snap(current.anchor.y + end.y - current.start.y) - current.anchor.y);
  };
  const move = (dx: number, dy: number) => { if (!frozen) commit(translateStudioWorldLayout(world, kind, keys, dx, dy)); };
  const keyDown = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
      || (event.target as Element).closest("input,select,textarea,[contenteditable=true]")) return;
    if (event.key === "Escape" && gesture.current) { event.preventDefault(); event.stopPropagation(); cancel(); return; }
    if (disabled) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault(); event.stopPropagation(); cancel();
      if (event.shiftKey || event.key.toLowerCase() === "y") onRedo(); else onUndo(); return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const arrows: Record<string, readonly [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = arrows[event.key];
    if (delta && keys.length) { event.preventDefault(); event.stopPropagation(); move(delta[0] * (event.shiftKey ? 16 : 1), delta[1] * (event.shiftKey ? 16 : 1)); }
  };
  const displayed = preview ?? world, displayedTargets = studioWorldLayoutTargets(displayed, kind);
  return <section className="min-w-0 space-y-3 rounded-xl border border-line bg-card p-3" aria-label={bt("직접 배치 편집", "Visual layout editor")}>
    <p id={`${id}-help`} className="text-xs text-fg-2">{bt("선택 → 드래그 또는 이동 버튼 → 한 번에 적용. Shift로 여러 항목을 선택하고 Esc로 현재 드래그를 취소합니다. 배경 그림은 고정이며 충돌·시작점은 구조 표시입니다.", "Select, drag or use movement buttons, then apply as one edit. Shift selects multiple items; Escape cancels a drag. Background artwork is fixed; collision/spawn overlays represent structure.")}</p>
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm">{bt("배치 대상", "Layout layer")} <select className={control} value={kind} disabled={disabled} onChange={(event) => { cancel(); setKind(event.target.value as WorldLayoutKind); setKeys([]); }}>
        {([["props", "별도 소품", "Separate props"], ["interactions", "도구 연결점", "Tool anchors"], ["colliders", "충돌 영역", "Collision areas"], ["spawns", "시작점", "Spawn points"], ["portals", "이동 지점", "Portals"]] as const).map(([value, ko, en]) => <option key={value} value={value}>{bt(ko, en)}</option>)}</select></label>
      <label className="text-sm">{bt("격자 맞춤", "Snap grid")} <select className={control} value={grid} onChange={(event) => { cancel(); setGrid(Number(event.target.value)); }}>{[0, 8, 16, 32].map((value) => <option key={value} value={value}>{value || bt("없음", "Off")}</option>)}</select></label>
      <label className="text-sm">{bt("지도 확대", "Map zoom")} <select className={control} value={zoom} onChange={(event) => { cancel(); setZoom(Number(event.target.value)); }}>{[1, 1.5, 2, 3].map((value) => <option key={value} value={value}>{value * 100}%</option>)}</select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showGeometry} onChange={(event) => setShowGeometry(event.target.checked)} />{bt("구조 표시", "Show structure")}</label>
    </div>
    <div className="max-h-[65vh] min-w-0 overflow-auto rounded-lg border border-line bg-panel" aria-label={bt("배치 지도 스크롤", "Layout map scrolling")}>
      <svg ref={svg} onKeyDown={keyDown} role="group" aria-label={bt("공간 배치 지도", "World layout map")} aria-describedby={`${id}-help`} tabIndex={0}
        className="block outline-none focus:ring-2 focus:ring-accent" viewBox={`0 0 ${world.width} ${world.height}`} style={{ width: `${zoom * 100}%`, aspectRatio: `${world.width}/${world.height}`, touchAction: gestureActive ? "none" : "pan-x pan-y" }}
        onPointerMove={(event) => { const result = proposed(event); if (result) setPreview(result.ok ? result.world : null); }}
        onPointerUp={(event) => { const original = gesture.current; const result = proposed(event); cancel(); if (original && result) commit(result, original.base); }}
        onPointerCancel={cancel} onLostPointerCapture={cancel}>
        <defs><pattern id={`${id}-grid`} width={grid || 16} height={grid || 16} patternUnits="userSpaceOnUse"><path d={`M ${grid || 16} 0 L 0 0 0 ${grid || 16}`} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" /></pattern></defs>
        <image href={world.backgroundUrl} x="0" y="0" width={world.width} height={world.height} preserveAspectRatio="none" opacity="0.8" pointerEvents="none" />
        {grid ? <rect width={world.width} height={world.height} fill={`url(#${id}-grid)`} pointerEvents="none" /> : null}
        {showGeometry ? <g fill="none" stroke="currentColor" strokeOpacity="0.55" pointerEvents="none">
          {world.rooms.map((room) => <rect key={room.id} x={room.x} y={room.y} width={room.width} height={room.height} strokeDasharray="8 5" />)}
          {displayed.colliders.map((rect, index) => <rect key={index} {...rect} fill="currentColor" fillOpacity="0.13" />)}
          {(world.interactionSlots ?? []).map((slot) => <g key={slot.id}><polyline points={`${slot.approachPoint.x},${slot.approachPoint.y} ${slot.anchorPoint.x},${slot.anchorPoint.y} ${slot.exitPoint.x},${slot.exitPoint.y}`} /><circle cx={slot.anchorPoint.x} cy={slot.anchorPoint.y} r={slot.radius} /></g>)}
        </g> : null}
        <g pointerEvents="none">{displayed.props.filter((prop) => prop.assetUrl && prop.width && prop.height).map((prop) => <g key={prop.id} transform={`translate(${prop.x} ${prop.y}) rotate(${prop.rotation ?? 0})`}>
          <image href={prop.assetUrl} x={-(prop.originX ?? 0.5) * prop.width!} y={-(prop.originY ?? 1) * prop.height!} width={prop.width} height={prop.height} opacity={prop.alpha ?? 1} preserveAspectRatio="none" /></g>)}</g>
        {displayedTargets.slice(0, 1024).map((item) => <g key={item.key} role="button" tabIndex={0} aria-label={`${item.label} · ${item.movable ? bt("배치 선택", "Select layout") : bt("배경 고정", "Fixed background")}`} aria-pressed={keys.includes(item.key)}
          data-layout-key={item.key} style={{ touchAction: "none" }} onPointerDown={(event) => begin(event, item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); select(item, event.shiftKey); } }}>
          <rect {...item.bounds} fill="currentColor" fillOpacity={keys.includes(item.key) ? "0.25" : "0.08"} stroke="currentColor" strokeWidth={keys.includes(item.key) ? 4 : 1} strokeDasharray={item.movable && !locked.includes(item.key) ? undefined : "6 4"} />
          <circle cx={item.x} cy={item.y} r="5" fill="currentColor" /><title>{item.label}</title>
        </g>)}
      </svg>
    </div>
    {targets.length > 1024 ? <p className="text-xs">{bt("지도에는 처음 1,024개 항목만 표시합니다. 나머지는 속성 편집 목록에서 확인하세요.", "The map shows the first 1,024 entries. Use the property list for the rest.")}</p> : null}
    <div className="grid max-h-44 grid-cols-1 gap-1 overflow-auto sm:grid-cols-2" role="group" aria-label={bt("배치 선택 목록", "Layout selection list")}>
      {targets.slice(0, 1024).map((item) => <label className="flex min-h-11 min-w-0 items-center gap-2 rounded border border-line p-2 text-sm" key={item.key}>
        <input type="checkbox" checked={keys.includes(item.key)} disabled={disabled || (!keys.includes(item.key) && keys.length >= 64)} onChange={() => select(item, true)} /><span className="break-all">{item.label}{!item.movable ? ` · ${bt("배경 고정", "Fixed background")}` : locked.includes(item.key) ? ` · ${bt("편집 잠금", "Locked")}` : ""}</span></label>)}
    </div>
    <p className="text-xs text-fg-3">{chosen.length}{bt("개 선택. 첫 선택이 정렬 기준입니다. 표시 치수가 없는 이미지는 기준점만 표시합니다.", " selected. The first selection is the alignment anchor. Images without explicit dimensions show an anchor only.")}</p>
    <div className="flex flex-wrap gap-2" role="group" aria-label={bt("선택 배치 조정", "Adjust selected layout")}>
      {([[-1, 0, "왼쪽", "Left"], [1, 0, "오른쪽", "Right"], [0, -1, "위", "Up"], [0, 1, "아래", "Down"]] as const).map(([x, y, ko, en]) => <button key={en} className={control} type="button" disabled={frozen || !chosen.length} onClick={() => move(x * (grid || 1), y * (grid || 1))}>{bt(`선택 ${ko} 이동`, `Move selection ${en.toLowerCase()}`)}</button>)}
      <button className={control} type="button" disabled={disabled || !chosen.length} onClick={() => { cancel(); setLocked((current) => chosen.every((item) => current.includes(item.key)) ? current.filter((key) => !keys.includes(key)) : [...new Set([...current, ...keys])]); }}>{bt("편집 잠금 전환", "Toggle edit lock")}</button>
      <button className={control} type="button" onClick={() => { cancel(); setKeys([]); }}>{bt("선택 해제", "Clear selection")}</button>
      {kind === "props" ? <><button className={control} type="button" disabled={frozen || !chosen.length} onClick={() => commit(duplicateStudioWorldLayoutProps(world, keys))}>{bt("선택 소품 복제", "Duplicate selected props")}</button>
        <button className={control} type="button" disabled={frozen || !chosen.length} onClick={() => commit(rotateStudioWorldLayout(world, keys, 90))}>{bt("90도 회전", "Rotate 90 degrees")}</button></> : null}
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label={bt("선택 정렬", "Align selection")}>
      {([["left", "왼쪽 맞춤", "Align left"], ["center-x", "가로 중심", "Horizontal center"], ["right", "오른쪽 맞춤", "Align right"], ["top", "위쪽 맞춤", "Align top"], ["center-y", "세로 중심", "Vertical center"], ["bottom", "아래쪽 맞춤", "Align bottom"]] as const).map(([value, ko, en]) => <button type="button" className={control} key={value} disabled={frozen || chosen.length < 2} onClick={() => commit(alignStudioWorldLayout(world, kind, keys, value))}>{bt(ko, en)}</button>)}
    </div>
    {kind === "props" && chosen.length === 1 ? <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (!frozen) commit(resizeStudioWorldLayoutProp(world, keys[0]!, Number(width), Number(height))); }}>
      <label className="text-sm">{bt("표시 너비", "Display width")}<input className={`${control} block w-28`} type="number" min="1" max="10000" required value={width} onChange={(event) => setWidth(event.target.value)} /></label>
      <label className="text-sm">{bt("표시 높이", "Display height")}<input className={`${control} block w-28`} type="number" min="1" max="10000" required value={height} onChange={(event) => setHeight(event.target.value)} /></label>
      <button type="submit" className={control} disabled={frozen}>{bt("소품 크기 적용", "Apply prop size")}</button>
    </form> : null}
    {gestureActive ? <p role="status" className="text-xs">{bt("드래그 미리보기 · 놓으면 검증 후 한 번 적용", "Drag preview · release to validate and commit once")}</p> : null}
    {message ? <p role="status" className="break-words text-sm">{message}</p> : null}
  </section>;
}
