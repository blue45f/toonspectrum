import {
  BookOpenText,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardCheck,
  FolderKanban,
  Handshake,
  LayoutDashboard,
  PanelTopOpen,
  Scale,
  Search,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonspectrum/core/production";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface CommandItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly href: string;
  readonly group: "화면" | "회차" | "작업";
  readonly icon: LucideIcon;
  readonly searchText: string;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

const SURFACE_ITEMS: readonly {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
}[] = [
  { id: "overview", label: "프로젝트 홈", description: "오늘 할 일과 막힌 작업", icon: LayoutDashboard },
  { id: "planning", label: "기획", description: "작품·시즌·장면 기준", icon: BookOpenText },
  { id: "episodes", label: "회차", description: "회차별 상태와 원고", icon: PanelTopOpen },
  { id: "production", label: "작업 보드", description: "담당자와 진행 상태", icon: Workflow },
  { id: "schedule", label: "일정", description: "마감과 작업량 확인", icon: CalendarClock },
  { id: "handoff", label: "작업 넘기기", description: "꼭 지킬 내용과 질문", icon: Handshake },
  { id: "review", label: "검수·수정", description: "수정 요청과 승인", icon: ClipboardCheck },
  { id: "procurement", label: "외주·발주", description: "의뢰 범위와 납품", icon: BriefcaseBusiness },
  { id: "rights", label: "계약·정산", description: "권리·크레딧·보상", icon: Scale },
  { id: "settings", label: "팀 설정", description: "참여자와 역할", icon: Users },
];

export function ProductionCommandPalette({
  aggregate,
  className,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly className?: string;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const items = useMemo<readonly CommandItem[]>(() => {
    const base = `/production/projects/${encodeURIComponent(aggregate.projectId)}`;
    const surfaces = SURFACE_ITEMS.map((item) => ({
      ...item,
      href: `${base}/${item.id}`,
      group: "화면" as const,
      searchText: `${item.label} ${item.description} ${item.id}`,
    }));
    const episodes = aggregate.episodes.map((episode) => ({
      id: `episode:${episode.episodeId}`,
      label: `${episode.episodeId} 공동 작업실`,
      description: `${episode.state} · 막힘 ${episode.openBlockerCount}`,
      href: `${base}/episodes/${encodeURIComponent(episode.episodeId)}`,
      group: "회차" as const,
      icon: PanelTopOpen,
      searchText: `${episode.episodeId} ${episode.state} 회차 에피소드`,
    }));
    const tasks = aggregate.tasks.slice(0, 20).map((task) => ({
      id: `task:${task.id}`,
      label: task.title,
      description: `${task.processKey} · ${task.status}`,
      href: `${base}/schedule?task=${encodeURIComponent(task.id)}`,
      group: "작업" as const,
      icon: FolderKanban,
      searchText: `${task.title} ${task.processKey} ${task.status} ${task.scope.id}`,
    }));
    return [...surfaces, ...episodes, ...tasks];
  }, [aggregate.episodes, aggregate.projectId, aggregate.tasks]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return items;
    return items.filter((item) => item.searchText.toLocaleLowerCase("ko-KR").includes(normalized));
  }, [items, query]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLocaleLowerCase("en-US") === "k") {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (event.key === "Escape") setOpen(false);
    };
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [activeIndex, filtered.length]);

  const choose = (item: CommandItem | undefined) => {
    if (!item) return;
    setOpen(false);
    void navigate(item.href);
  };

  return (
    <>
      <button
        type="button"
        className={cn(buttonClass({ variant: "outline", size: "sm" }), className)}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Search className="size-4" aria-hidden="true" />
        빠른 이동
        <kbd className="ml-1 rounded border border-line bg-raised px-1.5 py-0.5 text-[0.625rem] text-fg-3">⌘K</kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/45 px-3 pt-[10vh] backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="제작 관리 빠른 이동"
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 text-fg-3" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.min(filtered.length - 1, index + 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(0, index - 1));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    choose(filtered[activeIndex]);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setOpen(false);
                  }
                }}
                aria-label="제작 관리 메뉴, 회차, 작업 검색"
                aria-controls="production-command-results"
                aria-activedescendant={filtered[activeIndex] ? `production-command-${filtered[activeIndex].id}` : undefined}
                placeholder="화면, 회차, 작업을 검색하세요"
                className="min-h-14 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
              />
              <button type="button" className="text-xs font-semibold text-fg-3 hover:text-fg" onClick={() => setOpen(false)}>ESC</button>
            </div>
            <div id="production-command-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
              {filtered.map((item, index) => {
                const Icon = item.icon;
                const active = index === activeIndex;
                const showGroup = index === 0 || filtered[index - 1]?.group !== item.group;
                return (
                  <div key={item.id}>
                    {showGroup ? <p className="px-3 pb-1 pt-3 text-[0.625rem] font-black uppercase tracking-[0.14em] text-fg-3">{item.group}</p> : null}
                    <button
                      id={`production-command-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(item)}
                      className={cn(
                        "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none",
                        active ? "bg-accent-soft text-accent" : "text-fg hover:bg-raised",
                      )}
                    >
                      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-accent text-on-accent" : "bg-raised text-fg-2")}><Icon className="size-4" aria-hidden="true" /></div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.label}</p><p className={cn("mt-0.5 truncate text-[0.6875rem]", active ? "text-accent/80" : "text-fg-3")}>{item.description}</p></div>
                    </button>
                  </div>
                );
              })}
              {filtered.length === 0 ? <div className="p-8 text-center"><Settings className="mx-auto size-7 text-fg-3" aria-hidden="true" /><p className="mt-2 text-sm font-bold text-fg">검색 결과가 없습니다</p><p className="mt-1 text-xs text-fg-2">화면 이름, 회차 ID 또는 작업명을 입력하세요.</p></div> : null}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-panel px-4 py-2 text-[0.625rem] text-fg-3"><span>↑↓ 이동 · Enter 열기 · Esc 닫기</span><span>{aggregate.title}</span></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
