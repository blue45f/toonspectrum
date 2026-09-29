import { Check, Layers3, Plug2, MousePointerClick } from "lucide-react";

import { RESOURCE_BUTTON } from "../navigation";
import { useCountUp } from "./useCountUp";
import "./material-discovery.css";

/**
 * 소재 페이지 상단 마케팅 배너. 경쟁사 대비 장점 3가지를 숫자와 함께 어필한다.
 */
export function MaterialAdvantageBanner({ assetCount, providerCount }: { assetCount: number; providerCount: number }) {
  const assets = useCountUp(assetCount);
  const providers = useCountUp(providerCount);
  const points = [
    { icon: Layers3, text: "유료 생성 API 없이 바로 쓰는 CC0 실측 소재" },
    { icon: Plug2, text: "Poly Haven·ambientCG 공식 오픈 API 연동, 한글 검색 지원" },
    { icon: MousePointerClick, text: "클릭 한 번으로 장면 보드에 담고 스튜디오 캔버스로" },
  ];
  return <section className="md-advantage-banner" aria-labelledby="md-advantage-title">
    <div>
      <p className="text-xs font-bold tracking-widest text-accent">WHY TOONSTUDIO MATERIALS</p>
      <h2 id="md-advantage-title" className="mt-2 text-xl font-bold sm:text-2xl">배경·소품 고민은 여기서 끝내세요</h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-fg-2">경쟁사 레퍼런스 탐색과 달리, ToonStudio 소재 도감은 찾은 소재를 장면 보드에 담아 명세서로 내보내고, 원클릭으로 스튜디오 작업과 연결합니다. 가입·API 키·카드 등록이 필요 없습니다.</p>
    </div>
    <div className="md-advantage-stats" role="list" aria-label="소재 도감 핵심 수치">
      <div className="md-advantage-stat" role="listitem"><strong aria-label={`무료 소재 ${assetCount}개`}>{assets.toLocaleString("ko-KR")}+</strong><span>무료 CC0 소재</span></div>
      <div className="md-advantage-stat" role="listitem"><strong aria-label={`오픈 API 제공처 ${providerCount}곳`}>{providers}</strong><span>오픈 API 제공처</span></div>
      <div className="md-advantage-stat" role="listitem"><strong>1-click</strong><span>스튜디오로 보내기</span></div>
    </div>
    <ul className="md-advantage-points">
      {points.map(({ icon: Icon, text }) => <li key={text}><Icon size={16} aria-hidden="true" />{text}</li>)}
    </ul>
    <div className="flex flex-wrap gap-2">
      <a className={`${RESOURCE_BUTTON} border-accent bg-accent text-on-accent hover:bg-accent-2`} href="#material-search"><Check size={15} aria-hidden="true" />지금 소재 찾아보기</a>
      <a className={RESOURCE_BUTTON} href="#material-board">장면 소재 목록 열기</a>
    </div>
  </section>;
}
