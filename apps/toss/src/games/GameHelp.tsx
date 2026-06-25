// 놀이터 게임 공용 "게임 방법" 안내 — 첫 진입 시 규칙 오버레이를 띄우고(게임별 1회),
// 작은 "방법" 칩 버튼으로 언제든 다시 열 수 있게 한다. 게임별로 id+title+steps만 주입.
// 웹 레퍼런스(src/domains/play/GameHelp.tsx)의 API를 그대로 미러링 — 헬프 카피 이식 가능.

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '../tds-shim';
import { theme } from '../theme';

export interface HelpStep {
  /** 앞에 붙는 이모지(예: "🎯"). */
  emoji: string;
  /** 단계 제목(예: "목표"). */
  title: string;
  /** 설명(강조는 <b>/<span> 등 ReactNode 허용). */
  desc: ReactNode;
}

/** 게임별 1회만 자동으로 열렸는지 — localStorage 실패 시 조용히 false. */
function seenBefore(id: string): boolean {
  try {
    return localStorage.getItem(`play:help-seen:${id}`) === '1';
  } catch {
    return false;
  }
}

function markSeen(id: string): void {
  try {
    localStorage.setItem(`play:help-seen:${id}`, '1');
  } catch {
    // 비공개 모드 등 — 조용히 무시.
  }
}

/**
 * 자체적으로 "방법" 칩 버튼 + 규칙 오버레이를 렌더한다(여는 상태 직접 관리).
 * 게임 헤더 어딘가에 `<GameHelp id=... title=... steps=... />` 한 줄만 두면 됨.
 * 같은 게임(id)에서는 최초 1회만 자동으로 열린다.
 */
export function GameHelp({
  id,
  title,
  steps,
}: {
  id: string;
  title: string;
  steps: HelpStep[];
}) {
  const [open, setOpen] = useState(() => !seenBefore(id));
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  // 처음 열렸으면 본 것으로 표시(다음 진입부터는 자동으로 열리지 않음).
  useEffect(() => {
    if (open) markSeen(id);
  }, [open, id]);

  // 열리면 기본 버튼에 포커스 + Esc로 닫기(표준 모달 a11y).
  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="pressable"
        onClick={() => setOpen(true)}
        aria-label="게임 방법 보기"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 26,
          padding: '0 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          border: `1px solid ${theme.border}`,
          background: 'transparent',
          color: theme.textMuted,
        }}
      >
        <span aria-hidden>❔</span> 방법
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'grid', placeItems: 'center', padding: 16 }}>
          {/* 백드롭(클릭/Enter/Space로 닫힘 — 실제 button이라 a11y 충족) */}
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(false)}
            style={{ position: 'absolute', inset: 0, cursor: 'default', border: 'none', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${title} 게임 방법`}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 360,
              borderRadius: 20,
              border: `1px solid ${theme.border}`,
              background: theme.surface,
              padding: 20,
              boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
            }}
          >
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 12px', fontSize: 16, fontWeight: 800, color: theme.text }}>
              <span aria-hidden style={{ color: theme.accent }}>❔</span> {title} — 이렇게 해요
            </h3>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0, padding: 0, listStyle: 'none', fontSize: 13, lineHeight: 1.6, color: theme.textMuted }}>
              {steps.map((s) => (
                <li key={s.title}>
                  <b style={{ color: theme.text }}>
                    {s.emoji} {s.title}
                  </b>{' '}
                  — {s.desc}
                </li>
              ))}
            </ul>
            <Button ref={primaryRef} onClick={() => setOpen(false)} style={{ width: '100%', marginTop: 16 }}>
              알겠어요, 시작!
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export default GameHelp;
