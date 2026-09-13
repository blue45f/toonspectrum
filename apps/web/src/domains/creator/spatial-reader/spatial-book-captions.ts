import type { SpatialBook } from "./spatial-book";

function cueTime(seconds: number): string {
  const milliseconds = Math.round(seconds * 1000);
  return [Math.floor(milliseconds / 3_600_000), Math.floor(milliseconds / 60_000) % 60, Math.floor(milliseconds / 1000) % 60]
    .map(value => String(value).padStart(2, "0")).join(":") + "." + String(milliseconds % 1000).padStart(3, "0");
}

/** Authored panel dialogue, timed by the author's panel durations; not an inferred audio transcript. */
export function spatialBookVtt(book: SpatialBook): string {
  let elapsed = 0;
  const cues: string[] = ["WEBVTT", ""];
  book.panels.forEach((panel, index) => {
    const start = elapsed;
    elapsed += panel.seconds;
    const caption = panel.caption.replace(/\r\n?/gu, "\n").trim();
    if (!caption) return;
    const safe = caption.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/\n{2,}/gu, "\n");
    cues.push(String(index + 1), `${cueTime(start)} --> ${cueTime(elapsed)}`, safe, "");
  });
  return cues.join("\n");
}
