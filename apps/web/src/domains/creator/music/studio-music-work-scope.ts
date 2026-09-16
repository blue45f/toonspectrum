import type { MusicBrief } from "@toonspectrum/core/studio-music";

function readBoundedId(value: string | null | undefined): string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/u.test(value) ? value : "";
}

/** The current route, including an explicitly unbound music route, owns new requests. */
export function readMusicWorkId(value: string | null | undefined): string {
  return readBoundedId(value);
}

/** Episode binding is valid only inside a work scope. */
export function readMusicEpisodeId(
  value: string | null | undefined,
  workId: string,
): string {
  return readMusicWorkId(workId) ? readBoundedId(value) : "";
}

/** Keep the creative draft while changing its target; previous consent must not carry over. */
export function scopeMusicBrief(
  brief: MusicBrief,
  workId: string,
  episodeId = "",
): MusicBrief {
  const scopedWorkId = readMusicWorkId(workId);
  return {
    ...brief,
    instruments: [...brief.instruments],
    workId: scopedWorkId,
    episodeId: readMusicEpisodeId(episodeId, scopedWorkId),
    rightsConfirmed: false,
  };
}
