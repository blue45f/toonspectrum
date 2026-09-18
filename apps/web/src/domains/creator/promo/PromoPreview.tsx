import { useEffect, useRef, useState } from "react";

import { preparePromoVoicePreview } from "./promo-audio";
import { drawPromoFrame, loadPromoImages, releasePromoTextCache } from "./promo-canvas";
import { PROMO_FPS, promoFrameCount, promoMusicGain, promoSize, promoTimeline } from "./promo-model";

import type { PromoImages } from "./promo-canvas";
import type { PromoPanel, PromoProject } from "./promo-model";

export function PromoPreview({ project, disabled, seekRequest }: { project: PromoProject; disabled: boolean; seekRequest?: { frame: number; token: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const startFrame = useRef(0);
  const imageCache = useRef<{ sources: Pick<PromoPanel, "id" | "src" | "foregroundSrc">[]; images: PromoImages } | null>(null);
  const voicePreview = useRef<Awaited<ReturnType<typeof preparePromoVoicePreview>>>(null);
  const voiceOperation = useRef<AbortController | null>(null);
  const [images, setImages] = useState<PromoImages>(new Map());
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [preparingAudio, setPreparingAudio] = useState(false);
  const total = promoFrameCount(project);
  const size = promoSize(project.ratio, 480);
  useEffect(() => {
    const cached = imageCache.current;
    if (cached && cached.sources.length === project.panels.length && project.panels.every((panel, index) => panel.id === cached.sources[index]?.id && panel.src === cached.sources[index]?.src && panel.foregroundSrc === cached.sources[index]?.foregroundSrc)) {
      setImages(cached.images); setLoading(false); setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setImages(new Map());
    loadPromoImages(project, controller.signal).then((loaded) => {
      if (!controller.signal.aborted) { imageCache.current = { sources: project.panels.map(({ id, src, foregroundSrc }) => ({ id, src, foregroundSrc })), images: loaded }; setImages(loaded); setLoading(false); }
    }).catch(() => {
      if (!controller.signal.aborted) { setError("미리보기 이미지를 읽지 못했어요."); setLoading(false); }
    });
    return () => controller.abort();
  }, [project]);
  useEffect(() => {
    setPlaying(false); setFrame(0); voiceOperation.current?.abort(); voicePreview.current?.stop();
    setPreparingAudio(false);
  }, [project, disabled]);
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    return () => {
      voiceOperation.current?.abort(); voicePreview.current?.stop();
      if (context) releasePromoTextCache(context);
    };
  }, []);
  useEffect(() => {
    if (!seekRequest) return;
    setPlaying(false); setFrame(Math.max(0, Math.min(total - 1, seekRequest.frame)));
  }, [seekRequest, total]);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawPromoFrame(ctx, project, images, frame, size.width, size.height);
  }, [project, images, frame, size.width, size.height]);
  useEffect(() => {
    if (!playing) { audioRef.current?.pause(); voicePreview.current?.stop(); return; }
    const audio = audioRef.current;
    const initialFrame = startFrame.current;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const next = initialFrame + Math.floor((now - start) * PROMO_FPS / 1000);
      setFrame(Math.min(total - 1, next));
      if (audio) audio.volume = promoMusicGain(project, Math.min(total - 1, next));
      if (next >= total - 1 || document.hidden) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    // Hidden tabs may suspend animation frames while audio keeps playing.
    const visibility = () => {
      if (!document.hidden) return;
      cancelAnimationFrame(raf);
      audio?.pause();
      voicePreview.current?.stop();
      setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      cancelAnimationFrame(raf);
      audio?.pause();
      voicePreview.current?.stop();
    };
  }, [playing, total, project]);
  const play = async () => {
    if (playing) { setPlaying(false); return; }
    const nextFrame = frame >= total - 1 ? 0 : frame;
    startFrame.current = nextFrame;
    setFrame(nextFrame);
    setError("");
    const controller = new AbortController();
    voiceOperation.current?.abort(); voiceOperation.current = controller;
    setPreparingAudio(true);
    try {
      const handle = await preparePromoVoicePreview(project, controller.signal);
      if (controller.signal.aborted) { handle?.stop(); return; }
      voicePreview.current = handle;
      handle?.start(nextFrame);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "내레이션을 준비하지 못했어요.");
      return;
    } finally { if (!controller.signal.aborted) setPreparingAudio(false); }
    const audio = audioRef.current;
    if (audio) {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number.POSITIVE_INFINITY;
      audio.currentTime = (nextFrame / PROMO_FPS) % duration;
      audio.volume = promoMusicGain(project, nextFrame);
      void audio.play().catch(() => setError("BGM을 재생하지 못했어요. 오디오 파일 또는 브라우저 권한을 확인해 주세요."));
    }
    setPlaying(true);
  };
  return (
    <section className="promo-preview" aria-label="홍보영상 미리보기">
      <div className="promo-preview-top"><span>미리보기</span><span>{project.ratio} · {project.seconds}초 · 30fps</span></div>
      <div className="promo-canvas-wrap"><canvas ref={canvasRef} width={size.width} height={size.height} aria-label={`${project.title} 홍보영상. 아래 컷 편집 영역에서 장면별 자막을 확인할 수 있어요.`} /></div>
      {project.audio ? <audio ref={audioRef} src={project.audio.src} loop preload="metadata" aria-label="미리보기 배경음악"><track kind="captions" srcLang="ko" label="배경음악 안내" src={`data:text/vtt;charset=utf-8,${encodeURIComponent("WEBVTT\n\n00:00:00.000 --> 00:01:00.000\n[사용자가 추가한 배경음악]\n")}`} default /></audio> : null}
      <div className="promo-playback">
        <button type="button" onClick={() => void play()} disabled={disabled || loading || preparingAudio || project.panels.some((panel) => !images.has(panel.id) || (panel.foregroundSrc && !images.has(`${panel.id}:foreground`))) || !project.panels.length}>{preparingAudio ? "내레이션 준비 중" : playing ? "일시정지" : "재생"}</button>
        <label className="promo-sr-only" htmlFor="promo-seek">영상 탐색</label>
        <input id="promo-seek" type="range" min={0} max={total - 1} value={frame} disabled={disabled || playing} onChange={(event) => setFrame(Number(event.target.value))} />
        <output>{(frame / PROMO_FPS).toFixed(1)} / {project.seconds}초</output>
      </div>
      <div className="promo-button-row">
        <button type="button" disabled={disabled || playing || preparingAudio || frame === 0} onClick={() => setFrame((value) => Math.max(0, value - 1))}>이전 프레임</button>
        <button type="button" disabled={disabled || playing || preparingAudio || frame >= total - 1} onClick={() => setFrame((value) => Math.min(total - 1, value + 1))}>다음 프레임</button>
        <button type="button" disabled={disabled || preparingAudio} onClick={() => { setPlaying(false); setFrame(total - PROMO_FPS); }}>마지막 카드 확인</button>
      </div>
      <div className="promo-scene-strip" aria-label="장면 타임라인">{promoTimeline(project).map((scene, index) => <button type="button" key={scene.panel.id} aria-pressed={frame >= scene.from && frame < scene.from + scene.duration} disabled={disabled || preparingAudio} onClick={() => { setPlaying(false); setFrame(scene.from); }}>컷 {index + 1}<br />{(scene.from / PROMO_FPS).toFixed(1)}초</button>)}</div>
      {preparingAudio ? <button type="button" onClick={() => { voiceOperation.current?.abort(); setPreparingAudio(false); }}>오디오 준비 취소</button> : null}
      {loading ? <p role="status">컷을 준비하고 있어요.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <p className="promo-muted">원본 컷에 카메라·장면 전환·입자·자막을 적용하는 모션툰입니다. 투명 전경을 추가하면 2.5D 연출을 사용할 수 있어요. 인물 동작·립싱크·새 프레임을 생성하는 기능은 아닙니다.</p>
    </section>
  );
}
