// 게임 결과 공유 — "결과 공유" 버튼 + 클립보드 폴백 토스트를 한 컴포넌트로 묶는다.
// 토스 네이티브 공유 → navigator.share → 클립보드 순(shareMessage)으로 폴백하고,
// 클립보드 복사가 일어난 경우에만 잠깐 토스트로 안내한다. 게임 결과 화면에 한 줄로 둔다.

import { useEffect, useState } from 'react';

import { shareMessage } from '../lib/toss';
import { Button } from '../tds-shim';
import { theme } from './../theme';

/** 미니앱 공유 URL(메시지 말미에 붙음 — 토스/웹 공유 시트에서 링크로 노출). */
export const SHARE_URL = 'https://toonspectrum.vercel.app';

export function ShareResult({ message, style }: { message: string; style?: React.CSSProperties }) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const x = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(x);
  }, [toast]);

  const onShare = async () => {
    const r = await shareMessage(`${message}\n${SHARE_URL}`);
    if (r === 'clipboard') setToast('클립보드에 복사했어요.');
  };

  return (
    <>
      <Button variant="weak" onClick={onShare} style={{ width: '100%', marginTop: 10, ...style }}>
        📣 결과 공유
      </Button>
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 'calc(28px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.82)',
            color: theme.text,
            padding: '10px 18px',
            borderRadius: 999,
            fontSize: 14,
            zIndex: 70,
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}

export default ShareResult;
