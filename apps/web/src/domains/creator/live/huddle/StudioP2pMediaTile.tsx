import { useEffect, useRef, useState } from "react";

export const P2P_CONTROL_CLASS = "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2 text-xs text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

function playCurrent(media: HTMLMediaElement | null, reportBlocked: (blocked: boolean) => void): void {
  const source = media?.srcObject;
  if (!media || !source) return;
  void media.play().then(() => {
    if (media.srcObject === source) reportBlocked(false);
  }).catch(() => {
    if (media.srcObject === source) reportBlocked(true);
  });
}

export function StudioP2pMediaTile({ stream, name, muted, visual }: {
  stream: MediaStream | null; name: string; muted: boolean; visual: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [videoBlocked, setVideoBlocked] = useState(false);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const tracks = stream?.getAudioTracks() ?? [];
    audio.srcObject = tracks.length ? new MediaStream(tracks) : null;
    setAudioBlocked(false);
    playCurrent(audio, setAudioBlocked);
    return () => { audio.srcObject = null; };
  }, [stream, muted]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = visual ? stream?.getVideoTracks() ?? [] : [];
    video.srcObject = tracks.length ? new MediaStream(tracks) : null;
    setVideoBlocked(false);
    playCurrent(video, setVideoBlocked);
    return () => { video.srcObject = null; };
  }, [stream, visual]);
  return <div className="relative overflow-hidden rounded-xl border border-line bg-panel">
    {/* A negotiated but inactive video track must never stall an audio-only call. */}
    {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Live voice has typed P2P chat alongside it. */}
    <audio ref={audioRef} autoPlay muted={muted} aria-label={`${name} 음성`} />
    { }
    <video ref={videoRef} autoPlay playsInline muted aria-label={`${name} 영상`}
      className={visual ? "aspect-video w-full object-contain" : "h-0 w-0"} />
    {!visual && <div className="grid h-16 place-items-center text-lg text-fg-3" aria-hidden>{name.slice(0, 1)}</div>}
    <p className="truncate px-2 py-1 text-xs text-fg">{name}</p>
    {(audioBlocked || videoBlocked) && <button className={P2P_CONTROL_CLASS} type="button" onClick={() => {
      playCurrent(audioRef.current, setAudioBlocked);
      playCurrent(videoRef.current, setVideoBlocked);
    }}>소리·영상 재생</button>}
  </div>;
}
