import { ArrowRight, Boxes, Brush, ChevronRight, Map as MapIcon, Users, type LucideIcon } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { HOME_CORE_STUDIOS, type HomeCoreStudioId } from "./reference-home-content";

const ICONS: Readonly<Record<HomeCoreStudioId, LucideIcon>> = {
  drawing: Brush,
  "three-d": Boxes,
  collaboration: Users,
  "virtual-studio": MapIcon,
};

/** 드로잉·3D·협업·가상 스튜디오를 홈 첫 화면 가까이에서 바로 여는 입구. */
export function HomeCoreStudios() {
  const bi = useBilingualLocalizer("domains.marketing.HomeCoreStudios");
  return (
    <section className="rd-core-studios" aria-labelledby="rd-core-studios-title">
      <div className="rd-core-heading">
        <h2 id="rd-core-studios-title">{bi("핵심 작업실, 바로 들어가기", "Jump into the core studios")}</h2>
        <p>{bi("그리기·3D·협업·가상 스튜디오를 한곳에 모았습니다.", "Drawing, 3D, team production and the virtual studio in one place.")}</p>
      </div>
      <ul className="rd-core-grid">
        {HOME_CORE_STUDIOS.map((studio) => {
          const Icon = ICONS[studio.id];
          const copy = bi(studio.ko, studio.en);
          return (
            <li key={studio.id} className="rd-core-card" data-core-studio={studio.id}>
              <img src={studio.image} srcSet={studio.imageSet} sizes="(max-width: 599px) 90vw, 25vw" alt="" width={640} height={400} loading="lazy" decoding="async" />
              <div className="rd-core-copy">
                <span className="rd-core-eyebrow"><Icon size={14} aria-hidden="true" />{studio.eyebrow}</span>
                <h3>{copy.title}</h3>
                <p>{copy.body}</p>
                <Link href={studio.href} className="rd-core-primary">{copy.action}<ArrowRight size={15} aria-hidden="true" /></Link>
                <Link href={studio.secondary.href} className="rd-core-secondary">{bi(studio.secondary.ko, studio.secondary.en)}<ChevronRight size={14} aria-hidden="true" /></Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
