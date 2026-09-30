import {
  Bug,
  Database,
  HandCoins,
  Handshake,
  Mail,
  MessagesSquare,
  Palette,
} from "lucide-react";

import { SiteLinkCard } from "./public/site-link-card";
import { SitePageArt } from "./public/site-page-art";
import { SitePageHeader } from "./public/site-page-header";

import { Container, Section } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
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
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <SitePageHeader
        size="hero"
        icon={Mail}
        eyebrow="CONTACT · CREATE SOMETHING TOGETHER"
        title={bi("웹툰을 만드는 더 나은 환경, 함께.", "A better environment for making webtoons, together.")}
        description={bi(
          "문의 성격에 맞는 경로를 고르면 가장 빠르게 답을 받을 수 있어요. 이용 문제는 지원 센터, 투자·제휴·스폰서십은 비공개 비즈니스 센터에서 받습니다.",
          "Pick the path that matches your question for the fastest answer. Usage problems go to support; investment, partnership and sponsorship go to the private business center.",
        )}
        aside={<SitePageArt kind="collaborate" caption={bi("브랜드 콘셉트 아트 · 실제 화면이 아닙니다", "Brand concept art · not a product screen")} />}
        asideClassName="hidden lg:block"
        actions={
          <>
            <Link href="/business" className={buttonClass({ size: "md", className: "min-h-11 gap-2" })}>
              <Handshake size={16} aria-hidden="true" />
              {bi("비즈니스 문의", "Business inquiries")}
            </Link>
            <Link href="/help" className={buttonClass({ variant: "ghost", size: "md", className: "min-h-11" })}>
              {bi("사용법과 도움말", "How-to & help")}
            </Link>
          </>
        }
      />

      <Section
        className="mt-10 sm:mt-12"
        eyebrow="CHOOSE A PATH"
        title={bi("문의 성격에 맞는 전용 경로", "Dedicated paths matched to your inquiry")}
        desc={bi("공개해도 되는 제안과 오류는 제보 보드, 연락처가 담기는 사업 문의는 비공개 센터를 이용해 주세요.", "Use the feedback board for public-safe ideas and bugs, and the private center for business inquiries with contact details.")}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SUPPORT_LINKS.map((link) => {
            const [title, body] = bi(link.ko, link.en);
            return <SiteLinkCard key={link.id} href={link.href} icon={link.icon} title={title} description={body} cta={bi("열기", "Open")} />;
          })}
        </div>
      </Section>

      <Section
        className="mt-12 sm:mt-14"
        eyebrow="WHAT WE WELCOME"
        title={bi("이런 문의를 받습니다", "We welcome these kinds of inquiries")}
        desc={bi("아래 주제라면 비즈니스 센터에서 비공개로 제안해 주세요.", "For these topics, send a private proposal through the business center.")}
      >
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TYPES.map((type) => {
            const [title, body] = bi(type.ko, type.en);
            return (
              <li key={type.id} className="flex gap-3 rounded-2xl border border-line/80 bg-panel/45 p-4">
                <type.icon className="mt-0.5 shrink-0 text-accent" size={18} aria-hidden="true" />
                <span className="min-w-0">
                  <strong className="block break-keep text-sm font-bold text-fg">{title}</strong>
                  <span className="mt-1 block break-keep text-xs leading-5 text-fg-2">{body}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>
    </Container>
  );
}
