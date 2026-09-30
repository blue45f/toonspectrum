/**
 * Studio Bubble Emotion Gallery — 감정 말풍선 갤러리 + 실시간 미리보기.
 *
 * 순수 코어(`studio-bubble-emotion-shapes`, `studio-bubble-typography`)를
 * 실제 화면에 연결하는 브리지 컴포넌트다. 화려하면서도 직관적으로:
 *  - 핵심 액션은 하나: "내 대사로 미리보기" 텍스트 입력.
 *  - 6가지 감정 카드는 애니메이션 SVG 일러스트로 "보는 재미"를 준다.
 *  - 빈 상태에는 다음 행동을 안내하는 일러스트를 둔다.
 *
 * ko/en, 다크/라이트, 390px 모바일, reduced-motion 대응.
 */
import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { FlaskConical, PenLine, Sparkles, Wand2 } from "lucide-react";

import type { SpeechEmotionKind } from "../ai/studio-ai-emotion-bubble-matcher";
import {
  getCurrentUiLocale,
  translateAuthoredSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  emotionBubblePath,
  emotionShapeParams,
  scaleShapeIntensity,
  thoughtTailBubbles,
  type EmotionShapeParams,
} from "./studio-bubble-emotion-shapes";
import { buildTypographySpans } from "./studio-bubble-typography";

type EmotionCard = {
  emotion: SpeechEmotionKind;
  labelKo: string;
  labelEn: string;
  sampleKo: string;
  sampleEn: string;
  descKo: string;
  descEn: string;
  stroke: string;
  /** 카드 버블에 걸 애니메이션 클래스. */
  animation: "sbega-tremble" | "sbega-wobble" | "sbega-float" | "sbega-drift" | "sbega-beat" | "";
};

const EMOTION_CARDS: ReadonlyArray<EmotionCard> = [
  {
    emotion: "rage-shout",
    labelKo: "분노",
    labelEn: "Rage",
    sampleKo: "그만해!!!",
    sampleEn: "STOP IT!!!",
    descKo: "가시 돋친 외곽선 + 떨림. 번개 꼬리로 화자를 찌른다.",
    descEn: "Spiky outline + tremble. A lightning tail stabs at the speaker.",
    stroke: "#e5484d",
    animation: "sbega-tremble",
  },
  {
    emotion: "shock-gasp",
    labelKo: "놀람",
    labelEn: "Shock",
    sampleKo: "뭐어?!",
    sampleEn: "WHAT?!",
    descKo: "출렁이는 외곽선 + 흔들림. 놀란 숨이 번지는 모양.",
    descEn: "Rippling outline + wobble. Shaped like a spreading gasp.",
    stroke: "#f76b15",
    animation: "sbega-wobble",
  },
  {
    emotion: "whisper-secret",
    labelKo: "속삭임",
    labelEn: "Whisper",
    sampleKo: "쉿, 조용히~",
    sampleEn: "Shh, quietly~",
    descKo: "점선 외곽선 + 작은 글자. 살짝 떠다니듯 번진다.",
    descEn: "Dashed outline + small type. Drifts like a secret.",
    stroke: "#8e8e93",
    animation: "sbega-drift",
  },
  {
    emotion: "thought-monologue",
    labelKo: "생각",
    labelEn: "Thought",
    sampleKo: "(이건 말하면 안 돼…)",
    sampleEn: "(I shouldn't say this…)",
    descKo: "구름형 외곽선 + 동그라미 꼬리. Comic Chat §5.1 방식.",
    descEn: "Cloud outline + bubble tail. Comic Chat §5.1 style.",
    stroke: "#5b7fa6",
    animation: "sbega-float",
  },
  {
    emotion: "romance-blush",
    labelKo: "설렘",
    labelEn: "Romance",
    sampleKo: "저, 좋아해요…",
    sampleEn: "I… like you…",
    descKo: "몽글몽글한 곡선 + 심장박동. 살짝 부푼 외곽선.",
    descEn: "Soft curves + heartbeat. A gently swollen outline.",
    stroke: "#e93d82",
    animation: "sbega-beat",
  },
  {
    emotion: "neutral-calm",
    labelKo: "중립",
    labelEn: "Neutral",
    sampleKo: "오늘 날씨가 좋네요.",
    sampleEn: "Nice weather today.",
    descKo: "정석 타원. 어떤 대사에도 어울리는 기본형.",
    descEn: "Classic ellipse. The default that fits any line.",
    stroke: "#3f3f46",
    animation: "",
  },
];

const BUBBLE_W = 220;
const BUBBLE_H = 132;

/** 긴 대사를 SVG 안에 들어가게 줄 단위로 자른다 (한 줄 최대 11자). */
function wrapLines(text: string, maxPerLine = 11): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= 3) break;
  }
  if (current && lines.length < 4) lines.push(current);
  return lines.length > 0 ? lines.slice(0, 4) : [""];
}

