import { Link } from "react-router-dom";

import {
  OPEN_DATA_PROVIDERS,
  RESOURCE_SEARCH_CONFIG,
} from "./resource-search-config";
import { RESOURCE_BUTTON } from "./navigation";
import { ResourceLayout } from "./ResourceLayout";

import type { ResourceProvider } from "@/shared/lib/creator-resources";

import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";
import {
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { MotionIllustration } from "@/shared/motion-assets";

const SCOPE = "domains.creator.resources.OpenDataLabPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

const KEYLESS = new Set<ResourceProvider>([
  "ambientcg", "vam", "nasa", "gbif", "musicbrainz",
  "internetarchive", "kheritage", "wikimedia",
]);
const WORKFLOW: Record<typeof OPEN_DATA_PROVIDERS[number], string> = {
  ambientcg: "배경 재질·HDRI·3D 소품",
  vam: "복식·직물·가구 고증",
  nasa: "우주·과학·SF 장면",
  gbif: "동식물·크리처 설정",
  musicbrainz: "장면별 음악 레퍼런스",
  internetarchive: "역사 도서·잡지·영상",
  kheritage: "한국 시대·장소 고증",
  neis: "학교물 배경 설정",
  tourapi: "실제 장소 기반 장면",
  korean: "캐릭터 어휘·대사",
  smithsonian: "박물관·과학·문화유산",
  wikimedia: "백과 조회 관심 변화",
  europeana: "유럽 문화유산 횡단 검색",
  dpla: "미국 역사 자료 횡단 검색",
};
export function OpenDataLabPage() {
  useBilingualI18nRevision();
  const keylessCount = OPEN_DATA_PROVIDERS.filter((provider) => KEYLESS.has(provider)).length;
  const keyedCount = OPEN_DATA_PROVIDERS.filter((provider) => !KEYLESS.has(provider)).length;
  return <ResourceLayout
    title={tx("공개 데이터 창작실")}
    intro={tx("국내외 공식 Open API를 장면·고증·대사·생물·음악·역사 자료로 검색하고, 출처와 이용 범위를 보존한 채 하나의 제작 보드에 저장하세요.")}
  >
    <section aria-label={tx("제공처 통계")} className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-stretch">
      <div className="flex items-center gap-4 rounded-2xl border border-accent/30 bg-accent-soft/50 p-5">
        <MotionIllustration
          name="layers"
          size="xl"
          className="shrink-0 text-accent"
          title={tx("공개 데이터 레이어 일러스트")}
        />
        <div>
          <p className="eyebrow text-accent">{txEn("OPEN DATA FOR CREATORS")}</p>
          <p className="mt-2 text-sm leading-7 text-fg-2">{tx("공식 제공처만 사용합니다. 가입·키 없이 바로 검색하거나, 무료 서버 키로 연결하세요.")}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-good/30 bg-good/10 p-5">
          <p className="text-2xl font-bold">{keylessCount}</p>
          <p className="mt-1 text-sm text-fg-2">{tx("가입·키 없이 즉시 검색")}</p>
        </div>
        <div className="rounded-2xl border border-accent/30 bg-accent-soft p-5">
          <p className="text-2xl font-bold">{keyedCount}</p>
          <p className="mt-1 text-sm text-fg-2">{tx("무료 서버 키 연결형")}</p>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-5">
          <p className="text-2xl font-bold">1</p>
          <p className="mt-1 text-sm text-fg-2">{tx("공통 출처·권리 보드")}</p>
        </div>
      </div>
    </section>
    <section className="rounded-2xl border border-line bg-panel p-6">
      <div className="flex items-start gap-5">
        <MotionIllustration
          name="eye"
          size="lg"
          className="hidden shrink-0 text-accent sm:block"
          title={tx("레퍼런스 확인 일러스트")}
        />
        <div>
          <h2 className="text-xl font-bold">{tx("검색 결과를 바로 완성 에셋으로 오해하지 않습니다")}</h2>
          <p className="mt-3 text-sm leading-7 text-fg-2">{tx("Studio 직접 가져오기는 CC0가 확인된 ambientCG에만 허용합니다. NASA·V&A는 안전한 미리보기를 레퍼런스 전용으로 표시하고, 나머지 제공처는 메타데이터와 원문 링크만 저장합니다. 이미지·본문·음원·가사의 권리는 원 레코드에서 다시 확인합니다.")}</p>
        </div>
      </div>
    </section>
    <section aria-labelledby="open-data-providers-title" className="grid gap-4 md:grid-cols-2">
      <h2 id="open-data-providers-title" className="sr-only">{tx("공개 데이터 제공처")}</h2>
      {OPEN_DATA_PROVIDERS.map((provider) => {
        const config = RESOURCE_SEARCH_CONFIG[provider];
        const keyless = KEYLESS.has(provider);
        return <article key={provider} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${keyless ? "border-good/30 bg-good/10" : "border-accent/30 bg-accent-soft text-accent"}`}>
              {keyless ? tx("가입·키 없음") : tx("무료 서버 키 필요")}
            </span>
            <span className="text-xs text-fg-2">{tx(WORKFLOW[provider])}</span>
          </div>
          <h3 className="text-lg font-bold">{RESOURCE_LABELS[provider]}</h3>
          <p className="flex-1 text-sm leading-7 text-fg-2">{tx(config.intro)}</p>
          <Link className={`${RESOURCE_BUTTON} self-start bg-accent-soft`} to={`/research/open-data/${provider}`}>
            {tx("검색 도구 열기")}
          </Link>
        </article>;
      })}
    </section>
    <section className="flex flex-wrap gap-3 rounded-2xl border border-line bg-panel p-6">
      <Link className={RESOURCE_BUTTON} to="/research">{tx("전체 저장 보드")}</Link>
      <Link className={RESOURCE_BUTTON} to="/research/material-assets">{tx("무료 소재 도감")}</Link>
      <Link className={RESOURCE_BUTTON} to="/research/open-creation">{tx("무료 창작 재료실")}</Link>
      <Link className={RESOURCE_BUTTON} to="/insights/resources">{tx("전체 제공처·연동 상태")}</Link>
    </section>
  </ResourceLayout>;
}
