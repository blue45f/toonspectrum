import { BadgeCheck, CalendarDays, Megaphone, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { FanCafePanel } from "./components/fan-cafe-panel";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const EVENT_GUIDE = [
  {
    icon: Megaphone,
    title: "공식 이벤트와 구분",
    titleEn: "Official vs. community",
    summary: "운영 공지는 공식 이벤트 허브에서, 창작자·팬 소식은 이곳에서",
    summaryEn: "Official announcements live in the event hub; creator and fan news lives here",
    detail: "ToonStudio이 직접 운영하는 프로모션은 공식 이벤트 허브에서 확인하고, 이곳에서는 창작자·팬·행사 주최자가 정보를 나눕니다.",
    detailEn: "Promotions run directly by ToonStudio appear in the official event hub; this board is where creators, fans, and organizers share information.",
  },
  {
    icon: CalendarDays,
    title: "일정 · 장소를 명확하게",
    titleEn: "Keep the date and place clear",
    summary: "날짜·장소·신청 마감·공식 링크를 함께 적어 주세요",
    summaryEn: "Include the date, venue, application deadline, and official link",
    detail: "행사 날짜, 지역, 신청 마감과 공식 안내 링크를 본문과 태그에 함께 적어 다른 사용자가 빠르게 확인할 수 있게 해주세요.",
    detailEn: "Add the event date, location, application deadline, and official info link to the body and tags so others can verify quickly.",
  },
  {
    icon: ShieldCheck,
    title: "안전한 참여",
    titleEn: "Participate safely",
    summary: "티켓 거래·연락처는 공개 글에 올리지 마세요",
    summaryEn: "Don't post ticket trades or contact info in public posts",
    detail: "티켓 거래·개인 연락처·미성년자 정보는 공개 게시물에 직접 올리지 말고, 신고 기능과 행사 주최자의 공식 채널을 우선 이용하세요.",
    detailEn: "Don't post ticket trades, personal contact details, or minors' information in public posts — use the report feature and the organizer's official channels first.",
  },
] as const;

function EventChannelCard({
  icon: Icon,
  badge,
  badgeTone,
  title,
  who,
  what,
  cta,
}: {
  readonly icon: typeof BadgeCheck;
  readonly badge: string;
  readonly badgeTone: string;
  readonly title: string;
  readonly who: string;
  readonly what: string;
  readonly cta: { readonly href: string; readonly label: string };
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badgeTone}`}>{badge}</span>
        <Icon size={20} className="text-accent" aria-hidden="true" />
      </div>
      <h3 className="mt-3 text-base font-black">{title}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="shrink-0 font-bold text-fg-3">누가</dt>
          <dd className="text-fg-2">{who}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-bold text-fg-3">무엇을</dt>
          <dd className="text-fg-2">{what}</dd>
        </div>
      </dl>
      <Link
        to={cta.href}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-bold hover:bg-raised"
      >
        {cta.label}
      </Link>
    </article>
  );
}

export function CommunityEventsPage() {
  useDocumentTitle("이벤트 게시판 · 창작자와 팬이 만나는 일정");
  const t = useBilingual("domains.community.CommunityEventsPage");

  return (
    <Container size="wide" className="relative py-6 sm:py-8 lg:py-10">
      <header className="rounded-3xl border border-line bg-panel/70 p-6 sm:p-8">
        <p className="eyebrow flex items-center gap-2 text-accent">
          <Sparkles size={15} aria-hidden="true" />
          COMMUNITY EVENTS
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">이벤트 게시판</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
          웹툰·일러스트 전시, 공모전, 팬 행사, 창작 모임과 온라인 이벤트를 한곳에서 공유하세요.
          기존 커뮤니티의 이미지 첨부·댓글·검색·신고 기능을 그대로 사용합니다.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/events"
            className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-on-accent hover:bg-accent-2"
          >
            공식 이벤트 보기
          </Link>
          <Link
            to="/ecosystem/fandom"
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-bold hover:bg-raised"
          >
            팬덤 · 코스프레 허브
          </Link>
        </div>
      </header>

      <section aria-label={t("공식 이벤트와 커뮤니티 게시판 비교", "Comparing official events and the community board")} className="mt-6">
        <h2 className="text-lg font-black tracking-tight">{t("둘의 차이 한눈에 보기", "The two channels at a glance")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <EventChannelCard
            icon={BadgeCheck}
            badge={t("공식", "Official")}
            badgeTone="border-accent/35 bg-accent-soft text-accent"
            title={t("공식 이벤트", "Official events")}
            who={t("ToonStudio 운영팀이 직접 진행", "Run directly by the ToonStudio team")}
            what={t("공모전·프로모션·업데이트 안내", "Contests, promotions, and update announcements")}
            cta={{ href: "/events", label: t("공식 이벤트 보기", "View official events") }}
          />
          <EventChannelCard
            icon={Users}
            badge={t("커뮤니티 · 현재 페이지", "Community · this page")}
            badgeTone="border-line bg-raised text-fg-2"
            title={t("이벤트 게시판", "Event board")}
            who={t("창작자·팬·행사 주최자가 자유롭게 공유", "Shared freely by creators, fans, and organizers")}
            what={t("전시·팬 행사·창작 모임 소식", "Exhibitions, fan events, and creator meetups")}
            cta={{ href: "#fan-cafe-composer", label: t("첫 이벤트 글 쓰기", "Write the first event post") }}
          />
        </div>
      </section>

      <section aria-label={t("게시판 이용 가이드", "Board usage guide")} className="mt-6 grid gap-4 md:grid-cols-3">
        {EVENT_GUIDE.map(({ icon: Icon, title, titleEn, summary, summaryEn, detail, detailEn }, index) => (
          <article key={title} className="rounded-2xl border border-line bg-panel p-5" {...introItemProps(index)}>
            <Icon size={20} className="text-accent" aria-hidden="true" />
            <h2 className="mt-3 font-black">{t(title, titleEn)}</h2>
            <p className="mt-1 text-sm leading-6 text-fg-2">{t(summary, summaryEn)}</p>
            <details className="mt-3 rounded-xl bg-raised/50 px-3 py-2 text-xs leading-6 text-fg-3">
              <summary className="cursor-pointer font-bold text-fg-2 marker:text-accent">
                {t("자세히", "Details")}
              </summary>
              <p className="mt-1.5 pb-1">{t(detail, detailEn)}</p>
            </details>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-panel/45 p-1">
        <FanCafePanel
          scope="pencafe"
          targetId="community-events"
          targetLabel="이벤트 게시판"
          initialKind="event"
          emptyGuide={{
            icon: CalendarDays,
            title: "아직 올라온 이벤트 소식이 없어요",
            description:
              "전시·공모전·팬 행사·창작 모임 소식을 가장 먼저 나눠보세요. 날짜·장소·신청 방법을 함께 적으면 참여가 쉬워집니다.",
            primary: { href: "#fan-cafe-composer", label: "첫 이벤트 글 쓰기" },
            secondary: { href: "/events", label: "공식 이벤트 보기" },
          }}
        />
      </section>
    </Container>
  );
}
