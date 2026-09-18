import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const PROCESS_STEPS = [
  { title: "구도를 설계하고", label: "SKETCH", description: "시선과 실루엣, 컷의 호흡. 선을 정리하기 전에 장면이 전하는 이야기를 먼저 잡습니다.", href: "/learn/paths/story-direction", action: "스토리·연출 과정" },
  { title: "선의 역할을 고르고", label: "LINEWORK", description: "형태를 설명하는 선, 무게를 주는 선. 브러시와 레이어를 다루며 나만의 표현을 찾아갑니다.", href: "/learn/paths/studio-quickstart", action: "드로잉 도구 실습" },
  { title: "색으로 완성합니다", label: "COLOR & LIGHT", description: "명도와 색의 온도를 나누고 빛을 더합니다. 채색 과정을 익혀 한 장면의 완성도를 높여보세요.", href: "/learn/paths/visual-finish", action: "그림 완성도 과정" },
] as const;

export function LearningProcessStudy() {
  const [selected, setSelected] = useState(0);
  const step = PROCESS_STEPS[selected];
  return <section className="learn-process-study" aria-labelledby="learn-process-title">
    <div className="learn-process-heading"><div><p className="learn-eyebrow">THE MAKING OF A SCENE</p><h2 id="learn-process-title">한 장면이 완성되는 과정.</h2></div><p>과정을 선택하고 필요한 실습으로 이어가세요.</p></div>
    <figure className="learn-process-art">
      <img src="/brand/atelier-process.webp" alt="같은 장면을 구상 스케치, 선화, 완성 채색으로 펼친 제작 과정 콘셉트 이미지" loading="lazy" width={1536} height={1024} />
      <figcaption>제작 과정 콘셉트 아트 · 단계별 표현을 살펴보세요</figcaption>
    </figure>
    <div className="learn-process-steps" role="group" aria-label="제작 과정 살펴보기">
      {PROCESS_STEPS.map((item, index) => <button key={item.label} type="button" aria-pressed={index === selected} onClick={() => setSelected(index)}><span className="learn-process-count">0{index + 1}</span><span><small>{item.label}</small><strong>{item.title}</strong></span><span aria-hidden="true">↗</span></button>)}
    </div>
    <div className="learn-process-detail"><p aria-live="polite">{step.description}</p><Link to={step.href}>{step.action}<ArrowUpRight size={16} aria-hidden="true" /></Link></div>
  </section>;
}
