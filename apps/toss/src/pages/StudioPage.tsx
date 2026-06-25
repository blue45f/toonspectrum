/**
 * /studio — 3D VRM 포저(웹 feature 컴포넌트 재사용).
 *
 * 웹(레포 루트)의 src/domains/creator/StudioVrmPoser 를 그대로 마운트한다(NO 복제 — WebComponentSample
 * 과 동일한 cross-app import 메커니즘). 포저는 자체적으로 `fixed inset-0 z-50` 전체화면 모달이고
 * react-router 컨텍스트를 쓰지 않으므로, 토스 해시 라우터 위에 그대로 얹을 수 있다.
 *
 *  - 코드 분할: StudioVrmPoser 는 three/@react-three/@pixiv/three-vrm/@mediapipe 등 무거운 의존을
 *    끌고 오므로 dynamic import(lazy)로 메인 번들에서 분리한다 — /studio 진입 시에만 로드.
 *  - 모바일: 포저 자체가 grid-cols-1(모바일) → lg:grid-cols-[1fr_360px] 반응형 + sm: 브레이크포인트로
 *    설계돼 있어 토스 WebView 뷰포트를 가득 채우고 가로 깨짐이 없다. 추가 셸은 로딩/폴백만 담당.
 *  - 웹캠 모션 트래킹: navigator.mediaDevices.getUserMedia 는 '트래킹 시작' 명시 클릭 시에만 호출되고,
 *    토스 WebView 가 카메라를 거부하면 포저가 안내 메시지를 보이며 수동 포즈 편집은 그대로 동작한다
 *    (graceful degradation — 별도 가드 불필요).
 *  - 닫기: 포저의 onClose(헤더 X·Esc)는 토스 놀이터(/play)로 돌아간다.
 *  - 내보내기: onInsert(투명 PNG dataURL)는 토스 단독 컨텍스트에선 파일로 저장(다운로드)한다.
 */
import { lazy, Suspense, useState } from 'react';

import { navigate } from '../router';
import { theme } from '../theme';

// three/@react-three/@mediapipe 등 무거운 의존을 메인 번들에서 분리(/studio 진입 시 로드).
const StudioVrmPoser = lazy(() =>
  import('@/src/domains/creator/StudioVrmPoser').then((m) => ({ default: m.StudioVrmPoser })),
);

/** 로딩 스피너 — 포저 청크(3D 런타임) 다운로드/평가 중 표시. */
function PoserLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        background: theme.bg,
        color: theme.text,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: `3px solid ${theme.accentSoft}`,
          borderTopColor: theme.accent,
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <strong style={{ fontSize: 16 }}>3D 스튜디오를 불러오는 중…</strong>
      <p style={{ margin: 0, fontSize: 13, color: theme.textMuted }}>
        3D 모델·포즈 엔진을 준비하고 있어요. 잠시만 기다려 주세요.
      </p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/**
 * 토스 단독 컨텍스트의 PNG 내보내기. 웹에선 캔버스 패널에 삽입되지만, 토스 /studio 는 포저만
 * 단독 노출하므로 투명 PNG 를 파일로 저장한다(WebView 다운로드). 저장 후 짧은 토스트로 안내.
 */
function downloadPng(dataUrl: string): void {
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `toonspectrum-character-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error('[toonspectrum] studio PNG 저장 실패', err);
  }
}

export function StudioPage() {
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      <Suspense fallback={<PoserLoading />}>
        <StudioVrmPoser
          open
          onClose={() => navigate('/play')}
          onInsert={(src) => {
            downloadPng(src);
            setToast('투명 PNG로 저장했어요. 사진첩/다운로드에서 확인하세요.');
            window.setTimeout(() => setToast(null), 3200);
          }}
        />
      </Suspense>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(24px + env(safe-area-inset-bottom))',
            transform: 'translateX(-50%)',
            zIndex: 60,
            maxWidth: 'min(92vw, 420px)',
            padding: '12px 18px',
            borderRadius: 999,
            background: 'rgba(21,16,12,0.96)',
            border: `1px solid ${theme.border}`,
            color: theme.text,
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          }}
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}

export default StudioPage;
