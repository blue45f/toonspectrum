import { FileJson, Link2 } from "lucide-react";
import { useState } from "react";

import { getApiErrorMessage } from "@/platform/api";
import { getWork, updateWork } from "@/platform/creator-client";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { MUSIC_OST_ANCHORS } from "./music-ost-flow";
import {
  buildMusicWorkBgmPatch,
  buildSiteOstCurationCandidate,
  normalizeHostedMusicUrl,
} from "./studio-music-publication";

import type { LocalMusicTrack } from "./studio-music-client";

const INPUT = "w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50";
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const CANDIDATE_URL_LIFETIME_MS = 5_000;
const MUSIC_PUBLISH_ANCHOR = MUSIC_OST_ANCHORS.connect;

/**
 * 작품에 연결해 만든 음원을 독자용 효과툰 BGM(작품 문서)으로 저장하는 영역.
 * 작품·회차 범위가 바뀌면 부모가 key로 새로 만들어 입력 상태를 비운다.
 */
export function MusicPublicationPanel({
  workId,
  tracks,
  onLinked,
}: {
  readonly workId: string;
  readonly tracks: readonly LocalMusicTrack[];
  readonly onLinked: (trackId: string) => void;
}) {
  const bt = useBilingual("MusicPublicationPanel");
  const [selectedId, setSelectedId] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // 목록에서 사라진 곡을 고르고 있었다면 첫 곡으로 되돌린다(파생 상태라 effect가 필요 없다).
  const track = tracks.find((entry) => entry.metadata.id === selectedId) ?? tracks[0] ?? null;
  const ready = Boolean(track && url.trim()) && !busy;

  const publish = async () => {
    if (!track || busy) return;
    setBusy(true);
    setStatus(bt("작품 BGM 연결 상태를 확인하는 중…", "Checking the work's BGM link…"));
    try {
      const work = await getWork(workId);
      await updateWork(workId, buildMusicWorkBgmPatch(work, track, url));
      setUrl(normalizeHostedMusicUrl(url));
      setStatus(bt("작품 문서에 독자용 BGM을 저장했습니다. 공개 작품의 효과툰 플레이어가 이 HTTPS 음원을 사용합니다.", "Saved the reader BGM to the work. The published effect-toon player will use this HTTPS audio."));
      onLinked(track.metadata.id);
    } catch (reason) {
      setStatus(await getApiErrorMessage(reason, bt("작품 BGM 연결을 완료하지 못했습니다.", "Couldn't finish linking the work's BGM.")));
    } finally {
      setBusy(false);
    }
  };

  const downloadCandidate = () => {
    if (!track) return;
    try {
      const candidate = buildSiteOstCurationCandidate(track, url);
      const blob = new Blob([JSON.stringify(candidate, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `site-ost-candidate-${track.metadata.id}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), CANDIDATE_URL_LIFETIME_MS);
      setStatus(bt("사이트 전역 OST는 자동 승격하지 않습니다. 검수·권리 확인용 후보 manifest를 저장했습니다.", "The site-wide OST is never promoted automatically. Saved a candidate manifest for review and rights checks."));
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : bt("사이트 OST 후보 정보를 만들지 못했습니다.", "Couldn't build the site OST candidate."));
    }
  };

  return (
    <aside
      id={MUSIC_PUBLISH_ANCHOR}
      tabIndex={-1}
      aria-label={bt("독자용 BGM 게시 연결", "Reader BGM publishing")}
      className="scroll-mt-24 space-y-3 rounded-2xl border border-accent/30 bg-accent/5 p-4 focus:outline-none"
    >
      <h3 className="flex items-center gap-2 font-semibold"><Link2 size={16} aria-hidden="true" />{bt("독자용 BGM 게시 연결", "Reader BGM publishing")}</h3>
      <p className="text-xs leading-5 text-fg-2">{bt("생성 음원은 먼저 MP3로 저장해 지속적인 HTTPS 주소에 호스팅하세요. 여기서 저장한 URL은 작품 문서의 효과툰 BGM으로 들어가 실제 독자 플레이어가 사용합니다.", "Save the audio as MP3 and host it at a stable HTTPS address first. The URL saved here becomes the work's effect-toon BGM used by the real reader player.")}</p>
      <label className="block space-y-1.5 text-xs font-medium">
        {bt("연결할 음원", "Audio to link")}
        <select aria-label={bt("독자용 BGM 음원", "Reader BGM audio")} className={INPUT} value={track?.metadata.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
          {tracks.map((entry) => (
            <option key={entry.metadata.id} value={entry.metadata.id}>
              {entry.metadata.brief.title}{entry.metadata.brief.episodeId ? ` · ${entry.metadata.brief.episodeId}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5 text-xs font-medium">
        {bt("배포용 HTTPS MP3 URL", "Hosted HTTPS MP3 URL")}
        <input
          aria-label={bt("배포용 HTTPS MP3 URL", "Hosted HTTPS MP3 URL")}
          type="url"
          inputMode="url"
          className={INPUT}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://cdn.example.com/my-original-ost.mp3"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} disabled={!ready} onClick={() => void publish()}>
          <Link2 size={15} aria-hidden="true" />{busy ? bt("작품에 저장 중…", "Saving to the work…") : bt("작품 독자용 BGM으로 저장", "Save as the work's reader BGM")}
        </button>
        <button type="button" className={BUTTON} disabled={!ready} onClick={downloadCandidate}>
          <FileJson size={15} aria-hidden="true" />{bt("사이트 OST 검수 후보 JSON", "Site OST review candidate JSON")}
        </button>
      </div>
      <p className="text-xs leading-5 text-fg-3">{bt("사이트 전역 OST는 임의 자동 승격하지 않습니다. 후보 JSON은 운영 검수·권리 확인 후 정적 playlist에 반영하기 위한 제출 자료입니다.", "The site-wide OST is never promoted on its own. The candidate JSON is a submission for operator review and rights checks before it reaches the static playlist.")}</p>
      {status ? <p role="status" className="rounded-lg border border-line bg-card/60 p-2 text-xs leading-5">{status}</p> : null}
    </aside>
  );
}

/** 아직 연결할 곡이 없을 때 4단계 안내가 가리키는 자리. */
export function MusicPublicationHint({ workLinked }: { readonly workLinked: boolean }) {
  const bt = useBilingual("MusicPublicationPanel.hint");
  return (
    <div id={MUSIC_PUBLISH_ANCHOR} tabIndex={-1} className="scroll-mt-24 rounded-2xl border border-dashed border-line p-4 text-xs leading-5 text-fg-3 focus:outline-none">
      <p className="flex items-center gap-2 font-semibold text-fg-2"><Link2 size={15} aria-hidden="true" />{bt("작품에 연결하기", "Link to a work")}</p>
      <p className="mt-1">
        {workLinked
          ? bt("이 작품에 연결해 만든 곡이 생기면 여기서 독자용 BGM으로 저장할 수 있어요.", "Once you make a track for this work, you can save it here as reader BGM.")
          : bt("작품 화면에서 ‘음악 만들기’로 이 화면을 열면, 만든 곡을 그 작품의 독자용 BGM으로 연결할 수 있어요.", "Open this page from a work's “Make music” action to link tracks to that work's reader BGM.")}
      </p>
    </div>
  );
}
