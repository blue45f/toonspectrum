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
  | "layer";

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
