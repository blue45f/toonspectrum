import { useId, useRef, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { removeStudioVirtualDecoration, STUDIO_VIRTUAL_DECOR_FRAME, type StudioVirtualDecorationState, type StudioVirtualDecorType } from "./studio-virtual-space-customization";
import { editStudioVirtualDecoration, studioVirtualDecorBounds, studioVirtualDecorationStateForWorld, type StudioDecorationLayoutResult } from "./studio-virtual-space-decoration-layout";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioWorldCollisionRects, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioWorldLayoutPointer } from "./studio-world-layout-edit";
import { DEFAULT_STUDIO_VIRTUAL_ART_STYLE, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { studioExperienceFrameGeometry } from "./studio-virtual-space-experience-art";
import { StudioVirtualExperienceArtPreview } from "./StudioVirtualExperienceArtPreview";

const LABELS: Readonly<Record<StudioVirtualDecorType, readonly [string, string]>> = {
  tree: ["나무", "Tree"], "flower-bed": ["화단", "Flower bed"], bench: ["벤치", "Bench"], lamp: ["조명", "Lamp"],
  banner: ["배너", "Banner"], "market-stall": ["마켓 부스", "Market stall"], fountain: ["분수", "Fountain"],
  portal: ["포털", "Portal"], rug: ["러그", "Rug"], sign: ["안내판", "Sign"], parasol: ["파라솔", "Parasol"], pet: ["고양이", "Cat"],
  "drawing-desk": ["드로잉 데스크", "Drawing desk"], bookshelf: ["책장", "Bookshelf"], "review-board": ["원고 리뷰 보드", "Review board"], sofa: ["소파", "Sofa"],
};

export function StudioVirtualSpaceDecorationEditor({ world, decorations, selfPoint, onChange, artStyle = DEFAULT_STUDIO_VIRTUAL_ART_STYLE }: {
  readonly artStyle?: StudioVirtualArtStyleKey;
  readonly world: StudioVirtualSpaceWorldManifest;
  readonly decorations: StudioVirtualDecorationState;
  readonly selfPoint: StudioVirtualSpacePoint;
  readonly onChange: (result: StudioDecorationLayoutResult) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceDecorationEditor"), id = useId();
  const [selection, setSelection] = useState<{ worldId: string; id: string } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const state = studioVirtualDecorationStateForWorld(decorations, world);
  const selected = selection?.worldId === world.id ? state.placements.find((item) => item.id === selection.id) : undefined;
  const choose = (itemId: string) => setSelection({ worldId: world.id, id: itemId });
  const move = (dx: number, dy: number) => {
    if (selected) onChange(editStudioVirtualDecoration(state, selected.id, { x: selected.x + dx, y: selected.y + dy }, world, selfPoint));
  };
  const worldPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return studioWorldLayoutPointer({ x: clientX, y: clientY }, { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, world);
  };
  const beginDrag = (item: StudioVirtualDecorPlacement, event: React.PointerEvent<SVGRectElement>) => {
    event.stopPropagation();
    choose(item.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: item.id, pointerId: event.pointerId, x: item.x, y: item.y, originX: item.x, originY: item.y });
  };
  const trackDrag = (event: React.PointerEvent<SVGRectElement>) => {
    if (!drag || drag.id !== state.placements.find((entry) => entry.id === drag.id)?.id || drag.pointerId !== event.pointerId) return;
    const point = worldPoint(event.clientX, event.clientY);
    if (!point) return;
    event.stopPropagation();
    setDrag({ ...drag, x: Math.round(point.x / 16) * 16, y: Math.round(point.y / 16) * 16 });
  };
  const endDrag = (item: StudioVirtualDecorPlacement, event: React.PointerEvent<SVGRectElement>) => {
    if (!drag || drag.id !== item.id || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const moved = drag.x !== drag.originX || drag.y !== drag.originY;
    setDrag(null);
    if (moved) onChange(editStudioVirtualDecoration(state, item.id, { x: drag.x, y: drag.y }, world, selfPoint));
  };
  return <fieldset className="studio-decoration-editor">
    <legend>{bt("가구 배치 편집", "Edit furniture layout")}</legend>
    <p id={`${id}-help`}>{bt("가구를 고른 뒤 지도의 빈 바닥을 누르거나 이동 버튼을 사용하세요. 화살표 키로 16px, Shift와 함께 1px씩 조정합니다.", "Select furniture, then tap an empty floor, drag it, or use the movement buttons. Arrow keys move 16 pixels; hold Shift for 1 pixel.")}</p>
    <svg ref={svgRef} className="studio-decoration-editor__map" viewBox={`0 0 ${world.width} ${world.height}`} role="group" tabIndex={0}
      aria-label={bt("가구 배치 지도", "Furniture layout map")} aria-describedby={`${id}-help`}
      onClick={(event) => {
        if (!selected) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const point = studioWorldLayoutPointer({ x: event.clientX, y: event.clientY }, { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, world);
        if (point) onChange(editStudioVirtualDecoration(state, selected.id, { x: Math.round(point.x / 16) * 16, y: Math.round(point.y / 16) * 16 }, world, selfPoint));
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setSelection(null); return; }
        if (!selected || event.altKey || event.metaKey || event.ctrlKey) return;
        const movements: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const delta = movements[event.key];
        if (!delta) return;
        event.preventDefault(); event.stopPropagation(); move(delta[0] * (event.shiftKey ? 1 : 16), delta[1] * (event.shiftKey ? 1 : 16));
      }}>
      <defs><pattern id={`${id}-grid`} width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeOpacity=".13" /></pattern></defs>
      <rect width={world.width} height={world.height} fill="var(--vs2-panel-2, #182332)" />
      <rect width={world.width} height={world.height} fill={`url(#${id}-grid)`} />
      <g pointerEvents="none" fill="currentColor" opacity=".18">{studioWorldCollisionRects(world).map((rect, index) => <rect key={index} {...rect} />)}</g>
      <g pointerEvents="none" fill="none" stroke="#7fe0ce" strokeOpacity=".45">{world.portals.map((portal) => <circle key={portal.id} cx={portal.point.x} cy={portal.point.y} r={portal.radius} />)}</g>
      {state.placements.map((item, index) => {
        const frame = STUDIO_VIRTUAL_DECOR_FRAME[item.type];
        const geometry = studioExperienceFrameGeometry("furniture", artStyle, frame, 82 * item.scale, 82 * item.scale, .5, .9);
        const dragging = drag?.id === item.id;
        const shown = dragging ? { ...item, x: drag.x, y: drag.y } : item;
        return <g key={item.id} pointerEvents="none">
        {/* 선택 영역은 rect만 소유한다. 원본 image의 큰 bbox가 버튼 중심이나 포인터 영역을 늘리지 않는다. */}
        <rect {...studioVirtualDecorBounds(item)} role="button" tabIndex={0} pointerEvents="all" aria-pressed={selected?.id === item.id}
          aria-label={bt(`${index + 1}번 ${LABELS[item.type][0]} 선택`, `Select ${LABELS[item.type][1]} ${index + 1}`)}
          className="studio-decoration-editor__object" onClick={(event) => { event.stopPropagation(); choose(item.id); }}
          onPointerDown={(event) => beginDrag(item, event)} onPointerMove={trackDrag} onPointerUp={(event) => endDrag(item, event)}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); choose(item.id); } }}
          rx="8" fill={selected?.id === item.id ? "#ad89ff" : "#72b6ca"} fillOpacity=".35" stroke={selected?.id === item.id ? "#f8e5ff" : "#83cfe2"} strokeWidth={selected?.id === item.id ? 4 : 2} />
        <g transform={`translate(${shown.x} ${shown.y}) rotate(${item.rotation})`} pointerEvents="none">
          <StudioVirtualExperienceArtPreview kind="furniture" artStyle={artStyle} frame={frame}
            x={-geometry.width * geometry.originX} y={-geometry.height * geometry.originY}
            width={geometry.width} height={geometry.height} preserveAspectRatio="none" />
        </g>
        <circle cx={shown.x} cy={shown.y} r="6" fill="#f8e5ff" pointerEvents="none" />
        <text x={shown.x} y={shown.y - 30} textAnchor="middle" fill="#fff" fontSize="22" pointerEvents="none">{index + 1}</text>
      </g>;
      })}
      <g pointerEvents="none"><circle cx={selfPoint.x} cy={selfPoint.y} r="12" fill="#ffce67" stroke="#152431" strokeWidth="4" /><text x={selfPoint.x} y={selfPoint.y + 30} fill="#ffdf90" fontSize="20" textAnchor="middle">{bt("나", "You")}</text></g>
    </svg>
    <label className="studio-decoration-editor__select">{bt("편집할 가구", "Furniture to edit")}
      <select value={selected?.id ?? ""} onChange={(event) => event.target.value ? choose(event.target.value) : setSelection(null)}>
        <option value="">{bt("가구를 선택하세요", "Select furniture")}</option>
        {state.placements.map((item, index) => <option value={item.id} key={item.id}>{index + 1}. {bt(...LABELS[item.type])}</option>)}
      </select>
    </label>
    {selected ? <>
      <p>{bt(`${LABELS[selected.type][0]} · X ${selected.x} / Y ${selected.y} · ${selected.rotation}° · ${Math.round(selected.scale * 100)}%`, `${LABELS[selected.type][1]} · X ${selected.x} / Y ${selected.y} · ${selected.rotation}° · ${Math.round(selected.scale * 100)}%`)}</p>
      <div className="studio-decoration-editor__controls" role="group" aria-label={bt("선택한 가구 이동", "Move selected furniture")}>
        {([[-16, 0, "왼쪽", "Left"], [0, -16, "위", "Up"], [0, 16, "아래", "Down"], [16, 0, "오른쪽", "Right"]] as const).map(([x, y, ko, en]) => <button key={en} type="button" onClick={() => move(x, y)}>{bt(`가구 ${ko}`, `Furniture ${en.toLowerCase()}`)}</button>)}
      </div>
      <div className="studio-decoration-editor__controls">
        <button type="button" onClick={() => onChange(editStudioVirtualDecoration(state, selected.id, { rotation: ((selected.rotation + 90) % 360) as 0 | 90 | 180 | 270 }, world, selfPoint))}>{bt("가구 90도 회전", "Rotate furniture 90°")}</button>
        <button type="button" disabled={selected.scale <= .65} onClick={() => onChange(editStudioVirtualDecoration(state, selected.id, { scale: Math.max(.65, Math.round((selected.scale - .1) * 100) / 100) }, world, selfPoint))}>{bt("가구 작게", "Smaller furniture")}</button>
        <button type="button" disabled={selected.scale >= 1.35} onClick={() => onChange(editStudioVirtualDecoration(state, selected.id, { scale: Math.min(1.35, Math.round((selected.scale + .1) * 100) / 100) }, world, selfPoint))}>{bt("가구 크게", "Larger furniture")}</button>
        <button type="button" onClick={() => { onChange({ ok: true, state: removeStudioVirtualDecoration(state, selected.id) }); setSelection(null); }}>{bt("선택 가구 삭제", "Remove selected furniture")}</button>
      </div>
    </> : null}
  </fieldset>;
}
