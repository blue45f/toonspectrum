import { comicPlayLink } from "@/shared/components/comic/comic-cast";
import { useCampus } from "@/shared/components/spatial-campus/campus-context";
import type { ComicCastId } from "@/shared/components/comic/comic-cast";
import { fortuneComicMood } from "./fortune-character-direction";
import { tryCopyFortuneText } from "./fortune-sharing";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Share2, PencilLine } from "lucide-react";
import type { FortuneReading } from "@toonspectrum/core/fortune";
import { fortuneCreativeMission, fortunePublicShare } from "./fortune-cinematic-model";

export function FortuneReadingTools({ reading }: { reading: FortuneReading }) {
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState("");
  const payload = fortunePublicShare(reading);
  const copy = async () => { const ok = await tryCopyFortuneText(payload.text); setFallback(ok ? "" : payload.text); setMessage(ok ? "입력 원문을 제외한 해석을 복사했어요." : "자동 복사가 제한되어 있어요. 아래 내용을 선택해 직접 복사해 주세요."); };
  const share = async () => {
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: payload.title, text: payload.text, url: new URL(payload.path, window.location.origin).href }); setMessage("공유창으로 해석을 전달했어요."); }
    catch (cause) { if (typeof cause === "object" && cause !== null && "name" in cause && cause.name === "AbortError") { setMessage("공유를 취소했어요."); return; } setFallback(payload.text); setMessage("이 브라우저에서는 공유창을 열 수 없어요. 아래 내용을 직접 복사해 주세요."); }
  };
  return <section className="fo-reading-tools" aria-label="해석 복사 및 공유"><div className="fo-reading-tool-actions"><button type="button" className="fo-button" onClick={() => { void copy(); }}><Copy size={16} />해석 복사</button><button type="button" className="fo-button" onClick={() => { void share(); }}><Share2 size={16} />해석 공유</button></div><p className="fo-help">버튼을 누를 때만 복사하거나 기기의 공유창을 열어요. 생년월일·태어난 시각·꿈 원문은 제외됩니다.</p>{fallback && <label className="fo-share-fallback">직접 복사할 해석<textarea readOnly rows={5} value={fallback} onFocus={(event) => event.currentTarget.select()} /></label>}<p className="fo-tool-status" role="status">{message}</p></section>;
}

export function FortuneCreativeMission({ reading, cast = "ara" }: { reading: FortuneReading; cast?: ComicCastId }) {
  const campus = useCampus();
  const tasks = fortuneCreativeMission(reading);
  const [done, setDone] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState("");
  const toggle = (index: number) => setDone((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
  const copy = async () => { const text = ["ToonStudio · 오늘의 한 컷 미션", ...tasks.map((task, i) => `${i + 1}. ${task}`)].join("\n"); const ok = await tryCopyFortuneText(text); setFallback(ok ? "" : text); setMessage(ok ? "미션을 복사했어요. 스튜디오에서 내 방식으로 이어 그려 보세요." : "아래 미션을 직접 선택해 복사해 주세요."); };
  return <section className="fo-creative-mission" aria-label="오늘의 한 컷 미션"><div className="fo-mission-head"><div><p className="fo-eyebrow">YOUR NEXT SCENE</p><h3>오늘의 상징을, 나만의 한 컷으로</h3></div><span role="status">{done.length} / {tasks.length} 완료</span></div><p>운세에서 발견한 이야기를 창작으로 바꿔요. 체크는 이 화면에서만 유지됩니다.</p><div className="fo-mission-tasks">{tasks.map((task, i) => <label key={task}><input type="checkbox" checked={done.includes(i)} onChange={() => toggle(i)} /><span>{task}</span></label>)}</div><div className="fo-mission-actions"><Link className="fo-button fo-primary" to={campus ? campus.returnHref ?? "/studio/new" : "/studio"}><PencilLine size={16} />{campus ? (campus.returnHref ? "원래 원고에서 이어 그리기" : "새 작품으로 그리기") : "스튜디오에서 그리기"}</Link><button type="button" className="fo-button" onClick={() => { void copy(); }}><Copy size={15} />미션 복사</button><Link className="fo-button" to={comicPlayLink(cast, fortuneComicMood(reading.id))}>이 분위기로 모션 컷 만들기 ↗</Link><span>캐릭터·연출 분위기만 연결 · 입력과 해석 원문은 전송하지 않아요</span></div>{fallback && <label className="fo-share-fallback">직접 복사할 미션<textarea readOnly rows={4} value={fallback} onFocus={(event) => event.currentTarget.select()} /></label>}<p className="fo-tool-status" role="status">{message}</p></section>;
}
