import {
  useId,
  useSyncExternalStore,
  type ReactElement,
  type SVGProps,
} from "react";

import type { StudioToolHintPreviewKind } from "../studio-tool-hint-preview-kind";

/**
 * Small, semantic tool demonstrations used by the Studio's rich hints.
 *
 * Keep this list deliberately finite: every supported kind has a designed
 * preview rather than falling back to an unrelated generic animation.
 */
export type { StudioToolHintPreviewKind } from "../studio-tool-hint-preview-kind";

export type StudioToolHintPreviewProps = Omit<
  SVGProps<SVGSVGElement>,
  "children" | "viewBox"
> & {
  kind: StudioToolHintPreviewKind;
  /** Stable action/state identity used to specialize direction within a visual family. */
  variant?: string;
  /** Overrides the operating-system preference. Useful for deterministic tests. */
  reducedMotion?: boolean;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const COLOR = {
  accent: "var(--color-accent, oklch(0.72 0.185 42))",
  accentSoft: "var(--color-accent-soft, oklch(0.72 0.185 42 / 0.14))",
  canvas: "var(--color-canvas, oklch(0.155 0.008 70))",
  card: "var(--color-card, oklch(0.205 0.01 66))",
  cool: "var(--color-cool, oklch(0.8 0.11 232))",
  fg: "var(--color-fg, oklch(0.95 0.01 85))",
  fg2: "var(--color-fg-2, oklch(0.74 0.012 78))",
  fg3: "var(--color-fg-3, oklch(0.57 0.012 76))",
  line: "var(--color-line, oklch(0.305 0.012 64))",
  lineStrong: "var(--color-line-strong, oklch(0.42 0.013 64))",
  raised: "var(--color-raised, oklch(0.245 0.011 64))",
} as const;

function normalizePreviewVariant(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replaceAll("_", "-")
    .replace(/\s+/gu, "-");
}

function previewVariantMatches(variant: string, ...candidates: readonly string[]): boolean {
  return candidates.some(
    (candidate) =>
      variant === candidate ||
      variant.endsWith(`:${candidate}`) ||
      variant.endsWith(`-${candidate}`) ||
      variant.endsWith(`/${candidate}`)
  );
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof globalThis.matchMedia !== "function") return () => undefined;

  const media = globalThis.matchMedia(REDUCED_MOTION_QUERY);
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }

  // Older iPadOS WebViews expose only the legacy MediaQueryList listener API.
  media.addListener(onChange);
  return () => media.removeListener(onChange);
}

function systemPrefersReducedMotion(): boolean {
  return typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia(REDUCED_MOTION_QUERY).matches
    : true;
}

function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    systemPrefersReducedMotion,
    () => true
  );
}

function SelectionPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <g data-preview-motion={animate ? "select" : undefined}>
        <path
          d="M66 29c14-7 35-4 44 9 7 10 4 24-8 31-13 8-34 5-42-7-7-10-4-26 6-33Z"
          fill={COLOR.accentSoft}
          stroke={COLOR.accent}
          strokeWidth="2"
        />
        <rect
          x="53"
          y="20"
          width="72"
          height="59"
          rx="2"
          fill="none"
          stroke={COLOR.fg2}
          strokeDasharray="4 3"
          strokeWidth="1.25"
        />
        {[
          [53, 20],
          [89, 20],
          [125, 20],
          [53, 49.5],
          [125, 49.5],
          [53, 79],
          [89, 79],
          [125, 79],
        ].map(([x, y]) => (
          <rect
            key={`${x}-${y}`}
            x={x - 2.5}
            y={y - 2.5}
            width="5"
            height="5"
            rx="1"
            fill={COLOR.canvas}
            stroke={COLOR.accent}
            strokeWidth="1.25"
          />
        ))}
        {animate ? (
          <animateTransform
            attributeName="transform"
            type="translate"
            dur="2.8s"
            values="0 0; 9 -3; 9 -3; 0 0"
            keyTimes="0; .34; .72; 1"
            calcMode="spline"
            keySplines=".16 1 .3 1; .16 1 .3 1; .16 1 .3 1"
            repeatCount="indefinite"
          />
        ) : null}
      </g>
      <path
        d="m138 63 7 20 4.5-7.5 8 7 4-4-8-7 8-4.5-23.5-4Z"
        fill={COLOR.fg}
        stroke={COLOR.canvas}
        strokeLinejoin="round"
        strokeWidth="2"
      >
        {animate ? (
          <animateTransform
            attributeName="transform"
            type="translate"
            dur="2.8s"
            values="13 8; 0 0; 0 0; 13 8"
            keyTimes="0; .34; .72; 1"
            calcMode="spline"
            keySplines=".16 1 .3 1; .16 1 .3 1; .16 1 .3 1"
            repeatCount="indefinite"
          />
        ) : null}
      </path>
    </>
  );
}

function InkPreview({ animate }: { animate: boolean }): ReactElement {
  const strokePath = "M38 65c20-25 31 17 48-8 14-21 28-27 41-10 12 15 27 13 43-7";

  return (
    <>
      <path
        d={strokePath}
        fill="none"
        stroke={COLOR.lineStrong}
        strokeLinecap="round"
        strokeWidth="1.5"
        opacity=".35"
      />
      <path
        d={strokePath}
        fill="none"
        stroke={COLOR.accent}
        strokeDasharray="178"
        strokeDashoffset={animate ? "178" : "0"}
        strokeLinecap="round"
        strokeWidth="4.5"
      >
        {animate ? (
          <animate
            attributeName="stroke-dashoffset"
            dur="2.6s"
            values="178; 0; 0"
            keyTimes="0; .72; 1"
            calcMode="spline"
            keySplines=".16 1 .3 1; .16 1 .3 1"
            repeatCount="indefinite"
          />
        ) : null}
      </path>
      <g transform={animate ? undefined : "translate(170 40) rotate(-18)"}>
        <path
          d="M-7-13 7-13 5 7 0 14-5 7Z"
          fill={COLOR.fg2}
          stroke={COLOR.canvas}
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path d="M0 14 5 7h-10Z" fill={COLOR.accent} />
        {animate ? (
          <>
            <animateMotion
              dur="2.6s"
              path={strokePath}
              rotate="auto"
              keyPoints="0; 1; 1"
              keyTimes="0; .72; 1"
              calcMode="spline"
              keySplines=".16 1 .3 1; .16 1 .3 1"
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              additive="sum"
              type="rotate"
              values="-18; -18"
              dur="2.6s"
              repeatCount="indefinite"
            />
          </>
        ) : null}
      </g>
    </>
  );
}

function ErasePreview({ animate }: { animate: boolean }): ReactElement {
  const strokePath = "M40 59c27-18 42 18 65-2 20-17 36 3 62-17";

  return (
    <>
      <path
        d={strokePath}
        fill="none"
        stroke={COLOR.accent}
        strokeLinecap="round"
        strokeWidth="7"
        opacity=".9"
      />
      <path
        d={strokePath}
        fill="none"
        stroke={COLOR.card}
        strokeDasharray="190"
        strokeDashoffset={animate ? "190" : "74"}
        strokeLinecap="round"
        strokeWidth="9"
      >
        {animate ? (
          <animate
            attributeName="stroke-dashoffset"
            dur="2.8s"
            values="190; 18; 18"
            keyTimes="0; .7; 1"
            calcMode="spline"
            keySplines=".16 1 .3 1; .16 1 .3 1"
            repeatCount="indefinite"
          />
        ) : null}
      </path>
      <path
        d={strokePath}
        fill="none"
        stroke={COLOR.lineStrong}
        strokeDasharray="2 6"
        strokeLinecap="round"
        strokeWidth="1.5"
        opacity=".45"
      />
      <g transform={animate ? undefined : "translate(108 54) rotate(-16)"}>
        <rect
          x="-11"
          y="-8"
          width="22"
          height="16"
          rx="4"
          fill={COLOR.fg2}
          stroke={COLOR.canvas}
          strokeWidth="2"
        />
        <path d="M0-8h7a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H0Z" fill={COLOR.accent} />
        {animate ? (
          <>
            <animateMotion
              dur="2.8s"
              path={strokePath}
              rotate="auto"
              keyPoints="0; .92; .92"
              keyTimes="0; .7; 1"
              calcMode="spline"
              keySplines=".16 1 .3 1; .16 1 .3 1"
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              additive="sum"
              type="rotate"
              values="-16; -16"
              dur="2.8s"
              repeatCount="indefinite"
            />
          </>
        ) : null}
      </g>
    </>
  );
}

function FillPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <path
        d="M56 30c13-11 43-11 55 2 10 11 7 20 20 25 12 4 11 17-1 22-15 6-28-2-42 0-18 2-39-5-38-22 1-11-4-18 6-27Z"
        fill={COLOR.raised}
        stroke={COLOR.fg2}
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M57 31c13-10 41-10 52 2 10 11 7 21 20 25 10 4 10 14-1 18-14 6-27-1-40 1-17 2-36-5-35-20 0-11-4-17 4-26Z"
        fill={COLOR.accent}
        opacity={animate ? ".08" : ".82"}
      >
        {animate ? (
          <animate
            attributeName="opacity"
            dur="2.5s"
            values=".08; .08; .82; .82"
            keyTimes="0; .28; .48; 1"
            repeatCount="indefinite"
          />
        ) : null}
      </path>
      <g transform="translate(150 34) rotate(-28)">
        <path
          d="m-12-5 17-8 10 21-17 8Z"
          fill={COLOR.fg2}
          stroke={COLOR.canvas}
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path d="M3-12 9-15l10 21-6 3Z" fill={COLOR.accent} />
        <path d="m-2 16 10 5 7-13Z" fill={COLOR.cool} opacity=".8" />
      </g>
      <circle cx="119" cy="50" r={animate ? "2" : "13"} fill="none" stroke={COLOR.fg} strokeWidth="1.5" opacity={animate ? "0" : ".35"}>
        {animate ? (
          <>
            <animate attributeName="r" dur="2.5s" values="2; 2; 15; 15" keyTimes="0; .27; .48; 1" repeatCount="indefinite" />
            <animate attributeName="opacity" dur="2.5s" values="0; .65; 0; 0" keyTimes="0; .27; .48; 1" repeatCount="indefinite" />
          </>
        ) : null}
      </circle>
    </>
  );
}

function SamplePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      {[COLOR.cool, COLOR.accent, COLOR.fg2].map((fill, index) => (
        <circle
          key={fill}
          cx={54 + index * 30}
          cy="53"
          r="13"
          fill={fill}
          opacity={index === 1 ? ".95" : ".72"}
          stroke={index === 1 ? COLOR.fg : COLOR.lineStrong}
          strokeWidth={index === 1 ? "2" : "1"}
        />
      ))}
      <circle cx="84" cy="53" r="19" fill="none" stroke={COLOR.accent} strokeWidth="1.5" opacity={animate ? ".2" : ".55"}>
        {animate ? (
          <animate attributeName="r" dur="2.7s" values="15; 15; 21; 15" keyTimes="0; .4; .62; 1" repeatCount="indefinite" />
        ) : null}
      </circle>
      <g transform={animate ? undefined : "translate(113 36) rotate(-38)"}>
        <path d="M-3-18h6V6h-6Z" fill={COLOR.fg2} stroke={COLOR.canvas} strokeWidth="1.5" />
        <path d="m-5 6 10 0-5 12Z" fill={COLOR.accent} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="1.5" />
        <rect x="-7" y="-22" width="14" height="6" rx="2" fill={COLOR.raised} stroke={COLOR.fg2} strokeWidth="1.5" />
        {animate ? (
          <>
            <animateTransform
              attributeName="transform"
              type="translate"
              dur="2.7s"
              values="147 30; 112 36; 112 36; 147 30"
              keyTimes="0; .36; .68; 1"
              calcMode="spline"
              keySplines=".16 1 .3 1; .16 1 .3 1; .16 1 .3 1"
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              additive="sum"
              type="rotate"
              values="-38; -38"
              dur="2.7s"
              repeatCount="indefinite"
            />
          </>
        ) : null}
      </g>
      <rect x="153" y="34" width="29" height="38" rx="5" fill={COLOR.canvas} stroke={COLOR.lineStrong} />
      <rect x="158" y="39" width="19" height="28" rx="3" fill={COLOR.accent}>
        {animate ? (
          <animate attributeName="opacity" dur="2.7s" values=".25; .25; 1; 1" keyTimes="0; .38; .52; 1" repeatCount="indefinite" />
        ) : null}
      </rect>
    </>
  );
}

function ShapePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <path
        d="M50 68 63 28l55-4 17 44-16 9-59-3Z"
        fill="none"
        stroke={COLOR.fg3}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        opacity={animate ? ".55" : ".2"}
      >
        {animate ? (
          <animate attributeName="opacity" dur="2.9s" values=".55; .55; .12; .12" keyTimes="0; .28; .5; 1" repeatCount="indefinite" />
        ) : null}
      </path>
      <rect
        x="57"
        y="26"
        width="72"
        height="48"
        rx="7"
        fill={COLOR.accentSoft}
        stroke={COLOR.accent}
        strokeDasharray="246"
        strokeDashoffset={animate ? "246" : "0"}
        strokeWidth="2.5"
      >
        {animate ? (
          <animate attributeName="stroke-dashoffset" dur="2.9s" values="246; 246; 0; 0" keyTimes="0; .3; .62; 1" repeatCount="indefinite" />
        ) : null}
      </rect>
      <path d="m149 68 7 18 4-7 7 6 4-4-7-6 7-4Z" fill={COLOR.fg} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="2">
        {animate ? (
          <animateTransform
            attributeName="transform"
            type="translate"
            dur="2.9s"
            values="-20 -42; 0 0; 0 0"
            keyTimes="0; .54; 1"
            calcMode="spline"
            keySplines=".16 1 .3 1; .16 1 .3 1"
            repeatCount="indefinite"
          />
        ) : null}
      </path>
    </>
  );
}

/** Direct vector-shape drawing, deliberately distinct from Smart Shape's scribble correction. */
function DirectShapePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x="40" y="18" width="136" height="68" rx="7" fill={COLOR.canvas} stroke={COLOR.lineStrong} />
      <path d="M58 71V35h52v36Z" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2.5" />
      <ellipse cx="141" cy="53" rx="22" ry="18" fill={COLOR.raised} stroke={COLOR.cool} strokeWidth="2" />
      <path
        d="M58 35h52v36H58Z"
        fill="none"
        stroke={COLOR.fg}
        strokeDasharray="176"
        strokeDashoffset={animate ? "176" : "0"}
        strokeWidth="1.5"
      >
        {animate ? (
          <animate
            attributeName="stroke-dashoffset"
            dur="2.7s"
            values="176;0;0"
            keyTimes="0;.68;1"
            repeatCount="indefinite"
          />
        ) : null}
      </path>
      <g transform={animate ? undefined : "translate(110 71)"}>
        <path d="m0 0 7 18 4-7 7 6 4-4-7-6 7-4Z" fill={COLOR.fg} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="2" />
        {animate ? (
          <animateMotion
            dur="2.7s"
            path="M58 35H110V71H58V35"
            keyPoints="0;1;1"
            keyTimes="0;.68;1"
            repeatCount="indefinite"
          />
        ) : null}
      </g>
    </>
  );
}

function TextPreview({ animate, clipId }: { animate: boolean; clipId: string }): ReactElement {
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect x="49" y="25" width={animate ? "0" : "102"} height="54">
            {animate ? (
              <animate attributeName="width" dur="2.8s" values="0; 0; 102; 102" keyTimes="0; .15; .65; 1" repeatCount="indefinite" />
            ) : null}
          </rect>
        </clipPath>
      </defs>
      <rect x="42" y="20" width="120" height="61" rx="5" fill={COLOR.canvas} stroke={COLOR.lineStrong} strokeDasharray="4 3" />
      <g clipPath={`url(#${clipId})`}>
        <text
          x="52"
          y="61"
          fill={COLOR.fg}
          fontFamily="var(--font-sans, sans-serif)"
          fontSize="29"
          fontWeight="750"
        >
          웹툰
        </text>
        <path d="M52 69h78" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2" />
      </g>
      <rect x={animate ? "51" : "133"} y="31" width="2" height="37" rx="1" fill={COLOR.accent}>
        {animate ? (
          <>
            <animate attributeName="x" dur="2.8s" values="51; 51; 133; 133" keyTimes="0; .15; .65; 1" repeatCount="indefinite" />
            <animate attributeName="opacity" dur=".8s" values="1; 1; .18; .18; 1" keyTimes="0; .45; .5; .95; 1" repeatCount="indefinite" />
          </>
        ) : null}
      </rect>
      <path d="M173 28v12M167 34h12" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" />
    </>
  );
}

function BubblePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <path
        d="M44 31c0-9 8-16 18-16h87c11 0 19 7 19 16v27c0 9-8 16-19 16H94L76 86l4-12H62c-10 0-18-7-18-16Z"
        fill={COLOR.fg}
        stroke={COLOR.lineStrong}
        strokeLinejoin="round"
        strokeWidth="2"
        transform={animate ? undefined : "scale(1)"}
      >
        {animate ? (
          <animateTransform
            attributeName="transform"
            type="scale"
            additive="sum"
            dur="2.8s"
            values=".94; 1; 1; .94"
            keyTimes="0; .22; .82; 1"
            calcMode="spline"
            keySplines=".16 1 .3 1; .16 1 .3 1; .16 1 .3 1"
            repeatCount="indefinite"
          />
        ) : null}
      </path>
      <g fill={COLOR.canvas}>
        {[81, 106, 131].map((cx, index) => (
          <circle key={cx} cx={cx} cy="46" r="5" opacity={animate ? ".28" : "1"}>
            {animate ? (
              <animate
                attributeName="opacity"
                dur="1.4s"
                begin={`${index * 0.16}s`}
                values=".28; 1; .28"
                keyTimes="0; .38; 1"
                repeatCount="indefinite"
              />
            ) : null}
          </circle>
        ))}
      </g>
      <path d="M177 22v11M171.5 27.5h11" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2" />
    </>
  );
}

function ImagePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <g data-preview-motion={animate ? "image" : undefined}>
        <rect x="49" y="17" width="108" height="69" rx="6" fill={COLOR.canvas} stroke={COLOR.fg2} strokeWidth="2" />
        <circle cx="75" cy="39" r="8" fill={COLOR.accent} opacity=".92" />
        <path d="m54 76 28-28 18 17 14-13 38 24Z" fill={COLOR.cool} opacity=".58" />
        <path d="m54 76 28-28 18 17" fill="none" stroke={COLOR.fg} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="m100 65 14-13 38 24" fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        {animate ? (
          <animateTransform
            attributeName="transform"
            type="translate"
            dur="3s"
            values="0 5; 0 0; 0 0; 0 5"
            keyTimes="0; .28; .78; 1"
            calcMode="spline"
            keySplines=".16 1 .3 1; .16 1 .3 1; .16 1 .3 1"
            repeatCount="indefinite"
          />
        ) : null}
      </g>
      <g fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2">
        <path d="M42 31V12h19M164 12h19v19M183 72v19h-19M61 91H42V72" />
      </g>
    </>
  );
}

const FILTER_PREVIEW_ENGINES = [
  "gaussian-blur",
  "motion-blur",
  "blur",
  "curves",
  "levels",
  "brightness-contrast",
  "hue-saturation",
  "color-balance",
  "channel-mixer",
  "gradient-map",
  "sharpen",
  "noise",
  "invert",
] as const;

type FilterPreviewEngine = (typeof FILTER_PREVIEW_ENGINES)[number];

function filterPreviewEngine(variant: string): FilterPreviewEngine | null {
  return FILTER_PREVIEW_ENGINES.find((engine) => previewVariantMatches(variant, engine)) ?? null;
}

function FilterEnginePreview({
  animate,
  engine,
}: {
  animate: boolean;
  engine: FilterPreviewEngine;
}): ReactElement {
  const frame = <rect x="39" y="16" width="138" height="72" rx="7" fill={COLOR.canvas} stroke={COLOR.lineStrong} strokeWidth="1.7" />;

  if (engine === "curves") {
    return <>{frame}<path d="M55 76V29h105M58 72c30 0 32-35 59-35 19 0 19 23 42 23" fill="none" stroke={COLOR.accent} strokeDasharray="148" strokeDashoffset={animate ? "148" : "0"} strokeLinecap="round" strokeWidth="3">{animate ? <animate attributeName="stroke-dashoffset" dur="2.7s" values="148;0;0" keyTimes="0;.72;1" repeatCount="indefinite" /> : null}</path><circle cx="90" cy="51" r="4" fill={COLOR.cool} /><circle cx="132" cy="45" r="4" fill={COLOR.cool} /></>;
  }
  if (engine === "levels") {
    return <>{frame}<path d="M53 70V61h8V45h8v12h8V35h8v29h8V51h8v19h8V29h8v41h8V43h8v27h8V56h8v14h8" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeLinejoin="round" strokeWidth="1.5" /><path d="M56 80h102" stroke={COLOR.fg2} strokeWidth="2" /><path d="m65 80 6-9 6 9m32 0 6-9 6 9m29 0 6-9 6 9" fill={COLOR.accent} opacity={animate ? ".35" : "1"}>{animate ? <animate attributeName="opacity" dur="1.4s" values=".3;1;.3" repeatCount="indefinite" /> : null}</path></>;
  }
  if (engine === "brightness-contrast") {
    return <>{frame}<circle cx="79" cy="52" r="18" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" /><circle cx="137" cy="52" r="18" fill={COLOR.raised} stroke={COLOR.fg2} strokeWidth="2" /><path d="M137 34a18 18 0 0 1 0 36Z" fill={COLOR.fg} /><g stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2">{[[79,25,79,18],[79,79,79,86],[52,52,45,52],[106,52,113,52]].map((p,index)=><path key={index} d={`M${p[0]} ${p[1]} ${p[2]} ${p[3]}`} />)}</g><circle cx="79" cy="52" r={animate ? "8" : "12"} fill={COLOR.accent}>{animate ? <animate attributeName="r" dur="2.3s" values="7;13;7" repeatCount="indefinite" /> : null}</circle></>;
  }
  if (engine === "hue-saturation") {
    return <>{frame}<circle cx="108" cy="52" r="29" fill="none" stroke={COLOR.fg3} strokeWidth="8" /><path d="M108 23a29 29 0 0 1 25 15" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="8" /><path d="M133 38a29 29 0 0 1-2 31" fill="none" stroke={COLOR.cool} strokeLinecap="round" strokeWidth="8" /><circle cx="108" cy="52" r={animate ? "7" : "17"} fill={COLOR.accentSoft} stroke={COLOR.accent}>{animate ? <animate attributeName="r" dur="2.5s" values="7;18;18;7" keyTimes="0;.4;.72;1" repeatCount="indefinite" /> : null}</circle></>;
  }
  if (engine === "color-balance") {
    return <>{frame}<path d="M57 64h102M108 36v39" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" /><g transform={animate ? undefined : "rotate(-8 108 64)"}><path d="M65 64h86" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="3" /><circle cx="70" cy="50" r="10" fill={COLOR.cool} /><circle cx="146" cy="50" r="10" fill={COLOR.accent} />{animate ? <animateTransform attributeName="transform" type="rotate" dur="2.8s" values="-8 108 64;8 108 64;8 108 64;-8 108 64" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}</g></>;
  }
  if (engine === "channel-mixer") {
    return <>{frame}<circle cx="69" cy="38" r="12" fill={COLOR.accent} opacity=".8" /><circle cx="69" cy="66" r="12" fill={COLOR.cool} opacity=".8" /><circle cx="99" cy="52" r="12" fill={COLOR.fg2} opacity=".75" /><path d="M82 38 139 52M82 66l57-14M111 52h28" stroke={COLOR.fg2} strokeDasharray="5 4" strokeWidth="2" /><circle cx="150" cy="52" r={animate ? "10" : "17"} fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2">{animate ? <animate attributeName="r" dur="2.4s" values="9;18;18;9" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}</circle></>;
  }
  if (engine === "gradient-map") {
    return <>{frame}<g>{[0,1,2,3,4].map((index)=><rect key={index} x={53+index*22} y="31" width="23" height="22" fill={index<2?COLOR.canvas:index===2?COLOR.fg3:index===3?COLOR.cool:COLOR.accent} stroke={COLOR.lineStrong} />)}</g><path d="M54 70h108" stroke={COLOR.fg3} strokeWidth="8" /><path d="M54 70h108" stroke={COLOR.accent} strokeDasharray="108" strokeDashoffset={animate ? "108" : "0"} strokeWidth="8">{animate ? <animate attributeName="stroke-dashoffset" dur="2.5s" values="108;0;0" keyTimes="0;.72;1" repeatCount="indefinite" /> : null}</path></>;
  }
  if (engine === "gaussian-blur" || engine === "blur") {
    const radius = engine === "gaussian-blur" ? 24 : 18;
    return <>{frame}<circle cx="87" cy="52" r={radius} fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" /><circle cx="129" cy="52" r={radius} fill={COLOR.cool} opacity=".28" /><circle cx="108" cy="52" r={animate ? "8" : `${radius + 4}`} fill={COLOR.accentSoft} opacity={animate ? ".25" : ".72"}>{animate ? <><animate attributeName="r" dur="2.7s" values={`8;${radius+6};${radius+6};8`} keyTimes="0;.42;.72;1" repeatCount="indefinite" /><animate attributeName="opacity" dur="2.7s" values=".2;.72;.72;.2" keyTimes="0;.42;.72;1" repeatCount="indefinite" /></> : null}</circle></>;
  }
  if (engine === "motion-blur") {
    return <>{frame}{[0,1,2,3].map((index)=><path key={index} d={`M54 ${36+index*11}h${68+index*9}`} stroke={index===3?COLOR.accent:COLOR.fg3} strokeLinecap="round" strokeWidth={index===3?5:3} opacity={index===3?1:.4} />)}<path d="m144 30 18 22-18 22" fill="none" stroke={COLOR.accent} strokeDasharray={animate ? "70" : undefined} strokeDashoffset={animate ? "70" : undefined} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3">{animate ? <animate attributeName="stroke-dashoffset" dur="2.1s" values="70;0;0" keyTimes="0;.7;1" repeatCount="indefinite" /> : null}</path></>;
  }
  if (engine === "sharpen") {
    return <>{frame}<path d="m56 73 32-37 20 22 18-19 34 34" fill="none" stroke={COLOR.fg3} strokeWidth="7" opacity=".25" /><path d="m56 73 32-37 20 22 18-19 34 34" fill="none" stroke={COLOR.accent} strokeDasharray="152" strokeDashoffset={animate ? "152" : "0"} strokeLinejoin="miter" strokeWidth="2.5">{animate ? <animate attributeName="stroke-dashoffset" dur="2.4s" values="152;0;0" keyTimes="0;.7;1" repeatCount="indefinite" /> : null}</path></>;
  }
  if (engine === "noise") {
    const dots = [[55,30],[69,47],[84,68],[98,35],[112,57],[128,28],[143,48],[158,71],[61,73],[151,34],[123,75],[91,51]];
    return <>{frame}{dots.map(([cx,cy],index)=><circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2+(index%3)} fill={index%2?COLOR.accent:COLOR.fg2} opacity={animate?".3":".9"}>{animate ? <animate attributeName="opacity" dur={`${.8+(index%4)*.2}s`} values=".2;1;.2" repeatCount="indefinite" /> : null}</circle>)}</>;
  }
  return <>{frame}<path d="M46 25h58v54H46Z" fill={COLOR.fg} stroke={COLOR.fg2} /><path d="M104 25h58v54h-58Z" fill={COLOR.canvas} stroke={COLOR.fg2} /><circle cx="77" cy="52" r="13" fill={COLOR.canvas} /><circle cx="133" cy="52" r="13" fill={COLOR.fg} /><path d="M94 18h28m0 0-7-6m7 6-7 6M122 86H94m0 0 7-6m-7 6 7 6" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" opacity={animate?".3":"1"}>{animate ? <animate attributeName="opacity" dur="1.3s" values=".25;1;.25" repeatCount="indefinite" /> : null}</path></>;
}

function FilterPreview({ animate, clipId, variant }: { animate: boolean; clipId: string; variant: string }): ReactElement {
  const engine = filterPreviewEngine(variant);
  if (engine) return <FilterEnginePreview animate={animate} engine={engine} />;
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect x="43" y="17" width={animate ? "0" : "112"} height="68">
            {animate ? (
              <animate attributeName="width" dur="3.2s" values="0; 112; 112; 0" keyTimes="0; .45; .67; 1" repeatCount="indefinite" />
            ) : null}
          </rect>
        </clipPath>
      </defs>
      <rect x="43" y="17" width="112" height="68" rx="6" fill={COLOR.raised} stroke={COLOR.lineStrong} />
      <circle cx="69" cy="38" r="8" fill={COLOR.fg3} />
      <path d="m47 78 30-29 20 18 14-14 40 25Z" fill={COLOR.fg3} opacity=".55" />
      <g clipPath={`url(#${clipId})`}>
        <rect x="43" y="17" width="112" height="68" fill={COLOR.accentSoft} />
        <circle cx="69" cy="38" r="8" fill={COLOR.accent} />
        <path d="m47 78 30-29 20 18 14-14 40 25Z" fill={COLOR.cool} opacity=".78" />
        <path d="M47 78 77 49l20 18" fill="none" stroke={COLOR.fg} strokeLinecap="round" strokeWidth="2" />
      </g>
      <g transform={animate ? undefined : "translate(155 0)"}>
        <path d="M0 13v76" stroke={COLOR.fg} strokeWidth="2" />
        <rect x="-5" y="42" width="10" height="18" rx="3" fill={COLOR.accent} stroke={COLOR.canvas} strokeWidth="2" />
        {animate ? (
          <animateTransform
            attributeName="transform"
            type="translate"
            dur="3.2s"
            values="43 0; 155 0; 155 0; 43 0"
            keyTimes="0; .45; .67; 1"
            calcMode="spline"
            keySplines=".16 1 .3 1; .16 1 .3 1; .16 1 .3 1"
            repeatCount="indefinite"
          />
        ) : null}
      </g>
      <g fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="1.75">
        <path d="M173 29h18M173 50h18M173 71h18" />
        <circle cx="181" cy="29" r="3" fill={COLOR.card} />
        <circle cx="186" cy="50" r="3" fill={COLOR.card} />
        <circle cx="177" cy="71" r="3" fill={COLOR.card} />
      </g>
    </>
  );
}

function BrushSizePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <circle cx="75" cy="50" r="25" fill={COLOR.canvas} stroke={COLOR.lineStrong} strokeWidth="1.5" />
      <circle cx="75" cy="50" r={animate ? "7" : "17"} fill={COLOR.accent} opacity=".88">
        {animate ? (
          <animate
            attributeName="r"
            dur="2.7s"
            values="7; 19; 19; 7"
            keyTimes="0; .38; .68; 1"
            calcMode="spline"
            keySplines=".16 1 .3 1; .16 1 .3 1; .16 1 .3 1"
            repeatCount="indefinite"
          />
        ) : null}
      </circle>
      <path d="M119 68h62" stroke={COLOR.fg3} strokeLinecap="round" strokeWidth="3" />
      <path d={animate ? "M119 68h8" : "M119 68h38"} stroke={COLOR.accent} strokeLinecap="round" strokeWidth="3">
        {animate ? (
          <animate attributeName="d" dur="2.7s" values="M119 68h8;M119 68h54;M119 68h54;M119 68h8" keyTimes="0;.38;.68;1" repeatCount="indefinite" />
        ) : null}
      </path>
      <circle cx={animate ? "127" : "157"} cy="68" r="6" fill={COLOR.fg} stroke={COLOR.canvas} strokeWidth="2">
        {animate ? (
          <animate attributeName="cx" dur="2.7s" values="127;173;173;127" keyTimes="0;.38;.68;1" repeatCount="indefinite" />
        ) : null}
      </circle>
      <path d="M124 34h52M124 42h32" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" opacity=".74" />
      <circle cx="178" cy="34" r="3" fill={COLOR.accent} />
    </>
  );
}

function OpacityPreview({
  animate,
  patternId,
}: {
  animate: boolean;
  patternId: string;
}): ReactElement {
  return (
    <>
      <defs>
        <pattern id={patternId} width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill={COLOR.canvas} />
          <path d="M0 0h6v6H0ZM6 6h6v6H6Z" fill={COLOR.raised} />
        </pattern>
      </defs>
      <rect x="42" y="21" width="74" height="62" rx="7" fill={`url(#${patternId})`} stroke={COLOR.lineStrong} />
      <circle cx="79" cy="52" r="22" fill={COLOR.accent} opacity={animate ? ".24" : ".72"}>
        {animate ? (
          <animate attributeName="opacity" dur="2.8s" values=".22;.9;.9;.22" keyTimes="0;.4;.68;1" repeatCount="indefinite" />
        ) : null}
      </circle>
      <path d="M135 34h45M135 52h45M135 70h45" stroke={COLOR.fg3} strokeLinecap="round" strokeWidth="2" />
      <circle cx="165" cy="34" r="4" fill={COLOR.fg2} />
      <circle cx={animate ? "145" : "166"} cy="52" r="5" fill={COLOR.accent} stroke={COLOR.canvas} strokeWidth="2">
        {animate ? (
          <animate attributeName="cx" dur="2.8s" values="145;176;176;145" keyTimes="0;.4;.68;1" repeatCount="indefinite" />
        ) : null}
      </circle>
      <circle cx="151" cy="70" r="4" fill={COLOR.fg2} />
    </>
  );
}

function StabilizerPreview({
  animate,
  variant,
}: {
  animate: boolean;
  variant: string;
}): ReactElement {
  const isAdaptive = previewVariantMatches(variant, "adaptive");
  const isPrecision = previewVariantMatches(variant, "precision");
  const isPostCorrection = previewVariantMatches(variant, "post-correction");

  if (isPostCorrection) {
    const roughPath = "M39 69c8-28 14 7 23-22 10 33 19-6 28 20 12-31 20 8 31-17 13 23 29-13 57-10";
    const correctedPath = "M39 69c20-28 39-25 55-6 19 22 38 17 54-5 10-14 20-19 30-18";
    return (
      <g data-preview-stabilizer="post-correction">
        <path
          d={roughPath}
          fill="none"
          stroke={COLOR.fg2}
          strokeDasharray={animate ? "220" : "4 4"}
          strokeDashoffset={animate ? "220" : undefined}
          strokeLinecap="round"
          strokeWidth="2.2"
          opacity={animate ? ".9" : ".32"}
        >
          {animate ? (
            <>
              <animate attributeName="stroke-dashoffset" dur="3.2s" values="220;0;0;220" keyTimes="0;.43;.72;1" repeatCount="indefinite" />
              <animate attributeName="opacity" dur="3.2s" values=".9;.9;.18;.18;.9" keyTimes="0;.43;.55;.84;1" repeatCount="indefinite" />
            </>
          ) : null}
        </path>
        <path
          d={correctedPath}
          fill="none"
          stroke={COLOR.accent}
          strokeDasharray="190"
          strokeDashoffset={animate ? "190" : "0"}
          strokeLinecap="round"
          strokeWidth="4.5"
          opacity={animate ? "0" : "1"}
        >
          {animate ? (
            <>
              <animate attributeName="stroke-dashoffset" dur="3.2s" values="190;190;0;0;190" keyTimes="0;.5;.72;.9;1" repeatCount="indefinite" />
              <animate attributeName="opacity" dur="3.2s" values="0;0;1;1;0" keyTimes="0;.48;.58;.9;1" repeatCount="indefinite" />
            </>
          ) : null}
        </path>
        <g transform={animate ? undefined : "translate(178 40)"}>
          <path d="M-6-12H6L4 4 0 11-4 4Z" fill={COLOR.fg} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="2" />
          <circle cy="12" r="2.5" fill={COLOR.accent} />
          {animate ? (
            <>
              <animateMotion dur="3.2s" path={roughPath} keyPoints="0;1;1;1" keyTimes="0;.43;.9;1" repeatCount="indefinite" />
              <animate attributeName="opacity" dur="3.2s" values="1;1;0;0;1" keyTimes="0;.43;.5;.9;1" repeatCount="indefinite" />
            </>
          ) : null}
        </g>
        <path d="M155 75h24m-6-6 6 6-6 6" fill="none" stroke={COLOR.cool} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </g>
    );
  }

  const rawPath = isAdaptive
    ? "M39 70c17-34 29-31 45-5l12 13 15-39c12-18 30 5 66 19"
    : isPrecision
      ? "M39 68c8-22 13 4 20-16 8 20 14-5 22 12 12-23 20 7 31-10 17-25 34 4 65-13"
      : "M42 72c8-37 19 2 29-29 9 42 19-11 29 25 10-30 19 4 29-22 8 38 20-14 48-11";
  const smoothPath = isAdaptive
    ? "M39 70c18-31 32-29 45-5l12 13 15-39c16-13 34 2 66 19"
    : isPrecision
      ? "M39 68c31-27 60-25 82-10 18 12 35 3 56-17"
      : "M43 69c18-30 36-29 53-6 18 25 38 20 52-6 9-17 18-21 28-20";
  const endpoint = isAdaptive ? "177 58" : isPrecision ? "177 41" : "176 37";
  const controlPoints = isAdaptive
    ? [[39, 70], [84, 65], [96, 78], [111, 39], [177, 58]]
    : isPrecision
      ? [[39, 68], [81, 55], [121, 58], [177, 41]]
      : [[43, 69], [96, 63], [148, 57], [176, 37]];

  return (
    <g data-preview-stabilizer={isAdaptive ? "adaptive" : isPrecision ? "precision" : "standard"}>
      {isPrecision ? (
        <path d="M38 61c32-27 61-25 83-10 18 12 35 3 57-17M40 75c30-27 59-25 81-10 18 12 35 3 55-17" fill="none" stroke={COLOR.cool} strokeDasharray="3 4" strokeWidth="1" opacity=".48" />
      ) : null}
      <path d={rawPath} fill="none" stroke={COLOR.fg3} strokeDasharray="3 4" strokeLinecap="round" strokeWidth="1.5" opacity=".68" />
      <path d={smoothPath} fill="none" stroke={COLOR.accent} strokeDasharray="210" strokeDashoffset={animate ? "210" : "0"} strokeLinecap="round" strokeLinejoin="round" strokeWidth={isPrecision ? "5" : "4"}>
        {animate ? <animate attributeName="stroke-dashoffset" dur="2.9s" values="210;0;0" keyTimes="0;.72;1" repeatCount="indefinite" /> : null}
      </path>
      {controlPoints.map(([cx, cy], index) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={isAdaptive && index === 2 ? "4" : "3"} fill={isAdaptive && index === 2 ? COLOR.cool : COLOR.card} stroke={COLOR.fg2} strokeWidth="1.5" />
      ))}
      <g transform={animate ? undefined : `translate(${endpoint})`}>
        <circle r="8" fill={COLOR.fg} stroke={COLOR.canvas} strokeWidth="2" />
        <circle r="2.5" fill={COLOR.accent} />
        {animate ? <animateMotion dur="2.9s" path={smoothPath} keyPoints="0;1;1" keyTimes="0;.72;1" repeatCount="indefinite" /> : null}
      </g>
    </g>
  );
}

