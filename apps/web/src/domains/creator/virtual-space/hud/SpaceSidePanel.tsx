import { ChevronLeft, X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  isStudioVirtualSpaceHudTab,
  studioVirtualSpaceHudTabOf,
  type StudioVirtualSpaceHudTab,
  type StudioVirtualWorkspacePanel,
} from "../studio-virtual-space-panel-scope";
import { spaceKoParticle } from "./space-korean";
import { SPACE_HUD_PANEL_META, spaceHudTabs } from "./space-panel-meta";

/**
 * 우측 슬라이드 패널.
 * - 데스크톱(1024px 이상): <aside> 비모달. 월드 이동을 막지 않는다.
 * - 그보다 좁으면: <dialog> 모달 바텀시트.
 * keepAlive 영역은 패널이 닫혀 있어도 마운트된 채 숨긴다.
 * (대화 런처처럼 이벤트를 계속 받아야 하거나, 저장 전 꾸미기 초안처럼 잃으면 안 되는 내용)
 */
export interface SpaceSidePanelKeepAlive {
  readonly id: string;
  /** 지금 보여 줄지. 패널이 닫혀 있으면 어차피 보이지 않는다. */
  readonly visible: boolean;
  readonly node: ReactNode;
}

export function SpaceSidePanel({ id, panel, personal, desktop, onSelect, onClose, children, keepAlive = [] }: {
  readonly id: string;
  readonly panel: StudioVirtualWorkspacePanel | null;
  readonly personal: boolean;
  readonly desktop: boolean;
  readonly onSelect: (panel: StudioVirtualWorkspacePanel) => void;
  readonly onClose: () => void;
  /** 현재 화면의 내용. panel이 null이면 그리지 않는다. */
  readonly children: ReactNode;
  /** 닫혀 있어도 유지해야 하는 내용. */
  readonly keepAlive?: readonly SpaceSidePanelKeepAlive[];
}) {
  const bt = useBilingual("SpaceSidePanel");
  const headingId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<StudioVirtualSpaceHudTab, HTMLButtonElement>());
  const open = panel !== null;
  const tabs = spaceHudTabs(personal);
  const activeTab = panel ? studioVirtualSpaceHudTabOf(panel) : null;
  const detail = panel && !isStudioVirtualSpaceHudTab(panel) ? panel : null;
  const meta = panel ? SPACE_HUD_PANEL_META[panel] : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (desktop || !dialog) return undefined;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
    return undefined;
  }, [desktop, open]);

  // Esc는 패널 안에서 먼저 처리해 HUD 전역 단축키가 다른 창까지 닫지 않게 한다.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const element = desktop ? asideRef.current : dialogRef.current;
    if (!open || !element) return undefined;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    element.addEventListener("keydown", onEscape);
    return () => element.removeEventListener("keydown", onEscape);
  }, [desktop, open]);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: StudioVirtualSpaceHudTab) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    event.stopPropagation();
    const index = tabs.indexOf(tab);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (!next) return;
    onSelect(next);
    tabRefs.current.get(next)?.focus();
  };

  const body = <>
    <header className="space-side-panel__header">
      {!desktop ? <span className="space-sheet__grip" aria-hidden /> : null}
      {detail && activeTab ? <button type="button" className="space-icon-button" onClick={() => onSelect(activeTab)}
        aria-label={bt(`${spaceKoParticle(SPACE_HUD_PANEL_META[activeTab].titleKo, "으로")} 돌아가기`, `Back to ${SPACE_HUD_PANEL_META[activeTab].titleEn}`)}>
        <ChevronLeft size={18} aria-hidden />
      </button> : null}
      <h2 id={headingId}>{meta ? bt(meta.titleKo, meta.titleEn) : bt("패널", "Panel")}</h2>
      <button type="button" className="space-icon-button" onClick={onClose} aria-label={bt("패널 닫기", "Close panel")}>
        <X size={18} aria-hidden />
      </button>
    </header>
    <div className="space-side-panel__tabs" role="tablist" aria-label={bt("패널 탭", "Panel tabs")}>
      {tabs.map((tab) => {
        const tabMeta = SPACE_HUD_PANEL_META[tab];
        const Icon = tabMeta.icon;
        const selected = activeTab === tab;
        return <button key={tab} ref={(node) => { if (node) tabRefs.current.set(tab, node); else tabRefs.current.delete(tab); }}
          type="button" role="tab" id={`${id}-tab-${tab}`} aria-selected={selected} aria-controls={`${id}-body`}
          tabIndex={selected || (!activeTab && tab === tabs[0]) ? 0 : -1} data-tab={tab}
          onClick={() => { if (panel !== tab) onSelect(tab); }} onKeyDown={(event) => onTabKeyDown(event, tab)}>
          <Icon size={17} aria-hidden /><span>{bt(tabMeta.shortKo, tabMeta.shortEn)}</span>
        </button>;
      })}
    </div>
    <div id={`${id}-body`} className="space-side-panel__body" role="tabpanel"
      aria-labelledby={activeTab ? `${id}-tab-${activeTab}` : headingId} data-panel={panel ?? undefined}>
      {open ? children : null}
      {keepAlive.map((item) => <div key={item.id} className="space-side-panel__keep" data-keep={item.id} hidden={!open || !item.visible}>{item.node}</div>)}
    </div>
  </>;

  if (desktop) {
    return <aside ref={asideRef} id={id} className="space-side-panel" aria-labelledby={headingId} hidden={!open}
      data-space-interactive="true" data-panel={panel ?? undefined}>
      {body}
    </aside>;
  }
  return <dialog ref={dialogRef} id={id} className="space-side-panel space-side-panel--sheet" aria-labelledby={headingId}
    data-space-interactive="true" data-panel={panel ?? undefined}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    {body}
  </dialog>;
}
