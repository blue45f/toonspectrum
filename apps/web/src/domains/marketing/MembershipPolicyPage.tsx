import { Coins, Database, ScrollText, UserRound } from "lucide-react";
import { useMemo } from "react";

import {
  ACTIVITY_POINT_POLICIES,
  MEMBERSHIP_ECONOMY_POLICY,
  MEMBERSHIP_PLAN_POLICIES,
} from "@toonstudio/core/membership-wallet";

import { Container } from "@/shared/components/container";
import { HeroBlock } from "@/shared/components/layout";
import { normalizeLocaleCode, useI18n, useT } from "@/shared/lib/i18n";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { useApp } from "@/shared/lib/store";
import { useDocumentTitle, useMetaDescription, usePageSocialMeta } from "@/shared/seo/use-document-title";

import { MembershipActivityPanel } from "./membership/MembershipActivityPanel";
import { MembershipMePanel } from "./membership/MembershipMePanel";
import { MembershipOpsPanel } from "./membership/MembershipOpsPanel";
import { MembershipPlanTable } from "./membership/MembershipPlanTable";
import { LoadingSkeleton, RetryNotice } from "./membership/MembershipStates";
import { COPY, TAB_COPY } from "./membership/membership-copy";
import { useMembershipData } from "./membership/use-membership-data";
import { IntroActions } from "./public/intro-primitives";
import { IntroTabs, type IntroTab } from "./public/intro-tabs";

/** 멤버십 정책의 네 묶음. '내 현황'은 로그인한 사람에게만 열린다. */
type MembershipTab = "mine" | "limits" | "points" | "rules";

/**
 * /membership — 멤버십·포인트·용량 정책.
 * 한 화면에 모든 정책을 쌓지 않고 '내 현황 · 등급별 한도 · 활동 포인트 · 운영 원칙' 탭으로 나눠 한 번에 하나만 보여 준다.
 * 수치는 정책 소스(packages/core)와 서버 카탈로그에서만 가져온다.
 */
export function MembershipPolicyPage() {
  useBilingualI18nRevision();
  const t = useT();
  const language = useI18n((state) => state.lang);
  const isEnglish = (normalizeLocaleCode(language) ?? "").startsWith("en");
  const pageLang = isEnglish ? "en" : "ko";
  const formatter = useMemo(() => new Intl.NumberFormat(isEnglish ? "en-US" : "ko-KR"), [isEnglish]);

  const userId = useApp((state) => state.userId);
  const { catalog, catalogStatus, retryCatalog, overview, overviewStatus, retryOverview } = useMembershipData(userId);

  const title = t(COPY.docTitle);
  const description = t(COPY.docDescription);
  useDocumentTitle(title);
  useMetaDescription(description);
  usePageSocialMeta({ canonicalPath: "/membership", title, description });

  const plans = catalog?.plans ?? Object.values(MEMBERSHIP_PLAN_POLICIES);
  const activities = catalog?.activityRewards ?? Object.values(ACTIVITY_POINT_POLICIES);
  const pointExpiryDays = (catalog?.economy ?? MEMBERSHIP_ECONOMY_POLICY).pointExpiryDays;
  const heroLines = t(COPY.heroTitle).split("\n");

  const tabs: readonly IntroTab<MembershipTab>[] = [
    ...(userId ? [{ id: "mine", label: t(TAB_COPY.tabMine), icon: UserRound } satisfies IntroTab<MembershipTab>] : []),
    { id: "limits", label: t(TAB_COPY.tabLimits), icon: Database },
    { id: "points", label: t(TAB_COPY.tabPoints), icon: Coins },
    { id: "rules", label: t(TAB_COPY.tabRules), icon: ScrollText },
  ];

  return (
    <div lang={pageLang} className="min-h-[calc(100dvh-var(--site-header-height,4.25rem))] bg-canvas py-5 sm:py-8 lg:py-10">
      <Container size="wide">
        <HeroBlock
          eyebrow="MEMBERSHIP & FAIR USE"
          title={<>{heroLines[0]}<br />{heroLines[1] ?? ""}</>}
          lede={t(COPY.heroLede)}
          actions={(
            <IntroActions
              primary={{ href: "/pricing", label: t(TAB_COPY.heroPrimary) }}
              secondary={{ href: "/events", label: t(COPY.linkEvents) }}
            />
          )}
        />
        <ul className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
          {[COPY.chipNoPayment, COPY.chipNotCash, COPY.chipFairUse].map((chip) => (
            <li key={chip} className="rounded-full border border-line bg-card px-3 py-2">{t(chip)}</li>
          ))}
        </ul>

        <IntroTabs
          tabs={tabs}
          fallback={userId ? "mine" : "limits"}
          label={t(TAB_COPY.tabsLabel)}
          idPrefix="membership"
          param="tab"
          mount="visited"
          className="mt-6"
          panelClassName="mt-4"
        >
          {(id) => id === "mine" ? (
            <>
              {overviewStatus === "loading" ? <LoadingSkeleton label={t(COPY.overviewLoading)} /> : null}
              {overviewStatus === "error" ? <RetryNotice message={t(COPY.overviewError)} onRetry={retryOverview} retryLabel={t(COPY.retry)} /> : null}
              {overviewStatus === "ready" && overview ? <MembershipMePanel overview={overview} formatter={formatter} /> : null}
            </>
          ) : id === "limits" ? (
            <section aria-labelledby="membership-plan-title">
              <h2 id="membership-plan-title" className="text-2xl font-black tracking-tight text-fg sm:text-3xl">{t(COPY.resourceTitle)}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
                {t(COPY.resourceDescription)}{" "}
                <Link href="/pricing" className="font-bold text-accent">{t(COPY.resourceLink)}</Link>
              </p>
              {catalogStatus === "loading" ? (
                <div className="mt-4"><LoadingSkeleton label={t(COPY.catalogLoading)} /></div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {catalogStatus === "error" ? <RetryNotice message={t(COPY.catalogError)} onRetry={retryCatalog} retryLabel={t(COPY.retry)} /> : null}
                  <MembershipPlanTable plans={plans} formatter={formatter} />
                </div>
              )}
            </section>
          ) : id === "points" ? (
            <MembershipActivityPanel activities={activities} formatter={formatter} />
          ) : (
            <MembershipOpsPanel pointExpiryDays={pointExpiryDays} formatter={formatter} />
          )}
        </IntroTabs>
      </Container>
    </div>
  );
}

export default MembershipPolicyPage;
