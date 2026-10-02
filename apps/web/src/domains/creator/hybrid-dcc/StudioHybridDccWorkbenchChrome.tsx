/**
 * 정밀 3D 모델링 작업대의 표시 조각: 작업 모드 탭, 추천 도구 타일, 전문가 도구 묶음.
 *
 * 상태와 커널 호출은 `StudioHybridDccPanel`이 소유하고, 여기서는 쉬운 이름·짧은 설명·
 * 잠금 이유를 일관된 모양으로 보여 주기만 한다. 오브젝트가 없어서 쓸 수 없는 도구는
 * 카드마다 경고를 반복하지 않고 "오브젝트를 고르면 켜짐" 묶음 한 곳에 모은다.
 */
import { ChevronDown, MousePointerClick } from "lucide-react";

import type { StudioDccWorkbenchMode } from "../studio-workspace-route";
import { WORKBENCH_MODES } from "./studio-hybrid-dcc-workbench-modes";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export interface StudioHybridDccModeTabsProps {
  readonly mode: StudioDccWorkbenchMode;
  readonly onChange: (mode: StudioDccWorkbenchMode) => void;
}

/** 여섯 작업 모드. 아이콘 + 이름 + 쉬운 설명을 함께 보여 주고, 좁은 화면에서는 가로로 넘긴다. */
export function StudioHybridDccModeTabs({ mode, onChange }: StudioHybridDccModeTabsProps) {
  const bt = useBilingual("StudioHybridDccWorkbench");
  return (
    <nav
      aria-label={bt("작업 모드", "Work modes")}
      className="min-w-0 max-w-full flex-1"
      data-studio-hybrid-dcc-mode-tabs="true"
    >
      <div className="flex snap-x gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1 [scrollbar-width:thin]">
        {WORKBENCH_MODES.map((spec) => {
          const Icon = spec.icon;
          const active = spec.id === mode;
          return (
            <button
              key={spec.id}
              type="button"
              aria-pressed={active}
              data-studio-hybrid-dcc-mode={spec.id}
              onClick={() => onChange(spec.id)}
              className={cn(
                "flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors motion-reduce:transition-none",
                active
                  ? "bg-accent text-on-accent shadow-sm"
                  : "text-fg-2 hover:bg-raised hover:text-fg",
                FOCUS_RING,
              )}
            >
              <Icon size={16} aria-hidden="true" className="shrink-0" />
              <span className="flex flex-col leading-tight">
                <span className="whitespace-nowrap text-sm font-semibold">{bt(spec.label[0], spec.label[1])}</span>
                <span
                  className={cn(
                    "whitespace-nowrap text-[0.6875rem] max-md:hidden",
                    active ? "text-on-accent/85" : "text-fg-3",
                  )}
                >
                  {bt(spec.hint[0], spec.hint[1])}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export interface StudioHybridDccQuickTool {
  /** 같은 모드 안에서 고유하고 언어와 무관한 식별자(업계 용어). 화면에도 작은 글씨로 보인다. */
  readonly technical: string;
  readonly label: string;
  readonly description: string;
  readonly requiresAsset?: boolean;
  readonly disabled?: boolean;
  readonly primary?: boolean;
  readonly onClick: () => void;
}

export interface StudioHybridDccToolTilesProps {
  readonly mode: StudioDccWorkbenchMode;
  readonly tools: readonly StudioHybridDccQuickTool[];
  readonly busy: boolean;
  readonly hasActiveAsset: boolean;
}

function ToolTile({
  tool,
  disabled,
}: {
  readonly tool: StudioHybridDccQuickTool;
  readonly disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={tool.onClick}
      data-studio-hybrid-dcc-tool={tool.technical}
      className={cn(
        "flex min-h-[4.75rem] min-w-0 flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-colors motion-reduce:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-55",
        tool.primary
          ? "border-accent/55 bg-accent-soft hover:bg-accent/15"
          : "border-line bg-card hover:border-accent/40 hover:bg-raised",
        FOCUS_RING,
      )}
    >
      <span
        className={cn(
          "text-sm font-semibold leading-snug [word-break:keep-all]",
          tool.primary ? "text-accent" : "text-fg",
        )}
      >
        {tool.label}
      </span>
      {/* 파일 형식 나열(GLB·OBJ·FBX…)은 한 낱말로 취급돼 좁은 카드 밖으로 넘칠 수 있어, 넘칠 때만 줄을 바꾼다. */}
      <span className="max-w-full text-xs leading-snug text-fg-2 [overflow-wrap:anywhere] [word-break:keep-all]">
        {tool.description}
      </span>
      <span className="mt-auto max-w-full truncate pt-0.5 text-[0.6875rem] tracking-wide text-fg-3">
        {tool.technical}
      </span>
    </button>
  );
}

/**
 * 추천 도구. 지금 누를 수 있는 도구를 먼저 보여 주고, 오브젝트가 있어야 하는 도구는
 * 이유 한 줄과 함께 따로 모은다(비활성 카드마다 경고를 반복하던 화면을 대신한다).
 */
export function StudioHybridDccToolTiles({ mode, tools, busy, hasActiveAsset }: StudioHybridDccToolTilesProps) {
  const bt = useBilingual("StudioHybridDccWorkbench");
  const ready = tools.filter((tool) => !tool.requiresAsset || hasActiveAsset);
  const locked = tools.filter((tool) => tool.requiresAsset && !hasActiveAsset);
  const gridClass = "grid grid-cols-[repeat(auto-fill,minmax(9.25rem,1fr))] gap-2";
  return (
    <div className="mt-3 space-y-3">
      {ready.length > 0 ? (
        <div className={gridClass} aria-label={bt("추천 3D 도구", "Suggested 3D tools")}>
          {ready.map((tool) => (
            <ToolTile key={`${mode}:${tool.technical}`} tool={tool} disabled={busy || Boolean(tool.disabled)} />
          ))}
        </div>
      ) : null}
      {locked.length > 0 ? (
        <div
          className="rounded-xl border border-dashed border-line-strong p-2.5"
          data-studio-hybrid-dcc-locked-tools="true"
        >
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            <MousePointerClick size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
            <span>
              {formatI18nTemplate(
                bt(
                  "오브젝트를 만들거나 3D 화면에서 선택하면 켜지는 도구 {v0}개",
                  "{v0} tools turn on once you create or select an object in the 3D view",
                ),
                { v0: locked.length },
              )}
            </span>
          </p>
          <div className={cn(gridClass, "mt-2")}>
            {locked.map((tool) => (
              <ToolTile key={`${mode}:${tool.technical}`} tool={tool} disabled />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface StudioHybridDccExpertTool {
  /** 업계 용어 이름. 전문가 도구의 주 이름이자 작업 기록에 남는 이름이다. */
  readonly name: string;
  /** 무엇을 하는지 한국어(또는 현재 언어)로 짧게. */
  readonly hint: string;
  readonly onClick: () => void;
  readonly requiresAsset?: boolean;
  readonly disabled?: boolean;
  readonly action?: string;
  readonly emphasis?: boolean;
}

export interface StudioHybridDccExpertToolGroup {
  readonly id: string;
  readonly title: string;
  readonly tools: readonly StudioHybridDccExpertTool[];
}

export interface StudioHybridDccExpertToolsProps {
  readonly groups: readonly StudioHybridDccExpertToolGroup[];
  readonly busy: boolean;
  readonly hasActiveAsset: boolean;
}

/** 엔진의 모든 도구. 업계 용어를 아는 사람을 위해 접어 두고, 펼치면 분류별로 이름과 쉬운 설명을 함께 보인다. */
export function StudioHybridDccExpertTools({ groups, busy, hasActiveAsset }: StudioHybridDccExpertToolsProps) {
  const bt = useBilingual("StudioHybridDccWorkbench");
  const total = groups.reduce((count, group) => count + group.tools.length, 0);
  return (
    <details className="group rounded-2xl border border-line bg-panel" data-studio-hybrid-dcc-expert-tools="true">
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-fg-2 [&::-webkit-details-marker]:hidden",
          FOCUS_RING,
        )}
      >
        <span className="min-w-0 [word-break:keep-all]">
          {bt("전문가용 전체 도구", "All expert tools")}
          <span className="ml-2 text-xs font-normal text-fg-3">
            {formatI18nTemplate(
              bt("{v0}개 · Blender·CAD 용어를 아는 분을 위한 목록", "{v0} tools · for people who know Blender and CAD terms"),
              { v0: total },
            )}
          </span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="grid gap-3 border-t border-line p-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <section key={group.id} aria-label={group.title} className="min-w-0 rounded-xl border border-line/70 bg-canvas/30 p-2.5">
            <h3 className="px-0.5 text-xs font-bold text-fg-2">{group.title}</h3>
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-1.5">
              {group.tools.map((tool) => (
                <button
                  key={tool.name}
                  type="button"
                  disabled={busy || Boolean(tool.disabled) || (Boolean(tool.requiresAsset) && !hasActiveAsset)}
                  data-studio-hybrid-dcc-action={tool.action}
                  onClick={tool.onClick}
                  className={cn(
                    "flex min-h-11 min-w-0 flex-col items-start justify-center rounded-lg border px-2.5 py-1.5 text-left transition-colors motion-reduce:transition-none",
                    "disabled:cursor-not-allowed disabled:opacity-45",
                    tool.emphasis
                      ? "border-accent/60 bg-accent text-on-accent hover:bg-accent-2"
                      : "border-line bg-card text-fg hover:bg-raised",
                    FOCUS_RING,
                  )}
                >
                  <span className="max-w-full truncate text-xs font-semibold">{tool.name}</span>
                  <span
                    className={cn(
                      "max-w-full text-[0.6875rem] leading-snug [word-break:keep-all]",
                      tool.emphasis ? "text-on-accent/85" : "text-fg-3",
                    )}
                  >
                    {tool.hint}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}
