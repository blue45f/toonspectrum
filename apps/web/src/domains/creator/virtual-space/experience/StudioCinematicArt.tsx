import { useState } from "react";
import { ImageOff } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { STUDIO_CINEMATIC_ART, studioCinematicArtUrl, type StudioCinematicArtId } from "./studio-cinematic-art";

interface StudioCinematicArtProps {
  readonly id: StudioCinematicArtId;
  readonly priority?: boolean;
  readonly alt?: string;
}

function ArtImage({ id, priority = false, alt = "" }: StudioCinematicArtProps) {
  const bt = useBilingual("StudioCinematicArt");
  const [failed, setFailed] = useState(false);
  const art = STUDIO_CINEMATIC_ART.find((candidate) => candidate.id === id);
  if (failed) return <div className="studio-cinematic-art__fallback" role="img"
    aria-label={bt("풍경 이미지를 불러오지 못했습니다. 입장과 공간 조작은 계속 사용할 수 있습니다.", "Scenery could not load. Entry and workspace controls remain available.")}>
    <ImageOff size={30} aria-hidden /><span>{bt("풍경을 불러오지 못했어요", "Scenery unavailable")}</span>
  </div>;
  return <picture className="studio-cinematic-art" data-cinematic-art={id}>
    <source type="image/webp" srcSet={`${studioCinematicArtUrl(id, 480)} 480w, ${studioCinematicArtUrl(id)} 1024w`}
      sizes="(max-width: 600px) 100vw, 1024px" />
    <img src={studioCinematicArtUrl(id)} alt={alt} width={1024} height={art?.height ?? 682}
      loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"}
      decoding="async" draggable={false} onError={() => setFailed(true)} />
  </picture>;
}

export function StudioCinematicArt(props: StudioCinematicArtProps) {
  return <ArtImage key={props.id} {...props} />;
}
