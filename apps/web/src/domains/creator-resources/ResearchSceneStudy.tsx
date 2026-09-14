import { ArrowUpRight, Focus, Lightbulb, Shapes } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const STUDIES = [
  { id: "space", label: "공간과 구도", icon: Focus, query: "architecture", detail: "시선이 들어오고 머무는 곳. 건축 자료에서 원근과 공간의 리듬을 찾아보세요.", position: "42% 50%" },
  { id: "light", label: "빛과 색", icon: Lightbulb, query: "landscape painting", detail: "빛을 받는 면과 그림자의 온도. 회화 자료에서 장면의 시간과 감정을 읽어보세요.", position: "65% 35%" },
  { id: "object", label: "복식과 소품", icon: Shapes, query: "costume", detail: "인물이 살아온 흔적을 남기는 옷과 물건. 재료와 쓰임을 확인하고 웹툰 장면에 설득력을 더하세요.", position: "75% 70%" },
] as const;

/** The artwork is a concept illustration; provider searches remain the source of reference evidence. */
export function ResearchSceneStudy() {
  const [selected, setSelected] = useState(0);
  const study = STUDIES[selected];

  return <figure className="research-scene-study">
    <div className="research-scene-art">
      <img src="/brand/atelier-world.webp" alt="빛과 건축, 사물의 형태를 관찰할 수 있는 상상 속 화가의 항구 도시" width={1536} height={1024} style={{ objectPosition: study.position }} fetchPriority="high" />
      <div className={`research-viewfinder research-viewfinder--${study.id}`} aria-hidden="true"><span /><span /><span /><span /></div>
      <span className="research-art-label">VISUAL STUDY / CONCEPT ART</span>
    </div>
    <figcaption>
      <div className="research-study-lenses" role="group" aria-label="장면 관찰 관점">
        {STUDIES.map((item, index) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" aria-pressed={index === selected} onClick={() => setSelected(index)}><Icon size={14} aria-hidden="true" />{item.label}</button>;
        })}
      </div>
      <p aria-live="polite">{study.detail}</p>
      <Link to={`/research/assets?q=${encodeURIComponent(study.query)}&page=1`}>{study.label} 레퍼런스 찾기 <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </figcaption>
  </figure>;
}
