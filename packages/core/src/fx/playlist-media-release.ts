type ReleasableMedia = Pick<HTMLMediaElement, "pause" | "removeAttribute" | "load">;

/** Pause alone retains media loaders. Clear the source after the crossfade to release them. */
export function releasePlaylistMedia(media: ReleasableMedia): void {
  try { media.pause(); } catch { /* A failing pause must not retain the resource. */ }
  try {
    media.removeAttribute("src");
    media.load();
  } catch { /* Cleanup remains safe for detached or unavailable media elements. */ }
}
