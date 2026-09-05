import { Download, FileText, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { LocalMusicTrack } from "./studio-music-client";

import { MUSIC_MOODS, musicFilename } from "@/lib/studio-music";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  // Let the download start before releasing its URL (especially on WebKit).
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const actionClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line px-3 text-xs hover:bg-panel focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";
export function MusicTrackCard({ track, saved, busy, onDelete, onReuse }: {
  track: LocalMusicTrack; saved: boolean; busy: boolean;
  onDelete: () => Promise<void>; onReuse: () => void;
}) {
  const [url, setUrl] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [repeat, setRepeat] = useState(false);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(track.audio);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [track.audio]);
  const b = track.metadata.brief;
  const downloadAudio = () => { try { download(track.audio, musicFilename(b.title)); } catch { setError("음원을 다운로드하지 못했습니다."); } };
  const downloadMetadata = () => {
    try { download(new Blob([JSON.stringify(track.metadata, null, 2)], { type: "application/json" }), musicFilename(b.title).replace(/\.mp3$/, ".json")); }
    catch { setError("제작 정보를 다운로드하지 못했습니다."); }
  };
  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); setConfirming(false); }
  };
  return (
    <article className="space-y-3 rounded-2xl border border-line bg-card p-4" aria-label={`${b.title} 음원`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h3 className="break-words font-semibold">{b.title}</h3><p className="mt-1 text-xs text-fg-3">{MUSIC_MOODS.find((m) => m.id === b.mood)?.label} · 요청 {b.seconds}초 · {b.vocals ? "보컬" : "연주곡"}</p></div>
        <span className="shrink-0 rounded-full bg-panel px-2 py-1 text-xs text-fg-2">{saved ? "기기에 저장됨" : "아직 미저장"}</span>
      </div>
      <p className="line-clamp-2 text-sm text-fg-2">{b.scene}</p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Music-only playback; the original lyric text is offered below for vocal requests. */}
      {url && <audio aria-label={`${b.title} 미리듣기`} className="w-full" src={url} controls preload="metadata" loop={repeat} onError={() => setError("브라우저에서 재생하지 못했습니다. MP3를 다운로드해 확인해 주세요.")} onPlay={(event) => { const current = event.currentTarget; document.querySelectorAll<HTMLAudioElement>("audio[data-toon-music]").forEach((audio) => { if (audio !== current) audio.pause(); }); }} data-toon-music />}
      {b.vocals && <details className="text-sm"><summary className="cursor-pointer">요청한 가사 보기</summary><p className="mt-2 whitespace-pre-wrap text-fg-2">{b.lyrics}</p><p className="mt-2 text-xs text-fg-3">생성 음원의 실제 가창과 다를 수 있습니다.</p></details>}
      <label className="flex min-h-8 items-center gap-2 text-xs text-fg-2"><input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} />반복 재생</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={actionClass} onClick={downloadAudio}><Download size={14} aria-hidden />MP3 저장</button>
        <button type="button" className={actionClass} onClick={downloadMetadata}><FileText size={14} aria-hidden />제작 정보</button>
        <button type="button" className={actionClass} onClick={onReuse} disabled={busy}><RotateCcw size={14} aria-hidden />설정 다시 사용</button>
        <button type="button" className={actionClass} onClick={() => setConfirming(true)} disabled={deleting}><Trash2 size={14} aria-hidden />삭제</button>
      </div>
      {confirming && <div className="rounded-lg border border-line p-3 text-sm"><p>이 기기의 음원을 삭제할까요? 필요한 MP3를 먼저 다운로드해 주세요.</p><div className="mt-2 flex gap-2"><button type="button" className={actionClass} disabled={deleting} onClick={() => void remove()}>삭제 확인</button><button type="button" className={actionClass} onClick={() => setConfirming(false)} disabled={deleting}>유지</button></div></div>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <p className="text-xs leading-relaxed text-fg-3">Eleven Music · {new Date(track.metadata.createdAt).toLocaleDateString("ko-KR")} · AI 생성 음원. 상용 이용은 공급자 요금제와 이용 조건을 확인해 주세요.</p>
    </article>
  );
}
