import { useState } from "react";
import type { ReactNode } from "react";
import { COMIC_CAST, comicCast, comicPortrait } from "./comic-cast";
import type { ComicCastId } from "./comic-cast";
import "./comic-cast.css";

export function ComicPortrait({ cast, large = false }: { cast: ComicCastId; large?: boolean }) {
  const actor = comicCast(cast);
  const [failedSource, setFailedSource] = useState("");
  const source = comicPortrait(actor.id);
  return <span className={`comic-portrait${large ? " comic-portrait-large" : ""}`} aria-hidden="true">
    {failedSource !== source ? <img src={source} alt="" width={large ? 280 : 64} height={large ? 340 : 76} loading="lazy" decoding="async" onError={() => setFailedSource(source)} /> : <span className="comic-portrait-fallback">{actor.name}</span>}
  </span>;
}
export function ComicCastPicker({ value, onChange }: { value: ComicCastId; onChange: (id: ComicCastId) => void }) {
  return <fieldset className="comic-cast-picker"><legend>오늘 함께할 캐릭터</legend><div>
    {COMIC_CAST.map((actor) => <button type="button" key={actor.id} aria-label={`${actor.name} ${actor.style}`} aria-pressed={value === actor.id} onClick={() => onChange(actor.id)}>
      <ComicPortrait cast={actor.id} /><span><strong>{actor.name}</strong><small>{actor.style}</small></span>
    </button>)}
  </div></fieldset>;
}
export function ComicDialogue({ cast, children, aside = false, label }: { cast: ComicCastId; children: ReactNode; aside?: boolean; label?: string }) {
  const actor = comicCast(cast);
  return <div className="comic-dialogue" data-aside={aside}>
    <ComicPortrait cast={actor.id} /><div className="comic-bubble"><span className="comic-speaker">{actor.name}<small>{label ?? actor.title}</small></span><div className="comic-dialogue-text">{children}</div></div>
  </div>;
}
