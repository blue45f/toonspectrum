import { studioToolbarProfileMatches, studioToolbarProfileNameError } from "./studio-toolbar-profile-names";
import { StudioToolbarProfileManager } from "./StudioToolbarProfileManager";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, GripVertical, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  DEFAULT_STUDIO_RAIL_TOOL_ORDER, isStudioRailToolId, studioRailToolLabel,
  type StudioRailToolId, type StudioToolbarPreferences, type StudioToolbarView,
} from "./studio-app-settings";
import { matchesStudioRailToolQuery } from "./studio-rail-tool-search";
import {
  configuredStudioToolbar, moveStudioToolbarTool, pinAllStudioToolbarTools,
  pinStudioToolbarTools, STUDIO_TOOLBAR_PRESETS, unpinStudioToolbarTools,
} from "./studio-toolbar-configuration";
import { useT } from "@/shared/lib/i18n";

const action = "min-h-11 rounded-lg border border-line px-3 text-xs text-fg hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-45";
const iconAction = "grid size-9 shrink-0 place-items-center rounded-md text-fg-2 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 pointer-coarse:size-11";

export function StudioToolbarConfigurator({ value, onApply, onCancel }: {
  value: StudioToolbarPreferences;
  onApply: (next: StudioToolbarPreferences) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const id = useId();
  const baseline = useRef(JSON.stringify(value));
  const [draft, setDraft] = useState(() => configuredStudioToolbar(value));
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StudioRailToolId[]>([]);
  const [name, setName] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const rowRefs = useRef<Partial<Record<StudioRailToolId, HTMLButtonElement | null>>>({});
  const conflict = dirty && baseline.current !== JSON.stringify(value);
  useEffect(() => {
    if (dirty) return;
    baseline.current = JSON.stringify(value);
    setDraft(configuredStudioToolbar(value));
  }, [value, dirty]);
  const label = (tool: StudioRailToolId) => studioRailToolLabel(tool, t);
  const change = (next: StudioToolbarPreferences) => {
    const active = next.profiles?.find((profile) => profile.id === next.activeProfileId);
    setDraft(active && !studioToolbarProfileMatches(active, next) ? { ...next, activeProfileId: null } : next);
    setDirty(true);
  };
  const nameProblem = studioToolbarProfileNameError(draft.profiles ?? [], name);
  const move = (tool: StudioRailToolId, index: number) => {
    change(moveStudioToolbarTool(draft, tool, index));
    setAnnouncement(`${label(tool)} · ${Math.max(1, Math.min(draft.visibleIds.length, index + 1))}번째로 이동`);
    requestAnimationFrame(() => rowRefs.current[tool]?.focus({ preventScroll: true }));
  };
  const toggle = (tool: StudioRailToolId) => setSelected((ids) => ids.includes(tool) ? ids.filter((item) => item !== tool) : [...ids, tool]);
  const matches = (tool: StudioRailToolId) => matchesStudioRailToolQuery(tool, query, t);
  const available = DEFAULT_STUDIO_RAIL_TOOL_ORDER.filter((tool) => !draft.visibleIds.includes(tool));

  return <section aria-label="도구막대 구성 편집" data-studio-toolbar-configurator="true" className="space-y-3 text-sm">
    <div className="sticky -top-4 z-10 space-y-3 border-b border-line bg-panel pb-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">도구막대 구성</h3>
        <span className="text-xs tabular-nums text-fg-2">고정 {draft.visibleIds.length} · 전체 {DEFAULT_STUDIO_RAIL_TOOL_ORDER.length}</span>
      </div>
      <p className="text-xs leading-relaxed text-fg-2">사용자 순서와 개수를 유지합니다. 전체 도구는 고정하지 않아도 사용할 수 있습니다.</p>
      <label className="relative block"><Search size={16} aria-hidden className="absolute left-3 top-3.5" />
        <input type="search" aria-label="도구막대에서 도구 찾기" value={query}
          onChange={(event) => setQuery(event.currentTarget.value.slice(0, 80))}
          placeholder="도구 이름 · 스포이드 · 단축키" className="min-h-11 w-full rounded-lg border border-line bg-card pl-9 pr-3 text-sm" />
      </label>
      <label className="flex items-center gap-2 text-xs">보기 방식
        <select aria-label="도구막대 보기 방식" className={action} value={draft.view ?? "single"}
          onChange={(event) => change({ ...draft, view: event.currentTarget.value as StudioToolbarView })}>
          <option value="single">한 열</option><option value="double">두 열</option><option value="list">이름 목록</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={action} onClick={() => change(pinAllStudioToolbarTools(draft))}>모든 도구 고정</button>
        <button type="button" className={action} onClick={() => change({ ...draft, visibleIds: DEFAULT_STUDIO_RAIL_TOOL_ORDER.filter((tool) => draft.visibleIds.includes(tool)) })}>기본 순서로 정렬</button>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="선택 도구 일괄 편집">
      <button type="button" className={action} onClick={() => setSelected(draft.visibleIds.filter(matches))}>고정 목록 선택</button>
      <button type="button" className={action} onClick={() => setSelected(available.filter(matches))}>추가 목록 선택</button>
      <button type="button" className={action} disabled={!selected.length} onClick={() => { change(pinStudioToolbarTools(draft, selected)); setSelected([]); }}>선택 추가</button>
      <button type="button" className={action} disabled={!selected.some((tool) => draft.visibleIds.includes(tool)) || draft.visibleIds.every((tool) => selected.includes(tool))}
        onClick={() => { change(unpinStudioToolbarTools(draft, selected)); setSelected([]); }}>선택 제거</button>
      <button type="button" className={action} onClick={() => setSelected([])}>선택 해제</button>
    </div>
    <div className="grid min-h-0 gap-3 sm:grid-cols-2">
      <section aria-labelledby={`${id}-pinned`} className="min-w-0 rounded-lg border border-line p-2">
        <h4 id={`${id}-pinned`} className="mb-2 text-xs font-semibold">도구막대에 표시</h4>
        <ul className="max-h-[min(26rem,50dvh)] space-y-1 overflow-y-auto overscroll-contain">
          {draft.visibleIds.filter(matches).map((tool) => {
            const index = draft.visibleIds.indexOf(tool);
            return <li key={tool} className="flex flex-wrap items-center rounded-lg border border-line bg-card p-1">
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-1 text-xs">
                <input type="checkbox" aria-label={`${label(tool)} 선택`} checked={selected.includes(tool)} onChange={() => toggle(tool)} />
                <span className="break-words">{index + 1}. {label(tool)}</span>
              </label>
              <button type="button" className={iconAction} ref={(node) => { rowRefs.current[tool] = node; }} draggable
                aria-label={`${label(tool)} 이동 · Alt와 방향키`}
                onDragStart={(event) => event.dataTransfer.setData("text/plain", tool)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); const dragged = event.dataTransfer.getData("text/plain"); if (isStudioRailToolId(dragged)) move(dragged, index); }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                  if (!event.altKey || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                  event.preventDefault(); event.stopPropagation();
                  move(tool, event.key === "Home" ? 0 : event.key === "End" ? draft.visibleIds.length - 1 : index + (event.key === "ArrowUp" ? -1 : 1));
                }}><GripVertical size={16} aria-hidden /></button>
              <div className="flex w-full justify-end border-t border-line/60">
                <button type="button" className={iconAction} aria-label={`${label(tool)} 맨 위로`} disabled={index === 0} onClick={() => move(tool, 0)}><ChevronsUp size={16} aria-hidden /></button>
                <button type="button" className={iconAction} aria-label={`${label(tool)} 위로`} disabled={index === 0} onClick={() => move(tool, index - 1)}><ArrowUp size={16} aria-hidden /></button>
                <button type="button" className={iconAction} aria-label={`${label(tool)} 아래로`} disabled={index === draft.visibleIds.length - 1} onClick={() => move(tool, index + 1)}><ArrowDown size={16} aria-hidden /></button>
                <button type="button" className={iconAction} aria-label={`${label(tool)} 맨 아래로`} disabled={index === draft.visibleIds.length - 1} onClick={() => move(tool, draft.visibleIds.length - 1)}><ChevronsDown size={16} aria-hidden /></button>
                <button type="button" className={action} aria-label={`${label(tool)} 숨기기`} disabled={draft.visibleIds.length <= 1}
                  onClick={() => change(unpinStudioToolbarTools(draft, [tool]))}>해제</button>
              </div>
            </li>;
          })}
        </ul>
      </section>
      <section aria-labelledby={`${id}-available`} className="min-w-0 rounded-lg border border-line p-2">
        <h4 id={`${id}-available`} className="mb-2 text-xs font-semibold">숨긴 도구 · 모든 도구에서 사용</h4>
        <ul className="max-h-[min(26rem,50dvh)] space-y-1 overflow-y-auto overscroll-contain">
          {available.filter(matches).map((tool) => <li key={tool} className="flex min-h-11 items-center gap-2">
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-xs"><input type="checkbox" aria-label={`${label(tool)} 선택`} checked={selected.includes(tool)} onChange={() => toggle(tool)} />{label(tool)}</label>
            <button type="button" className={action} aria-label={`${label(tool)} 표시하기`} onClick={() => change(pinStudioToolbarTools(draft, [tool]))}>추가</button>
          </li>)}
        </ul>
        {!available.filter(matches).length ? <p className="py-3 text-xs text-fg-2">추가할 검색 결과가 없습니다.</p> : null}
      </section>
    </div>
    <details className="rounded-lg border border-line p-3">
      <summary className="min-h-9 cursor-pointer text-sm font-semibold">작업별 구성 · 내 구성 저장</summary>
      <div className="mt-2 flex flex-wrap gap-2">
        {STUDIO_TOOLBAR_PRESETS.map((preset) => <button key={preset.id} type="button" className={action}
          onClick={() => change({ ...draft, visibleIds: [...preset.ids], configured: true, activeProfileId: null })}>{preset.name} 구성</button>)}

      </div>
      <StudioToolbarProfileManager value={draft} onChange={change} />
      <div className="mt-2 flex gap-2">
        <input aria-label="새 도구 구성 이름" aria-invalid={Boolean(name.trim() && nameProblem) || undefined} aria-describedby={name.trim() && nameProblem ? `${id}-name-error` : undefined} value={name} maxLength={48} onChange={(event) => setName(event.currentTarget.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-3 text-sm" />
        <button type="button" className={action} disabled={Boolean(nameProblem) || (draft.profiles?.length ?? 0) >= 12}
          onClick={() => { if (nameProblem || (draft.profiles?.length ?? 0) >= 12) return; const profileId = crypto.randomUUID(); change({ ...draft, activeProfileId: profileId, profiles: [...(draft.profiles ?? []), { id: profileId, name: name.trim(), visibleIds: [...draft.visibleIds], view: draft.view ?? "single" }] }); setName(""); }}>구성 저장</button>
      </div>
      {name.trim() && nameProblem ? <p id={`${id}-name-error`} role="status" className="mt-2 text-xs text-warn">{nameProblem}</p> : null}
    </details>
    {draft.archivedIds?.length ? <p className="text-xs text-fg-2">이 버전에서 알 수 없는 도구 {draft.archivedIds.length}개의 설정은 보관했으며 실행하지 않습니다.</p> : null}
    <p role="status" aria-live="polite" className="text-xs text-fg-2">{announcement || (dirty ? "아직 적용하지 않은 구성입니다." : "이동 버튼 또는 Alt+방향키로 정렬할 수 있습니다.")}</p>
    {conflict ? <div role="alert" className="text-sm text-warn">다른 화면에서 구성이 바뀌었습니다. 최신 구성을 불러온 뒤 다시 편집하세요.
      <button type="button" className={action} onClick={() => { setDirty(false); setSelected([]); }}>최신 구성 불러오기</button>
    </div> : null}
    <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-panel py-3">
      <button type="button" className={action} onClick={onCancel}>취소</button>
      <button type="button" className={`${action} bg-accent-soft text-accent`} disabled={conflict}
        onClick={() => onApply({ ...draft, configured: true, version: 2 })}>구성 적용</button>
    </footer>
  </section>;
}
