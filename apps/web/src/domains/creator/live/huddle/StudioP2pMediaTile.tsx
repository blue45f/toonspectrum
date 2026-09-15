import { useEffect, useRef, useState } from "react";

export const P2P_CONTROL_CLASS = "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2 text-xs text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
export function StudioP2pMediaTile({ stream, name, muted, visual }: {
  stream: MediaStream | null; name: string; muted: boolean; visual: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let active = true; video.srcObject = stream;
    if (stream) void video.play().then(() => { if (active) setNeedsPlay(false); })
      .catch(() => { if (active) setNeedsPlay(true); });
    else setNeedsPlay(false);
    return () => { active = false; video.srcObject = null; };
  }, [stream, muted]);
  return <div className="relative overflow-hidden rounded-xl border border-line bg-panel">
    {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Live WebRTC has no prerecorded captions; typed P2P chat is offered alongside. */}
    <video ref={ref} autoPlay playsInline muted={muted} aria-label={`${name} 영상`}
      className={visual ? "aspect-video w-full object-contain" : "h-0 w-0"} />
    {!visual && <div className="grid h-16 place-items-center text-lg text-fg-3" aria-hidden>{name.slice(0, 1)}</div>}
    <p className="truncate px-2 py-1 text-xs text-fg">{name}</p>
    {needsPlay && <button className={P2P_CONTROL_CLASS} type="button" onClick={() => {
      void ref.current?.play().then(() => setNeedsPlay(false)).catch(() => setNeedsPlay(true));
    }}>소리·영상 재생</button>}
  </div>;
}
