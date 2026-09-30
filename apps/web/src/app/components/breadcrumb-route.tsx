import { type ReactElement, type ReactNode } from "react";

import { AppBreadcrumb, type AppBreadcrumbItem } from "./breadcrumb";

/**
 * 라우트 그룹 파일에서 도메인 페이지를 수정하지 않고 브레드크럼을 얹는다.
 *
 * ```tsx
 * { id: "market-browse", path: "/market/browse",
 *   element: withRouteBreadcrumb(resolveBreadcrumbTrail("/market/browse"), <MarketBrowsePage />) },
 * ```
 */
export function withRouteBreadcrumb(
  trail: readonly AppBreadcrumbItem[],
  element: ReactNode,
): ReactElement {
  if (trail.length === 0) return <>{element}</>;
  return (
    <>
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-4 sm:px-6">
        <AppBreadcrumb items={trail} />
      </div>
      {element}
    </>
  );
}
