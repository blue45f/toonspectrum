// 창작 스튜디오 키보드 단축키 도움말 — "?" 키 또는 단축키 버튼으로 토글.
// StudioPage 내부 상태에 의존하지 않는 자체완결 모달(open/onClose만 받음).
import { X } from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";
import { createPortal } from "react-dom";

interface ShortcutRow {
  keys: string;
  label: string;
}

interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

// 표시는 macOS ⌘ 기준 + Windows/Linux는 Ctrl로 읽으면 됨.
const GROUPS: ShortcutGroup[] = [
  {
    title: "드로잉",
    rows: [
      { keys: "B", label: "펜으로 전환" },
      { keys: "E", label: "펜·지우개 전환" },
      { keys: "[ · ]", label: "브러시 크기 ±1px" },
      { keys: "⇧ [ · ⇧ ]", label: "브러시 크기 ±5px" },
      { keys: "⌥ [ · ⌥ ]", label: "불투명도 ±5%" },
      { keys: "1–6", label: "최근 브러시 슬롯 호출" },
      { keys: "⇧ 1–6", label: "현재 브러시를 슬롯에 저장" },
      { keys: "⇧ + 드래그", label: "자유선 → 0°/45°/90° 직선" },
      { keys: "X", label: "주 색 ↔ 보조 색 교체" },
    ],
  },
  {
    title: "편집",
    rows: [
      { keys: "⌘Z", label: "실행취소" },
      { keys: "⌘⇧Z · ⌘Y", label: "다시실행" },
      { keys: "⌘D", label: "선택 요소 복제" },
      { keys: "⌘V", label: "클립보드 이미지 붙여넣기" },
      { keys: "G", label: "고급 채우기 켜기·끄기" },
      { keys: "Delete · ⌫", label: "선택 요소 삭제" },
      { keys: "Esc", label: "선택 해제" },
    ],
  },
  {
    title: "정렬 · 레이어",
    rows: [
      { keys: "⌘]", label: "맨 앞으로" },
      { keys: "⌘[", label: "맨 뒤로" },
      { keys: "방향키", label: "1px 이동" },
      { keys: "⇧ + 방향키", label: "10px 이동" },
    ],
  },
  {
    title: "보기",
    rows: [
      { keys: "⌘ +", label: "확대" },
      { keys: "⌘ −", label: "축소" },
      { keys: "⌘ 0", label: "100%로 맞춤" },
      { keys: "⌘ + 휠", label: "포인터 기준 확대/축소" },
      { keys: "Space + 드래그", label: "화면 이동(팬)" },
      { keys: "Tab", label: "캔버스만 / 도구 토글" },
      { keys: "H", label: "캔버스 좌우 반전 (보기)" },
      { keys: "?", label: "단축키 도움말" },
    ],
  },
];

export function StudioShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeFromEffect = useEffectEvent(onClose);

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
        aria-label="단축키 도움말 닫기"
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
          <p id="studio-shortcuts-title" className="text-sm font-bold text-fg">키보드 단축키</p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid size-11 place-items-center rounded-xl border border-line text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:size-9"
          >
            <X size={14} />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-1.5 text-[0.66rem] font-semibold uppercase tracking-wide text-fg-3">{g.title}</p>
              <ul className="space-y-1">
                {g.rows.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-3 text-xs text-fg-2">
                    <span>{r.label}</span>
                    <kbd className="shrink-0 rounded-md border border-line bg-card px-1.5 py-0.5 font-mono text-[0.66rem] text-fg-3">
                      {r.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.62rem] leading-relaxed text-fg-3">
          Windows·Linux에서는 ⌘ 대신 Ctrl, ⌥ 대신 Alt를 사용하세요. 입력창·대화상자·검토 또는 협업 잠금 중에는 드로잉 단축키가 비활성화됩니다.
        </p>
      </div>
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
