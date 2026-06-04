import { Container } from "@/components/section";
import { Phone, Mail, Megaphone, Handshake, Database, MessagesSquare } from "lucide-react";

// 광고·제휴/문의(/contact) — 광고 슬롯·업무제휴·데이터 문의 등 비즈니스 연락 창구.
const TYPES = [
  { icon: Megaphone, title: "광고 문의", body: "배너·스폰서 슬롯·추천 영역 등 광고 집행 및 단가 문의." },
  { icon: Handshake, title: "업무 제휴", body: "플랫폼 연동, 콘텐츠 제휴, 공동 기획·프로모션 등 비즈니스 제안." },
  { icon: Database, title: "데이터 문의", body: "랭킹·통계·카탈로그 데이터 활용, API/리포트 관련 문의." },
  { icon: MessagesSquare, title: "기타 문의", body: "서비스 제휴/투자, 채용, 권리 관련 등 그 밖의 모든 문의." },
];

export function ContactPage() {
  return (
    <Container size="prose" className="py-12 lg:py-16">
      <p className="eyebrow text-accent">CONTACT</p>
      <h1 className="mt-3 text-pretty text-3xl font-bold leading-tight sm:text-4xl">광고·제휴 문의</h1>
      <p className="mt-4 text-pretty text-base leading-relaxed text-fg-2">
        툰스펙트럼은 웹툰·웹소설 독자가 매일 찾는 통합 발견 서비스입니다. 광고 집행, 업무 제휴, 데이터 활용
        등 어떤 제안이든 아래 연락처로 편하게 문의해 주세요. 영업일 기준 빠르게 회신드립니다.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <a
          href="tel:01038734197"
          className="flex items-center gap-3 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-accent/50 hover:bg-accent-soft"
        >
          <Phone className="text-accent" size={22} />
          <span>
            <span className="block text-xs text-fg-3">전화</span>
            <span className="numeral text-lg font-bold text-fg">010-3873-4197</span>
          </span>
        </a>
        <a
          href="mailto:blue45f@gmail.com?subject=[툰스펙트럼] 광고·제휴 문의"
          className="flex items-center gap-3 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-accent/50 hover:bg-accent-soft"
        >
          <Mail className="text-accent" size={22} />
          <span className="min-w-0">
            <span className="block text-xs text-fg-3">이메일</span>
            <span className="block truncate text-lg font-bold text-fg">blue45f@gmail.com</span>
          </span>
        </a>
      </div>

      <h2 className="mt-10 mb-3 text-lg font-bold text-fg">이런 문의를 받습니다</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {TYPES.map((t) => (
          <div key={t.title} className="rounded-2xl border border-line bg-card/60 p-5">
            <t.icon className="mb-2 text-accent" size={20} />
            <p className="font-semibold text-fg">{t.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-3">{t.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href="mailto:blue45f@gmail.com?subject=[툰스펙트럼] 광고·제휴 문의&body=문의 유형:%0D%0A회사/담당자:%0D%0A연락처:%0D%0A내용:%0D%0A"
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-transform hover:translate-y-[-1px]"
        >
          <Mail size={16} /> 문의 메일 보내기
        </a>
      </div>
    </Container>
  );
}
