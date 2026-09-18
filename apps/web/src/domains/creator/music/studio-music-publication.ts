import { readWorkFx } from "../studio-motion-fx";

import type { LocalMusicTrack } from "./studio-music-client";

interface MusicPublicationWork {
  readonly id: string;
  readonly doc: Record<string, unknown>;
  readonly isOwner: boolean;
  readonly revision?: number;
}

export interface MusicWorkBgmPatch {
  readonly doc: Record<string, unknown>;
  readonly baseRevision?: number;
}

export interface SiteOstCurationCandidate {
  readonly version: 1;
  readonly reviewRequired: true;
  readonly generatedTrackId: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly track: {
    readonly id: string;
    readonly src: string;
    readonly title: string;
    readonly artist: "Creator submission";
    readonly role: "opening" | "creator" | "story" | "action" | "romance" | "ending";
    readonly origin: "original";
    readonly vocalMode: "vocal" | "instrumental";
    readonly language: string;
    readonly summary: string;
    readonly license: string;
    readonly creditUrl: string;
  };
}

export function normalizeHostedMusicUrl(value: string): string {
  const input = value.trim();
  if (!input || input.length > 2_048) throw new Error("배포용 음원 URL을 확인해 주세요.");
  let url: URL;
  try { url = new URL(input); }
  catch { throw new Error("배포용 음원 URL이 올바르지 않습니다."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("독자용 BGM은 인증정보·해시가 없는 HTTPS URL이어야 합니다.");
  }
  if (!/\.mp3$/iu.test(url.pathname)) {
    throw new Error("생성된 OST 게시 연결은 지속적인 HTTPS MP3 주소만 지원합니다.");
  }
  return url.toString();
}

export function buildMusicWorkBgmPatch(
  work: MusicPublicationWork,
  track: LocalMusicTrack,
  hostedUrl: string,
): MusicWorkBgmPatch {
  if (!work.isOwner) throw new Error("작품 소유자만 독자용 BGM을 변경할 수 있습니다.");
  if (!track.metadata.brief.rightsConfirmed) {
    throw new Error("배포 전에 음원 입력·가사 사용 권한을 다시 확인해 주세요.");
  }
  if (!track.metadata.brief.workId || track.metadata.brief.workId !== work.id) {
    throw new Error("현재 작품에 연결해 생성한 음원만 이 작품의 BGM으로 게시할 수 있습니다.");
  }
  const url = normalizeHostedMusicUrl(hostedUrl);
  const fx = readWorkFx(work.doc);
  return {
    doc: {
      ...work.doc,
      fx: { ...fx, bgmMood: "", bgmUrl: url },
    },
    ...(Number.isSafeInteger(work.revision) ? { baseRevision: work.revision } : {}),
  };
}

function siteRole(track: LocalMusicTrack): SiteOstCurationCandidate["track"]["role"] {
  const { purpose, mood } = track.metadata.brief;
  if (purpose === "opening") return "opening";
  if (purpose === "ending") return "ending";
  if (purpose === "trailer" || ["action", "hunter", "martial", "epic"].includes(mood)) return "action";
  if (["romance", "royal", "office", "school"].includes(mood)) return "romance";
  if (purpose === "bgm") return "story";
  return "creator";
}

export function buildSiteOstCurationCandidate(
  track: LocalMusicTrack,
  hostedUrl: string,
): SiteOstCurationCandidate {
  const url = normalizeHostedMusicUrl(hostedUrl);
  const brief = track.metadata.brief;
  return {
    version: 1,
    reviewRequired: true,
    generatedTrackId: track.metadata.id,
    workId: brief.workId,
    episodeId: brief.episodeId,
    track: {
      id: `creator-${track.metadata.id}`,
      src: url,
      title: brief.title,
      artist: "Creator submission",
      role: siteRole(track),
      origin: "original",
      vocalMode: brief.vocals ? "vocal" : "instrumental",
      language: brief.vocals ? brief.lyricsLanguage : "instrumental",
      summary: brief.scene.slice(0, 220),
      license: "Creator submission — verify provider terms and distribution rights before promotion",
      creditUrl: track.metadata.termsUrl,
    },
  };
}
