// 창작 스튜디오 키보드 단축키 도움말 — "?" 키 또는 단축키 버튼으로 토글.
// StudioPage 내부 상태에 의존하지 않는 자체완결 모달(open/onClose만 받음).
// optional `shortcuts` prop이 있으면 커스터마이즈된 코드를 formatStudioShortcutChord로 표시.
import { X } from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";
import { createPortal } from "react-dom";

import {
  formatStudioShortcutChord,
  type StudioShortcutActionId,
} from "./studio-app-settings";

import { useT } from "@/lib/i18n";


interface ShortcutRow {
  keys: string;
  keysKey?: string;
  labelKey: string;
  /** Single customizable action (replaces keys when remapped). */
  actionId?: StudioShortcutActionId;
  /** Multi-chord rows (e.g. brush smaller/larger). */
  actionIds?: readonly StudioShortcutActionId[];
}

interface ShortcutGroup {
  titleKey: string;
  rows: ShortcutRow[];
}

// 표시는 macOS ⌘ 기준 + Windows/Linux는 Ctrl로 읽으면 됨.
const GROUPS: ShortcutGroup[] = [
  {
    titleKey: "studio.shortcuts.group.drawing",
    rows: [
      { keys: "B", labelKey: "studio.shortcuts.row.drawing.pen", actionId: "tool-pen" },
      { keys: "E", labelKey: "studio.shortcuts.row.drawing.eraser", actionId: "tool-eraser" },
      {
        keys: "N · ⇧N",
        labelKey: "studio.shortcuts.row.drawing.blendWet",
        actionIds: ["tool-blend", "tool-wet-mix"],
      },
      { keys: "O", labelKey: "studio.shortcuts.row.drawing.dodgeBurn", actionId: "tool-dodge-burn" },
      {
        keys: "[ · ]",
        labelKey: "studio.shortcuts.row.drawing.brushSize",
        actionIds: ["brush-smaller", "brush-larger"],
      },
      { keys: "⇧ [ · ⇧ ]", labelKey: "studio.shortcuts.row.drawing.brushSizeStep" },
      { keys: "⌥ [ · ⌥ ]", labelKey: "studio.shortcuts.row.drawing.opacity" },
      { keys: "1–6", labelKey: "studio.shortcuts.row.drawing.recentBrushSlots" },
      { keys: "⇧ 1–6", labelKey: "studio.shortcuts.row.drawing.saveBrushSlot" },
      {
        keys: "⇧ + 드래그",
        keysKey: "studio.shortcuts.keys.shiftDrag",
        labelKey: "studio.shortcuts.row.drawing.straighten",
      },
      { keys: "X", labelKey: "studio.shortcuts.row.drawing.swapColors", actionId: "swap-colors" },
    ],
  },
  {
    titleKey: "studio.shortcuts.group.edit",
    rows: [
      { keys: "T", labelKey: "studio.shortcuts.row.edit.text", actionId: "tool-lettering" },
      { keys: "⌘ Enter", labelKey: "studio.shortcuts.row.edit.confirmBubble" },
      { keys: "⌘Z", labelKey: "studio.shortcuts.row.edit.undo", actionId: "undo" },
      { keys: "⌘⇧Z · ⌘Y", labelKey: "studio.shortcuts.row.edit.redo", actionId: "redo" },
      { keys: "⌘X · ⌘C", labelKey: "studio.shortcuts.row.edit.cutCopy" },
      { keys: "⌘V · ⌘⇧V", labelKey: "studio.shortcuts.row.edit.paste" },
      { keys: "⌘A", labelKey: "studio.shortcuts.row.edit.selectAll" },
      { keys: "⌘D", labelKey: "studio.shortcuts.row.edit.deselect", actionId: "deselect-pixels" },
      { keys: "⌘⇧I", labelKey: "studio.shortcuts.row.edit.invert", actionId: "invert-pixels" },
      { keys: "Q", labelKey: "studio.shortcuts.row.edit.quickMask" },
      { keys: "⌘J", labelKey: "studio.shortcuts.row.edit.duplicate" },
      { keys: "G", labelKey: "studio.shortcuts.row.edit.fill", actionId: "tool-fill" },
      { keys: "Delete · ⌫", labelKey: "studio.shortcuts.row.edit.delete" },
      { keys: "Esc", labelKey: "studio.shortcuts.row.edit.cancel" },
    ],
  },
  {
    titleKey: "studio.shortcuts.group.layers",
    rows: [
      { keys: "⌘] · ⌘⇧]", labelKey: "studio.shortcuts.row.layers.forward" },
      { keys: "⌘[ · ⌘⇧[", labelKey: "studio.shortcuts.row.layers.backward" },
      {
        keys: "방향키",
        keysKey: "studio.shortcuts.keys.arrowKeys",
        labelKey: "studio.shortcuts.row.layers.move1px",
      },
      {
        keys: "⇧ + 방향키",
        keysKey: "studio.shortcuts.keys.shiftArrowKeys",
        labelKey: "studio.shortcuts.row.layers.move10px",
      },
    ],
  },
  {
    titleKey: "studio.shortcuts.group.view",
    rows: [
      { keys: "⌘ +", labelKey: "studio.shortcuts.row.view.zoomIn" },
      { keys: "⌘ −", labelKey: "studio.shortcuts.row.view.zoomOut" },
      { keys: "⌘ 0", labelKey: "studio.shortcuts.row.view.zoomFit" },
      {
        keys: "⌘ + 휠",
        keysKey: "studio.shortcuts.keys.commandWheel",
        labelKey: "studio.shortcuts.row.view.zoomAtPointer",
      },
      {
        keys: "Space + 드래그",
        keysKey: "studio.shortcuts.keys.spaceDrag",
        labelKey: "studio.shortcuts.row.view.pan",
      },
      { keys: "`", labelKey: "studio.shortcuts.row.view.toggleCanvas", actionId: "toggle-chrome" },
      { keys: "H", labelKey: "studio.shortcuts.row.view.flipCanvas", actionId: "flip-canvas" },
      { keys: "?", labelKey: "studio.shortcuts.row.view.help", actionId: "shortcuts-help" },
    ],
  },
];

