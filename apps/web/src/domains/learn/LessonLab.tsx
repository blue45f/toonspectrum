import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useId, useReducer, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { buildLabLink, LAB_CONFIGS, readLabState, type LabView } from "./learning-lab-state";
import { clamp, depthPoint, LAST_FRAME, timelineReducer, type LabKind } from "./learning-model";
import { LearningLinkButton } from "./LearningLinkButton";

const INK = "#202b3d";
const ACCENT = "#087f73";

export function LessonDiagram({ kind, value, frame, view = "both" }: { kind: LabKind; value: number; frame: number; view?: LabView }) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const stage = Math.min(2, Math.floor(clamp(frame, 0, LAST_FRAME) / 100));
  const config = LAB_CONFIGS[kind];
  const selectedView = config.comparable ? view : "both";
  const parameter = clamp(value, config.min, config.max);
  const corners: readonly [number, number][] = [[105, 168], [265, 168], [265, 295], [105, 295]];
  const back = corners.map(([x, y]) => depthPoint(x, y, 460, parameter, 0.52));
  const polygon = (points: readonly (readonly number[])[]) => points.map((point) => point.join(",")).join(" ");
  const viewBox = selectedView === "reference" ? "0 0 320 360" : selectedView === "comparison" ? "320 0 320 360" : "0 0 640 360";
  return (
    <svg className="learn-diagram" data-view={selectedView} viewBox={viewBox} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>{config.title} · {selectedView === "both" ? translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "전체 보기") : selectedView === "reference" ? translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "기준만") : translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "비교만")}</title>
      <desc id={descriptionId}>{config.label}: {parameter} {config.unit}. {config.stages[stage]} {translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "학습용 개념도이며 실제 원고나 엔진 측정 결과가 아닙니다.")}</desc>
      <rect width="640" height="360" fill="#f5f7fa" rx="14" />
      {kind === "pacing" && [20, parameter].map((gap, column) => (
        <g key={column} transform={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "translate({v0} 0)"), { v0: String(column === 0 ? 42 : 352) })}>
          <text x="0" y="30" fill={INK} fontSize="18" fontWeight="700">{column === 0 ? translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "기준 간격 20") : formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "비교 간격 {v0}"), { v0: String(parameter) })}</text>
          {["상황", "변화", "반응"].map((label, index) => (
            <g key={label} transform={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "translate(0 {v0})"), { v0: String(52 + index * (48 + gap)) })}>
              <rect width="245" height="48" rx="5" fill={stage === index ? translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "#d7eee8") : translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "#fff")} stroke={stage === index ? ACCENT : "#a7b1c2"} strokeWidth="2" />
              <text x="18" y="31" fill={INK} fontSize="18">{index + 1}. {label}</text>
              <circle cx="210" cy="24" r="11" fill="none" stroke={INK} strokeWidth="2" />
            </g>
          ))}
        </g>
      ))}
      {kind === "perspective" && <g>
        <line x1="25" y1={parameter} x2="615" y2={parameter} stroke={ACCENT} strokeDasharray="8 6" strokeWidth="2" />
        <text x="28" y={parameter - 13} fill={ACCENT} fontSize="17">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "아이레벨")}</text>
        <polygon points={polygon(back)} fill="#dce5ee" stroke={INK} strokeWidth="2" />
        {corners.map(([x, y], index) => <line key={index} x1={x} y1={y} x2="460" y2={parameter} stroke="#a7b1c2" strokeDasharray="5 5" />)}
        {parameter < 168 && <polygon points={polygon([corners[0], corners[1], back[1], back[0]])} fill="#cfdfde" stroke={INK} strokeWidth="2" />}
        {parameter > 295 && <polygon points={polygon([corners[3], corners[2], back[2], back[3]])} fill="#cfdfde" stroke={INK} strokeWidth="2" />}
        <polygon points={polygon([corners[1], corners[2], back[2], back[1]])} fill="#a6c5c2" stroke={INK} strokeWidth="2" />
        <rect x="105" y="168" width="160" height="127" fill="#fff" stroke={INK} strokeWidth="3" />
        <text x="154" y="241" fill={INK} fontSize="18">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "앞면")}</text>
        <circle cx="460" cy={parameter} r={stage === 1 ? 8 : 6} fill={ACCENT} />
        <text x="474" y={parameter > 280 ? parameter - 14 : parameter + 24} fill={INK} fontSize="17">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "소실점")}</text>
        <text x="30" y="337" fill={INK} fontSize="16">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "깊이 방향의 선만 같은 소실점으로 향합니다.")}</text>
      </g>}
      {kind === "strokes" && <g fill="none" strokeLinecap="round">
        <text x="40" y="35" fill={INK} fontSize="18" fontWeight="700">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "균일선")}</text>
        <text x="345" y="35" fill={INK} fontSize="18" fontWeight="700">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "강약선 (구간별 두께)")}</text>
        {[0, 1, 2].map((row) => <g key={row} transform={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "translate(0 {v0})"), { v0: String(row * 84) })}>
          <path d="M45 112 C100 42 205 165 275 88" stroke={INK} strokeWidth={parameter} />
          <path d="M350 112 C370 87 395 88 425 98" stroke={INK} strokeWidth={Math.max(1, parameter * 0.35)} />
          <path d="M425 98 C458 110 490 127 525 119" stroke={stage === row ? ACCENT : INK} strokeWidth={parameter} />
          <path d="M525 119 C551 116 570 103 580 88" stroke={INK} strokeWidth={Math.max(1, parameter * 0.5)} />
        </g>)}
        <text x={selectedView === "comparison" ? 345 : 40} y="335" fill={INK} fontSize="16">{selectedView === "both" ? translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "개념 비교용 경로 · 실제 브러시 품질 측정이 아닙니다.") : translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "개념 비교용 경로")}</text>
      </g>}
      {kind === "layers" && <g>
        <defs><clipPath id={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "{v0}-clip"), { v0: String(id) })}><circle cx="472" cy="176" r="83" /></clipPath></defs>
        <text x="38" y="35" fill={INK} fontSize="18" fontWeight="700">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "클리핑 전")}</text>
        <text x="350" y="35" fill={INK} fontSize="18" fontWeight="700">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "클리핑 후")}</text>
        {[166, 472].map((cx) => <circle key={cx} cx={cx} cy="176" r="83" fill="#efbf91" />)}
        <rect x="168" y="121" width="133" height="161" fill="#284667" opacity={parameter / 100} />
        <rect x="474" y="121" width="133" height="161" fill="#284667" opacity={parameter / 100} clipPath={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "url(#{v0}-clip)"), { v0: String(id) })} />
        {[166, 472].map((cx) => <circle key={cx} cx={cx} cy="176" r="83" fill="none" stroke={stage === 1 ? ACCENT : INK} strokeWidth="2" />)}
        <text x={selectedView === "comparison" ? 350 : 38} y="324" fill={INK} fontSize="17">{selectedView === "both" ? formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "동일한 불투명도 {v0}% · 일반 알파 합성"), { v0: String(parameter) }) : formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "동일한 불투명도 {v0}%"), { v0: String(parameter) })}</text>
      </g>}
      {kind === "lettering" && <g>
        <path d="M263 133 Q331 139 353 188" fill="none" stroke={ACCENT} strokeDasharray="7 5" strokeWidth="3" />
        <path d="M342 180 L355 191 L358 173" fill="none" stroke={ACCENT} strokeWidth="3" />
        <rect x="30" y="40" width="270" height="102" rx="30" fill="#fff" stroke={stage === 0 ? ACCENT : INK} strokeWidth="2" />
        <path d="M75 142 L62 164 L103 142" fill="#fff" stroke={INK} strokeWidth="2" />
        <text x="59" y="80" fill={INK} fontSize={parameter}><tspan x="59">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "거기 누구야?")}</tspan><tspan x="59" dy={parameter * 1.35}>{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "문이 열려 있어.")}</tspan></text>
        <rect x="331" y="192" width="276" height="101" rx="30" fill="#fff" stroke={stage === 1 ? ACCENT : INK} strokeWidth="2" />
        <path d="M541 293 L568 315 L518 293" fill="#fff" stroke={INK} strokeWidth="2" />
        <text x="360" y="233" fill={INK} fontSize={parameter}><tspan x="360">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "나야. 잠깐만!")}</tspan><tspan x="360" dy={parameter * 1.35}>{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "지금 내려갈게.")}</tspan></text>
        <text x="32" y="337" fill={INK} fontSize="16">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "① 질문 → ② 대답 · 숫자는 설명 순서입니다.")}</text>
      </g>}
      {kind === "values" && [202, Math.round(230 - parameter * 1.7)].map((shade, column) => (
        <g key={column} transform={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "translate({v0} 0)"), { v0: String(column === 0 ? 35 : 350) })}>
          <text x="0" y="35" fill={INK} fontSize="18" fontWeight="700">{column === 0 ? translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "낮은 대비의 기준") : formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "비교 강도 {v0}%"), { v0: String(parameter) })}</text>
          <rect y="64" width="250" height="225" rx="8" fill="#e6e6e6" />
          <g fill={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "rgb({v0},{v1},{v2})"), { v0: String(shade), v1: String(shade), v2: String(shade) })}>
            <circle cx="124" cy="117" r="27" />
            <path d="M105 148 L147 148 L166 209 L149 214 L147 268 L130 268 L126 223 L118 268 L100 268 L106 211 L68 191 L77 175 L109 187 Z" />
          </g>
          <text x="0" y="325" fill={INK} fontSize="16">{column === 0 ? translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "배경과 외곽이 섞입니다.") : translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "형태가 분리되는지 확인하세요.")}</text>
        </g>
      ))}
    </svg>
  );
}

