import type { ReactNode } from "react";

import { SiteSectionTabs, SiteTabPanel, type SiteSectionTab } from "@/domains/legal/public/site-section-tabs";
import { useSiteTabAnchors, useSiteTabs } from "@/domains/legal/public/site-tabs";

/** 탭 하나의 정의(id·라벨·아이콘·배지). 사이트 공통 탭 부품의 타입을 소개 페이지 경계로 다시 내보낸다. */
export type IntroTab<T extends string> = SiteSectionTab<T>;

/** 앵커를 쓰지 않는 탭 묶음이 훅에 넘기는 빈 지도. 모듈 상수라 렌더마다 새로 만들어지지 않는다. */
const NO_ANCHORS: Readonly<Record<string, never>> = {};

/** 패널을 언제 DOM에 두는지. `active`는 보이는 패널만, `visited`는 한 번 연 패널을 숨겨 유지, `all`은 모든 패널(검색·인쇄용 정적 본문). */
export type IntroTabMount = "active" | "visited" | "all";

export interface IntroTabApi<T extends string> {
  readonly value: T;
  readonly select: (next: T) => void;
}

export interface IntroTabsProps<T extends string> {
  readonly tabs: readonly IntroTab<T>[];
  /** 처음 열리는 탭. */
  readonly fallback: T;
  /** 탭 목록의 접근 가능한 이름. */
  readonly label: string;
  /** 탭·패널 id 접두사 — 한 페이지에 탭 묶음이 둘 이상이어도 겹치지 않게 한다. */
  readonly idPrefix: string;
  /** 주소 `?param=id`로 탭을 공유한다(기본 탭은 주소에 남기지 않는다). 생략하면 화면 안에서만 기억한다. */
  readonly param?: string;
  /** 예전 섹션 앵커(`#id`) → 탭. 공유 링크가 막다른 길이 되지 않게 해당 탭을 열고 스크롤한다. */
  readonly anchors?: Readonly<Record<string, T>>;
  readonly mount?: IntroTabMount;
  readonly className?: string;
  readonly tabsClassName?: string;
  readonly panelClassName?: string;
  /** 탭 하나의 본문. 두 번째 인자로 '다음 단계' 같은 버튼이 탭을 바꿀 수 있다. */
  readonly children: (id: T, api: IntroTabApi<T>) => ReactNode;
}

/**
 * 소개·홍보 페이지의 '긴 세로 나열 → 탭' 공통 래퍼: 탭 상태(주소 공유)·앵커 열기·WAI-ARIA 탭을 한곳에서 묶는다.
 * 기능은 지우지 않고 한 번에 한 묶음만 보여 모바일 길이를 줄인다.
 */
export function IntroTabs<T extends string>({
  tabs,
  fallback,
  label,
  idPrefix,
  param,
  anchors,
  mount = "active",
  className,
  tabsClassName,
  panelClassName,
  children,
}: IntroTabsProps<T>) {
  const { value, select, isMounted } = useSiteTabs<T>({ ids: tabs.map((tab) => tab.id), fallback, param });
  useSiteTabAnchors(anchors ?? NO_ANCHORS, value, select);
  const api: IntroTabApi<T> = { value, select };

  return (
    <div className={className}>
      <SiteSectionTabs tabs={tabs} value={value} onChange={select} label={label} idPrefix={idPrefix} className={tabsClassName} />
      {tabs.map((tab) => {
        const active = tab.id === value;
        const mounted = active || mount === "all" || (mount === "visited" && isMounted(tab.id));
        return mounted ? (
          <SiteTabPanel key={tab.id} idPrefix={idPrefix} id={tab.id} active={active} className={panelClassName}>
            {children(tab.id, api)}
          </SiteTabPanel>
        ) : null;
      })}
    </div>
  );
}
