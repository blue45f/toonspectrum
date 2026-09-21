import { Pin, PinOff, Search } from "lucide-react";
import { useId } from "react";
import { STUDIO_RAIL_TOOL_CATALOG, studioRailToolLabel, type StudioRailToolId } from "./studio-app-settings";
import { STUDIO_CHROME_RAIL_TOOL_GROUPS } from "./studio-chrome-ia-map";
import type { StudioRailToolButtonProps } from "./studio-chrome-ui";
import { matchesStudioRailToolQuery } from "./studio-rail-tool-search";
import { useT } from "@/shared/lib/i18n";

export function StudioAllToolsCatalog({ definitions, pinned, query, onQuery, onPin, onUsed }: {
  definitions: Record<StudioRailToolId, StudioRailToolButtonProps>;
  pinned: readonly StudioRailToolId[];
  query: string;
  onQuery: (value: string) => void;
  onPin: (id: StudioRailToolId, pinned: boolean) => void;
  onUsed: () => void;
}) {
  const t = useT();
  const rootId = useId();
  const matches = (id: StudioRailToolId) => matchesStudioRailToolQuery(id, query, t);
  return <div className="space-y-2">
    <label className="relative block"><Search size={16} aria-hidden className="absolute left-3 top-3.5 text-fg-2" />
      <input type="search" aria-label="전체 도구 검색" value={query}
        placeholder="이름 · 스포이드 · 3D · 단축키" onChange={(event) => onQuery(event.currentTarget.value.slice(0, 80))}
        className="min-h-11 w-full rounded-lg border border-line bg-card pl-9 pr-3 text-sm text-fg focus-visible:outline-accent" />
    </label>
    <p className="text-xs text-fg-2">이름을 눌러 사용하고, 핀 버튼으로 배치를 바꿉니다.</p>
    {STUDIO_CHROME_RAIL_TOOL_GROUPS.map((group) => {
      const ids = group.toolIds.filter(matches);
      if (!ids.length) return null;
      return <section key={group.id} aria-labelledby={`${rootId}-${group.id}`}>
        <h3 id={`${rootId}-${group.id}`} className="px-2 py-2 text-xs font-semibold text-fg-2">{group.labelKo}</h3>
        {ids.map((id) => {
          const definition = definitions[id];
          const Icon = definition.icon;
          const label = studioRailToolLabel(id, t);
          const isPinned = pinned.includes(id);
          const shortcut = STUDIO_RAIL_TOOL_CATALOG.find((item) => item.id === id)?.defaultShortcut;
          return <div key={id} className="flex items-start gap-1 rounded-lg hover:bg-raised">
            <button type="button" aria-label={`${label} 사용`} aria-disabled={definition.disabled || undefined}
              data-studio-catalog-tool-id={id} data-studio-hidden-tool-id={!isPinned ? id : undefined}
              aria-describedby={definition.disabled ? `${rootId}-${id}-reason` : undefined}
              onClick={(event) => { if (definition.disabled) return; definition.onClick?.(event); onUsed(); }}
              onFocus={definition.onFocus} onPointerEnter={definition.onPointerEnter}
              className="flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-3 text-left text-sm text-fg focus-visible:ring-2 focus-visible:ring-accent">
              <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1"><span className="block">{label}</span>
                {definition.disabled ? <span id={`${rootId}-${id}-reason`} className="mt-1 block text-xs leading-relaxed text-fg-2">{definition.unavailableReason ?? "선택 항목과 편집 권한을 확인하세요."}</span> : null}
              </span>
              {shortcut ? <kbd className="text-xs text-fg-2">{shortcut}</kbd> : null}
            </button>
            <button type="button" aria-label={`${label} ${isPinned ? "고정 해제" : "고정"}`} aria-pressed={isPinned}
              disabled={isPinned && pinned.length <= 1} onClick={() => onPin(id, !isPinned)}
              className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-2 hover:bg-card focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
              {isPinned ? <PinOff size={17} aria-hidden /> : <Pin size={17} aria-hidden />}
            </button>
          </div>;
        })}
      </section>;
    })}
    {!STUDIO_RAIL_TOOL_CATALOG.some(({ id }) => matches(id)) ? <p role="status" className="py-4 text-sm text-fg-2">일치하는 도구가 없습니다. 이름이나 단축키를 바꿔 검색하세요.</p> : null}
  </div>;
}
