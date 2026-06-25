/**
 * 토스 미니앱의 창작 스튜디오(/create) — 웹(루트)의 Konva 컷툰 에디터(StudioPage)를 그대로 재사용한다.
 *
 * 메커니즘(WebComponentSample 과 동일 패턴):
 *   1) "@/src/domains/creator/StudioPage" 를 cross-app lazy import → 코드 복제 0(NO fork).
 *   2) StudioPage 는 react-router(useNavigate/useSearchParams)에 의존하므로 WebRouterHost(MemoryRouter)로 감싼다.
 *   3) Tailwind 유틸리티는 web-theme.css(@source ".../src/domains/creator")로 생성된다.
 *
 * 모바일/터치 적응:
 *   - StudioPage 는 lg(1024px) 미만에서 자체 모바일 레이아웃을 쓴다(양쪽 패널 → 바텀시트, 하단 도구막대,
 *     캔버스를 화면 폭에 꽉 채움). 토스 셸은 항상 좁은 뷰포트라 이 모바일 레이아웃이 그대로 활성화된다.
 *   - 에디터는 자체 하단 도구막대(fixed bottom)를 가지므로, 토스 BottomNav 와 겹치지 않게 이 라우트는
 *     몰입형(BottomNav 숨김)으로 렌더한다(App.tsx 에서 분기). 대신 상단에 가벼운 뒤로가기 바를 둔다.
 *   - 가로 깨짐 방지: 에디터를 100dvw/100dvh 프레임에 가두고 overflow-x 를 차단한다.
 */
import { lazy, Suspense, useEffect } from 'react';

import { WebRouterHost } from '../web-router-host';
import { navigate } from '../router';
import { theme } from '../theme';

// 청크 해시가 바뀐 구세션에서 lazy import 가 404 로 깨지면 1회만 새로고침해 복구(웹 lazyRetry 와 동일 취지).
const StudioPage = lazy(() =>
  import('@/src/domains/creator/StudioPage')
    .then((m) => ({ default: m.StudioPage }))
    .catch((error) => {
      const key = 'toss-create-chunk-reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      }
      throw error;
    }),
);

/** 무거운 번들(konva·three·VRM)을 받는 동안 보여줄 브랜드 로딩 화면. */
function CreateLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: theme.bg,
        color: theme.text,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: `3px solid ${theme.accentSoft}`,
          borderTopColor: theme.accent,
          animation: 'create-spin 0.8s linear infinite',
        }}
      />
      <p style={{ margin: 0, fontSize: 14, color: theme.textMuted }}>창작 스튜디오를 불러오는 중…</p>
      <style>{`@keyframes create-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/** 상단 뒤로가기 바 — 몰입형 에디터에서 토스 홈/탐색으로 돌아가는 어포던스. */
function CreateTopBar() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 'calc(48px + env(safe-area-inset-top))',
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 8,
        paddingRight: 14,
        background: 'rgba(21,16,12,0.92)',
        backdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
      <button
        type="button"
        className="pressable"
        onClick={() => navigate('/explore')}
        aria-label="뒤로 가기"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 36,
          padding: '0 10px 0 6px',
          background: 'none',
          border: 'none',
          borderRadius: 10,
          color: theme.text,
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>‹</span>
        뒤로
      </button>
      <strong style={{ fontSize: 15, fontWeight: 800 }}>창작 스튜디오</strong>
    </header>
  );
}

export function CreatePage() {
  // 토스 셸의 index.css 는 body overscroll 을 막지만, 에디터는 캔버스 팬/줌에 자체 제스처를 쓰므로
  // 가로 스크롤(가로 깨짐)만 차단한다. 언마운트 시 원복.
  useEffect(() => {
    const prev = document.body.style.overflowX;
    document.body.style.overflowX = 'hidden';
    return () => {
      document.body.style.overflowX = prev;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        maxWidth: '100vw',
        overflowX: 'hidden',
        background: theme.bg,
      }}
    >
      <CreateTopBar />
      <Suspense fallback={<CreateLoading />}>
        {/* StudioPage 내부 네비게이션(예: 게시 후 /create/:id, 작품 상세)은 토스 해시 라우터로 위임된다. */}
        <WebRouterHost initialPath="/studio" basePaths={['/create', '/studio']}>
          <StudioPage />
        </WebRouterHost>
      </Suspense>
    </div>
  );
}

export default CreatePage;
