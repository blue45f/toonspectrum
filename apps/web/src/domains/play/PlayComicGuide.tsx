import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Link } from "react-router-dom";
import { ComicCastPicker, ComicDialogue } from "@/shared/components/comic/ComicCast";
import { comicCast, comicPlayLink } from "@/shared/components/comic/comic-cast";
import type { ComicCastId } from "@/shared/components/comic/comic-cast";
import { playDirectorLines } from "./lab/play-director";
import "./play-character.css";

export function PlayComicGuide({ cast, onChange, game }: { cast: ComicCastId; onChange: (id: ComicCastId) => void; game?: string }) {
  const lines = playDirectorLines(game, cast);
  const body = <><ComicCastPicker value={cast} onChange={onChange} /><ComicDialogue cast={cast} label={translateCurrentStaticSourceText("domains.play.PlayComicGuide", "ko", "오늘의 진행자")}>{lines.lead}</ComicDialogue><ComicDialogue cast={lines.companion} aside label={translateCurrentStaticSourceText("domains.play.PlayComicGuide", "ko", "옆 컷의 참견")}>{lines.reply}</ComicDialogue></>;
  if (game) return <details className="play-comic-guide"><summary>{comicCast(cast).name}{translateCurrentStaticSourceText("domains.play.PlayComicGuide", "ko", "의 플레이 가이드 · 도움말 펼치기")}</summary>{body}</details>;
  return <section className="play-comic-guide" aria-label={translateCurrentStaticSourceText("domains.play.PlayComicGuide", "ko", "캐릭터와 함께하는 창작 놀이터")}><p className="play-eyebrow">{translateCurrentStaticSourceText("domains.play.PlayComicGuide", "en", "ONE CAST · YOUR NEXT EPISODE")}</p><h2>{translateCurrentStaticSourceText("domains.play.PlayComicGuide", "ko", "운세를 읽던 캐릭터와, 다음 컷까지.")}</h2>{body}<nav className="comic-journey-links" aria-label={translateCurrentStaticSourceText("domains.play.PlayComicGuide", "ko", "웹툰 창작 릴레이")}><Link to={formatI18nTemplate(translateCurrentStaticSourceText("domains.play.PlayComicGuide", "en", "/fortune?content=today&cast={v0}"), { v0: String(cast) })}>{translateCurrentStaticSourceText("domains.play.PlayComicGuide", "ko", "01 · 오늘의 웹툰 운세")}</Link><Link to={comicPlayLink(cast)}>{translateCurrentStaticSourceText("domains.play.PlayComicGuide", "ko", "02 · 모션 컷 실험실")}</Link><Link to="/studio">{translateCurrentStaticSourceText("domains.play.PlayComicGuide", "ko", "03 · 내 작품 이어 그리기")}</Link></nav><p className="play-note">{translateCurrentStaticSourceText("domains.play.PlayComicGuide", "ko", "캐릭터 선택만 이어져요. 운세 입력·해석 원문·내 그림은 다른 화면으로 자동 전송하지 않아요.")}</p></section>;
}
