import {
  useId,
  useSyncExternalStore,
  type ReactElement,
  type SVGProps,
} from "react";

/**
 * Small, semantic tool demonstrations used by the Studio's rich hints.
 *
 * Keep this list deliberately finite: every supported kind has a designed
 * preview rather than falling back to an unrelated generic animation.
 */
export type StudioToolHintPreviewKind =
  | "select"
  | "ink"
  | "erase"
  | "fill"
  | "sample"
  | "shape"
  | "text"
  | "bubble"
  | "image"
  | "filter"
  | "lasso"
  | "brush-size"
  | "opacity"
  | "stabilizer"
  | "pressure"
  | "symmetry"
  | "zoom-view"
  | "history"
  | "layer"
  | "timeline"
  | "keyframe"
  | "frame-sequence"
  | "onion-skin"
  | "timelapse"
  | "motion-fx"
  | "video-export"
  | "audio"
  | "object-3d"
  | "pose-3d"
  | "camera-3d"
  | "lighting-3d";

export type StudioToolHintPreviewProps = Omit<
  SVGProps<SVGSVGElement>,
  "children" | "viewBox"
> & {
  kind: StudioToolHintPreviewKind;
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

function FilterPreview({ animate, clipId }: { animate: boolean; clipId: string }): ReactElement {
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

function StabilizerPreview({ animate }: { animate: boolean }): ReactElement {
  const smoothPath = "M43 69c18-30 36-29 53-6 18 25 38 20 52-6 9-17 18-21 28-20";

  return (
    <>
      <path
        d="M42 72c8-37 19 2 29-29 9 42 19-11 29 25 10-30 19 4 29-22 8 38 20-14 48-11"
        fill="none"
        stroke={COLOR.fg3}
        strokeDasharray="3 4"
        strokeLinecap="round"
        strokeWidth="1.5"
        opacity=".68"
      />
      <path
        d={smoothPath}
        fill="none"
        stroke={COLOR.accent}
        strokeDasharray="190"
        strokeDashoffset={animate ? "190" : "0"}
        strokeLinecap="round"
        strokeWidth="4"
      >
        {animate ? (
          <animate attributeName="stroke-dashoffset" dur="2.9s" values="190;0;0" keyTimes="0;.72;1" repeatCount="indefinite" />
        ) : null}
      </path>
      {[43, 96, 148, 176].map((cx, index) => (
        <circle key={cx} cx={cx} cy={[69, 63, 57, 37][index]} r="3" fill={COLOR.card} stroke={COLOR.fg2} strokeWidth="1.5" />
      ))}
      <g transform={animate ? undefined : "translate(176 37)"}>
        <circle r="8" fill={COLOR.fg} stroke={COLOR.canvas} strokeWidth="2" />
        <circle r="2.5" fill={COLOR.accent} />
        {animate ? (
          <animateMotion dur="2.9s" path={smoothPath} keyPoints="0;1;1" keyTimes="0;.72;1" repeatCount="indefinite" />
        ) : null}
      </g>
    </>
  );
}

function PressurePreview({ animate }: { animate: boolean }): ReactElement {
  return (
    <>
      <path d="M40 67C75 35 119 36 176 61" fill="none" stroke={COLOR.lineStrong} strokeLinecap="round" strokeWidth="1.5" opacity=".5" />
      <path
        d="M40 67C75 35 119 36 176 61"
        fill="none"
        stroke={COLOR.accent}
        strokeLinecap="round"
        strokeWidth={animate ? "2" : "9"}
      >
        {animate ? (
          <animate attributeName="stroke-width" dur="2.6s" values="2;11;5;2" keyTimes="0;.42;.76;1" repeatCount="indefinite" />
        ) : null}
      </path>
      <g transform="translate(105 36)">
        <path d="M-8-16H8L5 5 0 14-5 5Z" fill={COLOR.fg2} stroke={COLOR.canvas} strokeLinejoin="round" strokeWidth="2" />
        <path d="M0 14 5 5H-5Z" fill={COLOR.accent} />
        {animate ? (
          <animateTransform attributeName="transform" additive="sum" type="translate" dur="2.6s" values="0 -5;0 6;0 0;0 -5" keyTimes="0;.42;.76;1" repeatCount="indefinite" />
        ) : null}
      </g>
      <path d="M63 82h98" stroke={COLOR.fg3} strokeLinecap="round" strokeWidth="2" />
      {[73, 105, 151].map((cx, index) => (
        <circle key={cx} cx={cx} cy="82" r={2 + index * 1.5} fill={index === 1 ? COLOR.accent : COLOR.fg2} />
      ))}
    </>
  );
}

function SymmetryPreview({ animate }: { animate: boolean }): ReactElement {
  const leftPath = "M99 25c-23 8-35 27-30 50 10-8 19-9 30-5";
  const rightPath = "M117 25c23 8 35 27 30 50-10-8-19-9-30-5";

  return (
    <>
      <path d="M108 17v70" stroke={COLOR.cool} strokeDasharray="3 4" strokeWidth="1.5" />
      <path d={leftPath} fill="none" stroke={COLOR.accent} strokeDasharray="95" strokeDashoffset={animate ? "95" : "0"} strokeLinecap="round" strokeWidth="4">
        {animate ? <animate attributeName="stroke-dashoffset" dur="2.7s" values="95;0;0" keyTimes="0;.65;1" repeatCount="indefinite" /> : null}
      </path>
      <path d={rightPath} fill="none" stroke={COLOR.accent} strokeDasharray="95" strokeDashoffset={animate ? "95" : "0"} strokeLinecap="round" strokeWidth="4" opacity=".72">
        {animate ? <animate attributeName="stroke-dashoffset" dur="2.7s" values="95;0;0" keyTimes="0;.65;1" repeatCount="indefinite" /> : null}
      </path>
      <circle cx="108" cy="17" r="4" fill={COLOR.card} stroke={COLOR.cool} strokeWidth="2" />
      <path d="m84 79 9 7M132 86l9-7" stroke={COLOR.fg2} strokeLinecap="round" strokeWidth="2" />
    </>
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

function OnionSkinPreview({ animate }: { animate: boolean }): ReactElement {
  const figures = [
    { x: 79, color: "var(--color-danger, oklch(0.68 0.2 25))", opacity: ".42", angle: -14 },
    { x: 108, color: COLOR.fg, opacity: ".95", angle: 0 },
    { x: 137, color: COLOR.cool, opacity: ".42", angle: 14 },
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
      <path d="M49 89h118" stroke={COLOR.lineStrong} strokeDasharray="4 4" />
      <g transform={animate ? undefined : "translate(108 88)"}>
        <circle r="5" fill={COLOR.accent} />
        {animate ? <animateMotion dur="2.4s" path="M79 88h58H79" repeatCount="indefinite" /> : null}
      </g>
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

function renderPreview(
  kind: StudioToolHintPreviewKind,
  animate: boolean,
  id: string
): ReactElement {
  switch (kind) {
    case "select":
      return <SelectionPreview animate={animate} />;
    case "ink":
      return <InkPreview animate={animate} />;
    case "erase":
      return <ErasePreview animate={animate} />;
    case "fill":
      return <FillPreview animate={animate} />;
    case "sample":
      return <SamplePreview animate={animate} />;
    case "shape":
      return <ShapePreview animate={animate} />;
    case "text":
      return <TextPreview animate={animate} clipId={`${id}-text-clip`} />;
    case "bubble":
      return <BubblePreview animate={animate} />;
    case "image":
      return <ImagePreview animate={animate} />;
    case "filter":
      return <FilterPreview animate={animate} clipId={`${id}-filter-clip`} />;
    case "lasso":
      return <LassoPreview animate={animate} />;
    case "brush-size":
      return <BrushSizePreview animate={animate} />;
    case "opacity":
      return <OpacityPreview animate={animate} patternId={`${id}-opacity-checker`} />;
    case "stabilizer":
      return <StabilizerPreview animate={animate} />;
    case "pressure":
      return <PressurePreview animate={animate} />;
    case "symmetry":
      return <SymmetryPreview animate={animate} />;
    case "zoom-view":
      return <ZoomViewPreview animate={animate} />;
    case "history":
      return <HistoryPreview animate={animate} />;
    case "layer":
      return <LayerPreview animate={animate} />;
    case "timeline":
      return <TimelinePreview animate={animate} />;
    case "keyframe":
      return <KeyframePreview animate={animate} />;
    case "frame-sequence":
      return <FrameSequencePreview animate={animate} />;
    case "onion-skin":
      return <OnionSkinPreview animate={animate} />;
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
    case "pose-3d":
      return <Pose3dPreview animate={animate} />;
    case "camera-3d":
      return <Camera3dPreview animate={animate} />;
    case "lighting-3d":
      return <Lighting3dPreview animate={animate} />;
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

  return (
    <svg
      {...svgProps}
      data-studio-tool-hint-preview={kind}
      data-preview-kind={kind}
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
      {renderPreview(kind, animate, id)}
    </svg>
  );
}