function JaggedTail(): ReactElement {
  // 번개형 꼬리 (rage).
  const points = "150,128 138,160 152,158 142,196 176,150 160,152";
  return <polygon points={points} fill="#ffffff" stroke="#e5484d" strokeWidth={2.5} strokeLinejoin="round" />;
}

function SolidTail({ stroke }: { stroke: string }): ReactElement {
  return (
    <polygon
      points={`128,126 104,168 158,132`}
      fill="#ffffff"
      stroke={stroke}
      strokeWidth={2.5}
      strokeLinejoin="round"
    />
  );
}

function EmotionBubbleSvg({
  card,
  text,
  intensity,
  seed,
}: {
  card: EmotionCard;
  text: string;
  intensity: number;
  seed: number;
}): ReactElement {
  const params: EmotionShapeParams = useMemo(
    () => scaleShapeIntensity(emotionShapeParams(card.emotion), intensity),
    [card.emotion, intensity]
  );
  const path = useMemo(
    () => emotionBubblePath(BUBBLE_W, BUBBLE_H, params, seed),
    [params, seed]
  );
  const tailBubbles = useMemo(
    () =>
      params.tailStyle === "bubbles"
        ? thoughtTailBubbles(BUBBLE_W / 2, BUBBLE_H - 4, BUBBLE_W / 2 - 30, BUBBLE_H + 56)
        : null,
    [params.tailStyle]
  );
  const lines = useMemo(() => wrapLines(text), [text]);
  const fontSize = 15 * params.fontScale;
  const lineHeight = fontSize * 1.35;
  const startY = BUBBLE_H / 2 - ((lines.length - 1) * lineHeight) / 2;

  return (
    <svg
      viewBox={`0 0 ${BUBBLE_W} ${BUBBLE_H + 70}`}
      className={card.animation}
      role="img"
      aria-label={`${card.labelKo} 말풍선 미리보기`}
      style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
    >
      {params.tailStyle === "jagged" ? (
        <JaggedTail />
      ) : params.tailStyle === "solid" ? (
        <SolidTail stroke={card.stroke} />
      ) : null}
      {tailBubbles ? (
        <g fill="#ffffff" stroke={card.stroke} strokeWidth={2} dangerouslySetInnerHTML={{ __html: tailBubbles }} />
      ) : null}
      <path
        d={path}
        fill="#ffffff"
        stroke={card.stroke}
        strokeWidth={2.5 * params.strokeScale}
        strokeDasharray={params.dashed ? "7 5" : undefined}
        strokeLinejoin="round"
      />
      <text
        x={BUBBLE_W / 2}
        y={startY}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#1c1c1e"
        fontSize={fontSize}
        fontWeight={500}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={BUBBLE_W / 2} dy={i === 0 ? 0 : lineHeight}>
            {buildTypographySpans(line).map((span, j) =>
              span.bold ? (
                <tspan key={j} fontWeight={800}>
                  {line.slice(span.start, span.end)}
                </tspan>
              ) : (
                <tspan key={j}>{line.slice(span.start, span.end)}</tspan>
              )
            )}
          </tspan>
        ))}
      </text>
    </svg>
  );
}

/** 빈 상태 일러스트: 비어 있는 말풍선 + 연필. */
function EmptyStateIllustration(): ReactElement {
  return (
    <svg viewBox="0 0 200 150" role="img" aria-hidden="true" style={{ width: 160, height: "auto" }} className="sbega-float">
      <ellipse cx={96} cy={62} rx={72} ry={44} fill="none" stroke="#a1a1aa" strokeWidth={3} strokeDasharray="9 7" />
      <polygon points="70,100 58,132 92,106" fill="none" stroke="#a1a1aa" strokeWidth={3} strokeLinejoin="round" />
      <text x={96} y={62} textAnchor="middle" dominantBaseline="central" fontSize={30} fill="#a1a1aa">
        ?
      </text>
      <g transform="translate(138,96) rotate(24)">
        <rect x={-4} y={-34} width={8} height={30} rx={3} fill="#f4a259" />
        <polygon points="-4,-4 4,-4 0,6" fill="#52525b" />
      </g>
    </svg>
  );
}