function PressurePreview({
  animate,
  variant,
}: {
  animate: boolean;
  variant: string;
}): ReactElement {
  const mode = previewVariantMatches(variant, "soft")
    ? "soft"
    : previewVariantMatches(variant, "firm")
      ? "firm"
      : "linear";
  const widths = mode === "soft" ? [5, 10, 13] : mode === "firm" ? [2, 4, 11] : [3, 7, 11];
  const responsePath = mode === "soft"
    ? "M145 78C148 48 158 30 181 24"
    : mode === "firm"
      ? "M145 78C164 78 177 59 181 24"
      : "M145 78 181 24";
  const segments = [
    "M38 68C53 52 68 44 82 42",
    "M82 42C96 39 109 43 119 50",
    "M119 50C126 55 131 61 137 66",
  ];

  return (
    <g data-preview-pressure-response={mode}>
      <path d="M38 68C68 37 109 37 137 66" fill="none" stroke={COLOR.lineStrong} strokeLinecap="round" strokeWidth="1.5" opacity=".5" />
      {segments.map((path, index) => (
        <path key={path} d={path} fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeWidth={animate ? "2" : widths[index]}>
          {animate ? <animate attributeName="stroke-width" dur="2.7s" values={`2;${widths[index]};${widths[index]};2`} keyTimes={`0;${.28 + index * .12};.8;1`} repeatCount="indefinite" /> : null}
        </path>
      ))}
      <path d="M143 80V20M143 80h42" fill="none" stroke={COLOR.fg3} strokeLinecap="round" strokeWidth="1.5" />
      <path d={responsePath} fill="none" stroke={COLOR.cool} strokeDasharray={animate ? "78" : undefined} strokeDashoffset={animate ? "78" : undefined} strokeLinecap="round" strokeWidth="2.5">
        {animate ? <animate attributeName="stroke-dashoffset" dur="2.7s" values="78;0;0;78" keyTimes="0;.64;.82;1" repeatCount="indefinite" /> : null}
      </path>
      <circle cx="181" cy="24" r={mode === "soft" ? "5" : mode === "firm" ? "3" : "4"} fill={COLOR.accent} />
      <g transform="translate(102 27)">
        <path d="M-7-14H7L5 5 0 13-5 5Z" fill={COLOR.fg2} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="2" />
        <path d="M0 13 5 5H-5Z" fill={COLOR.accent} />
        {animate ? <animateTransform attributeName="transform" additive="sum" type="translate" dur="2.7s" values={mode === "soft" ? "0 -3;0 8;0 2;0 -3" : mode === "firm" ? "0 -8;0 -2;0 9;0 -8" : "0 -6;0 4;0 6;0 -6"} keyTimes="0;.4;.76;1" repeatCount="indefinite" /> : null}
      </g>
    </g>
  );
}

function SymmetryPreview({
  animate,
  variant,
}: {
  animate: boolean;
  variant: string;
}): ReactElement {
  const mode = previewVariantMatches(variant, "none")
    ? "none"
    : previewVariantMatches(variant, "horizontal")
      ? "horizontal"
      : previewVariantMatches(variant, "radial")
        ? "radial"
        : previewVariantMatches(variant, "kaleidoscope")
          ? "kaleidoscope"
          : "vertical";

  if (mode === "none") {
    const freePath = "M48 70c9-35 31-50 57-35 18 11 19 35 50 39";
    return (
      <g data-preview-symmetry="none">
        <path d="M108 18v69" stroke={COLOR.fg3} strokeDasharray="3 4" strokeWidth="1.3" opacity=".42" />
        <path d="m101 24 14-14" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="3" />
        <path d={freePath} fill="none" stroke={COLOR.accent} strokeDasharray="170" strokeDashoffset={animate ? "170" : "0"} strokeLinecap="round" strokeWidth="4.5">
          {animate ? <animate attributeName="stroke-dashoffset" dur="2.7s" values="170;0;0" keyTimes="0;.7;1" repeatCount="indefinite" /> : null}
        </path>
        <circle cx="155" cy="74" r="4" fill={COLOR.accent} />
      </g>
    );
  }

  if (mode === "horizontal") {
    const upperPath = "M52 44c15-21 34-25 54-10 17 13 31 13 57-2";
    const lowerPath = "M52 60c15 21 34 25 54 10 17-13 31-13 57 2";
    return (
      <g data-preview-symmetry="horizontal">
        <path d="M35 52h146" stroke={COLOR.cool} strokeDasharray="3 4" strokeWidth="1.5" />
        {[upperPath, lowerPath].map((path, index) => (
          <path key={path} d={path} fill="none" stroke={COLOR.accent} strokeDasharray="145" strokeDashoffset={animate ? "145" : "0"} strokeLinecap="round" strokeWidth="4" opacity={index ? ".72" : "1"}>
            {animate ? <animate attributeName="stroke-dashoffset" dur="2.7s" values="145;0;0" keyTimes="0;.68;1" repeatCount="indefinite" /> : null}
          </path>
        ))}
        <circle cx="35" cy="52" r="4" fill={COLOR.card} stroke={COLOR.cool} strokeWidth="2" />
      </g>
    );
  }

  if (mode === "radial") {
    return (
      <g data-preview-symmetry="radial" transform="translate(108 52)">
        {[0, 60, 120].map((angle) => <path key={angle} d="M-44 0H44" transform={`rotate(${angle})`} stroke={COLOR.cool} strokeDasharray="3 4" strokeWidth="1" opacity=".52" />)}
        <g>
          {[0, 60, 120, 180, 240, 300].map((angle) => <path key={angle} d="M8 0c8-13 19-12 29 0-10 12-21 13-29 0Z" transform={`rotate(${angle})`} fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" />)}
          {animate ? <animateTransform attributeName="transform" type="rotate" dur="3.6s" values="0;60;60" keyTimes="0;.72;1" repeatCount="indefinite" /> : null}
        </g>
        <circle r="5" fill={COLOR.accent} stroke={COLOR.canvas} strokeWidth="2" />
      </g>
    );
  }

  if (mode === "kaleidoscope") {
    return (
      <g data-preview-symmetry="kaleidoscope" transform="translate(108 52)">
        {Array.from({ length: 8 }, (_, index) => index * 45).map((angle, index) => (
          <g key={angle} transform={`rotate(${angle})`}>
            <path d="M0 0 45-12V12Z" fill={index % 2 ? COLOR.accentSoft : COLOR.raised} stroke={index % 2 ? COLOR.cool : COLOR.accent} strokeWidth="1.2" />
            <circle cx="31" cy="0" r={index % 2 ? "3" : "5"} fill={index % 2 ? COLOR.cool : COLOR.accent} />
          </g>
        ))}
        <circle r="7" fill={COLOR.card} stroke={COLOR.fg} strokeWidth="2" />
        {animate ? <animateTransform attributeName="transform" additive="sum" type="rotate" dur="4.2s" values="0;45;45" keyTimes="0;.75;1" repeatCount="indefinite" /> : null}
      </g>
    );
  }

  const leftPath = "M99 25c-23 8-35 27-30 50 10-8 19-9 30-5";
  const rightPath = "M117 25c23 8 35 27 30 50-10-8-19-9-30-5";
  return (
    <g data-preview-symmetry="vertical">
      <path d="M108 17v70" stroke={COLOR.cool} strokeDasharray="3 4" strokeWidth="1.5" />
      {[leftPath, rightPath].map((path, index) => (
        <path key={path} d={path} fill="none" stroke={COLOR.accent} strokeDasharray="95" strokeDashoffset={animate ? "95" : "0"} strokeLinecap="round" strokeWidth="4" opacity={index ? ".72" : "1"}>
          {animate ? <animate attributeName="stroke-dashoffset" dur="2.7s" values="95;0;0" keyTimes="0;.65;1" repeatCount="indefinite" /> : null}
        </path>
      ))}
      <circle cx="108" cy="17" r="4" fill={COLOR.card} stroke={COLOR.cool} strokeWidth="2" />
      <path d="m84 79 9 7M132 86l9-7" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" />
    </g>
  );
}

function ZoomViewPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x={animate ? "63" : "52"} y={animate ? "29" : "20"} width={animate ? "82" : "104"} height={animate ? "47" : "64"} rx="5" fill={COLOR.canvas} stroke={COLOR.fg2} strokeWidth="2">
        {animate ? (
          <>
            <animate attributeName="x" dur="2.8s" values="63;48;48;63" keyTimes="0;.38;.72;1" repeatCount="indefinite" />
            <animate attributeName="y" dur="2.8s" values="29;18;18;29" keyTimes="0;.38;.72;1" repeatCount="indefinite" />
            <animate attributeName="width" dur="2.8s" values="82;112;112;82" keyTimes="0;.38;.72;1" repeatCount="indefinite" />
            <animate attributeName="height" dur="2.8s" values="47;68;68;47" keyTimes="0;.38;.72;1" repeatCount="indefinite" />
          </>
        ) : null}
      </rect>
      <path d="M72 67 91 46l16 14 14-11 22 19" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <circle cx="81" cy="42" r="6" fill={COLOR.cool} />
      <circle cx="158" cy="71" r="17" fill={COLOR.card} stroke={COLOR.fg} strokeWidth="2" />
      <path d="M170 83l13 9M151 71h14M158 64v14" stroke={COLOR.fg} strokeLinecap="round" strokeWidth="2.5" />
      <path d="M42 31V17h14M160 17h14v14M174 73v14h-14M56 87H42V73" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2" opacity=".75" />
    </>
  );
}

function HistoryPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <g key={index} transform={`translate(${70 + index * 16} ${21 + index * 8})`} opacity={index === 2 ? "1" : ".46"}>
          <rect width="74" height="48" rx="5" fill={index === 2 ? COLOR.canvas : COLOR.raised} stroke={index === 2 ? COLOR.accent : COLOR.lineStrong} strokeWidth="1.5" />
          <circle cx="19" cy="18" r="6" fill={index === 2 ? COLOR.accent : COLOR.fg3} />
          <path d="M11 40 28 25l13 10 10-8 12 13" fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </g>
      ))}
      <path d="M71 32H48l9-9M48 32l9 9" fill="none" stroke={COLOR.fg} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <path d="M48 32c0 19 12 31 31 34" fill="none" stroke={COLOR.accent} strokeDasharray={animate ? "64" : undefined} strokeDashoffset={animate ? "64" : undefined} strokeLinecap="round" strokeWidth="2.5">
        {animate ? <animate attributeName="stroke-dashoffset" dur="2.6s" values="64;0;0;64" keyTimes="0;.38;.72;1" repeatCount="indefinite" /> : null}
      </path>
      <g fill={COLOR.fg3}>
        <circle cx="60" cy="82" r="3" />
        <circle cx="78" cy="82" r="3" />
        <circle cx="96" cy="82" r="3" />
      </g>
      <circle cx={animate ? "96" : "78"} cy="82" r="5" fill={COLOR.accent} stroke={COLOR.canvas} strokeWidth="2">
        {animate ? <animate attributeName="cx" dur="2.6s" values="96;60;60;96" keyTimes="0;.38;.72;1" repeatCount="indefinite" /> : null}
      </circle>
    </>
  );
}

function LayerPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <g transform="translate(42 4)">
        <path d="m66 18 58 20-58 20L8 38Z" fill={COLOR.raised} stroke={COLOR.lineStrong} strokeLinejoin="round" strokeWidth="1.5" opacity=".65" />
        <path d="m66 32 58 20-58 20L8 52Z" fill={COLOR.canvas} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="1.5" opacity=".88" />
        <g transform={animate ? undefined : "translate(0 -10)"}>
          <path d="m66 46 58 20-58 20L8 66Z" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeLinejoin="round" strokeWidth="2" />
          <path d="m43 66 17-9 19 7 12-5 18 7-43 15Z" fill={COLOR.accent} opacity=".72" />
          {animate ? (
            <animateTransform attributeName="transform" type="translate" dur="2.8s" values="0 0;0 -12;0 -12;0 0" keyTimes="0;.32;.72;1" repeatCount="indefinite" />
          ) : null}
        </g>
      </g>
      <g transform="translate(177 32)" fill="none" stroke={COLOR.fg2} strokeWidth="1.8">
        <path d="M-9 0C-4-6 4-6 9 0-4 6 4 6-9 0Z" />
        <circle r="2.5" fill={COLOR.accent} stroke="none" opacity={animate ? ".3" : "1"}>
          {animate ? <animate attributeName="opacity" dur="1.4s" values=".3;1;.3" repeatCount="indefinite" /> : null}
        </circle>
      </g>
    </>
  );
}

function TimelinePreview({ animate }: { animate: boolean }): ReactElement {
  const playheadX = animate ? 64 : 142;

  return (
    <>
      <rect x="27" y="20" width="162" height="62" rx="6" fill={COLOR.canvas} stroke={COLOR.lineStrong} strokeWidth="1.4" />
      <path d="M27 37h162M27 54h162M27 71h162M66 20v62" stroke={COLOR.line} strokeWidth="1" />
      <g fill={COLOR.fg3} opacity=".72">
        <rect x="35" y="27" width="21" height="3" rx="1.5" />
        <rect x="35" y="44" width="16" height="3" rx="1.5" />
        <rect x="35" y="61" width="24" height="3" rx="1.5" />
      </g>
      {[
        [86, 28],
        [119, 45],
        [101, 62],
        [158, 62],
      ].map(([x, y], index) => (
        <rect
          key={`${x}-${y}`}
          x={x - 4}
          y={y - 4}
          width="8"
          height="8"
          rx="1.2"
          transform={`rotate(45 ${x} ${y})`}
          fill={index === 3 ? COLOR.accent : COLOR.raised}
          stroke={index === 3 ? COLOR.accent : COLOR.fg2}
          strokeWidth="1.3"
        />
      ))}
      <g transform={`translate(${playheadX} 0)`} data-preview-motion={animate ? "timeline" : undefined}>
        <path d="m0 16-5-6h10Z" fill={COLOR.accent} />
        <path d="M0 16v70" stroke={COLOR.accent} strokeWidth="2" />
        {animate ? (
          <animateTransform
            attributeName="transform"
            type="translate"
            dur="3s"
            values="64 0;142 0;142 0;64 0"
            keyTimes="0;.58;.76;1"
            repeatCount="indefinite"
          />
        ) : null}
      </g>
      <path d="m91 91 10-6v12Z" fill={COLOR.fg} opacity=".9" />
      <rect x="108" y="87" width="54" height="7" rx="3.5" fill={COLOR.raised} />
      <rect x="108" y="87" width={animate ? "18" : "42"} height="7" rx="3.5" fill={COLOR.accent}>
        {animate ? <animate attributeName="width" dur="3s" values="0;54;54;0" keyTimes="0;.58;.76;1" repeatCount="indefinite" /> : null}
      </rect>
    </>
  );
}

function KeyframePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x="34" y="28" width="148" height="48" rx="7" fill={COLOR.canvas} stroke={COLOR.lineStrong} strokeWidth="1.4" />
      <path d="M34 52h148M73 28v48M111 28v48M149 28v48" stroke={COLOR.line} />
      <g transform={animate ? undefined : "translate(73 52)"} data-preview-motion={animate ? "keyframe" : undefined}>
        <rect x="-8" y="-8" width="16" height="16" rx="2" transform="rotate(45)" fill={COLOR.accent} stroke={COLOR.fg} strokeWidth="1.5" />
        {animate ? (
          <animateTransform
            attributeName="transform"
            type="translate"
            dur="2.8s"
            values="73 52;149 52;149 52;73 52"
            keyTimes="0;.42;.72;1"
            repeatCount="indefinite"
          />
        ) : null}
      </g>
      <circle cx="111" cy="52" r="12" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeDasharray="3 3" opacity={animate ? ".4" : ".9"}>
        {animate ? <animate attributeName="opacity" dur="1.4s" values=".3;.9;.3" repeatCount="indefinite" /> : null}
      </circle>
      <path d="M111 46v12M105 52h12" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2" />
      <path d="m168 84 6 16 4-6 7 5 3-4-7-5 7-4Z" fill={COLOR.fg} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="1.6" />
    </>
  );
}

function FrameSequencePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      {[0, 1, 2].map((index) => {
        const x = 35 + index * 54;
        return (
          <g key={index} transform={`translate(${x} 24)`}>
            <rect width="44" height="49" rx="5" fill={COLOR.canvas} stroke={COLOR.lineStrong} strokeWidth="1.4" />
            <circle cx={13 + index * 3} cy={15 + index * 2} r="6" fill={index === 2 ? COLOR.accent : COLOR.fg3} opacity={index === 2 ? ".85" : ".55"} />
            <path d={`M7 41 18 ${30 - index * 2}l8 6 10-9`} fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            <text x="22" y="62" fill={COLOR.fg3} fontSize="8" textAnchor="middle">{index + 1}</text>
          </g>
        );
      })}
      <rect x={animate ? "33" : "141"} y="22" width="48" height="53" rx="7" fill="none" stroke={COLOR.accent} strokeWidth="2.2">
        {animate ? <animate attributeName="x" dur="3s" values="33;87;141;141;33" keyTimes="0;.25;.5;.76;1" repeatCount="indefinite" /> : null}
      </rect>
      <path d="m90 88 10-6v12Z" fill={COLOR.fg} />
      <path d="M109 88h69" stroke={COLOR.lineStrong} strokeLinecap="round" strokeWidth="6" />
      <path d="M109 88h23" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="6">
        {animate ? <animate attributeName="d" dur="3s" values="M109 88h0;M109 88h69;M109 88h69;M109 88h0" keyTimes="0;.5;.76;1" repeatCount="indefinite" /> : null}
      </path>
    </>
  );
}

function OnionSkinPreview({
  animate,
  variant,
}: {
  animate: boolean;
  variant: string;
}): ReactElement {
  const previousCount = previewVariantMatches(variant, "onion-prev-count");
  const nextCount = previewVariantMatches(variant, "onion-next-count");
  const opacity = previewVariantMatches(variant, "onion-opacity");
  const tint = previewVariantMatches(variant, "onion-tint");
  const figures = [
    {
      x: 79,
      color: "var(--color-danger, oklch(0.68 0.2 25))",
      opacity: previousCount ? ".76" : ".42",
      angle: -14,
    },
    { x: 108, color: COLOR.fg, opacity: ".95", angle: 0 },
    {
      x: 137,
      color: tint ? COLOR.accent : COLOR.cool,
      opacity: nextCount || tint ? ".76" : ".42",
      angle: 14,
    },
  ];

  return (
    <>
      {figures.map((figure, index) => (
        <g key={figure.x} transform={`translate(${figure.x} 20) rotate(${figure.angle} 0 36)`} fill="none" stroke={figure.color} strokeLinecap="round" strokeWidth="3" opacity={figure.opacity}>
          <circle cy="9" r="7" fill={COLOR.raised} strokeWidth="1.6" />
          <path d="M0 17v30M0 27l-15 14M0 27l16 11M0 47l-13 27M0 47l15 26" />
          {animate && index !== 1 ? (
            <animate attributeName="opacity" dur="2.4s" values={`${figure.opacity};.75;${figure.opacity}`} repeatCount="indefinite" />
          ) : null}
        </g>
      ))}
      {previousCount || nextCount ? (
        <g data-preview-operation={previousCount ? "previous-count" : "next-count"}>
          <circle cx={previousCount ? "64" : "152"} cy="84" r="12" fill={COLOR.canvas} stroke={COLOR.accent} strokeWidth="2" />
          <path
            d={previousCount ? "M69 77 61 84l8 7" : "m147 77 8 7-8 7"}
            fill="none"
            stroke={COLOR.accent}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.4"
          />
          <text x={previousCount ? "82" : "134"} y="88" fill={COLOR.fg} fontSize="12" fontWeight="700" textAnchor="middle">
            {animate ? "3" : "2"}
            {animate ? <animate attributeName="opacity" dur="1.5s" values=".35;1;.35" repeatCount="indefinite" /> : null}
          </text>
        </g>
      ) : opacity ? (
        <g data-preview-operation="opacity">
          <line x1="54" y1="89" x2="162" y2="89" stroke={COLOR.lineStrong} strokeLinecap="round" strokeWidth="7" />
          <line x1="54" y1="89" x2={animate ? "82" : "139"} y2="89" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="7">
            {animate ? <animate attributeName="x2" dur="2.4s" values="82;139;139;82" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
          </line>
          <circle cx={animate ? "82" : "139"} cy="89" r="7" fill={COLOR.fg} stroke={COLOR.canvas} strokeWidth="2">
            {animate ? <animate attributeName="cx" dur="2.4s" values="82;139;139;82" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
          </circle>
        </g>
      ) : tint ? (
        <g data-preview-operation="tint">
          {[COLOR.accent, COLOR.cool, "var(--color-danger, oklch(0.68 0.2 25))"].map((fill, index) => (
            <circle key={fill} cx={88 + index * 20} cy="88" r={index === 1 ? "7" : "5"} fill={fill} opacity={index === 1 ? "1" : ".55"}>
              {animate && index === 1 ? <animate attributeName="r" dur="1.4s" values="5;8;5" repeatCount="indefinite" /> : null}
            </circle>
          ))}
        </g>
      ) : (
        <>
          <path d="M49 89h118" stroke={COLOR.lineStrong} strokeDasharray="4 4" />
          <g transform={animate ? undefined : "translate(108 88)"} data-preview-operation="toggle">
            <circle r="5" fill={COLOR.accent} />
            {animate ? <animateMotion dur="2.4s" path="M79 88h58H79" repeatCount="indefinite" /> : null}
          </g>
        </>
      )}
    </>
  );
}

function TimelapsePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <g key={index} transform={`translate(${31 + index * 10} ${18 + index * 8})`} opacity={index === 2 ? "1" : ".5"}>
          <rect width="82" height="57" rx="5" fill={COLOR.canvas} stroke={index === 2 ? COLOR.accent : COLOR.lineStrong} strokeWidth="1.4" />
          <path d={`M13 43c17-${10 + index * 3} 28 ${8 + index * 2} 48-${13 + index * 2} 8-7 14-6 21-2`} fill="none" stroke={index === 2 ? COLOR.accent : COLOR.fg3} strokeLinecap="round" strokeWidth="2.4" />
        </g>
      ))}
      <path d="M128 48h19l-6-6m6 6-6 6" fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <rect x="153" y="25" width="42" height="55" rx="6" fill={COLOR.raised} stroke={COLOR.fg2} strokeWidth="1.4" />
      <path d="m168 42 15 9-15 9Z" fill={COLOR.accent} />
      <path d="M159 70h30" stroke={COLOR.lineStrong} strokeLinecap="round" strokeWidth="4" />
      <path d="M159 70h9" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="4">
        {animate ? <animate attributeName="d" dur="2.8s" values="M159 70h0;M159 70h30;M159 70h30;M159 70h0" keyTimes="0;.55;.78;1" repeatCount="indefinite" /> : null}
      </path>
      <circle cx="72" cy="14" r="8" fill={COLOR.raised} stroke={COLOR.cool} strokeWidth="1.5" />
      <path d="M72 14v-5M72 14l4 3" stroke={COLOR.cool} strokeLinecap="round" strokeWidth="1.5" />
    </>
  );
}

function MotionFxPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x="52" y="13" width="112" height="79" rx="7" fill={COLOR.canvas} stroke={COLOR.lineStrong} strokeWidth="1.4" />
      {[0, 1, 2].map((index) => (
        <g key={index} transform={animate ? undefined : `translate(0 ${index * 23})`}>
          <rect x="63" y="22" width="90" height="18" rx="4" fill={index === 1 ? COLOR.accentSoft : COLOR.raised} stroke={index === 1 ? COLOR.accent : COLOR.line} />
          <path d="M71 34 82 25l8 6 9-5 11 8" fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="1.6" />
          {animate ? (
            <animateTransform attributeName="transform" type="translate" dur="3s" values={`0 ${index * 23 + 12};0 ${index * 23};0 ${index * 23};0 ${index * 23 + 12}`} keyTimes="0;.28;.75;1" repeatCount="indefinite" />
          ) : null}
        </g>
      ))}
      <circle cx="140" cy="55" r="13" fill="none" stroke={COLOR.accent} strokeWidth="2" opacity={animate ? ".2" : ".85"}>
        {animate ? <animate attributeName="r" dur="1.5s" values="5;16;5" repeatCount="indefinite" /> : null}
        {animate ? <animate attributeName="opacity" dur="1.5s" values=".9;.1;.9" repeatCount="indefinite" /> : null}
      </circle>
      <path d="m33 64 7-7 7 7M40 57v20" fill="none" stroke={COLOR.cool} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </>
  );
}

function VideoExportPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <rect key={index} x={25 + index * 27} y={27 + index * 6} width="43" height="34" rx="4" fill={COLOR.canvas} stroke={index === 2 ? COLOR.accent : COLOR.lineStrong} strokeWidth="1.3" opacity={index === 2 ? "1" : ".58"} />
      ))}
      <path d="M106 51h24l-7-7m7 7-7 7" fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M140 19h37l14 14v51h-51Z" fill={COLOR.raised} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M177 19v15h14" fill={COLOR.canvas} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="1.5" />
      <path d="m154 43 18 11-18 11Z" fill={COLOR.accent} />
      <rect x="148" y="73" width="35" height="5" rx="2.5" fill={COLOR.lineStrong} />
      <rect x="148" y="73" width={animate ? "8" : "30"} height="5" rx="2.5" fill={COLOR.accent}>
        {animate ? <animate attributeName="width" dur="2.8s" values="0;35;35;0" keyTimes="0;.58;.8;1" repeatCount="indefinite" /> : null}
      </rect>
      <g transform={animate ? undefined : "translate(116 51)"}>
        <circle r="3.5" fill={COLOR.accent} />
        {animate ? <animateMotion dur="2.8s" path="M88 51H140" keyPoints="0;1;1;0" keyTimes="0;.58;.8;1" repeatCount="indefinite" /> : null}
      </g>
    </>
  );
}

function AudioPreview({ animate }: { animate: boolean }): ReactElement {
  const bars = [16, 30, 44, 24, 52, 34, 20, 40, 28];

  return (
    <>
      <path d="M35 58h18l21-18v40L53 62H35Z" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M84 48c9 7 9 18 0 25M92 40c17 13 17 32 0 43" fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" opacity={animate ? ".35" : ".8"}>
        {animate ? <animate attributeName="opacity" dur="1.4s" values=".25;1;.25" repeatCount="indefinite" /> : null}
      </path>
      <g transform="translate(111 23)">
        {bars.map((height, index) => (
          <rect key={index} x={index * 9} y={(56 - height) / 2} width="5" height={height} rx="2.5" fill={index % 3 === 1 ? COLOR.accent : COLOR.cool} opacity=".78">
            {animate ? <animate attributeName="height" dur={`${1 + index * 0.08}s`} values={`${height};${Math.max(10, 58 - height)};${height}`} repeatCount="indefinite" /> : null}
            {animate ? <animate attributeName="y" dur={`${1 + index * 0.08}s`} values={`${(56 - height) / 2};${(56 - Math.max(10, 58 - height)) / 2};${(56 - height) / 2}`} repeatCount="indefinite" /> : null}
          </rect>
        ))}
      </g>
      <path d="M112 88h76" stroke={COLOR.lineStrong} strokeLinecap="round" strokeWidth="5" />
      <circle cx={animate ? "126" : "169"} cy="88" r="6" fill={COLOR.accent}>
        {animate ? <animate attributeName="cx" dur="2.4s" values="118;181;181;118" keyTimes="0;.55;.78;1" repeatCount="indefinite" /> : null}
      </circle>
    </>
  );
}

function Object3dPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <g transform="translate(108 52)" data-preview-motion={animate ? "object-3d" : undefined}>
        <path d="m0-28 31 15L0 2l-31-15Z" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeLinejoin="round" strokeWidth="1.6" />
        <path d="M-31-13 0 2v31l-31-15Z" fill={COLOR.canvas} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="1.6" />
        <path d="M31-13 0 2v31l31-15Z" fill={COLOR.raised} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="1.6" />
        {animate ? (
          <animateTransform
            attributeName="transform"
            additive="sum"
            type="rotate"
            dur="3.2s"
            values="0;12;-8;0"
            keyTimes="0;.38;.72;1"
            repeatCount="indefinite"
          />
        ) : null}
      </g>
      <g transform="translate(108 54)" fill="none" strokeLinecap="round" strokeWidth="2.5">
        <path d="M0 0v-40" stroke={COLOR.cool} />
        <path d="m0-40-4 8h8Z" fill={COLOR.cool} stroke="none" />
        <path d="M0 0h46" stroke={COLOR.accent} />
        <path d="m46 0-8-4v8Z" fill={COLOR.accent} stroke="none" />
        <path d="M0 0-28 26" stroke={COLOR.fg2} />
      </g>
      <ellipse cx="108" cy="54" rx="49" ry="20" fill="none" stroke={COLOR.lineStrong} strokeDasharray="4 4" />
      <circle cx={animate ? "157" : "143"} cy="54" r="4" fill={COLOR.accent}>
        {animate ? <animate attributeName="cx" dur="3.2s" values="157;143;153;157" keyTimes="0;.38;.72;1" repeatCount="indefinite" /> : null}
      </circle>
    </>
  );
}

function Pose3dPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <g transform="translate(108 18)" fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="4">
        <circle cx="0" cy="10" r="9" fill={COLOR.raised} stroke={COLOR.accent} strokeWidth="1.8" />
        <path d="M0 21v34M0 55-17 78M0 55l20 22" />
        <g transform={animate ? undefined : "rotate(-28 0 29)"} data-preview-motion={animate ? "pose-3d" : undefined}>
          <path d="M0 29 24 43 39 25" />
          <circle cx="24" cy="43" r="4" fill={COLOR.accent} stroke={COLOR.canvas} strokeWidth="1.5" />
          <circle cx="39" cy="25" r="4" fill={COLOR.fg} stroke={COLOR.canvas} strokeWidth="1.5" />
          {animate ? (
            <animateTransform
              attributeName="transform"
              type="rotate"
              dur="2.8s"
              values="8 0 29;-34 0 29;-34 0 29;8 0 29"
              keyTimes="0;.38;.7;1"
              repeatCount="indefinite"
            />
          ) : null}
        </g>
        <path d="M0 29-22 45-38 34" />
      </g>
      <path d="M57 86c13 8 27 11 42 10M117 96c17-1 32-5 44-13" fill="none" stroke={COLOR.lineStrong} strokeDasharray="3 4" strokeWidth="1.2" />
      {[86, 108, 132].map((x, index) => (
        <circle key={x} cx={x} cy={index === 1 ? 47 : 73} r="3" fill={index === 1 ? COLOR.accent : COLOR.cool} opacity=".72" />
      ))}
    </>
  );
}

function Camera3dPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x="70" y="21" width="114" height="67" rx="6" fill={COLOR.canvas} stroke={COLOR.lineStrong} strokeWidth="1.4" />
      <path d="M91 72 117 43l18 17 12-11 20 23Z" fill={COLOR.accentSoft} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="1.5" />
      <circle cx="151" cy="38" r="8" fill={COLOR.accent} opacity=".75" />
      <path d="M91 32h14M91 32v14M163 32h-14M163 32v14M91 77h14M91 77V63M163 77h-14M163 77V63" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2" />
      <g transform={animate ? undefined : "translate(28 47)"} data-preview-motion={animate ? "camera-3d" : undefined}>
        <rect x="0" y="0" width="30" height="23" rx="5" fill={COLOR.raised} stroke={COLOR.fg} strokeWidth="1.5" />
        <path d="m30 7 14-7v23l-14-7Z" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeLinejoin="round" strokeWidth="1.5" />
        <circle cx="15" cy="11.5" r="5" fill={COLOR.canvas} stroke={COLOR.cool} strokeWidth="1.5" />
        {animate ? (
          <animateTransform
            attributeName="transform"
            type="translate"
            dur="3s"
            values="22 52;34 42;34 42;22 52"
            keyTimes="0;.42;.72;1"
            repeatCount="indefinite"
          />
        ) : null}
      </g>
      <path d="M64 48 77 39M64 65l13 9" fill="none" stroke={COLOR.lineStrong} strokeDasharray="3 3" />
    </>
  );
}

function Lighting3dPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <g transform={animate ? undefined : "translate(57 28)"} data-preview-motion={animate ? "lighting-3d" : undefined}>
        <circle cx="0" cy="0" r="10" fill={COLOR.accent} />
        {Array.from({ length: 8 }, (_, index) => {
          const angle = (index * Math.PI) / 4;
          const x1 = Math.cos(angle) * 15;
          const y1 = Math.sin(angle) * 15;
          const x2 = Math.cos(angle) * 22;
          const y2 = Math.sin(angle) * 22;
          return <path key={index} d={`M${x1} ${y1} ${x2} ${y2}`} stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2" />;
        })}
        {animate ? (
          <animateTransform
            attributeName="transform"
            type="translate"
            dur="3.2s"
            values="57 28;76 21;76 21;57 28"
            keyTimes="0;.42;.72;1"
            repeatCount="indefinite"
          />
        ) : null}
      </g>
      <path d="M72 39 113 67M83 31l41 30M93 25l42 28" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2" opacity={animate ? ".35" : ".6"}>
        {animate ? <animate attributeName="opacity" dur="1.6s" values=".25;.7;.25" repeatCount="indefinite" /> : null}
      </path>
      <circle cx="141" cy="58" r="25" fill={COLOR.raised} stroke={COLOR.fg2} strokeWidth="1.5" />
      <path d="M123 41c18 3 31 17 36 36-19-2-34-16-36-36Z" fill={COLOR.accentSoft} />
      <ellipse cx="145" cy="89" rx={animate ? "25" : "19"} ry="5" fill={COLOR.canvas} opacity=".75">
        {animate ? <animate attributeName="rx" dur="3.2s" values="25;17;17;25" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
      </ellipse>
    </>
  );
}

