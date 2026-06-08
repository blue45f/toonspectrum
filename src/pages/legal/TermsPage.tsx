"use client";

import { useMemo, useState } from "react";
import { Container } from "@/components/section";

const FAN_CAFE_ACTIVITY_STORAGE_KEY = "webtoon-index-fan-cafe-activity-log-v1";
const TERMS_DEMO_CHECKLIST_STORAGE_KEY = "webtoon-index-terms-demo-checklist-v1";

const TERMS_DEMO_CHECKS = [
  {
    id: "service-nature",
    title: "색인 도구 성격 확인",
    detail: "서비스가 본편을 호스팅하지 않고 원 플랫폼 발견을 돕는다는 점을 확인합니다.",
  },
  {
    id: "account-responsibility",
    title: "계정 관리 책임 확인",
    detail: "계정 정보 유지, 타인 권리 침해 금지, 운영 방해 제한 기준을 확인합니다.",
  },
  {
    id: "community-rule",
    title: "커뮤니티 게시 규칙 확인",
    detail: "비방·차별·저작권 침해·불법 정보 게시 금지와 비노출 기준을 확인합니다.",
  },
  {
    id: "ip-boundary",
    title: "콘텐츠 권리 경계 확인",
    detail: "작품 메타데이터와 표지 권리는 플랫폼·권리자에게 있다는 점을 확인합니다.",
  },
  {
    id: "change-policy",
    title: "약관 변경 고지 확인",
    detail: "시행일과 변경 공지 경로를 확인하고 커뮤니티 이용 전 재점검합니다.",
  },
] as const;

type TermsDemoCheckId = (typeof TERMS_DEMO_CHECKS)[number]["id"];
type FanCafeActivityLog = {
  id: string;
  at: number;
  action: string;
  label: string;
  detail?: string;
  scope?: string;
  targetLabel?: string;
};

const readFanCafeActivityLog = (): FanCafeActivityLog[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(FAN_CAFE_ACTIVITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is FanCafeActivityLog => {
        const candidate = item as Partial<FanCafeActivityLog>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.at === "number" &&
          typeof candidate.action === "string" &&
          typeof candidate.label === "string"
        );
      })
      .slice(-20);
  } catch {
    return [];
  }
};

const readTermsChecklist = (): TermsDemoCheckId[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(TERMS_DEMO_CHECKLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is TermsDemoCheckId => TERMS_DEMO_CHECKS.some((check) => check.id === id));
  } catch {
    return [];
  }
};

const writeTermsChecklist = (items: TermsDemoCheckId[]) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(TERMS_DEMO_CHECKLIST_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Local persistence is optional for this demo checklist.
  }
};

const formatActivityTime = (at: number) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));

