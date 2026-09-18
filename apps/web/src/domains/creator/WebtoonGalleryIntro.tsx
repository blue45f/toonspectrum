import { ArrowRight, BookOpen, PenLine, Trophy } from "lucide-react";

import { buildStudioHref } from "./creator-studio-links";
import "./webtoon-gallery.css";

import Link from "@/compat/router-link";

/** Editorial concept artwork illustrates panel rhythm, independently of community work data. */
export function WebtoonGalleryIntro() {
  return <section className="webtoon-gallery-intro" aria-labelledby="webtoon-gallery-title">
    <div className="webtoon-gallery-copy">
      <p className="eyebrow text-accent">TOONSTUDIO / WEBTOON SHOWCASE</p>
      <h1 id="webtoon-gallery-title">한 컷의 시선이,<br /><em>다음 이야기를 만듭니다.</em></h1>
      <p>섬세하게 그은 선, 독자를 멈춰 세우는 구도, 다음 컷으로 흐르는 대사. 직접 그린 웹툰과 일러스트를 나누고, 좋아하는 작가의 다음 장면을 만나세요.</p>
      <div className="webtoon-gallery-actions">
        <Link href="/studio" className="webtoon-gallery-primary"><PenLine size={17} aria-hidden="true" />웹툰 그리기<ArrowRight size={17} aria-hidden="true" /></Link>
        <Link href={buildStudioHref({ mode: "upload" })}><BookOpen size={16} aria-hidden="true" />작품 업로드</Link>
        <Link href="/showcase/challenges"><Trophy size={16} aria-hidden="true" />창작 챌린지</Link>
      </div>
    </div>
    <figure className="webtoon-gallery-story">
      <div className="webtoon-gallery-panels" aria-label="전경에서 인물과 클로즈업으로 이어지는 세 컷 구성 예시">
        <div className="webtoon-gallery-panel webtoon-gallery-panel--wide"><img src="/brand/atelier-world.webp" alt="햇빛이 비치는 항구 도시를 넓게 보여주는 도입 컷" width={1536} height={1024} /><span>01 / ESTABLISH</span></div>
        <div className="webtoon-gallery-panel webtoon-gallery-panel--character"><img src="/brand/atelier-world.webp" alt="도시를 바라보는 붉은 코트의 인물을 보여주는 컷" width={1536} height={1024} /><span>02 / FOLLOW</span></div>
        <div className="webtoon-gallery-panel webtoon-gallery-panel--detail"><img src="/brand/atelier-world.webp" alt="여행자의 스케치북으로 시선을 좁히는 마지막 컷" width={1536} height={1024} /><span>03 / DISCOVER</span></div>
      </div>
      <figcaption>컷의 크기와 시선으로 만드는 이야기의 호흡 <span>브랜드 콘셉트 아트 · 실제 게시 작품과 구분됩니다.</span></figcaption>
    </figure>
  </section>;
}
