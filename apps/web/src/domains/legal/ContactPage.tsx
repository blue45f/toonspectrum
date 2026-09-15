import {
  Bug,
  Database,
  Handshake,
  MessagesSquare,
  Palette,
} from "lucide-react";

import { Container } from "@/shared/components/section";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { useDocumentTitle } from "@/hooks/use-document-title";
import Link from "@/compat/router-link";

const SUPPORT_LINKS = [
  {
    icon: MessagesSquare,
    title: "사이트 문의",
    body: "서비스 이용, 계정, 데이터 표시처럼 일반 문의를 남깁니다.",
    href: "/feedback?category=question",
  },
  {
    icon: Handshake,
    title: "제휴 문의",
    body: "광고, 플랫폼 연동, 콘텐츠 제휴 같은 비즈니스 제안을 접수합니다.",
    href: "/feedback?category=idea",
  },
  {
    icon: Bug,
    title: "버그 제보",
    body: "오류 화면, 재현 경로, 기대 동작을 자사 제보 보드에 남깁니다.",
    href: "/feedback?category=bug",
  },
] as const;

const TYPES = [
  {
    icon: Palette,
    title: "창작 도구·교육",
    body: "웹툰 드로잉 수업, 창작 워크숍, 제작 도구를 활용하는 협업 제안.",
  },
  {
    icon: Handshake,
    title: "업무 제휴",
    body: "플랫폼 연동, 콘텐츠 제휴, 공동 기획·프로모션 등 비즈니스 제안.",
  },
  {
    icon: Database,
    title: "리소스·데이터",
    body: "드로잉 리소스 공유, 카탈로그 정보 활용, 출처와 사용 조건에 관한 문의.",
  },
  {
    icon: MessagesSquare,
    title: "기타 문의",
    body: "서비스 제휴·투자, 채용, 권리 관련 등 그 밖의 모든 문의.",
  },
] as const;

export function ContactPage() {
  useDocumentTitle("문의·제휴 · 함께 만드는 웹툰 창작 환경");
  return (
    <Container size="wide" className="py-8 sm:py-12 lg:py-16">
      <PublicStoryHero
        eyebrow="CONTACT · CREATE SOMETHING TOGETHER"
        title="웹툰을 만드는 더 나은 환경, 함께."
        description="창작 도구와 교육, 리소스 공유, 콘텐츠와 플랫폼의 연결. 웹툰을 그리는 사람에게 도움이 되는 협업을 제안해 주세요. 모든 문의는 툰스펙트럼의 자체 피드백 보드에서 접수하고 상태를 확인할 수 있습니다."
        image="materials"
        imageAlt="브러시와 재료가 놓인 웹툰 작업실 콘셉트 아트"
        caption="LET’S MAKE ROOM FOR IDEAS · 드로잉 재료 콘셉트 아트"
      >
        <Link
          href="/feedback"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
        >
          제안 작성하기
          <Handshake size={16} aria-hidden="true" />
        </Link>
        <Link
          href="/help"
          className="ml-4 inline-flex min-h-12 items-center text-sm font-semibold text-fg-2 hover:text-accent"
        >
          사용법과 도움말
        </Link>
      </PublicStoryHero>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <h2 className="mb-3 text-lg font-bold text-fg">이런 문의를 받습니다</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {TYPES.map((type) => (
              <div
                key={type.title}
                className="rounded-2xl border border-line bg-card/60 p-5"
              >
                <type.icon className="mb-2 text-accent" size={20} />
                <p className="font-semibold text-fg">{type.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-fg-2">
                  {type.body}
                </p>
              </div>
            ))}
          </div>

          <h2 className="mb-3 mt-8 text-lg font-bold text-fg">
            자사 문의·제안 보드
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {SUPPORT_LINKS.map((link) => (
              <Link
                key={link.title}
                href={link.href}
                className="flex min-h-full flex-col gap-2 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-accent/50 hover:bg-accent-soft"
              >
                <link.icon className="text-accent" size={22} />
                <span className="text-base font-bold text-fg">{link.title}</span>
                <span className="text-sm leading-relaxed text-fg-2">
                  {link.body}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <aside>
          <div className="sticky top-[var(--site-header-sticky-offset,5rem)] rounded-2xl border border-line bg-panel/40 p-5">
            <h2 className="text-sm font-semibold text-fg">문의 작성과 진행 상태</h2>
            <p className="mt-2 text-xs leading-relaxed text-fg-3">
              외부 게시 서비스로 이동하지 않습니다. 질문, 아이디어, 오류 제보를
              툰스펙트럼 피드백 보드에 남기고 댓글과 운영 답변을 같은 화면에서
              확인할 수 있습니다.
            </p>
            <Link
              href="/feedback"
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-2"
            >
              피드백 보드 열기
            </Link>
          </div>
        </aside>
      </div>
    </Container>
  );
}
