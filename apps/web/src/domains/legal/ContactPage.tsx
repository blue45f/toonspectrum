import {
  Bug,
  Database,
  HandCoins,
  Handshake,
  MessagesSquare,
  Palette,
} from "lucide-react";

import { Container } from "@/shared/components/section";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("ContactPage", ko, en);

const SUPPORT_LINKS = [
  {
    id: "general",
    icon: MessagesSquare,
    href: "/support",
    ko: ["사이트 문의", "서비스 이용, 계정, 데이터 표시처럼 일반 문의를 남깁니다."],
    en: ["General support", "General questions about using the service, accounts and data display."],
  },
  {
    id: "business",
    icon: Handshake,
    href: "/business",
    ko: ["투자·제휴·후원 문의", "투자·IR, 콘텐츠/IP, 광고·스폰서십 제안을 비공개로 접수합니다."],
    en: ["Investment & partnership", "Private intake for investment/IR, content/IP and ads/sponsorship proposals."],
  },
  {
    id: "support-us",
    icon: HandCoins,
    href: "/support-us",
    ko: ["ToonStudio 응원하기", "개인 서포터 결제 준비 상태, 기업 스폰서십, 공익 기부의 서로 다른 경로를 확인합니다."],
    en: ["Support ToonStudio", "Compare individual supporter readiness, corporate sponsorship and public-benefit donations."],
  },
  {
    id: "bug",
    icon: Bug,
    href: "/feedback?type=bug",
    ko: ["버그 제보", "오류 화면, 재현 경로, 기대 동작을 자사 제보 보드에 남깁니다."],
    en: ["Report a bug", "File the error screen, reproduction path and expected behavior on our feedback board."],
  },
] as const;

const TYPES = [
  {
    id: "tools-education",
    icon: Palette,
    ko: ["창작 도구·교육", "웹툰 드로잉 수업, 창작 워크숍, 제작 도구를 활용하는 협업 제안."],
    en: ["Creation tools & education", "Proposals for webtoon drawing classes, creation workshops and production tools."],
  },
  {
    id: "partnership",
    icon: Handshake,
    ko: ["업무 제휴", "플랫폼 연동, 콘텐츠 제휴, 공동 기획·프로모션 등 비즈니스 제안."],
    en: ["Business partnership", "Business proposals: platform integration, content partnerships and co-planned promotions."],
  },
  {
    id: "resources-data",
    icon: Database,
    ko: ["리소스·데이터", "드로잉 리소스 공유, 카탈로그 정보 활용, 출처와 사용 조건에 관한 문의."],
    en: ["Resources & data", "Questions about drawing resource sharing, catalog data use, sources and usage terms."],
  },
  {
    id: "etc",
    icon: MessagesSquare,
    ko: ["기타 문의", "서비스 투자·IR, 후원·스폰서십, 채용, 권리 관련 등 그 밖의 문의."],
    en: ["Everything else", "Other questions about investment/IR, sponsorships, hiring and rights."],
  },
] as const;

export function ContactPage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("문의·제휴 · 함께 만드는 웹툰 창작 환경", "Contact & partnerships · building a better webtoon environment together"));

  return (
    <Container size="wide" className="py-8 sm:py-12 lg:py-16">
      <PublicStoryHero
        purpose="collaborate"
        eyebrow="CONTACT · CREATE SOMETHING TOGETHER"
        title={bi("웹툰을 만드는 더 나은 환경, 함께.", "A better environment for making webtoons, together.")}
        description={bi(
          "창작 도구와 교육, 리소스 공유, 콘텐츠와 플랫폼의 연결. 웹툰을 그리는 사람에게 도움이 되는 협업을 제안해 주세요. 서비스 이용 문제는 지원 센터에서, 투자·제휴·스폰서십은 비공개 비즈니스 센터에서, 개인 서포터와 후원 경계는 응원 센터에서 확인할 수 있습니다.",
          "Creation tools and education, resource sharing, and connections between content and platforms. Suggest a collaboration that helps people who draw webtoons. Service questions live in the support center, investment/partnership/sponsorship in the private business center, and supporter boundaries in the support-us center.",
        )}
        image="materials"
        imageAlt={bi("브러시와 재료가 놓인 웹툰 작업실 콘셉트 아트", "Webtoon atelier concept art with brushes and materials")}
        caption={bi("LET’S MAKE ROOM FOR IDEAS · 드로잉 재료 콘셉트 아트", "LET’S MAKE ROOM FOR IDEAS · Drawing materials concept art")}
      >
        <Link
          href="/business"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
        >
          {bi("비즈니스 문의", "Business inquiries")}
          <Handshake size={16} aria-hidden="true" />
        </Link>
        <Link
          href="/help"
          className="ml-4 inline-flex min-h-12 items-center text-sm font-semibold text-fg-2 hover:text-accent"
        >
          {bi("사용법과 도움말", "How-to & help")}
        </Link>
      </PublicStoryHero>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <h2 className="mb-3 text-lg font-bold text-fg">{bi("이런 문의를 받습니다", "We welcome these kinds of inquiries")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {TYPES.map((type) => {
              const [title, body] = bi(type.ko, type.en);
              return (
                <div
                  key={type.id}
                  className="rounded-2xl border border-line bg-card/60 p-5"
                >
                  <type.icon className="mb-2 text-accent" size={20} />
                  <p className="font-semibold text-fg">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-fg-2">
                    {body}
                  </p>
                </div>
              );
            })}
          </div>

          <h2 className="mb-3 mt-8 text-lg font-bold text-fg">
            {bi("문의 성격에 맞는 전용 경로", "Dedicated paths matched to your inquiry")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {SUPPORT_LINKS.map((link) => {
              const [title, body] = bi(link.ko, link.en);
              return (
                <Link
                  key={link.id}
                  href={link.href}
                  className="flex min-h-full flex-col gap-2 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-accent/50 hover:bg-accent-soft"
                >
                  <link.icon className="text-accent" size={22} />
                  <span className="text-base font-bold text-fg">{title}</span>
                  <span className="text-sm leading-relaxed text-fg-2">
                    {body}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <aside>
          <div className="sticky top-[var(--site-header-sticky-offset,5rem)] rounded-2xl border border-line bg-panel/40 p-5">
            <h2 className="text-sm font-semibold text-fg">{bi("공개와 비공개를 구분합니다", "We separate public from private")}</h2>
            <p className="mt-2 text-xs leading-relaxed text-fg-3">
              {bi(
                "사용 중 발생한 문제는 지원 센터에서 해결 방법과 진단 정보를 확인하세요. 공개해도 되는 제안과 오류는 피드백 보드에서 논의하고, 연락처·사업 정보가 포함되는 투자·제휴 문의는 비공개 센터를 이용해 주세요.",
                "For problems while using the service, check solutions and diagnostics in the support center. Discuss public-safe proposals and errors on the feedback board, and use the private center for investment/partnership inquiries containing contact or business information.",
              )}
            </p>
            <Link
              href="/business"
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-2"
            >
              {bi("비공개 비즈니스 센터 열기", "Open the private business center")}
            </Link>
          </div>
        </aside>
      </div>
    </Container>
  );
}
