import { ArrowUpRight, BookOpen, Briefcase, CalendarDays, GraduationCap, Landmark, MonitorSmartphone, Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CreatorEcosystemLayout } from "./CreatorEcosystemLayout";
import { SectionArt } from "@/shared/components/section-art";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { LucideIcon } from "lucide-react";

const SCOPE = "domains.creator-ecosystem.EducationHubPage";

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

const KIND_KO: Record<EducationKind, string> = {
  all: "전체",
  university: "대학 · 학과",
  academy: "학원 · 직업훈련",
  public: "공공 아카데미",
  online: "온라인 · 혼합",
};

const KIND_EN: Record<EducationKind, string> = {
  all: "All",
  university: "University · department",
  academy: "Academy · vocational",
  public: "Public academy",
  online: "Online · hybrid",
};

const KIND_ART: Record<Exclude<EducationKind, "all">, { icon: LucideIcon; art: string }> = {
  university: { icon: GraduationCap, art: "edu-art-university" },
  academy: { icon: Briefcase, art: "edu-art-academy" },
  public: { icon: Landmark, art: "edu-art-public" },
  online: { icon: MonitorSmartphone, art: "edu-art-online" },
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
  const bt = useBilingual(SCOPE);
  const [kind, setKind] = useState<EducationKind>("all");
  const [query, setQuery] = useState("");

  const kindLabel = (value: EducationKind) => bt(KIND_KO[value], KIND_EN[value]);

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
      title={bt("웹툰 성장 · 교육 허브", "Webtoon growth · education hub")}
      intro={bt(
        "학과·학원·공공 교육을 한곳에서 비교하고, 지원사업과 공모 일정까지 창작 경로로 이어갑니다. 교육기관 정보는 공식 출처 확인일을 함께 표시합니다.",
        "Compare departments, academies, and public programs in one place, and connect subsidies and contest schedules into your creative path. Each institution shows when its official source was verified.",
      )}
    >
      <section className="grid gap-4 rounded-2xl border border-line bg-panel p-5 lg:grid-cols-[1fr_auto]">
        <label className="relative block">
          <span className="sr-only">{bt("교육기관 검색", "Search institutions")}</span>
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={bt("웹툰, 콘티, 취업, AI, 지역 등으로 검색", "Search by webtoon, storyboard, jobs, AI, region…")}
            className="min-h-11 w-full rounded-xl border border-line bg-canvas pl-10 pr-3 text-sm text-fg"
          />
        </label>
        <div className="flex flex-wrap gap-2" aria-label={bt("교육기관 유형", "Institution type")}>
          {(Object.keys(KIND_KO) as EducationKind[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={kind === value
                ? "min-h-11 rounded-xl border border-accent bg-accent-soft px-4 text-sm font-bold text-accent"
                : "min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-fg-2 hover:bg-raised"}
            >
              {kindLabel(value)}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const { icon: KindIcon, art } = KIND_ART[item.kind];
          return (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-line bg-panel">
              <div className={`edu-card-art ${art} relative flex h-24 items-center gap-4 overflow-hidden px-5`} aria-hidden="true">
                <KindIcon size={36} strokeWidth={1.5} className="edu-card-art-icon shrink-0" />
                <span className="edu-card-art-kind">{kindLabel(item.kind)}</span>
                <BookOpen size={20} className="edu-card-art-spark absolute right-5 top-5" aria-hidden="true" />
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                    {kindLabel(item.kind)}
                  </span>
                  <span className="text-xs text-fg-3">{item.region}</span>
                </div>
                <h2 className="mt-4 text-xl font-black">{item.name}</h2>
                <p className="mt-3 text-sm leading-6 text-fg-2">{item.summary}</p>
                {item.currentProgram ? (
                  <p className="mt-3 rounded-xl bg-raised p-3 text-xs leading-5 text-fg-2">
                    {bt("현재 확인", "Currently")}: {item.currentProgram}
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
                  <span className="text-xs text-fg-3">{bt("공식 정보 확인", "Official info verified")} {item.verifiedAt}</span>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {!items.length ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-panel px-6 py-12 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-on-accent shadow-lg">
            <SearchX size={28} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-black">{bt("조건에 맞는 교육기관이 없어요", "No institutions match")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-fg-2">
              {bt("다른 키워드나 유형을 선택해 보세요.", "Try a different keyword or type.")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setKind("all"); setQuery(""); }}
            className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-bold text-on-accent"
          >
            {bt("검색 초기화", "Clear search")}
          </button>
        </div>
      ) : null}

      <section aria-labelledby="education-connect-title" className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_240px] md:items-center">
        <div className="flex items-start gap-3">
          <CalendarDays size={22} className="mt-0.5 text-accent" aria-hidden="true" />
          <div>
            <h2 id="education-connect-title" className="font-black">{bt("교육만 보지 말고 모집 기회까지 연결하세요", "Don't stop at education — connect to opportunities")}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              {bt(
                "기존 작가 기회센터의 지원사업 검색과 연결해 교육 → 포트폴리오 → 공모·지원 → 데뷔 흐름을 이어갑니다.",
                "Connects to the creator opportunity center's subsidy search: education → portfolio → contests → debut.",
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/opportunities?q=웹툰"
                className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-on-accent"
              >
                {bt("웹툰 지원사업 찾기", "Find webtoon subsidies")}
              </Link>
              <Link
                to="/learn/recipes"
                className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-bold"
              >
                {bt("제작 레시피 보기", "View production recipes")}
              </Link>
            </div>
          </div>
        </div>
        <SectionArt image="learn" className="hidden h-36 w-full md:block" />
        </div>
      </section>
    </CreatorEcosystemLayout>
  );
}
