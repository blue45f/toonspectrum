import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { ComicDialogue } from "@/shared/components/comic/ComicCast";
import { comicCast, comicMood } from "@/shared/components/comic/comic-cast";
import { koreaDay } from "../../lab/creative-core";
import { downloadPng } from "../../lab/creative-export";
import { MotionPanelFrame } from "../../lab/MotionPanelFrame";
import { loadMotionImage } from "../../lab/motion-panel-image";
import { cleanMotionCaption, MOTION_PRESETS, motionMoodDefaults } from "../../lab/motion-panel-model";
import { recordResult } from "../../lab/play-storage";
import { useMotionPanelClock } from "../../lab/useMotionPanelClock";
import "../../motion-panel.css";

export default function MotionPanel() {
  const [params] = useSearchParams(); const cast = comicCast(params.get("cast")).id;
  const defaults = motionMoodDefaults(comicMood(params.get("mood")));
  const [preset, setPreset] = useState(defaults.preset), [caption, setCaption] = useState(defaults.caption);
  const [image, setImage] = useState<string | null>(null), [bubble, setBubble] = useState(true), [sfx, setSfx] = useState(true);
  const [loading, setLoading] = useState(false), [exporting, setExporting] = useState(false), [message, setMessage] = useState("");
  const svgRef = useRef<SVGSVGElement>(null), uploadRef = useRef<AbortController | null>(null);
  const clock = useMotionPanelClock();
  useEffect(() => () => uploadRef.current?.abort(), []);
  const upload = async (file: File) => {
    uploadRef.current?.abort(); const controller = new AbortController(); uploadRef.current = controller;
    setLoading(true); setMessage(""); clock.pause();
    try { const result = await loadMotionImage(file, controller.signal); if (!controller.signal.aborted) { setImage(result); setMessage("내 그림을 불러왔어요. 서버 전송이나 자동 저장 없이 이 화면에서만 사용해요."); } }
    catch (cause) { if (!controller.signal.aborted) setMessage(cause instanceof Error ? cause.message : "이미지를 불러오지 못했어요."); }
    finally { if (uploadRef.current === controller) setLoading(false); }
  };
  const resetImage = () => { uploadRef.current?.abort(); uploadRef.current = null; setLoading(false); setImage(null); clock.seek(0); setMessage("기본 그림으로 돌아왔어요. 불러온 이미지는 이 화면에서 제거했어요."); };
  const savePng = async () => {
    if (!svgRef.current || exporting) return;
    const snapshot = svgRef.current.outerHTML; clock.pause(); setExporting(true); setMessage("");
    try { await downloadPng(snapshot, "toonstudio-motion-panel.png", 960, 600); setMessage("현재 장면을 PNG로 저장했어요. 영상 파일이 아닌 정지 이미지예요."); }
    catch { setMessage("PNG 저장에 실패했어요. 다른 브라우저나 더 작은 이미지로 다시 시도해 주세요."); }
    finally { setExporting(false); }
  };
  return <section className="motion-panel-lab" aria-label="모션 컷 제작 도구">
    <header className="play-exercise-heading"><div><span className="play-eyebrow">MOTION PANEL · YOUR OWN SCENE</span><h2>한 컷에, 이야기의 리듬을.</h2><p>내 그림에 카메라 움직임·말풍선·효과음을 얹어 보세요. AI 영상 생성이 아닌 5초짜리 화면 연출 실험입니다.</p></div></header>
    <div className="motion-panel-layout"><div className="motion-panel-preview">
      <MotionPanelFrame svgRef={svgRef} preset={preset} progress={clock.progress} caption={caption} cast={cast} image={image} bubble={bubble} sfx={sfx} />
      <div className="motion-panel-transport"><button type="button" className="play-button primary" disabled={!clock.canAnimate || loading} onClick={clock.playing ? clock.pause : clock.play}>{clock.playing ? <Pause size={16} /> : <Play size={16} />}{clock.playing ? "일시정지" : clock.progress >= 1 ? "다시 재생" : "재생"}</button><button type="button" className="play-button" onClick={() => clock.seek(0)}><RotateCcw size={16} />처음으로</button><span aria-live="off">{(clock.progress * 5).toFixed(1)} / 5.0초</span></div>
      <label className="motion-panel-seek"><span>장면 위치 직접 조절</span><input aria-label="장면 위치" type="range" min={0} max={1000} step={1} value={Math.round(clock.progress * 1000)} aria-valuetext={`${(clock.progress * 5).toFixed(1)}초`} onChange={(event) => clock.seek(Number(event.target.value) / 1000)} /></label>
      {clock.reduced && <p className="play-note">기기의 동작 줄이기 설정에 따라 자동 모션을 정지했어요. 슬라이더로 정지 장면을 고를 수 있어요.</p>}
      <p className="play-note">자동 재생·반복 재생 없이 한 번만 재생해요. 다른 탭으로 이동하면 정지하며, 돌아와도 자동으로 재개하지 않아요.</p>
    </div><div className="motion-panel-controls">
      <fieldset className="motion-panel-presets"><legend>01 · 카메라 연출</legend>{MOTION_PRESETS.map((item) => <button type="button" key={item.id} aria-pressed={preset === item.id} onClick={() => { setPreset(item.id); clock.seek(0); }}><strong>{item.label}</strong><span>{item.description}</span></button>)}</fieldset>
      <label className="play-field"><span>02 · 나만의 말풍선 <small>{Array.from(caption).length}/60자</small></span><textarea aria-label="나만의 말풍선" rows={3} value={caption} onChange={(event) => setCaption(cleanMotionCaption(event.target.value))} /></label>
      <div className="motion-panel-toggles"><label><input type="checkbox" checked={bubble} onChange={(event) => setBubble(event.target.checked)} />말풍선 표시</label><label><input type="checkbox" checked={sfx} onChange={(event) => setSfx(event.target.checked)} />효과음 글자 표시</label></div>
      <label className="motion-panel-upload"><span>03 · 내 그림 불러오기</span><input aria-label="내 그림 불러오기" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /><small>PNG·JPEG·WebP · 8MB / 1600만 화소 이하 · 긴 변 1600px로 축소 · 원본 파일은 변경하지 않아요.</small></label>
      {(image || loading) && <button type="button" className="play-button" onClick={resetImage}>{loading ? "불러오기 취소" : "내 그림 제거 · 기본 그림으로"}</button>}
      {loading && <p role="status" className="play-note">내 기기에서 이미지를 준비하고 있어요…</p>}
    </div></div>
    <ComicDialogue cast={cast} label="편집실의 한마디">{MOTION_PRESETS.find((item) => item.id === preset)?.description} 내 그림과 대사는 이 화면에서만 유지돼요. 마음에 드는 순간은 PNG로 남겨 주세요.</ComicDialogue>
    <div className="play-actions"><button type="button" className="play-button primary" disabled={exporting || loading} onClick={() => void savePng()}><Download size={16} />{exporting ? "PNG 만드는 중…" : "현재 컷 PNG 저장"}</button><button type="button" className="play-button" onClick={() => setMessage(recordResult({ id: `motion-${koreaDay()}-${preset}`, game: "motion-panel", label: `${MOTION_PRESETS.find((item) => item.id === preset)?.label} 완성` }) ? "오늘의 완성을 창작 기록에 남겼어요. 이미지와 대사는 저장하지 않아요." : "완료 기록을 저장하지 못했어요. PNG로 결과를 보관해 주세요.")}>완성 기록 남기기</button><Link className="play-button" to="/studio">스튜디오에서 이어 그리기 ↗</Link></div>
    <p className="play-feedback" role="status">{message}</p>
    <p className="play-note">나가기·새로고침 시 이미지와 대사가 사라집니다. 별도의 저장 버튼을 누르기 전에는 기기에 저장하지 않아요. 기본 그림은 ToonStudio의 오리지널 안내 일러스트입니다.</p>
  </section>;
}
