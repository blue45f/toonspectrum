// 창작 스튜디오 키보드 단축키 도움말 — "?" 키 또는 단축키 버튼으로 토글.
// StudioPage 내부 상태에 의존하지 않는 자체완결 모달(open/onClose만 받음).
import { X } from "lucide-react";
import { useEffect } from "react";

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
    title: "편집",
    rows: [
      { keys: "⌘Z", label: "실행취소" },
      { keys: "⌘⇧Z · ⌘Y", label: "다시실행" },
      { keys: "⌘D", label: "선택 요소 복제" },
      { keys: "⌘V", label: "클립보드 이미지 붙여넣기" },
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
    ],
  },
];

export function StudioShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Escape 로 닫기 (키보드 접근성) — open 일 때만 동작.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    // 클릭으로 닫히는 백드롭(presentational). 키보드 닫기는 Escape(위 useEffect)와 onKeyDown으로 제공한다.
    // 전체화면 백드롭을 포커스 가능한 위젯으로 만들면 UX가 나빠지므로 no-static-element-interactions 만 한정 비활성화.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-6"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {/* dialog 패널의 onClick은 백드롭으로의 클릭 전파만 막는 가드라 호출 동작이 없다. */}
      {/* 키보드 닫기는 Escape(useEffect)와 닫기 버튼으로 제공되므로 패널엔 키 리스너가 필요 없다. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-panel p-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="키보드 단축키"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-fg">키보드 단축키</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid size-7 place-items-center rounded-lg border border-line text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={14} />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title} className={g.title === "보기" ? "sm:col-span-2" : undefined}>
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
        <p className="mt-3 text-[0.6rem] leading-relaxed text-fg-4">Windows·Linux에서는 ⌘ 대신 Ctrl을 사용하세요. 입력창에 포커스가 있을 땐 단축키가 비활성화됩니다.</p>
      </div>
    </div>
  );
}
