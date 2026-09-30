import { ChevronRight } from "lucide-react";
import { type ReactElement, type ReactNode } from "react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("AppBreadcrumb", ko, en);

export interface AppBreadcrumbItem {
  /** 한국어 라벨. */
  readonly ko: string;
  /** 영어 라벨. */
  readonly en: string;
  /** 현재 페이지가 아닌 상위 경로의 링크. 마지막 항목은 생략한다. */
  readonly href?: string;
}

interface AppBreadcrumbProps {
  readonly items: readonly AppBreadcrumbItem[];
  /** 스크린리더용 랜드마크 이름. */
  readonly ariaLabel?: string;
}

/**
 * 앱 공용 브레드크럼. 도메인 페이지마다 따로 만들지 않고 이 컴포넌트를 재사용한다.
 *
 * 라우트 그룹 파일에서 `withRouteBreadcrumb(trail, element)`으로 감싸면 도메인
 * 페이지를 수정하지 않고 2뎁스 이상 페이지에 시범 적용할 수 있다.
 */
export function AppBreadcrumb({ items, ariaLabel }: AppBreadcrumbProps) {
  useBilingualI18nRevision();
  if (items.length === 0) return null;
  return (
    <nav aria-label={ariaLabel ?? bi("현재 위치", "Breadcrumb")} className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[0.8125rem] leading-6">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const label = bi(item.ko, item.en);
          return (
            <li key={`${item.ko}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-fg-3" />
              ) : null}
              {isLast || !item.href ? (
                <span aria-current={isLast ? "page" : undefined} className={isLast ? "max-w-56 truncate font-semibold text-fg" : "text-fg-2"}>
                  {label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="inline-flex min-h-8 max-w-56 items-center truncate rounded-md px-1.5 text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * 라우트 그룹 파일에서 도메인 페이지를 수정하지 않고 브레드크럼을 얹는다.
 *
 * ```tsx
 * { id: "market-browse", path: "/market/browse",
 *   element: withRouteBreadcrumb(resolveBreadcrumbTrail("/market/browse"), <MarketBrowsePage />) },
 * ```
 */
// eslint-disable-next-line react-refresh/only-export-components -- route HOC is used alongside AppBreadcrumb in route definitions
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
