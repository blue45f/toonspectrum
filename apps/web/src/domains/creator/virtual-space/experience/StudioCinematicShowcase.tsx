import { useState } from "react";
import { ArrowUpRight, Compass, Image } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioCinematicArt } from "./StudioCinematicArt";
import { STUDIO_CINEMATIC_ART } from "./studio-cinematic-art";
import "./studio-cinematic-experience.css";

export function StudioCinematicShowcase() {
  const bt = useBilingual("StudioCinematicShowcase");
  const [index, setIndex] = useState(0);
  const art = STUDIO_CINEMATIC_ART[index] ?? STUDIO_CINEMATIC_ART[0];
  return <section className="studio-cinematic-showcase" aria-label={bt("스튜디오 아트 둘러보기", "Explore studio art")}>
    <div className="studio-cinematic-showcase__scene">
      <StudioCinematicArt id={art.id} priority />
      <div className="studio-cinematic-showcase__brand" aria-hidden><Compass size={18} />TOONSTUDIO / CREATIVE CAMPUS</div>
      <div className="studio-cinematic-showcase__caption" aria-live="polite">
        <span>{bt("이야기가 시작되는 곳", "Where stories begin")}</span>
        <h2>{bt(art.labelKo, art.labelEn)}</h2>
        <p>{bt(art.descriptionKo, art.descriptionEn)}</p>
      </div>
    </div>
    <div className="studio-cinematic-showcase__controls" role="group" aria-label={bt("풍경 선택", "Choose scenery")}>
      {STUDIO_CINEMATIC_ART.map((item, itemIndex) => <button type="button" key={item.id}
        aria-pressed={index === itemIndex} onClick={() => setIndex(itemIndex)}>
        <span aria-hidden>{String(itemIndex + 1).padStart(2, "0")}</span>{bt(item.labelKo, item.labelEn)}<ArrowUpRight size={14} aria-hidden />
      </button>)}
    </div>
    <p className="studio-cinematic-showcase__disclosure"><Image size={13} aria-hidden />{bt(
      "생성 아트로 표현한 공간 컨셉입니다. 이미지 속 인물·버튼은 실제 접속자나 조작 UI가 아닙니다.",
      "Generated concept art. People and buttons within the image are not live participants or interactive controls.")}</p>
  </section>;
}