function LassoPreview({ animate }: { animate: boolean }): ReactElement {
  const lassoPath = "M55 63c-18-14 3-39 27-37 19-18 59-5 58 14 27 5 27 30 5 38-24 9-65 5-90-15Z";

  return (
    <>
      <path d="M75 67c8-21 26-29 51-21-4 17-17 26-38 29Z" fill={COLOR.accentSoft} />
      <path
        d={lassoPath}
        fill="none"
        stroke={COLOR.fg}
        strokeDasharray="5 4"
        strokeLinecap="round"
        strokeWidth="1.6"
      >
        {animate ? (
          <animate attributeName="stroke-dashoffset" dur=".8s" values="0; -18" repeatCount="indefinite" />
        ) : null}
      </path>
      <path
        d={lassoPath}
        fill="none"
        stroke={COLOR.accent}
        strokeDasharray="164"
        strokeDashoffset={animate ? "164" : "0"}
        strokeLinecap="round"
        strokeWidth="2"
        opacity=".9"
      >
        {animate ? (
          <animate attributeName="stroke-dashoffset" dur="3s" values="164; 0; 0" keyTimes="0; .72; 1" repeatCount="indefinite" />
        ) : null}
      </path>
      <g transform={animate ? undefined : "translate(55 63)"}>
        <path d="m0 0 7 19 4-7 7 6 4-4-7-6 7-4Z" fill={COLOR.fg} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="2" />
        {animate ? (
          <animateMotion
            dur="3s"
            path={lassoPath}
            rotate="auto"
            keyPoints="0; 1; 1"
            keyTimes="0; .72; 1"
            calcMode="spline"
            keySplines=".16 1 .3 1; .16 1 .3 1"
            repeatCount="indefinite"
          />
        ) : null}
      </g>
    </>
  );
}

function PolygonLassoPreview({ animate }: { animate: boolean }): ReactElement {
  const points = "58,68 68,30 113,22 158,43 145,79 88,83";
  return (
    <>
      <polygon points={points} fill={COLOR.accentSoft} stroke={COLOR.fg} strokeDasharray="6 4" strokeWidth="2">
        {animate ? <animate attributeName="stroke-dashoffset" dur=".8s" values="0;-20" repeatCount="indefinite" /> : null}
      </polygon>
      <polyline
        points={points}
        fill="none"
        stroke={COLOR.accent}
        strokeDasharray="238"
        strokeDashoffset={animate ? "238" : "0"}
        strokeLinejoin="round"
        strokeWidth="2.5"
      >
        {animate ? <animate attributeName="stroke-dashoffset" dur="3s" values="238;0;0" keyTimes="0;.72;1" repeatCount="indefinite" /> : null}
      </polyline>
      {[[58, 68], [68, 30], [113, 22], [158, 43], [145, 79], [88, 83]].map(([cx, cy], index) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5" fill={index === 5 ? COLOR.accent : COLOR.card} stroke={COLOR.accent} strokeWidth="1.5">
          {animate && index === 5 ? <animate attributeName="r" dur="1.25s" values="3;6;3" repeatCount="indefinite" /> : null}
        </circle>
      ))}
      <path d="m151 68 7 18 4-7 7 6 4-4-7-6 7-4Z" fill={COLOR.fg} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="2" />
    </>
  );
}

function SelectionBrushPreview({ animate }: { animate: boolean }): ReactElement {
  const path = "M48 68c25-34 49 16 73-18 14-19 31-13 47-2";
  return (
    <>
      <path d={path} fill="none" stroke={COLOR.accentSoft} strokeLinecap="round" strokeWidth="28" />
      <path d={path} fill="none" stroke={COLOR.fg} strokeDasharray="5 4" strokeLinecap="round" strokeWidth="1.8">
        {animate ? <animate attributeName="stroke-dashoffset" dur=".75s" values="0;-18" repeatCount="indefinite" /> : null}
      </path>
      <path d={path} fill="none" stroke={COLOR.accent} strokeDasharray="171" strokeDashoffset={animate ? "171" : "0"} strokeLinecap="round" strokeWidth="5">
        {animate ? <animate attributeName="stroke-dashoffset" dur="2.8s" values="171;0;0" keyTimes="0;.7;1" repeatCount="indefinite" /> : null}
      </path>
      <g transform={animate ? undefined : "translate(168 48)"}>
        <circle r="13" fill={COLOR.canvas} stroke={COLOR.accent} strokeWidth="2" />
        <circle r="3" fill={COLOR.accent} />
        {animate ? <animateMotion dur="2.8s" path={path} keyPoints="0;1;1" keyTimes="0;.7;1" repeatCount="indefinite" /> : null}
      </g>
    </>
  );
}

function SelectionCombinePreview({
  animate,
  operation,
}: {
  animate: boolean;
  operation: "add" | "subtract" | "intersect";
}): ReactElement {
  const secondX = animate ? "145" : "130";
  return (
    <>
      <circle cx="88" cy="52" r="31" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" />
      <circle cx={secondX} cy="52" r="31" fill={operation === "subtract" ? COLOR.canvas : COLOR.cool} fillOpacity={operation === "intersect" ? ".18" : ".32"} stroke={COLOR.fg2} strokeDasharray="5 4" strokeWidth="2">
        {animate ? <animate attributeName="cx" dur="2.8s" values="145;119;119;145" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
      </circle>
      {operation === "intersect" ? (
        <path d="M108 27c18 8 28 23 28 25s-10 17-28 25c-14-10-22-22-22-25s8-15 22-25Z" fill={COLOR.accent} opacity={animate ? ".35" : ".82"}>
          {animate ? <animate attributeName="opacity" dur="2.8s" values=".2;.85;.85;.2" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
        </path>
      ) : null}
      {operation === "subtract" ? (
        <path d="M107 29c17 9 27 21 27 23s-10 15-27 23c7-15 7-31 0-46Z" fill={COLOR.canvas} stroke={COLOR.lineStrong} strokeDasharray="3 3" />
      ) : null}
      {operation === "add" ? (
        <path d="M108 21v62M77 52h62" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="3" opacity={animate ? ".35" : ".9"}>
          {animate ? <animate attributeName="opacity" dur="1.3s" values=".3;1;.3" repeatCount="indefinite" /> : null}
        </path>
      ) : operation === "subtract" ? (
        <path d="M78 52h59" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="3" />
      ) : (
        <path d="M108 30v44M92 52h32" stroke={COLOR.fg} strokeLinecap="round" strokeWidth="2" opacity=".72" />
      )}
    </>
  );
}

function TransformPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x="48" y="20" width="120" height="66" rx="6" fill={COLOR.canvas} stroke={COLOR.lineStrong} />
      <g transform="translate(108 53)" data-preview-motion={animate ? "transform" : undefined}>
        <g transform={animate ? undefined : "rotate(8) scale(1.08)"}>
          <rect x="-40" y="-21" width="80" height="42" rx="4" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" />
          <path d="M-31 11-12-7 3 6 15-5 31 11" fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          {animate ? (
            <animateTransform attributeName="transform" type="rotate" dur="3s" values="-5;9;9;-5" keyTimes="0;.42;.72;1" repeatCount="indefinite" />
          ) : null}
        </g>
        {[
          [-40, -21],
          [40, -21],
          [-40, 21],
          [40, 21],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x - 3} y={y - 3} width="6" height="6" rx="1" fill={COLOR.canvas} stroke={COLOR.fg} />
        ))}
      </g>
      <path d="M177 35a18 18 0 0 1 3 23m0-23-1 10-9-4" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </>
  );
}

function PanPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x="41" y="16" width="134" height="74" rx="8" fill={COLOR.raised} stroke={COLOR.lineStrong} />
      <g transform={animate ? undefined : "translate(9 -4)"} data-preview-motion={animate ? "pan" : undefined}>
        <rect x="59" y="27" width="88" height="52" rx="4" fill={COLOR.canvas} stroke={COLOR.fg2} />
        <circle cx="80" cy="43" r="6" fill={COLOR.accent} />
        <path d="m63 71 24-21 15 14 12-10 29 17" fill="none" stroke={COLOR.cool} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        {animate ? (
          <animateTransform attributeName="transform" type="translate" dur="2.8s" values="-12 7;12 -6;12 -6;-12 7" keyTimes="0;.42;.72;1" repeatCount="indefinite" />
        ) : null}
      </g>
      <path d="M108 12v13m0-13-5 6m5-6 5 6M108 92V79m0 13-5-6m5 6 5-6M34 53h16m-16 0 7-5m-7 5 7 5M182 53h-16m16 0-7-5m7 5-7 5" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </>
  );
}

function MarqueePreview({ animate, ellipse }: { animate: boolean; ellipse: boolean }): ReactElement {
  const common = {
    fill: COLOR.accentSoft,
    stroke: COLOR.fg,
    strokeDasharray: "6 4",
    strokeWidth: "2",
  } as const;
  return (
    <>
      <rect x="43" y="17" width="130" height="70" rx="6" fill={COLOR.canvas} stroke={COLOR.lineStrong} />
      {ellipse ? (
        <ellipse cx="108" cy="52" rx={animate ? "16" : "43"} ry={animate ? "11" : "25"} {...common}>
          {animate ? (
            <>
              <animate attributeName="rx" dur="2.8s" values="16;43;43;16" keyTimes="0;.42;.75;1" repeatCount="indefinite" />
              <animate attributeName="ry" dur="2.8s" values="11;25;25;11" keyTimes="0;.42;.75;1" repeatCount="indefinite" />
              <animate attributeName="stroke-dashoffset" dur=".8s" values="0;-20" repeatCount="indefinite" />
            </>
          ) : null}
        </ellipse>
      ) : (
        <rect x={animate ? "87" : "64"} y={animate ? "42" : "28"} width={animate ? "42" : "88"} height={animate ? "22" : "48"} rx="2" {...common}>
          {animate ? (
            <>
              <animate attributeName="x" dur="2.8s" values="87;64;64;87" keyTimes="0;.42;.75;1" repeatCount="indefinite" />
              <animate attributeName="y" dur="2.8s" values="42;28;28;42" keyTimes="0;.42;.75;1" repeatCount="indefinite" />
              <animate attributeName="width" dur="2.8s" values="42;88;88;42" keyTimes="0;.42;.75;1" repeatCount="indefinite" />
              <animate attributeName="height" dur="2.8s" values="22;48;48;22" keyTimes="0;.42;.75;1" repeatCount="indefinite" />
              <animate attributeName="stroke-dashoffset" dur=".8s" values="0;-20" repeatCount="indefinite" />
            </>
          ) : null}
        </rect>
      )}
      <path d="m161 73 7 17 4-7 7 6 4-4-7-6 7-4Z" fill={COLOR.fg} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="2" />
    </>
  );
}

function CropPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x="51" y="16" width="114" height="74" rx="6" fill={COLOR.canvas} stroke={COLOR.lineStrong} />
      <circle cx="77" cy="38" r="8" fill={COLOR.accent} />
      <path d="m56 80 29-29 18 16 14-13 43 26" fill={COLOR.cool} opacity=".55" />
      <rect x={animate ? "46" : "63"} y={animate ? "12" : "23"} width={animate ? "124" : "91"} height={animate ? "82" : "58"} fill="none" stroke={COLOR.fg} strokeWidth="2.5">
        {animate ? (
          <>
            <animate attributeName="x" dur="2.9s" values="46;63;63;46" keyTimes="0;.42;.74;1" repeatCount="indefinite" />
            <animate attributeName="y" dur="2.9s" values="12;23;23;12" keyTimes="0;.42;.74;1" repeatCount="indefinite" />
            <animate attributeName="width" dur="2.9s" values="124;91;91;124" keyTimes="0;.42;.74;1" repeatCount="indefinite" />
            <animate attributeName="height" dur="2.9s" values="82;58;58;82" keyTimes="0;.42;.74;1" repeatCount="indefinite" />
          </>
        ) : null}
      </rect>
      <path d="M39 31h21V10M177 73h-21v21" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="3" />
    </>
  );
}

function PixelInkPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <g stroke={COLOR.line} strokeWidth="1" opacity=".7">
        {Array.from({ length: 7 }, (_, index) => <path key={`v-${index}`} d={`M${55 + index * 16} 20v64`} />)}
        {Array.from({ length: 5 }, (_, index) => <path key={`h-${index}`} d={`M55 ${20 + index * 16}h96`} />)}
      </g>
      <path d="M63 76h16V60h16V52h16V36h32" fill="none" stroke={COLOR.accent} strokeDasharray="112" strokeDashoffset={animate ? "112" : "0"} strokeLinecap="square" strokeLinejoin="miter" strokeWidth="7">
        {animate ? <animate attributeName="stroke-dashoffset" dur="2.6s" values="112;0;0" keyTimes="0;.7;1" repeatCount="indefinite" /> : null}
      </path>
      <path d="m154 25 21 21-13 13-21-21Z" fill={COLOR.fg2} stroke={COLOR.canvas} strokeWidth="2" />
      <rect x="138" y="35" width="10" height="10" fill={COLOR.accent} />
    </>
  );
}

function SmudgePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <circle cx="76" cy="52" r="28" fill={COLOR.accent} opacity=".72" />
      <circle cx="133" cy="52" r="28" fill={COLOR.cool} opacity=".68" />
      <path d="M80 37c18 15 34-13 49 2M78 52c19 15 35-14 54 2M82 67c18 12 33-11 47 0" fill="none" stroke={COLOR.fg} strokeLinecap="round" strokeWidth="4" opacity=".78">
        {animate ? <animate attributeName="d" dur="2.4s" values="M80 37c18 15 34-13 49 2M78 52c19 15 35-14 54 2M82 67c18 12 33-11 47 0;M76 37c24-13 38 15 57 0M80 52c20-13 35 14 49 0M77 67c24-11 38 12 56 0;M80 37c18 15 34-13 49 2M78 52c19 15 35-14 54 2M82 67c18 12 33-11 47 0" repeatCount="indefinite" /> : null}
      </path>
      <g transform={animate ? undefined : "translate(145 30)"}>
        <path d="m0 0 24 8-12 8Z" fill={COLOR.fg2} stroke={COLOR.canvas} strokeWidth="2" />
        {animate ? <animateMotion dur="2.4s" path="M145 30C119 70 91 27 68 64" repeatCount="indefinite" /> : null}
      </g>
    </>
  );
}

function LiquifyPreview({ animate }: { animate: boolean }): ReactElement {
  const straight = "M51 28H165M51 44H165M51 60H165M51 76H165";
  const warped = "M51 28c35 0 35 18 57 18s26-18 57-18M51 44c30 0 37 18 58 18s27-18 56-18M51 60c30 0 36-18 57-18s29 18 57 18M51 76c35 0 34-18 57-18s28 18 57 18";
  return (
    <>
      <rect x="43" y="17" width="130" height="70" rx="7" fill={COLOR.canvas} stroke={COLOR.lineStrong} />
      <path d={animate ? straight : warped} fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2">
        {animate ? <animate attributeName="d" dur="2.8s" values={`${straight};${warped};${warped};${straight}`} keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
      </path>
      <circle cx="108" cy="52" r="18" fill="none" stroke={COLOR.accent} strokeDasharray="4 4" strokeWidth="2" />
      <path d="m107 38 14 14-14 14M94 52h27" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
    </>
  );
}

function LassoFillPreview({ animate }: { animate: boolean }): ReactElement {
  const path = "M57 67c-12-17 7-39 31-34 14-17 49-5 47 15 21 8 12 30-9 33-25 4-53 0-69-14Z";
  return (
    <>
      <path d={path} fill={COLOR.accent} fillOpacity={animate ? ".08" : ".72"} stroke={COLOR.fg} strokeDasharray="5 4" strokeWidth="2">
        {animate ? (
          <>
            <animate attributeName="fill-opacity" dur="2.9s" values=".05;.05;.72;.72" keyTimes="0;.56;.72;1" repeatCount="indefinite" />
            <animate attributeName="stroke-dashoffset" dur=".8s" values="0;-18" repeatCount="indefinite" />
          </>
        ) : null}
      </path>
      <g transform={animate ? undefined : "translate(57 67)"}>
        <path d="m0 0 8 19 4-8 7 7 4-4-7-7 8-4Z" fill={COLOR.fg} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="2" />
        {animate ? <animateMotion dur="2.9s" path={path} keyPoints="0;1;1" keyTimes="0;.56;1" repeatCount="indefinite" /> : null}
      </g>
      <path d="M158 28v20m-10-10h20" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2.5" />
    </>
  );
}

function CommentPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x="43" y="18" width="78" height="68" rx="6" fill={COLOR.canvas} stroke={COLOR.lineStrong} />
      <path d="m49 76 19-20 15 13 11-10 21 17" fill="none" stroke={COLOR.cool} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <g transform={animate ? undefined : "translate(91 48)"}>
        <path d="M0-9a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 18v13" fill={COLOR.accent} stroke={COLOR.canvas} strokeWidth="2" />
        {animate ? <animateMotion dur="2.7s" path="M91 28V48" keyPoints="0;1;1" keyTimes="0;.38;1" repeatCount="indefinite" /> : null}
      </g>
      <g transform={animate ? undefined : "translate(0 0)"}>
        <path d="M126 29h48c7 0 12 5 12 12v22c0 7-5 12-12 12h-26l-10 9 2-9h-14c-7 0-12-5-12-12V41c0-7 5-12 12-12Z" fill={COLOR.raised} stroke={COLOR.accent} strokeWidth="2" />
        <path d="M127 44h43M127 54h34M127 64h24" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" />
        {animate ? <animateTransform attributeName="transform" type="translate" dur="2.7s" values="10 0;0 0;0 0;10 0" keyTimes="0;.38;.78;1" repeatCount="indefinite" /> : null}
      </g>
    </>
  );
}

function PerspectivePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <path d="M38 43h140" stroke={COLOR.fg3} strokeWidth="1.5" />
      {[-44, -24, 0, 24, 44].map((offset) => (
        <path key={offset} d={`M108 43 ${108 + offset * 1.65} 92`} stroke={COLOR.lineStrong} strokeWidth="1.4" />
      ))}
      <circle cx="108" cy="43" r={animate ? "4" : "6"} fill={COLOR.accent}>
        {animate ? <animate attributeName="r" dur="1.4s" values="4;7;4" repeatCount="indefinite" /> : null}
      </circle>
      <path d="M51 77 108 43l58 34" fill="none" stroke={COLOR.accent} strokeDasharray="122" strokeDashoffset={animate ? "122" : "0"} strokeLinecap="round" strokeWidth="3">
        {animate ? <animate attributeName="stroke-dashoffset" dur="2.8s" values="122;0;0" keyTimes="0;.72;1" repeatCount="indefinite" /> : null}
      </path>
      <path d="M70 77V59h20v7M146 77V59h-20v7" fill="none" stroke={COLOR.fg2} strokeWidth="2" />
    </>
  );
}

function RotateViewPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <g transform="translate(108 52)">
        <g transform={animate ? undefined : "rotate(18)"}>
          <rect x="-46" y="-28" width="92" height="56" rx="5" fill={COLOR.canvas} stroke={COLOR.fg2} strokeWidth="2" />
          <circle cx="-24" cy="-10" r="7" fill={COLOR.accent} />
          <path d="m-40 20 24-21L1 14l13-11 25 17" fill="none" stroke={COLOR.cool} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          {animate ? <animateTransform attributeName="transform" type="rotate" dur="3s" values="-15;18;18;-15" keyTimes="0;.45;.72;1" repeatCount="indefinite" /> : null}
        </g>
      </g>
      <path d="M51 32a66 66 0 0 1 104-9m0 0-13-1m13 1-4 12M165 72a66 66 0 0 1-104 9m0 0 13 1m-13-1 4-12" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </>
  );
}

function FlipViewPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <path d="M108 14v76" stroke={COLOR.cool} strokeDasharray="4 4" strokeWidth="1.5" />
      <g transform="translate(108 0)">
        <g transform={animate ? "scale(1 1)" : "scale(-1 1)"}>
          <g transform="translate(-108 0)">
            <rect x="50" y="23" width="116" height="61" rx="6" fill={COLOR.canvas} stroke={COLOR.fg2} strokeWidth="2" />
            <circle cx="77" cy="43" r="8" fill={COLOR.accent} />
            <path d="m57 76 30-26 18 16 13-12 39 22" fill="none" stroke={COLOR.cool} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          </g>
          {animate ? (
            <animateTransform
              attributeName="transform"
              type="scale"
              dur="2.8s"
              values="1 1;-1 1;-1 1;1 1"
              keyTimes="0;.42;.72;1"
              repeatCount="indefinite"
            />
          ) : null}
        </g>
      </g>
      <path d="M86 52H48m0 0 9-8m-9 8 9 8M130 52h38m0 0-9-8m9 8-9 8" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
    </>
  );
}

function ShapeKindPreview({ animate, kind }: { animate: boolean; kind: "smart" | "rect" | "ellipse" }): ReactElement {
  if (kind === "smart") return <ShapePreview animate={animate} />;
  return (
    <>
      <path d="M54 72 70 29l47-7 43 28-25 32-61-3Z" fill="none" stroke={COLOR.fg3} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" opacity=".45" />
      {kind === "rect" ? (
        <rect x="62" y="25" width="92" height="57" rx="5" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeDasharray="298" strokeDashoffset={animate ? "298" : "0"} strokeWidth="2.5">
          {animate ? <animate attributeName="stroke-dashoffset" dur="2.8s" values="298;0;0" keyTimes="0;.72;1" repeatCount="indefinite" /> : null}
        </rect>
      ) : (
        <ellipse cx="108" cy="53" rx="48" ry="30" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeDasharray="248" strokeDashoffset={animate ? "248" : "0"} strokeWidth="2.5">
          {animate ? <animate attributeName="stroke-dashoffset" dur="2.8s" values="248;0;0" keyTimes="0;.72;1" repeatCount="indefinite" /> : null}
        </ellipse>
      )}
      <path d="m164 68 7 18 4-7 7 6 4-4-7-6 7-4Z" fill={COLOR.fg} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="2" />
    </>
  );
}

function ShapeFillPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x="47" y="23" width="83" height="60" rx="8" fill={COLOR.canvas} stroke={COLOR.accent} strokeWidth="2.5" />
      <rect x="49.5" y="25.5" width="78" height="55" rx="5.5" fill={COLOR.accent} opacity={animate ? ".06" : ".28"}>
        {animate ? <animate attributeName="opacity" dur="2.7s" values=".06;.34;.34;.06" keyTimes="0;.35;.72;1" repeatCount="indefinite" /> : null}
      </rect>
      <path d="m144 27 22 22-13 13-22-22Z" fill={COLOR.fg2} stroke={COLOR.canvas} strokeWidth="2" />
      <path d="m143 50 15 15" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="5" />
      <path d="M154 69c0 7-5 12-11 12s-11-5-11-12c0-5 7-15 11-20 4 5 11 15 11 20Z" fill={COLOR.accent} opacity={animate ? ".32" : ".88"}>
        {animate ? <animate attributeName="opacity" dur="2.7s" values=".2;.9;.9;.2" keyTimes="0;.35;.72;1" repeatCount="indefinite" /> : null}
      </path>
      <path d="M59 37h59M59 69h59" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="1.5" opacity=".45" />
    </>
  );
}

function ReferencePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x="35" y="18" width="91" height="69" rx="7" fill={COLOR.canvas} stroke={COLOR.lineStrong} />
      <path d="m41 78 23-24 15 14 12-10 29 20" fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <g transform={animate ? undefined : "translate(0 -4)"}>
        <rect x="118" y="12" width="65" height="78" rx="8" fill={COLOR.raised} stroke={COLOR.accent} strokeWidth="2" />
        <circle cx="139" cy="35" r="9" fill={COLOR.accent} opacity=".8" />
        <path d="M128 75c3-17 12-25 24-25s20 8 22 25" fill={COLOR.cool} opacity=".7" />
        <path d="M126 22h18M126 81h27" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" />
        {animate ? <animateTransform attributeName="transform" type="translate" dur="2.8s" values="12 5;0 -4;0 -4;12 5" keyTimes="0;.35;.76;1" repeatCount="indefinite" /> : null}
      </g>
      <path d="M105 45h19m-6-6 6 6-6 6" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </>
  );
}

function WorkspaceActionPreview({ animate, kind }: { animate: boolean; kind: "assets" | "export" | "project" | "fullscreen" | "settings" | "save" | "publish" | "ai" }): ReactElement {
  if (kind === "fullscreen") {
    return (
      <>
        <rect x={animate ? "68" : "45"} y={animate ? "31" : "17"} width={animate ? "80" : "126"} height={animate ? "43" : "70"} rx="6" fill={COLOR.canvas} stroke={COLOR.fg2} strokeWidth="2">
          {animate ? <><animate attributeName="x" dur="2.8s" values="68;45;45;68" keyTimes="0;.4;.74;1" repeatCount="indefinite" /><animate attributeName="y" dur="2.8s" values="31;17;17;31" keyTimes="0;.4;.74;1" repeatCount="indefinite" /><animate attributeName="width" dur="2.8s" values="80;126;126;80" keyTimes="0;.4;.74;1" repeatCount="indefinite" /><animate attributeName="height" dur="2.8s" values="43;70;70;43" keyTimes="0;.4;.74;1" repeatCount="indefinite" /></> : null}
        </rect>
        <path d="M38 34V13h21M178 34V13h-21M38 70v21h21M178 70v21h-21" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="3" />
      </>
    );
  }
  if (kind === "settings") {
    return (
      <>
        {[31, 52, 73].map((y) => <path key={y} d={`M52 ${y}h112`} stroke={COLOR.fg3} strokeLinecap="round" strokeWidth="3" />)}
        {[84, 137, 104].map((x, index) => (
          <circle key={x} cx={animate ? (index === 0 ? 84 : index === 1 ? 137 : 104) : x + (index === 1 ? -18 : 18)} cy={31 + index * 21} r="7" fill={COLOR.accent} stroke={COLOR.canvas} strokeWidth="2">
            {animate ? <animate attributeName="cx" dur="2.7s" values={`${x};${x + (index === 1 ? -28 : 28)};${x + (index === 1 ? -28 : 28)};${x}`} keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
          </circle>
        ))}
      </>
    );
  }
  if (kind === "ai") {
    return (
      <>
        <path d="M43 71c17-36 32 8 49-30 15 34 30-5 47 22" fill="none" stroke={COLOR.fg3} strokeDasharray="4 4" strokeWidth="2" />
        <path d="M43 71c19-28 38-31 56-8 17 21 34 11 51-14" fill="none" stroke={COLOR.accent} strokeDasharray="152" strokeDashoffset={animate ? "152" : "0"} strokeLinecap="round" strokeWidth="4">
          {animate ? <animate attributeName="stroke-dashoffset" dur="2.8s" values="152;0;0" keyTimes="0;.7;1" repeatCount="indefinite" /> : null}
        </path>
        <path d="m168 26 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill={COLOR.cool} />
        <path d="m145 17 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill={COLOR.accent} />
      </>
    );
  }
  if (kind === "assets") {
    return (
      <>
        {[0, 1, 2].map((index) => <rect key={index} x={38 + index * 38} y="25" width="29" height="29" rx="5" fill={index === 1 ? COLOR.accentSoft : COLOR.raised} stroke={index === 1 ? COLOR.accent : COLOR.lineStrong} />)}
        <rect x="151" y="42" width="31" height="31" rx="6" fill={COLOR.canvas} stroke={COLOR.fg2} />
        <path d="m157 66 8-9 5 5 6-7" fill="none" stroke={COLOR.cool} strokeLinecap="round" strokeWidth="2" />
        <g transform={animate ? undefined : "translate(76 37)"}>
          <rect x="-10" y="-10" width="20" height="20" rx="4" fill={COLOR.accent} />
          {animate ? <animateMotion dur="2.8s" path="M76 37C104 18 137 30 166 57" keyPoints="0;1;1" keyTimes="0;.62;1" repeatCount="indefinite" /> : null}
        </g>
      </>
    );
  }
  const isPublish = kind === "publish";
  const isSave = kind === "save";
  const isExport = kind === "export";
  return (
    <>
      <path d="M57 18h65l25 25v43H57Z" fill={COLOR.canvas} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="2" />
      <path d="M122 18v25h25M72 56h57M72 67h45" fill="none" stroke={COLOR.lineStrong} strokeLinecap="round" strokeWidth="2" />
      {kind === "project" ? <path d="M42 37h45l8 9h52v39H42Z" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeLinejoin="round" strokeWidth="2" /> : null}
      <g transform={animate ? undefined : `translate(${isPublish ? 164 : 160} ${isSave ? 70 : 58})`}>
        {isSave ? <path d="M-13-12h26v24h-26Zm5 0v9H7v-9M-7 5H7" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeLinejoin="round" strokeWidth="2" /> : isPublish ? <path d="M0-17 13 8 3 5 0 17-3 5-13 8Z" fill={COLOR.accent} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="2" /> : kind === "project" ? <path d="M-14-9h11l4 4h15V12h-30Zm5 9h18M0-5V9" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /> : <path d="M0-15v25m0 0-9-9m9 9 9-9M-13 15h26" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />}
        {animate ? <animateTransform attributeName="transform" type="translate" dur="2.8s" values={`${isExport ? 145 : 160} 48;${isPublish ? 164 : 160} ${isSave ? 70 : 58};${isPublish ? 164 : 160} ${isSave ? 70 : 58};${isExport ? 145 : 160} 48`} keyTimes="0;.42;.75;1" repeatCount="indefinite" /> : null}
      </g>
      {isPublish ? <circle cx="164" cy="79" r="12" fill="none" stroke={COLOR.cool} strokeDasharray="3 3" /> : null}
    </>
  );
}

function FileWorkflowPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <path d="M49 20h68l24 24v42H49Z" fill={COLOR.canvas} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="2" />
      <path d="M117 20v24h24M64 57h61M64 68h45" fill="none" stroke={COLOR.lineStrong} strokeLinecap="round" strokeWidth="2" />
      <path d="M156 31v42m0-42-8 9m8-9 8 9M177 73V31m0 42-8-9m8 9 8-9" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
      <circle cx={animate ? "156" : "177"} cy="84" r="6" fill={COLOR.accent}>
        {animate ? <animate attributeName="cx" dur="2.6s" values="156;177;177;156" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
      </circle>
    </>
  );
}

function EditWorkflowPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <g data-preview-operation="edit-workflow">
      <rect x="28" y="18" width="112" height="70" rx="7" fill={COLOR.canvas} stroke={COLOR.fg2} strokeWidth="1.8" />
      <rect x="43" y="31" width="42" height="34" rx="5" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeDasharray="4 3" strokeWidth="1.8" />
      <circle cx="57" cy="44" r="6" fill={COLOR.accent} />
      <path d="m47 59 11-10 8 7 7-6 8 9" fill="none" stroke={COLOR.cool} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M48 74h32" stroke={COLOR.fg3} strokeLinecap="round" strokeWidth="2" />
      <g transform={animate ? undefined : "translate(43 9)"}>
        <rect x="52" y="31" width="42" height="34" rx="5" fill={COLOR.raised} stroke={COLOR.cool} strokeWidth="2" />
        <circle cx="66" cy="44" r="6" fill={COLOR.cool} />
        <path d="m56 59 11-10 8 7 7-6 8 9" fill="none" stroke={COLOR.fg} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        {animate ? <animateTransform attributeName="transform" type="translate" dur="3s" values="-9 0;43 9;43 9;-9 0" keyTimes="0;.43;.75;1" repeatCount="indefinite" /> : null}
      </g>
      <g transform="translate(151 22)">
        {[0, 1, 2].map((index) => (
          <rect key={index} x={index * 6} y={index * 18} width="36" height="25" rx="4" fill={index === 0 ? COLOR.accentSoft : COLOR.raised} stroke={index === 0 ? COLOR.accent : COLOR.lineStrong} strokeWidth="1.6" />
        ))}
        <path d="M18 52V5m0 0-7 8m7-8 7 8" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4">
          {animate ? <animate attributeName="stroke-dasharray" dur="1.5s" values="2 4;14 2;2 4" repeatCount="indefinite" /> : null}
        </path>
      </g>
      <path d="M34 20v-8h21v8M39 12V7h11v5" fill={COLOR.raised} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="1.5" />
    </g>
  );
}

function InsertContentPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <rect x="33" y="18" width="112" height="70" rx="7" fill={COLOR.canvas} stroke={COLOR.fg2} strokeWidth="2" />
      <path d="M46 34h28M46 44h20" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="3" />
      <rect x="83" y="31" width="48" height="39" rx="5" fill={COLOR.raised} stroke={COLOR.cool} />
      <path d="m87 65 12-13 9 8 7-6 12 11" fill="none" stroke={COLOR.cool} strokeLinecap="round" strokeWidth="2" />
      <path d="M50 62h23v15H50Z" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="1.8" />
      <g transform={animate ? undefined : "translate(-24 22)"}>
        <rect x="157" y="17" width="28" height="28" rx="5" fill={COLOR.accent} />
        <path d="M171 24v14M164 31h14" stroke={COLOR.canvas} strokeLinecap="round" strokeWidth="2.5" />
        {animate ? <animateTransform attributeName="transform" type="translate" dur="2.8s" values="0 0;-24 22;-24 22;0 0" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
      </g>
    </>
  );
}

function CommentInboxPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <g key={index} transform={`translate(${46 + index * 18} ${17 + index * 17})`} opacity={index === 2 ? "1" : ".55"}>
          <path d="M0 0h91v42H24L13 52V42H0Z" fill={index === 2 ? COLOR.accentSoft : COLOR.canvas} stroke={index === 2 ? COLOR.accent : COLOR.lineStrong} strokeLinejoin="round" strokeWidth="1.8" />
          <circle cx="16" cy="15" r="5" fill={index === 2 ? COLOR.accent : COLOR.fg3} />
          <path d="M28 13h46M28 24h34" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" />
        </g>
      ))}
      <circle cx="169" cy="30" r="13" fill={COLOR.accent} stroke={COLOR.canvas} strokeWidth="2">
        {animate ? <animate attributeName="r" dur="1.5s" values="10;14;10" repeatCount="indefinite" /> : null}
      </circle>
      <path d="M169 24v12M163 30h12" stroke={COLOR.canvas} strokeLinecap="round" strokeWidth="2" />
    </>
  );
}

function DrawWorkflowPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <g data-preview-operation="draw-workflow">
      <rect x="31" y="14" width="32" height="76" rx="7" fill={COLOR.canvas} stroke={COLOR.lineStrong} strokeWidth="1.6" />
      {[24, 42, 60, 78].map((y, index) => (
        <g key={y}>
          <rect x="36" y={y - 7} width="22" height="14" rx="4" fill={index === 0 ? COLOR.accentSoft : COLOR.raised} stroke={index === 0 ? COLOR.accent : COLOR.line} />
          {index === 0 ? <path d={`M41 ${y + 2}c4-8 8 6 12-3`} fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2" /> : null}
          {index === 1 ? <path d={`m42 ${y - 3} 11 8`} stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="3" /> : null}
          {index === 2 ? <path d={`M47 ${y - 4}c5 6 5 9 0 11-5-2-5-5 0-11Z`} fill={COLOR.cool} /> : null}
          {index === 3 ? <rect x="42" y={y - 4} width="11" height="8" rx="1" fill="none" stroke={COLOR.fg2} strokeWidth="1.5" /> : null}
        </g>
      ))}
      <rect x="70" y="16" width="116" height="72" rx="7" fill={COLOR.canvas} stroke={COLOR.fg2} strokeWidth="1.8" />
      <path d="M82 68c17-34 32 16 48-13 12-22 25-17 40-7" fill="none" stroke={COLOR.accent} strokeDasharray="119" strokeDashoffset={animate ? "119" : "0"} strokeLinecap="round" strokeWidth="4">
        {animate ? <animate attributeName="stroke-dashoffset" dur="2.8s" values="119;0;0" keyTimes="0;.65;1" repeatCount="indefinite" /> : null}
      </path>
      <circle cx="97" cy="37" r="11" fill={COLOR.cool} opacity=".58" />
      <rect x="137" y="27" width="31" height="21" rx="3" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="1.8" />
      <rect x="35" y={animate ? "17" : "71"} width="24" height="16" rx="5" fill="none" stroke={COLOR.accent} strokeWidth="2.2">
        {animate ? <animate attributeName="y" dur="3s" values="17;35;53;71;71;17" keyTimes="0;.18;.36;.54;.76;1" repeatCount="indefinite" /> : null}
      </rect>
    </g>
  );
}

function ViewWorkflowPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <g data-preview-operation="view-workflow">
      <rect x="25" y="17" width="23" height="70" rx="5" fill={COLOR.raised} stroke={COLOR.lineStrong} />
      <path d="M31 29h11M31 39h11M31 49h11" stroke={COLOR.fg3} strokeLinecap="round" strokeWidth="2" />
      <rect x="168" y="17" width="23" height="70" rx="5" fill={COLOR.raised} stroke={COLOR.lineStrong} />
      <path d="M174 29h11M174 39h11M174 49h11" stroke={COLOR.fg3} strokeLinecap="round" strokeWidth="2" />
      <g transform="translate(108 52)">
        <rect x="-53" y="-32" width="106" height="64" rx="6" fill={COLOR.canvas} stroke={COLOR.fg2} strokeWidth="2" />
        <g transform={animate ? undefined : "scale(-1 1)"}>
          <circle cx="-25" cy="-12" r="8" fill={COLOR.accent} />
          <path d="m-43 21 25-24L0 13l13-12 31 20" fill="none" stroke={COLOR.cool} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          {animate ? <animateTransform attributeName="transform" type="scale" dur="3.2s" values="1 1;1 1;-1 1;-1 1;1 1" keyTimes="0;.3;.48;.75;1" repeatCount="indefinite" /> : null}
        </g>
        {animate ? <animateTransform attributeName="transform" additive="sum" type="scale" dur="3.2s" values=".86;.98;.98;.86" keyTimes="0;.34;.75;1" repeatCount="indefinite" /> : null}
      </g>
      <path d="M82 92h52" stroke={COLOR.lineStrong} strokeLinecap="round" strokeWidth="5" />
      <circle cx={animate ? "82" : "125"} cy="92" r="6" fill={COLOR.accent}>
        {animate ? <animate attributeName="cx" dur="3.2s" values="82;134;134;82" keyTimes="0;.4;.74;1" repeatCount="indefinite" /> : null}
      </circle>
    </g>
  );
}

