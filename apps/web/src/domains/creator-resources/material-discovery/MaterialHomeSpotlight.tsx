import { ArrowRight, Layers3, MousePointerClick, Plug2 } from "lucide-react";

import Link from "@/shared/navigation/router-link";

import catalogData from "../material-atlas/catalog.json";
import { MATERIAL_PROVIDERS, parseMaterialCatalog } from "../material-atlas/model";
import { useCountUp } from "./useCountUp";
import "./material-discovery.css";

const CATALOG = parseMaterialCatalog(catalogData);
const ASSET_COUNT = CATALOG?.assets.length ?? 0;
const PROVIDER_COUNT = Object.keys(MATERIAL_PROVIDERS).length;

const COPY = {
  ko: {
    eyebrow: "MATERIAL DISCOVERY",
    title: "배경·소품 고민은\n여기서 끝내세요",
    body: "경쟁사 레퍼런스 탐색과 달리, ToonStudio는 찾은 소재를 장면 보드에 담고, 출처 명세서로 내보내고, 원클릭으로 스튜디오 캔버스에 올립니다. 가입·API 키·카드 등록 없이 바로 시작하세요.",
    points: [
      { icon: Layers3, title: "유료 생성 API 없이", body: "실측 CC0 소재를 바로 쓰는 진짜 제작 자료" },
      { icon: Plug2, title: "공식 오픈 API 연동", body: "Poly Haven·ambientCG, 한글 검색 지원" },
      { icon: MousePointerClick, title: "클릭 한 번으로", body: "장면 보드에 담고 스튜디오 캔버스로" },
    ],
    stats: [
      { label: "무료 CC0 소재", suffix: "+" },
      { label: "오픈 API 제공처", suffix: "" },
      { label: "스튜디오로 보내기", suffix: "", fixed: "1-click" },
    ],
    primary: "소재 도감 열어보기",
    secondary: "트렌딩 소재 보기",
  },
  en: {
    eyebrow: "MATERIAL DISCOVERY",
    title: "Stop hunting for\nbackgrounds and props",
    body: "Unlike reference hunting elsewhere, ToonStudio lets you collect found materials onto a scene board, export a sourced specification, and send them to the studio canvas in one click. No sign-up, API key, or card required.",
    points: [
      { icon: Layers3, title: "No paid generation API", body: "Real production-ready CC0 materials" },
      { icon: Plug2, title: "Official open APIs", body: "Poly Haven and ambientCG, Korean search" },
      { icon: MousePointerClick, title: "One click", body: "Collect to a scene board, send to canvas" },
    ],
    stats: [
      { label: "Free CC0 materials", suffix: "+" },
      { label: "Open API providers", suffix: "" },
      { label: "Send to studio", suffix: "", fixed: "1-click" },
    ],
    primary: "Open the material atlas",
    secondary: "See trending materials",
  },
} as const;

type Locale = keyof typeof COPY;

/**
 * 홈 마케팅용 소재 탐색 스포트라이트.
 * 경쟁사 대비 장점 3가지와 카운트업 수치를 보여주고 소재 도감으로 유도한다.
 */
export function MaterialHomeSpotlight({ locale = "ko" }: { locale?: Locale }) {
  const copy = COPY[locale];
  const assets = useCountUp(ASSET_COUNT);
  const providers = useCountUp(PROVIDER_COUNT);
  const statValues = [assets.toLocaleString(locale === "ko" ? "ko-KR" : "en-US"), String(providers), null];
  return <section className="md-spotlight" aria-labelledby="md-spotlight-title" data-testid="material-home-spotlight">
    <div className="md-spotlight-copy">
      <p className="md-spotlight-eyebrow">{copy.eyebrow}</p>
      <h2 id="md-spotlight-title">{copy.title.split("\n").map((line, index) => <span key={index}>{line}<br /></span>)}</h2>
      <p className="md-spotlight-body">{copy.body}</p>
      <ul className="md-spotlight-points">
        {copy.points.map(({ icon: Icon, title, body }) => <li key={title}>
          <span className="md-spotlight-icon" aria-hidden="true"><Icon size={18} /></span>
          <div><strong>{title}</strong><span>{body}</span></div>
        </li>)}
      </ul>
      <div className="md-spotlight-actions">
        <Link href="/research/material-atlas" className="md-spotlight-primary">{copy.primary}<ArrowRight size={16} aria-hidden="true" /></Link>
        <Link href="/research/material-atlas#material-search" className="md-spotlight-secondary">{copy.secondary}</Link>
      </div>
    </div>
    <div className="md-spotlight-stats" role="list" aria-label={locale === "ko" ? "소재 도감 핵심 수치" : "Material atlas highlights"}>
      {copy.stats.map((stat, index) => <div key={stat.label} className="md-spotlight-stat" role="listitem">
        <strong>{stat.fixed ?? `${statValues[index] ?? 0}${stat.suffix}`}</strong>
        <span>{stat.label}</span>
      </div>)}
    </div>
  </section>;
}