export function StudioBubbleEmotionGallery(): ReactElement {
  useBilingualI18nRevision();
  const locale = getCurrentUiLocale();
  const ko = locale === "ko";
  const tx = (source: string) => translateAuthoredSourceText(locale, "ko", "StudioBubbleEmotionGallery", source);

  const [draft, setDraft] = useState("");
  const [intensity, setIntensity] = useState(80);

  const hasDraft = draft.trim().length > 0;
  const intensityRatio = intensity / 100;

  return (
    <section aria-label={tx("감정 말풍선 갤러리")} className="space-y-5">
      <style>{`
        @keyframes sbega-tremble { 0%,100% { transform: translate(0,0); } 25% { transform: translate(-1.6px,1px); } 50% { transform: translate(1.4px,-1.2px); } 75% { transform: translate(-1px,-1.4px); } }
        @keyframes sbega-wobble { 0%,100% { transform: rotate(0deg) scale(1); } 30% { transform: rotate(-1.6deg) scale(1.03); } 60% { transform: rotate(1.4deg) scale(0.98); } }
        @keyframes sbega-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes sbega-drift { 0%,100% { transform: translate(0,0); opacity: .92; } 50% { transform: translate(5px,-4px); opacity: 1; } }
        @keyframes sbega-beat { 0%,100% { transform: scale(1); } 12% { transform: scale(1.045); } 24% { transform: scale(1); } 36% { transform: scale(1.03); } }
        .sbega-tremble { animation: sbega-tremble .45s linear infinite; transform-origin: center; }
        .sbega-wobble { animation: sbega-wobble 1.6s ease-in-out infinite; transform-origin: center; }
        .sbega-float { animation: sbega-float 3.2s ease-in-out infinite; }
        .sbega-drift { animation: sbega-drift 4s ease-in-out infinite; }
        .sbega-beat { animation: sbega-beat 1.4s ease-in-out infinite; transform-origin: center; }
        @media (prefers-reduced-motion: reduce) {
          .sbega-tremble, .sbega-wobble, .sbega-float, .sbega-drift, .sbega-beat { animation: none; }
        }
      `}</style>

      {/* 헤더 */}
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-amber-400 text-white shadow-lg">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-fg-1">{tx("감정 말풍선 갤러리")}</h2>
          <p className="text-sm text-fg-3">
            {tx("대사의 감정에 따라 말풍선 모양·글자 크기가 바뀌어요. 대사를 입력하면 6가지 감정으로 바로 미리볼 수 있습니다.")}
          </p>
        </div>
      </header>

      {/* 핵심 액션: 내 대사로 미리보기 */}
      <div className="rounded-2xl border border-line bg-card/60 p-4 shadow-sm">
        <label htmlFor="sbega-draft" className="flex items-center gap-2 text-sm font-semibold text-fg-1">
          <PenLine className="size-4 text-fuchsia-500" aria-hidden="true" />
          {tx("내 대사로 미리보기")}
        </label>
        <textarea
          id="sbega-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={120}
          placeholder={ko ? "예) 절대 안 돼!!!  /  쉿, 조용히~" : "e.g. No way!!!  /  Shh, quietly~"}
          className="mt-2 w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg-1 placeholder:text-fg-4 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
        />
        <div className="mt-3 flex items-center gap-3">
          <FlaskConical className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
          <label htmlFor="sbega-intensity" className="text-xs font-medium text-fg-3">
            {tx("감정 강도")}
          </label>
          <input
            id="sbega-intensity"
            type="range"
            min={0}
            max={100}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="w-full accent-fuchsia-500"
            aria-valuetext={`${intensity}%`}
          />
          <span className="w-11 shrink-0 text-right text-xs font-semibold tabular-nums text-fg-2">{intensity}%</span>
        </div>

        {hasDraft ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {EMOTION_CARDS.map((card) => (
              <figure key={card.emotion} className="rounded-xl border border-line bg-bg p-2">
                <EmotionBubbleSvg card={card} text={draft.trim()} intensity={intensityRatio} seed={7} />
                <figcaption className="mt-1 text-center text-xs font-semibold text-fg-2">
                  {ko ? card.labelKo : card.labelEn}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-bg/60 px-4 py-8 text-center">
            <EmptyStateIllustration />
            <p className="text-sm font-medium text-fg-2">
              {tx("아직 대사가 없어요")}
            </p>
            <p className="max-w-xs text-xs text-fg-3">
              {tx("위에 대사를 쓰면 6가지 감정 말풍선으로 바로 미리 보여줘요. 느낌표·물음표·~를 넣어보세요!")}
            </p>
          </div>
        )}
      </div>

      {/* 감정 카드 그리드 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EMOTION_CARDS.map((card, index) => (
          <article
            key={card.emotion}
            className="group overflow-hidden rounded-2xl border border-line bg-card/60 transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="bg-gradient-to-br from-bg to-card p-3">
              <EmotionBubbleSvg
                card={card}
                text={ko ? card.sampleKo : card.sampleEn}
                intensity={1}
                seed={index + 1}
              />
            </div>
            <div className="border-t border-line p-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-fg-1">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: card.stroke }}
                  aria-hidden="true"
                />
                {ko ? card.labelKo : card.labelEn}
                <span className="text-xs font-normal text-fg-4">
                  {ko ? card.labelEn : card.labelKo}
                </span>
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-fg-3">
                {ko ? card.descKo : card.descEn}
              </p>
            </div>
          </article>
        ))}
      </div>

      {/* 연구 노트 */}
      <footer className="flex items-start gap-2 rounded-xl bg-bg/60 p-3 text-xs text-fg-4">
        <Wand2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          {tx("감정에 따라 말풍선 형태와 글자 크기를 바꾸는 아이디어는 Yang et al.(2021), 생각 말풍선 꼬리는 Comic Chat(Siggraph 1996)에서 가져왔습니다.")}
        </p>
      </footer>
    </section>
  );
}
