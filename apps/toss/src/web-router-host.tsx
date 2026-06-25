/**
 * 웹 feature 컴포넌트(react-router 의존)를 토스의 해시 라우터 앱 안에서 렌더하기 위한 어댑터.
 *
 * 웹의 /studio·/create 컴포넌트는 react-router-dom 의 useNavigate/useParams/useSearchParams/Link 와
 * 웹 호환 레이어(@/src/compat/router-link)를 직접 사용한다. 토스 앱은 자체적으로 window.location.hash
 * 기반 라우팅(src/router.ts)을 쓰므로 react-router 컨텍스트가 없다.
 *
 * 이 호스트는 격리된 MemoryRouter 를 제공해 (토스의 해시 라우팅과 충돌하지 않으면서) 웹 컴포넌트가
 * 정상 마운트되게 하고, MemoryRouter 안에서 일어난 네비게이션을 토스 라우터로 다리 놓아준다:
 *   - 토스가 소유한 경로(예: /title/…, /ranking)로 가려 하면 → 토스 navigate()로 위임(해시 변경)
 *   - 호스트가 담당하는 웹 경로(basePaths, 예: /create)면 → MemoryRouter 안에서 그대로 처리
 *
 * 사용 예 (페이지 에이전트):
 *   <WebRouterHost initialPath="/create/123" routePattern="/create/:id">
 *     <CreateSeriesPage />
 *   </WebRouterHost>
 * 또는 단순 마운트(라우트 파라미터가 필요 없으면 routePattern 생략):
 *   <WebRouterHost initialPath="/studio?work=123"><StudioPage /></WebRouterHost>
 */
import { type ReactNode, useEffect, useRef } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate as useRouterNavigate,
} from 'react-router-dom';

import { navigate as tossNavigate } from './router';

/** MemoryRouter 가 책임지는 웹 경로 prefix. 그 외 경로는 토스 해시 라우터로 위임한다. */
function isHostedPath(pathname: string, basePaths: readonly string[]): boolean {
  return basePaths.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/**
 * MemoryRouter 내부에서 위치 변화를 감지해, 호스트가 담당하지 않는 경로(토스 소유)로의 이동을
 * 토스 해시 라우터로 다리 놓는다. 첫 위치(initial)는 위임하지 않는다.
 */
function NavigationBridge({ basePaths }: { basePaths: readonly string[] }) {
  const location = useLocation();
  const navigate = useRouterNavigate();
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const { pathname, search, hash } = location;
    if (isHostedPath(pathname, basePaths)) return;
    // 호스트 밖 경로 → 토스 해시 라우터로 위임하고, MemoryRouter 는 호스트 루트로 되돌려
    // 스택이 토스 외부 경로로 오염되지 않게 한다.
    tossNavigate(`${pathname}${search}${hash}`);
    navigate(basePaths[0] ?? '/', { replace: true });
  }, [location, navigate, basePaths]);

  return null;
}

export interface WebRouterHostProps {
  children: ReactNode;
  /** MemoryRouter 의 초기 경로(쿼리 포함 가능). 예: "/create/123", "/studio?work=42". */
  initialPath?: string;
  /**
   * useParams 가 동작하도록 자식을 감쌀 Route 패턴. 예: "/create/:id".
   * 생략하면 자식을 catch-all("*") 로 마운트(파라미터 없는 단순 페이지·쿼리 기반 페이지용).
   */
  routePattern?: string;
  /** MemoryRouter 가 담당하는 경로 prefix 들. 이 밖으로 가는 네비게이션은 토스로 위임된다. */
  basePaths?: readonly string[];
}

export function WebRouterHost({
  children,
  initialPath = '/',
  routePattern,
  basePaths = ['/create', '/studio'],
}: WebRouterHostProps) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <NavigationBridge basePaths={basePaths} />
      {routePattern ? (
        <Routes>
          <Route path={routePattern} element={<>{children}</>} />
          {/* 패턴과 안 맞는 경로(브리지 처리 전 잠깐)에서도 자식을 유지해 깜빡임 방지 */}
          <Route path="*" element={<>{children}</>} />
        </Routes>
      ) : (
        children
      )}
    </MemoryRouter>
  );
}

export default WebRouterHost;
