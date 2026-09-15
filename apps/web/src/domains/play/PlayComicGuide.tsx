import { Link } from "react-router-dom";
import { ComicCastPicker, ComicDialogue } from "@/shared/components/comic/ComicCast";
import { comicCast, comicPlayLink } from "@/shared/components/comic/comic-cast";
import type { ComicCastId } from "@/shared/components/comic/comic-cast";
import { playDirectorLines } from "./lab/play-director";
import "./play-character.css";

export function PlayComicGuide({ cast, onChange, game }: { cast: ComicCastId; onChange: (id: ComicCastId) => void; game?: string }) {
  const lines = playDirectorLines(game, cast);
  const body = <><ComicCastPicker value={cast} onChange={onChange} /><ComicDialogue cast={cast} label="오늘의 진행자">{lines.lead}</ComicDialogue><ComicDialogue cast={lines.companion} aside label="옆 컷의 참견">{lines.reply}</ComicDialogue></>;
  if (game) return <details className="play-comic-guide"><summary>{comicCast(cast).name}의 플레이 가이드 · 도움말 펼치기</summary>{body}</details>;
  return <section className="play-comic-guide" aria-label="캐릭터와 함께하는 창작 놀이터"><p className="play-eyebrow">ONE CAST · YOUR NEXT EPISODE</p><h2>운세를 읽던 캐릭터와, 다음 컷까지.</h2>{body}<nav className="comic-journey-links" aria-label="웹툰 창작 릴레이"><Link to={`/fortune?content=today&cast=${cast}`}>01 · 오늘의 웹툰 운세</Link><Link to={comicPlayLink(cast)}>02 · 모션 컷 실험실</Link><Link to="/studio">03 · 내 작품 이어 그리기</Link></nav><p className="play-note">캐릭터 선택만 이어져요. 운세 입력·해석 원문·내 그림은 다른 화면으로 자동 전송하지 않아요.</p></section>;
}
