import type { SiteOstTrack } from "@/shared/lib/site-background-music";

interface Props {
  tracks: readonly SiteOstTrack[];
  activeTrack: SiteOstTrack | null;
  korean: boolean;
  onSelect: (id: string) => void;
}

export function SiteOstTrackSelect({ tracks, activeTrack, korean, onSelect }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-fg-2">
        {korean ? `전체 OST · ${tracks.length}곡` : `All OST · ${tracks.length} tracks`}
        <select aria-label={korean ? "OST 곡 선택" : "Select OST track"} disabled={tracks.length === 0} value={activeTrack?.id ?? ""} onChange={(event) => onSelect(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-2 text-xs text-fg outline-none focus:border-accent">
          {!activeTrack ? <option value="">{korean ? "곡을 선택하세요" : "Select a track"}</option> : null}
          {tracks.map((track) => <option key={track.id} value={track.id}>{track.title} · {track.vocalMode === "vocal" ? (korean ? "보컬" : "Vocal") : (korean ? "연주" : "Instrumental")} · {Math.floor(track.durationMs / 60_000)}:{String(Math.floor(track.durationMs / 1_000) % 60).padStart(2, "0")}</option>)}
        </select>
      </label>
      <p className="text-[0.6875rem] text-fg-3">{korean ? "직접 선택하면 페이지 자동 전환이 꺼집니다. 재생 버튼으로 시작하세요." : "Selecting a track turns off page following. Press play to start."}</p>
      {activeTrack ? <a href={activeTrack.src} download={`${activeTrack.id}.mp3`} className="inline-flex min-h-9 items-center text-xs font-bold text-accent underline underline-offset-4">{korean ? "현재 곡 MP3 저장" : "Save current MP3"}</a> : null}
    </div>
  );
}
