import { FolderKanban, Handshake, MousePointerClick, Rocket } from "lucide-react";

import { ProductIntentStart } from "@/domains/creator-resources/ProductIntentStart";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { HeroBlock } from "@/shared/components/layout";
import { cx } from "@/shared/lib/cx";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n";
import { useTheme } from "@/shared/lib/theme";
import { usePathname } from "@/shared/navigation/navigation";

// 홈 래퍼 스타일(studio-introduction) → 여백 리듬(creator-home-spacing) → 시작 선택기(intent-start) → 작업실 둘러보기 층(studio-tour) 순서로 덮는다.
import "./studio-introduction.css";
import "./creator-home-spacing.css";
import "./intent-start.css";
import "./studio-tour.css";

import { AboutJourneyPager, IntroPrimaryLink, IntroSecondaryLink } from "./public/intro-primitives";
import { IntroTabs, type IntroTab } from "./public/intro-tabs";
import { ComicIntroHost } from "./comic-intro/ComicIntroHost";
import { ReferenceCreatorDashboard } from "./ReferenceCreatorDashboard";
import { StudioAnnotatedTour } from "./StudioAnnotatedTour";
import { StudioSupportLinks } from "./StudioSupportLinks";
import { STUDIO_TOUR_ANCHORS, type StudioTourTab } from "./studio-tour-content";
import { useCreatorHomeSectionNavigation } from "./use-creator-home-section-navigation";

const SCOPE = "domains.marketing.CreatorHomeExperience";

/**
 * 공개 홈(/)은 참고 보드형 대시보드, /about/studio는 눌러서 보는 작업실 둘러보기.
 * 둘러보기는 '화면 구성(주석 달린 예시 편집기) · 바로 시작 · 재료·협업·도움' 세 탭으로 나눠
 * 한 번에 한 묶음만 보여 준다. 핵심 기능·제작 과정·제품 원칙은 각자의 소개 페이지가 소유한다.
 */
export function CreatorHomeExperience() {
  useCreatorHomeSectionNavigation();
  const pathname = usePathname().replace(/\/+$/u, "").toLowerCase();
  const introduction = pathname === "/about/studio";
  const language = useI18n((state) => state.lang);
  const resolvedTheme = useTheme((state) => state.resolvedTheme);
  const bi = useBilingualLocalizer(SCOPE);

  const tabs: readonly IntroTab<StudioTourTab>[] = [
    { id: "map", label: bi("화면 구성", "Screen tour"), icon: MousePointerClick },
    { id: "start", label: bi("바로 시작", "Start here"), icon: Rocket },
    { id: "support", label: bi("재료·협업·도움", "Assets & help"), icon: Handshake },
  ];

  return (
    <div
      // 둘러보기는 Tailwind 부품으로 그려서, 요소 규칙(h2 크기·p 여백 초기화)을 거는 옛 .creator-experience·.creator-flagship 래퍼를 쓰지 않는다.
      className={cx("creator-home", !introduction && "creator-experience creator-flagship")}
      data-creator-home="production-first"
      data-creator-experience="all-in-one-studio-v3"
      data-theme-art={resolvedTheme}
      data-product-direction="planning-to-publishing"
      data-home-view={introduction ? "introduction" : "dashboard"}
      lang={language}
    >
      {!introduction && <ReferenceCreatorDashboard />}
      {introduction && <PageEntrance variant="rise"><>
        <div className="cf-hero cf-shell">
          <HeroBlock
            eyebrow="STUDIO TOUR"
            titleId="creator-hero-title"
            title={bi("작업실을 눌러서 둘러보세요.", "Tap around the studio.")}
            lede={bi("번호를 누르면 화면 영역마다 하는 일과, 바로 열 수 있는 작업공간을 보여 드려요.", "Tap a number to see what each part does and open the matching workspace.")}
            actions={(
              <>
                <IntroPrimaryLink href="/studio/new">{bi("새 작품 시작하기", "Start a new work")}</IntroPrimaryLink>
                <IntroSecondaryLink href="/studio" icon={FolderKanban}>{bi("내 프로젝트 열기", "Open my projects")}</IntroSecondaryLink>
              </>
            )}
          />
        </div>

        <IntroTabs
          tabs={tabs}
          fallback="map"
          label={bi("작업실 둘러보기", "Studio tour")}
          idPrefix="studio-tour"
          param="tab"
          anchors={STUDIO_TOUR_ANCHORS}
          mount="visited"
          tabsClassName="cf-shell mt-4"
          panelClassName="mt-4"
        >
          {(id) => id === "start" ? (
            <div id="creator-start" className="cf-shell cf-home-wayfinding">
              <ProductIntentStart headingId="creator-toolkit-title" />
            </div>
          ) : id === "map" ? (
            <section id="creator-bridge" className="cf-bridge cf-shell" aria-labelledby="creator-bridge-title">
              <h2 id="creator-bridge-title" tabIndex={-1} className="mb-3 text-base font-bold text-fg">
                {bi("작업실 화면 구성 · 번호를 눌러 보세요", "Studio screen tour · tap a number")}
              </h2>
              <StudioAnnotatedTour />
            </section>
          ) : (
            <section id="creator-support" className="cf-shell" aria-labelledby="creator-support-title">
              <h2 id="creator-support-title" tabIndex={-1} className="mb-3 text-base font-bold text-fg">
                {bi("작품 밖으로 나가지 않고, 찾고 배우고 함께 만드세요.", "Find, learn and collaborate without leaving the work.")}
              </h2>
              <StudioSupportLinks />
            </section>
          )}
        </IntroTabs>

        <div className="cf-shell cf-tour-end">
          <AboutJourneyPager current="/about/studio" />
        </div>
      </></PageEntrance>}
      {!introduction && <ComicIntroHost />}
    </div>
  );
}