function compactViewport() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches;
}

export function LessonLab({ kind }: { kind: LabKind }) {
  const config = LAB_CONFIGS[kind];
  const { pathname, search } = useLocation();
  const [initial] = useState(() => readLabState(kind, search, compactViewport()));
  const [value, setValue] = useState(initial.value);
  const [view, setView] = useState<LabView>(initial.view);
  const [speed, setSpeed] = useState(1);
  const [motionEnabled, setMotionEnabled] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [timeline, dispatch] = useReducer(timelineReducer, { frame: initial.frame, playing: false });
  const root = useRef<HTMLElement>(null);
  const id = useId();
  const stage = Math.min(2, Math.floor(timeline.frame / 100));

  useEffect(() => {
    const state = readLabState(kind, search, compactViewport());
    setValue(state.value);
    setView(state.view);
    dispatch({ type: "seek", frame: state.frame });
  }, [kind, search]);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { setMotionEnabled(!media.matches); dispatch({ type: "pause" }); };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!timeline.playing || !motionEnabled) return;
    let previous = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      dispatch({ type: "tick", delta: (now - previous) * 0.03 * speed });
      previous = now;
      handle = window.requestAnimationFrame(tick);
    };
    handle = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(handle);
  }, [timeline.playing, motionEnabled, speed]);
  useEffect(() => {
    const stop = () => { if (document.hidden) dispatch({ type: "pause" }); };
    document.addEventListener("visibilitychange", stop);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      if (entries[0] && !entries[0].isIntersecting) dispatch({ type: "pause" });
    });
    if (root.current) observer?.observe(root.current);
    return () => { document.removeEventListener("visibilitychange", stop); observer?.disconnect(); };
  }, []);

  return (
    <section className="learn-lab" ref={root} aria-labelledby={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "{v0}-heading"), { v0: String(id) })}>
      <div className="learn-section-heading"><div><span className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "INTERACTIVE LAB")}</span><h2 id={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "{v0}-heading"), { v0: String(id) })}>{config.title}</h2></div><span className="learn-tag">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "직접 조절하기")}</span></div>
      {config.comparable && <div className="learn-comparison-controls" role="group" aria-label={translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "도식 비교 보기")}>{(["both", "reference", "comparison"] as const).map((mode) => <button type="button" key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === "both" ? translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "나란히") : mode === "reference" ? translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "기준만") : translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "비교만")}</button>)}</div>}
      {/* MDN overflow accessibility: a labelled scrolling region must retain keyboard focus; removing tabIndex strands keyboard-only readers. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- This named overflow viewport is keyboard-scrollable; LessonLab.accessibility.test.tsx protects its focus contract. */}
      <div className="learn-diagram-scroll" tabIndex={0} role="region" aria-label={config.comparable ? translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "개념 비교 도식. 기준만·비교만 버튼으로 한쪽씩 크게 볼 수 있습니다.") : translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "개념 설명 도식. 좁은 화면에서는 좌우로 스크롤할 수 있습니다.")}><LessonDiagram kind={kind} value={value} frame={timeline.frame} view={view} /></div>
      {config.comparable && <p className="learn-small">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "기준만·비교만은 같은 좌표와 배율로 표시합니다. 나란히 보기에서는 두 결과를 함께 확인할 수 있습니다.")}</p>}
      <label className="learn-range-label" htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "{v0}-parameter"), { v0: String(id) })}>{config.label}<strong>{value} {config.unit}</strong></label>
      <input id={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "{v0}-parameter"), { v0: String(id) })} className="learn-range" type="range" min={config.min} max={config.max} step="1" value={value} onChange={(event) => setValue(Number(event.currentTarget.value))} />
      <div className="learn-player-controls">
        <button type="button" disabled={!motionEnabled} onClick={() => dispatch({ type: "toggle" })}>{timeline.playing ? translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "일시정지") : translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "설명 재생")}</button>
        <label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "{v0}-speed"), { v0: String(id) })}>{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "재생 속도")}</label><select id={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "{v0}-speed"), { v0: String(id) })} value={speed} onChange={(event) => setSpeed(Number(event.currentTarget.value))}><option value="0.5">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "0.5배")}</option><option value="1">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "1배")}</option><option value="1.5">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "1.5배")}</option></select>
        <button type="button" aria-pressed={!motionEnabled} onClick={() => { setMotionEnabled(!motionEnabled); dispatch({ type: "pause" }); }}>{motionEnabled ? translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "모션 끄기") : translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "모션 켜기")}</button>
        <button type="button" onClick={() => { setValue(config.initial); setView(config.comparable && compactViewport() ? "comparison" : "both"); dispatch({ type: "seek", frame: 0 }); setSpeed(1); }}>{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "예제 초기화")}</button>
      </div>
      <label className="learn-range-label" htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "{v0}-timeline"), { v0: String(id) })}>{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "설명 타임라인")}<span>{(timeline.frame / 30).toFixed(1)} {translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "/ 10초")}</span></label>
      <input id={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "en", "{v0}-timeline"), { v0: String(id) })} className="learn-range" type="range" min="0" max={LAST_FRAME} value={Math.floor(timeline.frame)} onChange={(event) => dispatch({ type: "seek", frame: Number(event.currentTarget.value) })} aria-valuetext={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "{v0}단계, {v1}초"), { v0: String(stage + 1), v1: String((timeline.frame / 30).toFixed(1)) })} />
      <div className="learn-chapters" aria-label={translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "설명 단계")}>{config.stages.map((caption, index) => <button type="button" key={caption} aria-pressed={index === stage} onClick={() => dispatch({ type: "seek", frame: index * 100 })}>{index + 1}{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "단계")}</button>)}</div>
      <p className="learn-caption" aria-live="polite">{config.stages[stage]}</p>
      <LearningLinkButton makePath={() => buildLabLink(pathname, kind, { value, frame: timeline.frame, view })} />
      <p className="learn-small">{translateCurrentStaticSourceText("domains.learn.LessonLab", "ko", "자동 재생과 소리는 없습니다. 모션을 끈 상태에서도 단계 버튼·슬라이더로 모든 내용을 확인할 수 있습니다. 예제 좌표는 게시 규격이 아닙니다.")}</p>
    </section>
  );
}