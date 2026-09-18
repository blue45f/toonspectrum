import { ArrowUpRight, CalendarDays, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CreatorEcosystemLayout } from "./CreatorEcosystemLayout";

type EducationKind = "all" | "university" | "academy" | "public" | "online";

interface EducationEntry {
  id: string;
  name: string;
  kind: Exclude<EducationKind, "all">;
  region: string;
  summary: string;
  focus: string[];
  sourceUrl: string;
  sourceLabel: string;
  verifiedAt: string;
  currentProgram?: string;
}

const EDUCATION_KIND_LABEL: Record<EducationKind, string> = {
  all: "전체",
  university: "대학 · 학과",
  academy: "학원 · 직업훈련",
  public: "공공 아카데미",
  online: "온라인 · 혼합",
};

const EDUCATION_ENTRIES: EducationEntry[] = [
  {
    id: "ck-manhwa",
    name: "청강문화산업대학교 만화콘텐츠스쿨",
    kind: "university",
    region: "경기 이천",
    summary: "웹툰·만화, 웹소설·장르문학, 캐릭터 일러스트레이션을 스토리 IP 관점에서 교육하는 전공 과정입니다.",
    focus: ["웹툰", "웹소설", "일러스트", "웹툰PD", "포트폴리오"],
    sourceUrl: "https://www.ck.ac.kr/school-department/manwha/school",
    sourceLabel: "청강문화산업대학교 공식",
    verifiedAt: "2026-09-18",
  },
  {
    id: "komacon-academy",
    name: "한국만화웹툰아카데미",
    kind: "public",
    region: "경기 부천 · 프로그램별 상이",
    summary: "예비·신진 창작자를 대상으로 멘토링과 작품 제작을 연결하는 한국만화영상진흥원 교육 프로그램입니다.",
    focus: ["작가양성", "멘토링", "작품제작", "데뷔", "청소년캠프"],
    sourceUrl: "https://www.komacon.kr/b_sys/index.asp?b_code=4&s_cate=1&s_fld=&s_txt=",
    sourceLabel: "한국만화영상진흥원 공식",
    verifiedAt: "2026-09-18",
    currentProgram: "2026 한국만화웹툰아카데미 및 청소년웹툰캠프 공고 확인",
  },
  {
    id: "seoul-it-webtoon",
    name: "서울IT아카데미 홍대 · 웹툰/애니메이션",
    kind: "academy",
    region: "서울 마포",
    summary: "기획·콘티·배경·채색·선화와 포트폴리오를 묶은 웹툰 제작 취업과정을 운영합니다.",
    focus: ["기획", "콘티", "배경", "채색", "선화", "취업"],
    sourceUrl: "https://www.seoulit.or.kr/edu/class_index_u.html",
    sourceLabel: "서울IT아카데미 공식",
    verifiedAt: "2026-09-18",
    currentProgram: "2026 생성형 AI 웹툰 제작 및 웹툰 전문인력 과정",
  },
  {
    id: "mbc-amca",
    name: "MBC C&I AI Multi-contents Creator Academy",
    kind: "online",
    region: "과정별 온·오프라인",
    summary: "웹툰·웹소설·OTT 등 생성형 AI 기반 콘텐츠 제작을 실제 포트폴리오까지 연결하는 통합 교육 과정입니다.",
    focus: ["AI", "웹툰", "웹소설", "영상", "포트폴리오"],
    sourceUrl: "https://www.mbcac.com/amca2026/",
    sourceLabel: "MBC C&I AMCA 공식",
    verifiedAt: "2026-09-18",
    currentProgram: "2026 Creator Recruitment",
  },
];

export function EducationHubPage() {
  const [kind, setKind] = useState<EducationKind>("all");
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return EDUCATION_ENTRIES.filter((item) => {
      if (kind !== "all" && item.kind !== kind) return false;
      if (!needle) return true;
      return [
        item.name,
        item.region,
        item.summary,
        item.focus.join(" "),
        item.currentProgram ?? "",
      ].join(" ").toLocaleLowerCase().includes(needle);
    });
  }, [kind, query]);

  return (
    <CreatorEcosystemLayout
      title="웹툰 성장 · 교육 허브"
      intro="학과·학원·공공 교육을 한곳에서 비교하고, 지원사업과 공모 일정까지 창작 경로로 이어갑니다. 교육기관 정보는 공식 출처 확인일을 함께 표시합니다."
    >
      <section className="grid gap-4 rounded-2xl border border-line bg-panel p-5 lg:grid-cols-[1fr_auto]">
        <label className="relative block">
          <span className="sr-only">교육기관 검색</span>
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="웹툰, 콘티, 취업, AI, 지역 등으로 검색"
            className="min-h-11 w-full rounded-xl border border-line bg-canvas pl-10 pr-3 text-sm text-fg"
          />
        </label>
        <div className="flex flex-wrap gap-2" aria-label="교육기관 유형">
          {(Object.keys(EDUCATION_KIND_LABEL) as EducationKind[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={kind === value
                ? "min-h-11 rounded-xl border border-accent bg-accent-soft px-4 text-sm font-bold text-accent"
                : "min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-fg-2 hover:bg-raised"}
            >
              {EDUCATION_KIND_LABEL[value]}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                {EDUCATION_KIND_LABEL[item.kind]}
              </span>
              <span className="text-xs text-fg-3">{item.region}</span>
            </div>
            <h2 className="mt-4 text-xl font-black">{item.name}</h2>
            <p className="mt-3 text-sm leading-6 text-fg-2">{item.summary}</p>
            {item.currentProgram ? (
              <p className="mt-3 rounded-xl bg-raised p-3 text-xs leading-5 text-fg-2">
                현재 확인: {item.currentProgram}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {item.focus.map((tag) => (
                <span key={tag} className="rounded-full border border-line px-2.5 py-1 text-xs text-fg-2">
                  #{tag}
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm">
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1 font-bold text-accent"
              >
                {item.sourceLabel}<ArrowUpRight size={15} aria-hidden="true" />
              </a>
              <span className="text-xs text-fg-3">공식 정보 확인 {item.verifiedAt}</span>
            </div>
          </article>
        ))}
      </section>

      {!items.length ? (
        <p className="rounded-2xl border border-line bg-panel p-6 text-sm text-fg-2">
          조건에 맞는 교육기관이 없습니다. 다른 키워드나 유형을 선택해 주세요.
        </p>
      ) : null}

      <section className="rounded-2xl border border-line bg-panel p-6">
        <div className="flex items-start gap-3">
          <CalendarDays size={22} className="mt-0.5 text-accent" aria-hidden="true" />
          <div>
            <h2 className="font-black">교육만 보지 말고 모집 기회까지 연결하세요</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              기존 작가 기회센터의 지원사업 검색과 연결해 교육 → 포트폴리오 → 공모·지원 → 데뷔 흐름을 이어갑니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/opportunities?q=웹툰"
                className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-on-accent"
              >
                웹툰 지원사업 찾기
              </Link>
              <Link
                to="/learn/recipes"
                className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-bold"
              >
                제작 레시피 보기
              </Link>
            </div>
          </div>
        </div>
      </section>
    </CreatorEcosystemLayout>
  );
}
