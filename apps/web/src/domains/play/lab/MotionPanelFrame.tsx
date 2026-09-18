import { useId } from "react";
import type { Ref } from "react";
import { comicCast } from "@/shared/components/comic/comic-cast";
import type { ComicCastId } from "@/shared/components/comic/comic-cast";
import { PlayArtwork } from "./PlayArtwork";
import { cameraTransform, motionCaptionLines, motionPreset } from "./motion-panel-model";
import type { MotionPresetId } from "./motion-panel-model";

export function MotionPanelFrame({ svgRef, preset, progress, caption, cast, image, bubble, sfx }: { svgRef: Ref<SVGSVGElement>; preset: MotionPresetId; progress: number; caption: string; cast: ComicCastId; image: string | null; bubble: boolean; sfx: boolean }) {
  const id = useId().replaceAll(":", "");
  const ink = "oklch(.28 .025 68)", paper = "oklch(.95 .03 85)";
  const lines = motionCaptionLines(caption);
  return <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" className="motion-panel-frame" role="img" aria-label={`${comicCast(cast).name}의 모션 컷 미리보기. ${caption}`}>
    <defs><clipPath id={`${id}-frame`}><rect x="14" y="14" width="932" height="572" rx="12" /></clipPath></defs>
    <rect width="960" height="600" fill={paper} />
    <g clipPath={`url(#${id}-frame)`}>
      <rect x="14" y="14" width="932" height="572" fill="oklch(.30 .018 68)" />
      <g transform={cameraTransform(preset, progress)} data-motion-art="true">
        {image ? <image href={image} width="960" height="600" preserveAspectRatio="xMidYMid slice" /> : <PlayArtwork kind="hero" />}
      </g>
      {sfx && <text x="850" y="110" textAnchor="end" fill={paper} stroke={ink} strokeWidth="2" paintOrder="stroke" fontFamily="sans-serif" fontSize="52" fontWeight="900" transform="rotate(7 850 110)">{motionPreset(preset).sfx}</text>}
      {bubble && <g><path d="M368 392H896Q918 392 918 414V540Q918 563 896 563H440L402 584L410 563H368Q346 563 346 540V414Q346 392 368 392Z" fill={paper} stroke={ink} strokeWidth="3" /><text x="374" y="426" fontFamily="sans-serif" fontSize="17" fontWeight="700" fill={ink}>{comicCast(cast).name} · 나의 다음 장면</text><text x="374" y="462" fontFamily="sans-serif" fontSize="23" fontWeight="600" fill={ink}>{lines.map((line, index) => <tspan x="374" dy={index ? 33 : 0} key={index}>{line}</tspan>)}</text></g>}
    </g>
    <rect x="14" y="14" width="932" height="572" rx="12" fill="none" stroke={ink} strokeWidth="5" />
  </svg>;
}