function SettingsSlidersPreview({ animate, exportMode = false }: { animate: boolean; exportMode?: boolean }): ReactElement {
  const rows = exportMode ? [30, 50, 70] : [27, 47, 67, 87];
  return (
    <>
      {exportMode ? <path d="M39 19h45l15 15v50H39Z" fill={COLOR.canvas} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="2" /> : null}
      {rows.map((y, index) => {
        const start = exportMode ? 112 : 42;
        const end = 184;
        const baseX = start + [24, 54, 37, 74][index];
        const shiftedX = start + [61, 28, 68, 34][index];
        return (
          <g key={y}>
            <path d={`M${start} ${y}h${end - start}`} stroke={COLOR.fg3} strokeLinecap="round" strokeWidth="3" />
            <circle cx={animate ? baseX : shiftedX} cy={y} r="6" fill={COLOR.accent} stroke={COLOR.canvas} strokeWidth="2">
              {animate ? <animate attributeName="cx" dur={`${2.4 + index * .18}s`} values={`${baseX};${shiftedX};${shiftedX};${baseX}`} keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
            </circle>
          </g>
        );
      })}
      {exportMode ? <path d="M60 46v24m0 0-8-8m8 8 8-8M49 76h22" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" /> : null}
    </>
  );
}

function BrushWorkflowPreview({
  animate,
  action,
}: {
  animate: boolean;
  action: "library" | "favorite" | "slot" | "studio";
}): ReactElement {
  if (action === "library") {
    return (
      <>
        {Array.from({ length: 6 }, (_, index) => {
          const x = 43 + (index % 3) * 48;
          const y = 20 + Math.floor(index / 3) * 36;
          return <rect key={index} x={x} y={y} width="39" height="27" rx="5" fill={index === 1 ? COLOR.accentSoft : COLOR.canvas} stroke={index === 1 ? COLOR.accent : COLOR.lineStrong} strokeWidth="1.7" />;
        })}
        <path d="M51 36c8-10 15 8 23-5M99 33c7-14 14 10 24-4M147 36h24M51 70h24M99 71c8-9 15 7 24-5M147 65c6 8 14 8 24 0" fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="3" />
        <rect x={animate ? "42" : "90"} y={animate ? "19" : "19"} width="41" height="29" rx="6" fill="none" stroke={COLOR.accent} strokeWidth="2.5">
          {animate ? <animate attributeName="x" dur="2.6s" values="42;90;90;42" keyTimes="0;.4;.72;1" repeatCount="indefinite" /> : null}
        </rect>
      </>
    );
  }
  if (action === "favorite") {
    return (
      <>
        <path d="M42 68c20-29 39 15 58-11 16-22 35-19 58-3" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="5" />
        <path d="m166 22 6 13 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2Z" fill={animate ? COLOR.accentSoft : COLOR.accent} stroke={COLOR.accent} strokeLinejoin="round" strokeWidth="2">
          {animate ? <animate attributeName="fill-opacity" dur="1.5s" values=".15;1;.15" repeatCount="indefinite" /> : null}
        </path>
      </>
    );
  }
  if (action === "slot") {
    return (
      <>
        {[1, 2, 3, 4].map((slot, index) => (
          <g key={slot} transform={`translate(${44 + index * 39} 35)`}>
            <rect width="31" height="31" rx="7" fill={slot === 3 ? COLOR.accentSoft : COLOR.canvas} stroke={slot === 3 ? COLOR.accent : COLOR.lineStrong} strokeWidth="1.8" />
            <text x="15.5" y="20" textAnchor="middle" fill={slot === 3 ? COLOR.accent : COLOR.fg2} fontSize="12" fontWeight="700">{slot}</text>
          </g>
        ))}
        <circle cx={animate ? "60" : "138"} cy="79" r="7" fill={COLOR.accent}>
          {animate ? <animate attributeName="cx" dur="2.6s" values="60;138;138;60" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
        </circle>
      </>
    );
  }
  return (
    <>
      <path d="M36 69c19-31 38 18 56-12 19-31 36 11 55-17" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="5" />
      <path d="M38 30h63M38 42h45" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" />
      <path d="M126 78V27h55M126 68c17-2 19-28 36-31 8-2 13-2 19-2" fill="none" stroke={COLOR.cool} strokeWidth="2" />
      <circle cx={animate ? "126" : "162"} cy={animate ? "68" : "37"} r="5" fill={COLOR.accent}>
        {animate ? <><animate attributeName="cx" dur="2.7s" values="126;162;162;126" keyTimes="0;.42;.72;1" repeatCount="indefinite" /><animate attributeName="cy" dur="2.7s" values="68;37;37;68" keyTimes="0;.42;.72;1" repeatCount="indefinite" /></> : null}
      </circle>
    </>
  );
}

function HistoryStepPreview({ animate, direction }: { animate: boolean; direction: "undo" | "redo" }): ReactElement {
  const mirror = direction === "redo";
  return (
    <>
      {[0, 1, 2].map((index) => (
        <rect key={index} x={68 + index * 13} y={23 + index * 8} width="80" height="51" rx="6" fill={index === 2 ? COLOR.canvas : COLOR.raised} stroke={index === 2 ? COLOR.accent : COLOR.lineStrong} opacity={index === 2 ? "1" : ".48"} />
      ))}
      <g transform={mirror ? "translate(216 0) scale(-1 1)" : undefined}>
        <path d="M73 34H43l11-11M43 34l11 11" fill="none" stroke={COLOR.fg} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <path d="M43 34c0 27 19 43 49 43" fill="none" stroke={COLOR.accent} strokeDasharray="82" strokeDashoffset={animate ? "82" : "0"} strokeLinecap="round" strokeWidth="3">
          {animate ? <animate attributeName="stroke-dashoffset" dur="2.5s" values="82;0;0;82" keyTimes="0;.4;.72;1" repeatCount="indefinite" /> : null}
        </path>
      </g>
      <path d="M99 49h37M99 59h27" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" />
    </>
  );
}

function LayerActionPreview({
  animate,
  action,
  variant,
}: {
  animate: boolean;
  action: "visibility" | "lock" | "merge" | "actions";
  variant: string;
}): ReactElement {
  const hidden = previewVariantMatches(variant, "hide", "batch-hide", "hide-layer");
  const shown = previewVariantMatches(variant, "show", "batch-show", "show-layer");
  const unlocked = previewVariantMatches(variant, "unlock", "batch-unlock", "unlock-layer");
  const flattenVisible = previewVariantMatches(variant, "flatten-visible");
  return (
    <g
      data-preview-operation={
        action === "visibility"
          ? hidden
            ? "hide"
            : shown
              ? "show"
              : "visibility"
          : action === "lock"
            ? unlocked
              ? "unlock"
              : "lock"
            : action === "merge"
              ? flattenVisible
                ? "flatten-visible"
                : "merge-selected"
              : "actions"
      }
    >
      {[0, 1, 2].map((index) => (
        <path key={index} d={`m108 ${17 + index * 18} 53 18-53 18-53-18Z`} fill={index === 1 ? COLOR.accentSoft : COLOR.canvas} stroke={index === 1 ? COLOR.accent : COLOR.lineStrong} strokeLinejoin="round" strokeWidth="1.7" opacity={action === "merge" && animate ? `${.45 + index * .2}` : "1"}>
          {action === "merge" && animate ? <animateTransform attributeName="transform" type="translate" dur="2.8s" values={`0 0;0 ${18 - index * 18};0 ${18 - index * 18};0 0`} keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
        </path>
      ))}
      {action === "visibility" ? (
        <>
          <path d="M160 37c9-9 22-9 31 0-9 9-22 9-31 0Z" fill="none" stroke={COLOR.fg2} strokeWidth="2" />
          <circle cx="176" cy="37" r="4" fill={COLOR.accent} opacity={hidden ? ".25" : "1"}>
            {animate ? <animate attributeName="opacity" dur="1.5s" values={hidden ? "1;.12;.12;1" : ".15;1;1;.15"} keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
          </circle>
          {hidden ? <path d="m158 25 36 25" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2.5" /> : null}
        </>
      ) : null}
      {action === "lock" ? (
        <g transform="translate(174 52)">
          <rect x="-12" y="-2" width="24" height="20" rx="4" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" />
          <path
            d={unlocked ? "M-7-2v-7a7 7 0 0 1 12-5v7" : "M-7-2v-7a7 7 0 0 1 14 0v7"}
            fill="none"
            stroke={COLOR.fg}
            strokeWidth="2"
          >
            {animate ? (
              <animate
                attributeName="d"
                dur="2.5s"
                values={unlocked
                  ? "M-7-2v-7a7 7 0 0 1 14 0v7;M-7-2v-7a7 7 0 0 1 12-5v7;M-7-2v-7a7 7 0 0 1 12-5v7;M-7-2v-7a7 7 0 0 1 14 0v7"
                  : "M-7-2v-7a7 7 0 0 1 12-5v7;M-7-2v-7a7 7 0 0 1 14 0v7;M-7-2v-7a7 7 0 0 1 14 0v7;M-7-2v-7a7 7 0 0 1 12-5v7"}
                keyTimes="0;.42;.72;1"
                repeatCount="indefinite"
              />
            ) : null}
          </path>
        </g>
      ) : null}
      {action === "actions" ? <g>{[76, 108, 140].map((x, index) => <circle key={x} cx={x} cy="90" r="5" fill={index === 1 ? COLOR.accent : COLOR.fg2}>{animate && index === 1 ? <animate attributeName="r" dur="1.4s" values="4;7;4" repeatCount="indefinite" /> : null}</circle>)}</g> : null}
      {action === "merge" ? (
        flattenVisible ? (
          <g>
            <rect x="158" y="70" width="31" height="22" rx="4" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" />
            <path d="M164 78h19M164 84h19" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2" />
            {animate ? <animateTransform attributeName="transform" type="translate" dur="2.8s" values="0 8;0 0;0 0;0 8" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
          </g>
        ) : (
          <path d="M165 83h24m-12-12v24" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2.5">
            {animate ? <animate attributeName="opacity" dur="1.4s" values=".3;1;.3" repeatCount="indefinite" /> : null}
          </path>
        )
      ) : null}
    </g>
  );
}

function LayerSelectionActionPreview({
  animate,
  action,
}: {
  animate: boolean;
  action: "duplicate" | "front" | "back" | "delete";
}): ReactElement {
  if (action === "delete") {
    return (
      <>
        <g opacity={animate ? "1" : ".18"}>
          <rect x="49" y="20" width="91" height="58" rx="7" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" />
          <circle cx="72" cy="39" r="7" fill={COLOR.accent} />
          <path d="m57 69 24-22 17 15 12-10 22 17" fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2.5" />
          {animate ? <animate attributeName="opacity" dur="2.6s" values="1;1;.12;.12;1" keyTimes="0;.32;.58;.78;1" repeatCount="indefinite" /> : null}
        </g>
        <g transform="translate(164 62)">
          <path d="M-13-9h26m-22 0 2 23H7L9-9m-11-6h4m-6 0h8" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
          {animate ? <animateTransform attributeName="transform" additive="sum" type="translate" dur="2.6s" values="0 8;0 0;0 0;0 8" keyTimes="0;.32;.78;1" repeatCount="indefinite" /> : null}
        </g>
      </>
    );
  }

  if (action === "duplicate") {
    return (
      <>
        <rect x="51" y="25" width="84" height="55" rx="7" fill={COLOR.canvas} stroke={COLOR.fg2} strokeWidth="2" />
        <g transform={animate ? undefined : "translate(31 -12)"}>
          <rect x="72" y="34" width="84" height="55" rx="7" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" />
          <path d="M93 62h42M114 41v42" stroke={COLOR.accent} strokeLinecap="round" strokeWidth="2.5" />
          {animate ? <animateTransform attributeName="transform" type="translate" dur="2.8s" values="0 0;31 -12;31 -12;0 0" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
        </g>
      </>
    );
  }

  const toFront = action === "front";
  return (
    <>
      {[0, 1, 2].map((index) => {
        const selected = index === (toFront ? 0 : 2);
        return (
          <g key={index} transform={`translate(${58 + index * 25} ${22 + index * 14})`}>
            <rect width="80" height="46" rx="6" fill={selected ? COLOR.accentSoft : COLOR.canvas} stroke={selected ? COLOR.accent : COLOR.lineStrong} strokeWidth="2" />
            {selected && animate ? (
              <animateTransform
                attributeName="transform"
                additive="sum"
                type="translate"
                dur="2.8s"
                values={`0 0;${toFront ? 50 : -50} ${toFront ? 28 : -28};${toFront ? 50 : -50} ${toFront ? 28 : -28};0 0`}
                keyTimes="0;.42;.72;1"
                repeatCount="indefinite"
              />
            ) : null}
          </g>
        );
      })}
      <path d={toFront ? "M170 74V25m0 0-8 9m8-9 8 9" : "M46 30v49m0 0-8-9m8 9 8-9"} fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
    </>
  );
}

function ObjectTransformActionPreview({
  animate,
  action,
  variant,
}: {
  animate: boolean;
  action: "translate" | "rotate" | "scale" | "ground";
  variant: string;
}): ReactElement {
  const originGround = previewVariantMatches(variant, "origin-ground");
  return (
    <>
      <path d="m108 25 35 18-35 18-35-18Z" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeLinejoin="round" strokeWidth="2" />
      <path d="m73 43 35 18 35-18v34l-35 18-35-18Z" fill={COLOR.canvas} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="2" />
      {action === "translate" ? <g transform={animate ? undefined : "translate(18 -9)"}><path d="M108 20V6m0 0-5 7m5-7 5 7M148 48h18m0 0-7-5m7 5-7 5" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />{animate ? <animateTransform attributeName="transform" type="translate" dur="2.7s" values="0 0;18 -9;18 -9;0 0" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}</g> : null}
      {action === "rotate" ? <path d="M61 52a51 30 0 0 0 96 0m0 0-11 3m11-3-4-10" fill="none" stroke={COLOR.accent} strokeDasharray={animate ? "150" : undefined} strokeDashoffset={animate ? "150" : undefined} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5">{animate ? <animate attributeName="stroke-dashoffset" dur="2.5s" values="150;0;0" keyTimes="0;.7;1" repeatCount="indefinite" /> : null}</path> : null}
      {action === "scale" ? <g transform={animate ? undefined : "translate(15 -10) scale(1.12)"}><path d="M65 31 51 17m0 0 11 2m-11-2 2 11M151 75l14 14m0 0-11-2m11 2-2-11" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />{animate ? <animateTransform attributeName="transform" type="scale" dur="2.7s" values=".88;1.12;1.12;.88" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}</g> : null}
      {action === "ground" ? <><path d="M43 91h130" stroke={COLOR.accent} strokeDasharray="5 4" strokeWidth="2" />{originGround ? <><path d="M108 80v22M97 91h22" stroke={COLOR.cool} strokeLinecap="round" strokeWidth="2" /><circle cx="108" cy="91" r="5" fill={COLOR.canvas} stroke={COLOR.cool} strokeWidth="2">{animate ? <animate attributeName="r" dur="1.4s" values="3;7;3" repeatCount="indefinite" /> : null}</circle></> : <g transform={animate ? undefined : "translate(0 0)"}><path d="M164 54v25m0 0-7-8m7 8 7-8" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />{animate ? <animateTransform attributeName="transform" type="translate" dur="2.7s" values="0 -18;0 0;0 0;0 -18" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}</g>}</> : null}
    </>
  );
}

function ObjectSnapPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <g data-preview-operation="object-snap">
      {[48, 78, 108, 138, 168].map((x) => <path key={`x-${x}`} d={`M${x} 15v74`} stroke={x === 108 ? COLOR.cool : COLOR.lineStrong} strokeWidth={x === 108 ? "1.4" : "1"} opacity={x === 108 ? ".7" : ".45"} />)}
      {[22, 52, 82].map((y) => <path key={`y-${y}`} d={`M34 ${y}h148`} stroke={y === 52 ? COLOR.cool : COLOR.lineStrong} strokeWidth={y === 52 ? "1.4" : "1"} opacity={y === 52 ? ".7" : ".45"} />)}
      <rect x="58" y="27" width="42" height="30" rx="5" fill="none" stroke={COLOR.fg3} strokeDasharray="4 3" strokeWidth="1.5" opacity=".56" />
      <g transform={animate ? undefined : "translate(0 0)"}>
        <rect x="87" y="37" width="42" height="30" rx="5" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" />
        <circle cx="108" cy="52" r="4" fill={COLOR.accent} stroke={COLOR.canvas} strokeWidth="1.5" />
        {animate ? <animateTransform attributeName="transform" type="translate" dur="2.8s" values="-29 -10;0 0;0 0;-29 -10" keyTimes="0;.42;.74;1" repeatCount="indefinite" /> : null}
      </g>
      <circle cx="108" cy="52" r={animate ? "4" : "9"} fill="none" stroke={COLOR.cool} strokeWidth="2" opacity={animate ? ".9" : ".78"}>
        {animate ? (
          <>
            <animate attributeName="r" dur="2.8s" values="3;3;13;3" keyTimes="0;.4;.56;1" repeatCount="indefinite" />
            <animate attributeName="opacity" dur="2.8s" values="0;0;1;0" keyTimes="0;.38;.48;1" repeatCount="indefinite" />
          </>
        ) : null}
      </circle>
      <path d="M138 67h28m0 0-8-6m8 6-8 6" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
      <path d="M102 46h12M108 40v24" stroke={COLOR.fg} strokeLinecap="round" strokeWidth="1.2" opacity=".7" />
    </g>
  );
}

function CameraActionPreview({
  animate,
  action,
  variant,
}: {
  animate: boolean;
  action: "zoom" | "reset" | "orbit" | "quad";
  variant: string;
}): ReactElement {
  const zoomOut = previewVariantMatches(variant, "zoom-out");
  const focusSelection = previewVariantMatches(variant, "focus-selection");
  if (action === "quad") {
    return (
      <>
        {[0, 1, 2, 3].map((index) => <rect key={index} x={48 + (index % 2) * 61} y={19 + Math.floor(index / 2) * 36} width="56" height="31" rx="4" fill={index === 0 ? COLOR.accentSoft : COLOR.canvas} stroke={index === 0 ? COLOR.accent : COLOR.lineStrong} />)}
        <circle cx={animate ? "76" : "137"} cy={animate ? "35" : "71"} r="5" fill={COLOR.accent}>{animate ? <><animate attributeName="cx" dur="2.8s" values="76;137;137;76" keyTimes="0;.45;.72;1" repeatCount="indefinite" /><animate attributeName="cy" dur="2.8s" values="35;71;71;35" keyTimes="0;.45;.72;1" repeatCount="indefinite" /></> : null}</circle>
      </>
    );
  }
  return (
    <>
      <circle cx="108" cy="52" r="25" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" />
      <path d="M98 72v-16h20v16M101 56v-12h14v12M108 44V33" fill="none" stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="2" />
      {action === "zoom" ? <g transform={animate ? undefined : zoomOut ? "translate(0 0)" : "translate(-22 -13)"} data-preview-operation={focusSelection ? "focus-selection" : zoomOut ? "zoom-out" : "zoom-in"}><circle cx="142" cy="68" r="15" fill={COLOR.card} stroke={COLOR.fg} strokeWidth="2" />{focusSelection ? <><circle cx="142" cy="68" r="7" fill="none" stroke={COLOR.accent} strokeWidth="2" /><path d="M142 55v6M142 75v6M129 68h6M149 68h6" stroke={COLOR.fg} strokeLinecap="round" strokeWidth="2" /></> : <path d={zoomOut ? "M136 68h12" : "M136 68h12M142 62v12"} stroke={COLOR.fg} strokeLinecap="round" strokeWidth="2.3" />}<path d="M153 79l11 10" stroke={COLOR.fg} strokeLinecap="round" strokeWidth="2.3" />{animate ? <animateTransform attributeName="transform" type="translate" dur="2.7s" values={zoomOut ? "-22 -13;0 0;0 0;-22 -13" : "0 0;-22 -13;-22 -13;0 0"} keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}</g> : null}
      {action === "reset" ? <path d="M72 38a42 42 0 1 1-1 31m1-31-13 1m13-1-5-12" fill="none" stroke={COLOR.accent} strokeDasharray={animate ? "190" : undefined} strokeDashoffset={animate ? "190" : undefined} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5">{animate ? <animate attributeName="stroke-dashoffset" dur="2.8s" values="190;0;0" keyTimes="0;.72;1" repeatCount="indefinite" /> : null}</path> : null}
      {action === "orbit" ? <><ellipse cx="108" cy="52" rx="65" ry="32" fill="none" stroke={COLOR.fg3} strokeDasharray="4 4" />{animate ? <circle r="7" fill={COLOR.accent}><animateMotion dur="2.8s" path="M43 52a65 32 0 1 0 130 0 65 32 0 1 0-130 0" repeatCount="indefinite" /></circle> : <circle cx="173" cy="52" r="7" fill={COLOR.accent} />}</> : null}
    </>
  );
}

function LineArtPreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <path d="m108 20 48 25-48 25-48-25Z" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeLinejoin="round" strokeWidth="2" />
      <path d="m60 45 48 25 48-25v34l-48 25-48-25Z" fill={COLOR.canvas} stroke={COLOR.fg2} strokeLinejoin="round" strokeWidth="2" />
      <path d="M108 70V35M60 45l48-10 48 10M60 79l48-9 48 9" fill="none" stroke={COLOR.fg} strokeDasharray={animate ? "160" : undefined} strokeDashoffset={animate ? "160" : undefined} strokeWidth="1.7">
        {animate ? <animate attributeName="stroke-dashoffset" dur="2.8s" values="160;0;0" keyTimes="0;.72;1" repeatCount="indefinite" /> : null}
      </path>
    </>
  );
}

function FrameActionPreview({
  animate,
  action,
  variant,
}: {
  animate: boolean;
  action: "capture" | "playback" | "reorder" | "duplicate" | "delete";
  variant: string;
}): ReactElement {
  const reorderPrevious = previewVariantMatches(variant, "reorder-previous");
  const reorderNext = previewVariantMatches(variant, "reorder-next");
  const cards = [52, 92, 132];
  return (
    <>
      {cards.map((x, index) => (
        <g key={x} opacity={action === "delete" && index === 1 && animate ? ".2" : "1"}>
          <rect x={x} y="27" width="32" height="43" rx="5" fill={index === 1 ? COLOR.accentSoft : COLOR.canvas} stroke={index === 1 ? COLOR.accent : COLOR.lineStrong} strokeWidth="1.7">
            {action === "delete" && index === 1 && animate ? <animate attributeName="opacity" dur="2.5s" values="1;.12;.12;1" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
          </rect>
          <circle cx={x + 10} cy="39" r="4" fill={index === 1 ? COLOR.accent : COLOR.fg3} />
          <path d={`M${x + 5} 62l8-9 6 6 7-8`} fill="none" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" />
          {action === "reorder" && index === 1 && animate && (reorderPrevious || reorderNext) ? <animateTransform attributeName="transform" type="translate" dur="2.7s" values={`0 0;${reorderPrevious ? -40 : 40} 0;${reorderPrevious ? -40 : 40} 0;0 0`} keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}
        </g>
      ))}
      {action === "capture" ? <><rect x="75" y="74" width="66" height="18" rx="6" fill={COLOR.raised} stroke={COLOR.fg2} /><circle cx="108" cy="83" r="6" fill={COLOR.accent}>{animate ? <animate attributeName="r" dur="1.5s" values="4;7;4" repeatCount="indefinite" /> : null}</circle></> : null}
      {action === "playback" ? <><path d="m93 76 17 10-17 10Z" fill={COLOR.accent} /><path d="M55 88h104" stroke={COLOR.fg3} strokeLinecap="round" strokeWidth="2" /><circle cx={animate ? "58" : "145"} cy="88" r="5" fill={COLOR.accent}>{animate ? <animate attributeName="cx" dur="2.6s" values="58;158;158;58" keyTimes="0;.68;.78;1" repeatCount="indefinite" /> : null}</circle></> : null}
      {action === "reorder" ? <path data-preview-operation={reorderPrevious ? "previous" : reorderNext ? "next" : "reorder"} d={reorderPrevious ? "M113 18H63m0 0 9-7m-9 7 9 7" : reorderNext ? "M103 18h50m0 0-9-7m9 7-9 7" : "M73 18h70m0 0-8-6m8 6-8 6M143 80H73m0 0 8-6m-8 6 8 6"} fill="none" stroke={COLOR.accent} strokeDasharray={animate ? "9 5" : undefined} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2">{animate ? <animate attributeName="stroke-dashoffset" dur="1.1s" values="0;-28" repeatCount="indefinite" /> : null}</path> : null}
      {action === "duplicate" ? <g transform={animate ? undefined : "translate(0 0)"}><rect x="88" y="22" width="32" height="43" rx="5" fill={COLOR.accentSoft} stroke={COLOR.accent} strokeWidth="2" />{animate ? <animateTransform attributeName="transform" type="translate" dur="2.6s" values="0 0;40 6;40 6;0 0" keyTimes="0;.42;.72;1" repeatCount="indefinite" /> : null}</g> : null}
      {action === "delete" ? <path d="M94 78h28m-23 0 2 15h14l2-15m-14-5h10" fill="none" stroke={COLOR.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">{animate ? <animate attributeName="opacity" dur="1.4s" values=".35;1;.35" repeatCount="indefinite" /> : null}</path> : null}
    </>
  );
}

function renderPreview(
  kind: StudioToolHintPreviewKind,
  animate: boolean,
  id: string,
  variant: string
): ReactElement {
  switch (kind) {
    case "select":
      return <SelectionPreview animate={animate} />;
    case "transform":
      return <TransformPreview animate={animate} />;
    case "pan":
      return <PanPreview animate={animate} />;
    case "ink":
      return <InkPreview animate={animate} />;
    case "pixel-ink":
      return <PixelInkPreview animate={animate} />;
    case "erase":
      return <ErasePreview animate={animate} />;
    case "fill":
      return <FillPreview animate={animate} />;
    case "sample":
      return <SamplePreview animate={animate} />;
    case "shape":
      return <DirectShapePreview animate={animate} />;
    case "smart-shape":
      return <ShapeKindPreview animate={animate} kind="smart" />;
    case "shape-rect":
      return <ShapeKindPreview animate={animate} kind="rect" />;
    case "shape-ellipse":
      return <ShapeKindPreview animate={animate} kind="ellipse" />;
    case "shape-fill":
      return <ShapeFillPreview animate={animate} />;
    case "text":
      return <TextPreview animate={animate} clipId={`${id}-text-clip`} />;
    case "bubble":
      return <BubblePreview animate={animate} />;
    case "comment":
      return <CommentPreview animate={animate} />;
    case "image":
      return <ImagePreview animate={animate} />;
    case "reference":
      return <ReferencePreview animate={animate} />;
    case "filter":
      return <FilterPreview animate={animate} clipId={`${id}-filter-clip`} variant={variant} />;
    case "smudge":
      return <SmudgePreview animate={animate} />;
    case "liquify":
      return <LiquifyPreview animate={animate} />;
    case "lasso":
      return <LassoPreview animate={animate} />;
    case "polygon-lasso":
      return <PolygonLassoPreview animate={animate} />;
    case "selection-brush":
      return <SelectionBrushPreview animate={animate} />;
    case "selection-add":
      return <SelectionCombinePreview animate={animate} operation="add" />;
    case "selection-subtract":
      return <SelectionCombinePreview animate={animate} operation="subtract" />;
    case "selection-intersect":
      return <SelectionCombinePreview animate={animate} operation="intersect" />;
    case "lasso-fill":
      return <LassoFillPreview animate={animate} />;
    case "marquee-rect":
      return <MarqueePreview animate={animate} ellipse={false} />;
    case "marquee-ellipse":
      return <MarqueePreview animate={animate} ellipse />;
    case "crop":
      return <CropPreview animate={animate} />;
    case "perspective":
      return <PerspectivePreview animate={animate} />;
    case "rotate-view":
      return <RotateViewPreview animate={animate} />;
    case "flip-view":
      return <FlipViewPreview animate={animate} />;
    case "brush-size":
      return <BrushSizePreview animate={animate} />;
    case "opacity":
      return <OpacityPreview animate={animate} patternId={`${id}-opacity-checker`} />;
    case "stabilizer":
      return <StabilizerPreview animate={animate} variant={variant} />;
    case "pressure":
      return <PressurePreview animate={animate} variant={variant} />;
    case "symmetry":
      return <SymmetryPreview animate={animate} variant={variant} />;
    case "zoom-view":
      return <ZoomViewPreview animate={animate} />;
    case "history":
      return <HistoryPreview animate={animate} />;
    case "undo":
      return <HistoryStepPreview animate={animate} direction="undo" />;
    case "redo":
      return <HistoryStepPreview animate={animate} direction="redo" />;
    case "layer":
      return <LayerPreview animate={animate} />;
    case "layer-visibility":
      return <LayerActionPreview animate={animate} action="visibility" variant={variant} />;
    case "layer-lock":
      return <LayerActionPreview animate={animate} action="lock" variant={variant} />;
    case "layer-merge":
      return <LayerActionPreview animate={animate} action="merge" variant={variant} />;
    case "layer-actions":
      return <LayerActionPreview animate={animate} action="actions" variant={variant} />;
    case "layer-duplicate":
      return <LayerSelectionActionPreview animate={animate} action="duplicate" />;
    case "layer-reorder-front":
      return <LayerSelectionActionPreview animate={animate} action="front" />;
    case "layer-reorder-back":
      return <LayerSelectionActionPreview animate={animate} action="back" />;
    case "layer-delete":
      return <LayerSelectionActionPreview animate={animate} action="delete" />;
    case "timeline":
      return <TimelinePreview animate={animate} />;
    case "keyframe":
      return <KeyframePreview animate={animate} />;
    case "frame-sequence":
      return <FrameSequencePreview animate={animate} />;
    case "frame-capture":
      return <FrameActionPreview animate={animate} action="capture" variant={variant} />;
    case "frame-playback":
      return <FrameActionPreview animate={animate} action="playback" variant={variant} />;
    case "frame-reorder":
      return <FrameActionPreview animate={animate} action="reorder" variant={variant} />;
    case "frame-duplicate":
      return <FrameActionPreview animate={animate} action="duplicate" variant={variant} />;
    case "frame-delete":
      return <FrameActionPreview animate={animate} action="delete" variant={variant} />;
    case "onion-skin":
      return <OnionSkinPreview animate={animate} variant={variant} />;
    case "timelapse":
      return <TimelapsePreview animate={animate} />;
    case "motion-fx":
      return <MotionFxPreview animate={animate} />;
    case "video-export":
      return <VideoExportPreview animate={animate} />;
    case "audio":
      return <AudioPreview animate={animate} />;
    case "object-3d":
      return <Object3dPreview animate={animate} />;
    case "object-translate":
      return <ObjectTransformActionPreview animate={animate} action="translate" variant={variant} />;
    case "object-rotate":
      return <ObjectTransformActionPreview animate={animate} action="rotate" variant={variant} />;
    case "object-scale":
      return <ObjectTransformActionPreview animate={animate} action="scale" variant={variant} />;
    case "object-ground":
      return <ObjectTransformActionPreview animate={animate} action="ground" variant={variant} />;
    case "object-snap":
      return <ObjectSnapPreview animate={animate} />;
    case "pose-3d":
      return <Pose3dPreview animate={animate} />;
    case "camera-3d":
      return <Camera3dPreview animate={animate} />;
    case "camera-zoom":
      return <CameraActionPreview animate={animate} action="zoom" variant={variant} />;
    case "camera-reset":
      return <CameraActionPreview animate={animate} action="reset" variant={variant} />;
    case "camera-orbit":
      return <CameraActionPreview animate={animate} action="orbit" variant={variant} />;
    case "quad-view":
      return <CameraActionPreview animate={animate} action="quad" variant={variant} />;
    case "lighting-3d":
      return <Lighting3dPreview animate={animate} />;
    case "line-art":
      return <LineArtPreview animate={animate} />;
    case "assets":
      return <WorkspaceActionPreview animate={animate} kind="assets" />;
    case "file-workflow":
      return <FileWorkflowPreview animate={animate} />;
    case "edit-workflow":
      return <EditWorkflowPreview animate={animate} />;
    case "insert-content":
      return <InsertContentPreview animate={animate} />;
    case "comment-inbox":
      return <CommentInboxPreview animate={animate} />;
    case "draw-workflow":
      return <DrawWorkflowPreview animate={animate} />;
    case "view-workflow":
      return <ViewWorkflowPreview animate={animate} />;
    case "export":
      return <WorkspaceActionPreview animate={animate} kind="export" />;
    case "export-options":
      return <SettingsSlidersPreview animate={animate} exportMode />;
    case "project":
      return <WorkspaceActionPreview animate={animate} kind="project" />;
    case "fullscreen":
      return <WorkspaceActionPreview animate={animate} kind="fullscreen" />;
    case "settings":
      return <WorkspaceActionPreview animate={animate} kind="settings" />;
    case "save":
      return <WorkspaceActionPreview animate={animate} kind="save" />;
    case "publish":
      return <WorkspaceActionPreview animate={animate} kind="publish" />;
    case "ai-assist":
      return <WorkspaceActionPreview animate={animate} kind="ai" />;
    case "brush-library":
      return <BrushWorkflowPreview animate={animate} action="library" />;
    case "brush-favorite":
      return <BrushWorkflowPreview animate={animate} action="favorite" />;
    case "brush-slot":
      return <BrushWorkflowPreview animate={animate} action="slot" />;
    case "brush-studio":
      return <BrushWorkflowPreview animate={animate} action="studio" />;
    case "draw-settings":
      return <SettingsSlidersPreview animate={animate} />;
  }
}

/**
 * Warm-ink, asset-free micro demonstration for a Studio tool hint.
 *
 * The preview is decorative by default. Pass `aria-label` (or
 * `aria-labelledby`) when it conveys information not already present in the
 * tooltip copy. Motion follows the OS preference unless `reducedMotion` is
 * supplied explicitly.
 */
export function StudioToolHintPreview({
  kind,
  variant,
  reducedMotion,
  className,
  role,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-hidden": ariaHidden,
  ...svgProps
}: StudioToolHintPreviewProps): ReactElement {
  const systemReducedMotion = useSystemReducedMotion();
  const animate = !(reducedMotion ?? systemReducedMotion);
  const id = `studio-tool-preview-${useId().replaceAll(":", "")}`;
  const hasAccessibleName = Boolean(ariaLabel || ariaLabelledBy);
  const normalizedVariant = normalizePreviewVariant(variant ?? kind);

  return (
    <svg
      {...svgProps}
      data-studio-tool-hint-preview={kind}
      data-preview-kind={kind}
      data-preview-variant={normalizedVariant}
      data-motion={animate ? "animated" : "reduced"}
      viewBox="0 0 216 104"
      preserveAspectRatio="xMidYMid meet"
      className={["block h-auto w-full", className].filter(Boolean).join(" ")}
      focusable="false"
      role={hasAccessibleName ? role ?? "img" : role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-hidden={hasAccessibleName ? ariaHidden : true}
    >
      <defs>
        <pattern id={`${id}-ledger`} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0v16" fill="none" stroke={COLOR.line} strokeWidth=".7" opacity=".28" />
        </pattern>
      </defs>
      <rect x=".5" y=".5" width="215" height="103" rx="7.5" fill={COLOR.card} stroke={COLOR.line} />
      <rect x="1" y="1" width="214" height="102" rx="7" fill={`url(#${id}-ledger)`} />
      <path d="M16 88h184" stroke={COLOR.lineStrong} strokeWidth=".8" opacity=".42" />
      <circle cx="16" cy="88" r="2" fill={COLOR.accent} opacity=".72" />
      {renderPreview(kind, animate, id, normalizedVariant)}
    </svg>
  );
}
