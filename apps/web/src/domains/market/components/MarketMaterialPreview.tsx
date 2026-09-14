import { ArrowUpRight, Brush, Layers3, Palette } from "lucide-react";
import { useState } from "react";

import Link from "@/compat/router-link";

import "./market-atelier.css";

const MATERIALS = [
  { id: "brush", label: "선과 질감", icon: Brush, title: "한 획에도, 작품의 성격을.", text: "선화와 채색에 필요한 브러시를 찾아보세요. 미리보기와 적용 조건을 확인하고 내 컷에 맞는 재료를 고를 수 있습니다.", href: "/market/browse?kind=brush", action: "브러시 탐색", position: "18% 38%" },
  { id: "palette", label: "색과 분위기", icon: Palette, title: "같은 장면, 다른 색의 온도.", text: "장면의 시간과 감정에 어울리는 색 조합. 팔레트에서 출발해 웹툰 전체의 색 흐름을 만들어보세요.", href: "/market/browse?kind=palette", action: "팔레트 탐색", position: "58% 38%" },
  { id: "asset", label: "장면과 소재", icon: Layers3, title: "이야기를 채우는 작은 디테일.", text: "배경과 소품, 효과까지. 반복해서 그려야 하는 장면에 쓸 2D 소재를 찾아 원고 제작의 흐름을 이어가세요.", href: "/market/browse?kind=asset", action: "2D 소재 탐색", position: "80% 66%" },
] as const;

export function MarketMaterialPreview() {
  const [selected, setSelected] = useState(0);
  const material = MATERIALS[selected];
  return <figure className="market-material-preview">
    <div className="market-material-image">
      <img src="/brand/atelier-materials.webp" alt="잉크 자국, 색 견본, 인물과 건축 스케치를 모은 웹툰 드로잉 재료 콘셉트 이미지" width={1536} height={1024} fetchPriority="high" style={{ objectPosition: material.position }} />
      <span className="market-material-label">THE ARTIST'S MATERIAL DESK</span>
    </div>
    <figcaption>
      <div className="market-material-tabs" role="group" aria-label="작업에 필요한 재료 선택">{MATERIALS.map((item, index) => { const Icon = item.icon; return <button key={item.id} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}><Icon size={14} aria-hidden="true" />{item.label}</button>; })}</div>
      <div className="market-material-description" aria-live="polite"><h2>{material.title}</h2><p>{material.text}</p></div>
      <div className="market-material-bottom"><span>재료 콘셉트 이미지</span><Link href={material.href}>{material.action}<ArrowUpRight size={15} aria-hidden="true" /></Link></div>
    </figcaption>
  </figure>;
}
