import { Link } from "react-router-dom";

import {
  OPEN_DATA_PROVIDERS,
  RESOURCE_SEARCH_CONFIG,
} from "./resource-search-config";
import { RESOURCE_BUTTON } from "./navigation";
import { ResourceLayout } from "./ResourceLayout";

import type { ResourceProvider } from "@/shared/lib/creator-resources";

import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";

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
  return <ResourceLayout
    title="공개 데이터 창작실"
    intro="국내외 공식 Open API를 장면·고증·대사·생물·음악·역사 자료로 검색하고, 출처와 이용 범위를 보존한 채 하나의 제작 보드에 저장하세요."
  >
    <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-good/30 bg-good/10 p-5">
        <p className="text-2xl font-bold">{OPEN_DATA_PROVIDERS.filter((provider) => KEYLESS.has(provider)).length}</p>
        <p className="mt-1 text-sm text-fg-2">가입·키 없이 즉시 검색</p>
      </div>
      <div className="rounded-2xl border border-accent/30 bg-accent-soft p-5">
        <p className="text-2xl font-bold">{OPEN_DATA_PROVIDERS.filter((provider) => !KEYLESS.has(provider)).length}</p>
        <p className="mt-1 text-sm text-fg-2">무료 서버 키 연결형</p>
      </div>
      <div className="rounded-2xl border border-line bg-panel p-5">
        <p className="text-2xl font-bold">1</p>
        <p className="mt-1 text-sm text-fg-2">공통 출처·권리 보드</p>
      </div>
    </section>
    <section className="rounded-2xl border border-line bg-panel p-6">
      <h2 className="text-xl font-bold">검색 결과를 바로 완성 에셋으로 오해하지 않습니다</h2>
      <p className="mt-3 text-sm leading-7 text-fg-2">Studio 직접 가져오기는 CC0가 확인된 ambientCG에만 허용합니다. NASA·V&A는 안전한 미리보기를 레퍼런스 전용으로 표시하고, 나머지 제공처는 메타데이터와 원문 링크만 저장합니다. 이미지·본문·음원·가사의 권리는 원 레코드에서 다시 확인합니다.</p>
    </section>
    <section className="grid gap-4 md:grid-cols-2">
      {OPEN_DATA_PROVIDERS.map((provider) => {
        const config = RESOURCE_SEARCH_CONFIG[provider];
        const keyless = KEYLESS.has(provider);
        return <article key={provider} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${keyless ? "border-good/30 bg-good/10" : "border-accent/30 bg-accent-soft text-accent"}`}>
              {keyless ? "가입·키 없음" : "무료 서버 키 필요"}
            </span>
            <span className="text-xs text-fg-2">{WORKFLOW[provider]}</span>
          </div>
          <h2 className="text-lg font-bold">{RESOURCE_LABELS[provider]}</h2>
          <p className="flex-1 text-sm leading-7 text-fg-2">{config.intro}</p>
          <Link className={`${RESOURCE_BUTTON} self-start bg-accent-soft`} to={`/research/open-data/${provider}`}>
            검색 도구 열기
          </Link>
        </article>;
      })}
    </section>
    <section className="flex flex-wrap gap-3 rounded-2xl border border-line bg-panel p-6">
      <Link className={RESOURCE_BUTTON} to="/research">전체 저장 보드</Link>
      <Link className={RESOURCE_BUTTON} to="/research/materials">무료 소재 도감</Link>
      <Link className={RESOURCE_BUTTON} to="/research/open-creation">무료 창작 재료실</Link>
      <Link className={RESOURCE_BUTTON} to="/insights/resources">전체 제공처·연동 상태</Link>
    </section>
  </ResourceLayout>;
}