// 이용약관(/terms) — 툰스펙트럼 서비스 이용 조건.
export function TermsPage() {
  const [checkedIds, setCheckedIds] = useState<TermsDemoCheckId[]>(readTermsChecklist);
  const [fanCafeActivity] = useState<FanCafeActivityLog[]>(readFanCafeActivityLog);

  const blockedActivity = useMemo(
    () => fanCafeActivity.filter((item) => item.action === "blocked").slice(-4).reverse(),
    [fanCafeActivity]
  );
  const communityTouchCount = useMemo(
    () => fanCafeActivity.filter((item) => item.action !== "blocked").length,
    [fanCafeActivity]
  );
  const readinessRate = Math.round((checkedIds.length / TERMS_DEMO_CHECKS.length) * 100);

  const toggleCheck = (id: TermsDemoCheckId, checked: boolean) => {
    setCheckedIds((current) => {
      const next = checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id);
      writeTermsChecklist(next);
      return next;
    });
  };

  return (
    <Container size="prose" className="py-12 lg:py-16">
      <p className="eyebrow text-accent">LEGAL</p>
      <h1 className="mt-3 text-pretty text-3xl font-bold leading-tight sm:text-4xl">이용약관</h1>
      <p className="mt-2 text-sm text-fg-3">시행일: 2026년 6월 4일</p>

      <section className="mt-8 rounded-2xl border border-line bg-panel/65 p-4 surface-hl sm:p-5" aria-labelledby="terms-demo-check-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow text-accent">TERMS DEMO</p>
            <h2 id="terms-demo-check-title" className="mt-1 text-lg font-bold text-fg">
              커뮤니티 이용 전 약관 체크
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-fg-3">
              팬카페에서 남긴 검색·필터·작성 제한 로그를 바탕으로, 커뮤니티 운영 약관을 실제 사용 흐름과 연결합니다.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-canvas/45 px-4 py-3 text-right">
            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-fg-3">readiness</p>
            <p className="numeral mt-1 text-2xl text-fg">{readinessRate}%</p>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-canvas/70" aria-hidden="true">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${readinessRate}%` }} />
        </div>

        <div className="mt-4 grid gap-3">
          {TERMS_DEMO_CHECKS.map((check) => (
            <label key={check.id} className="flex cursor-pointer gap-3 rounded-xl border border-line bg-card/65 p-3 transition-colors hover:border-line-strong">
              <input
                type="checkbox"
                checked={checkedIds.includes(check.id)}
                onChange={(event) => toggleCheck(check.id, event.target.checked)}
                className="mt-1 size-4 accent-[var(--color-accent)]"
              />
              <span>
                <strong className="block text-sm text-fg">{check.title}</strong>
                <span className="mt-1 block text-xs leading-relaxed text-fg-3">{check.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-canvas/35 p-3">
            <p className="text-xs font-semibold text-fg">커뮤니티 로그 연결</p>
            <p className="mt-1 text-xs text-fg-3">
              일반 상호작용 {communityTouchCount}건 · 작성 차단 {blockedActivity.length}건
            </p>
          </div>
          <a
            href="/community"
            className="rounded-xl border border-accent/35 bg-accent-soft p-3 text-xs font-semibold text-accent transition-colors hover:border-accent/60"
          >
            팬카페에서 데모 로그 더 만들기
          </a>
        </div>

        {blockedActivity.length > 0 ? (
          <div className="mt-4 space-y-2" aria-label="커뮤니티 작성 차단 이력">
            {blockedActivity.map((item) => (
              <div key={item.id} className="rounded-xl border border-bad/35 bg-bad/10 p-3 text-xs text-fg-2">
                <strong className="text-fg">차단 이력</strong> · {item.label}
                {item.detail ? <span className="ml-1 text-fg-3">({item.detail})</span> : null}
                <span className="mt-1 block text-fg-3">{formatActivityTime(item.at)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="mt-8 space-y-7 text-sm leading-relaxed text-fg-2">
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제1조 (목적)</h2>
          <p>
            본 약관은 툰스펙트럼(이하 “서비스”)이 제공하는 웹툰·웹소설 통합 색인·검색·랭킹·리뷰·커뮤니티
            등 일체의 서비스 이용과 관련하여 서비스와 이용자 간의 권리·의무 및 책임사항을 규정합니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제2조 (서비스의 성격)</h2>
          <p>
            서비스는 각 플랫폼의 공개된 카탈로그 정보를 수집·정리하여 “무엇을, 어디서, 왜 볼지”를 돕는
            <strong className="text-fg"> 색인·발견 도구</strong>입니다. 서비스는 작품 본편(이미지·텍스트)을 호스팅하거나
            재배포하지 않으며, 실제 열람은 각 원 플랫폼의 링크를 통해 이루어집니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제3조 (계정)</h2>
          <p>
            이용자는 이메일 또는 제휴 소셜 로그인으로 계정을 만들 수 있습니다. 계정 정보는 정확하게
            유지해야 하며, 계정의 관리 책임은 이용자에게 있습니다. 타인의 권리를 침해하거나 운영을 방해하는
            계정은 이용이 제한될 수 있습니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제4조 (이용자의 의무)</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>욕설·비방·차별·음란·불법 정보 등 타인에게 피해를 주는 게시물을 작성하지 않습니다.</li>
            <li>저작권 등 제3자의 권리를 침해하는 콘텐츠를 게시하거나 유통하지 않습니다.</li>
            <li>자동화 수단으로 서비스를 과도하게 부하시키거나 데이터를 무단 대량 수집하지 않습니다.</li>
            <li>운영진은 위반 게시물을 비노출 처리하거나 계정 이용을 제한할 수 있습니다.</li>
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제5조 (콘텐츠 및 지식재산권)</h2>
          <p>
            작품 메타데이터·표지 등은 각 플랫폼/권리자에게 권리가 있으며, 서비스는 이를 정보 제공 목적으로
            인용·연결합니다. 이용자가 작성한 리뷰·게시물의 권리는 이용자에게 있으나, 서비스 노출에 필요한
            범위에서 서비스가 이를 사용할 수 있습니다. 자세한 사항은{" "}
            <a className="text-accent underline underline-offset-2" href="/copyright">저작권·콘텐츠 안내</a>를
            참고하세요.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제6조 (면책)</h2>
          <p>
            서비스가 제공하는 평점·조회·가격 등 일부 지표는 추정값(≈)을 포함하며, 실데이터와 차이가 있을 수
            있습니다. 서비스는 제공 정보의 완전성·정확성을 보증하지 않으며, 원 플랫폼의 정책 변경으로 인한
            링크·가격 변동에 대해 책임지지 않습니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제7조 (약관의 변경)</h2>
          <p>
            본 약관은 관련 법령에 따라 변경될 수 있으며, 변경 시 서비스 내 공지합니다. 문의는{" "}
            <a className="text-accent underline underline-offset-2" href="/contact">광고·제휴/문의</a> 페이지의
            연락처로 받습니다.
          </p>
        </section>
      </div>
    </Container>
  );
}