function displayKeysForRow(
  row: ShortcutRow,
  shortcuts: Partial<Record<StudioShortcutActionId, string>> | Record<string, string> | undefined
): string {
  if (!shortcuts) return row.keys;
  if (row.actionId) {
    if (!Object.prototype.hasOwnProperty.call(shortcuts, row.actionId)) return row.keys;
    const chord = shortcuts[row.actionId];
    if (typeof chord !== "string") return row.keys;
    return formatStudioShortcutChord(chord);
  }
  if (row.actionIds && row.actionIds.length > 0) {
    const parts = row.actionIds.map((id) => {
      if (!Object.prototype.hasOwnProperty.call(shortcuts, id)) return null;
      const chord = shortcuts[id];
      if (typeof chord !== "string") return null;
      return formatStudioShortcutChord(chord);
    });
    if (parts.every((p) => p !== null)) {
      return parts.join(" · ");
    }
  }
  return row.keys;
}

export function StudioShortcutsHelp({
  open,
  onClose,
  shortcuts,
}: {
  open: boolean;
  onClose: () => void;
  /** Optional app-settings shortcut map; remapped chords are shown via formatStudioShortcutChord. */
  shortcuts?: Partial<Record<StudioShortcutActionId, string>> | Record<string, string>;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeFromEffect = useEffectEvent(onClose);
  const t = useT();

  // 진짜 modal 계약: 포커스 진입·순환·복원, 배경 inert, 스크롤 잠금을 한 생명주기로 관리한다.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const overlay = overlayRef.current;
    const inertStates: Array<readonly [HTMLElement, boolean]> = [];
    for (const child of document.body.children) {
      if (!(child instanceof HTMLElement) || child === overlay) continue;
      inertStates.push([child, child.inert]);
      child.inert = true;
    }
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "?") {
        event.preventDefault();
        closeFromEffect();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? [])].filter((element) => !element.hidden && element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      for (const [element, wasInert] of inertStates) element.inert = wasInert;
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  const content = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-canvas/75 p-4 backdrop-blur-sm sm:p-6"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("studio.shortcuts.close")}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="relative z-10 max-h-[min(80vh,42rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-panel p-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-shortcuts-title"
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
      >
        <div className="mb-3 flex items-center justify-between">
          <p id="studio-shortcuts-title" className="text-sm font-bold text-fg">{t("studio.shortcuts.title")}</p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid size-11 place-items-center rounded-xl border border-line text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:size-9"
          >
            <X size={14} />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.titleKey}>
              <p className="mb-1.5 text-[0.66rem] font-semibold uppercase tracking-wide text-fg-3">
                {t(g.titleKey)}
              </p>
              <ul className="space-y-1">
                {g.rows.map((r) => (
                  <li key={r.labelKey} className="flex items-center justify-between gap-3 text-xs text-fg-2">
                    <span>{t(r.labelKey)}</span>
                    <kbd className="shrink-0 rounded-md border border-line bg-card px-1.5 py-0.5 font-mono text-[0.66rem] text-fg-3">
                      {r.keysKey && !r.actionId && !r.actionIds
                        ? t(r.keysKey)
                        : displayKeysForRow(r, shortcuts)}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.62rem] leading-relaxed text-fg-3">
          {t("studio.shortcuts.notice")}
        </p>
      </div>
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
