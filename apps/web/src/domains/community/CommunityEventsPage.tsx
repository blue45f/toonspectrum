import { CalendarDays, Megaphone, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { FanCafePanel } from "./components/fan-cafe-panel";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";

const EVENT_GUIDE = [
  {
    icon: Megaphone,
    title: "공식 이벤트와 구분",
    text: "ToonSpectrum이 직접 운영하는 프로모션은 공식 이벤트 허브에서 확인하고, 이곳에서는 창작자·팬·행사 주최자가 정보를 나눕니다.",
  },
  {
    icon: CalendarDays,
    title: "일정 · 장소를 명확하게",
    text: "행사 날짜, 지역, 신청 마감과 공식 안내 링크를 본문과 태그에 함께 적어 다른 사용자가 빠르게 확인할 수 있게 해주세요.",
  },
  {
    icon: ShieldCheck,
    title: "안전한 참여",
    text: "티켓 거래·개인 연락처·미성년자 정보는 공개 게시물에 직접 올리지 말고, 신고 기능과 행사 주최자의 공식 채널을 우선 이용하세요.",
  },
] as const;

export function CommunityEventsPage() {
  useDocumentTitle("이벤트 게시판 · 창작자와 팬이 만나는 일정");

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

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {EVENT_GUIDE.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-2xl border border-line bg-panel p-5">
            <Icon size={20} className="text-accent" aria-hidden="true" />
            <h2 className="mt-3 font-black">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">{text}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-panel/45 p-1">
        <FanCafePanel
          scope="pencafe"
          targetId="community-events"
          targetLabel="이벤트 게시판"
          initialKind="event"
        />
      </section>
    </Container>
  );
}
