import { useId, type ReactNode } from "react";

import type { StudioExpressionPreset } from "../studio-pose-presets";
import type { ScenePropDef } from "./studio-vrm-procedural-scene-props";

type PreviewFrameProps = {
  readonly label: string;
  readonly className: string;
  readonly children: ReactNode;
};

function PreviewFrame({ label, className, children }: PreviewFrameProps) {
  const gradientId = `vrm-semantic-${useId().replaceAll(":", "")}`;
  return (
    <svg role="img" aria-label={label} className={`${className} shrink-0`} viewBox="0 0 96 96">
      <title>{label}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-card, #fffaf5)" />
          <stop offset="1" stopColor="var(--color-panel, #eadfd5)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="92" height="92" rx="20" fill={`url(#${gradientId})`} />
      <ellipse cx="48" cy="83" rx="28" ry="5" fill="var(--color-line, #705f55)" opacity="0.12" />
      {children}
    </svg>
  );
}

function ExpressionEye({ cx, cy, closed, dx, dy }: { readonly cx: number; readonly cy: number; readonly closed: boolean; readonly dx: number; readonly dy: number }) {
  if (closed) return <path d={`M${cx - 7} ${cy}q7 6 14 0`} fill="none" stroke="#493934" strokeWidth="2.3" strokeLinecap="round" />;
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx="7" ry="5.8" fill="#fff" stroke="#493934" strokeWidth="1.8" />
      <circle cx={cx + dx} cy={cy + dy} r="2.4" fill="#493934" />
      <circle cx={cx + dx - 0.8} cy={cy + dy - 0.8} r="0.7" fill="#fff" />
    </g>
  );
}

export function StudioVrmExpressionPresetVisual({ preset, className = "size-8" }: { readonly preset: StudioExpressionPreset; readonly className?: string }) {
  const weights = preset.weights;
  const happy = weights.happy ?? 0;
  const sad = weights.sad ?? 0;
  const angry = weights.angry ?? 0;
  const surprised = weights.surprised ?? 0;
  const blink = weights.blink ?? 0;
  const leftClosed = blink > 0.55 || (weights.blinkLeft ?? 0) > 0.55;
  const rightClosed = blink > 0.55 || (weights.blinkRight ?? 0) > 0.55;
  const gazeX = ((weights.lookRight ?? 0) - (weights.lookLeft ?? 0)) * 3;
  const gazeY = ((weights.lookDown ?? 0) - (weights.lookUp ?? 0)) * 2.5;
  const mouthOpen = Math.max(weights.aa ?? 0, weights.oh ?? 0, weights.ou ?? 0);
  const cheeks = preset.id.includes("shy") || preset.id.includes("love") || preset.id.includes("innocent");
  const tears = preset.id.includes("tear") || preset.id.includes("cry");
  const mouthPath = surprised > 0.55 || mouthOpen > 0.55 ? null : happy > sad ? "M37 62q11 10 22 0" : sad > happy ? "M38 68q10-8 20 0" : "M40 64q8 2 16 0";
  const browY = 35 + sad * 2 - angry * 2;
  return (
    <PreviewFrame label={`${preset.label} 표정 미리보기`} className={className}>
      <g>
        <circle cx="48" cy="49" r="31" fill="#f0c8b2" stroke="#9f7567" strokeWidth="1.7" />
        <path d="M20 43c1-25 16-34 30-33 17 1 28 11 27 34-6-11-13-15-19-17-9 8-20 11-38 16Z" fill="#4b3633" />
        <path d={`M29 ${browY}q7 ${angry > sad ? -4 : 3} 14 0M53 ${browY}q7 ${angry > sad ? 4 : -3} 14 0`} fill="none" stroke="#5b4039" strokeWidth="2.2" strokeLinecap="round" />
        <ExpressionEye cx={36} cy={47} closed={leftClosed} dx={gazeX} dy={gazeY} />
        <ExpressionEye cx={60} cy={47} closed={rightClosed} dx={gazeX} dy={gazeY} />
        {mouthPath ? <path d={mouthPath} fill="none" stroke="#9d5e5b" strokeWidth="2.4" strokeLinecap="round" /> : <ellipse cx="48" cy="65" rx={5 + mouthOpen * 3} ry={3 + mouthOpen * 5} fill="#7a4849" stroke="#9d5e5b" strokeWidth="1.5" />}
        {cheeks ? <><ellipse cx="28" cy="59" rx="6" ry="3" fill="#e99696" opacity="0.5" /><ellipse cx="68" cy="59" rx="6" ry="3" fill="#e99696" opacity="0.5" /></> : null}
        {tears ? <><path d="M27 53c-4 7-5 10 0 12 5-2 4-6 0-12Z" fill="#79bfe8" /><path d="M69 53c-4 7-5 10 0 12 5-2 4-6 0-12Z" fill="#79bfe8" /></> : null}
      </g>
    </PreviewFrame>
  );
}

const animalColors: Record<string, string> = {
  cat: "#a78372", dog: "#a56f4f", bunny: "#d7c6bd", bird: "#6ea7c7", fox: "#c76c39", bear: "#7c5d4d", chick: "#f0c64c", fish: "#6aa8ce",
  penguin: "#3e4651", dragon: "#5f9670", unicorn: "#d7b5dc", owl: "#8c6f55", butterfly: "#b37ed0", deer: "#a97858", wolf: "#6d747b", turtle: "#6b9562",
};

function AnimalVisual({ id }: { readonly id: string }) {
  const color = animalColors[id] ?? "#8f786d";
  if (id === "fish") return <g stroke="#50606a" strokeWidth="2"><path d="M24 51c13-15 37-15 50 0-13 15-37 15-50 0Z" fill={color} /><path d="m72 51 15-12v24L72 51Z" fill={color} /><circle cx="39" cy="47" r="2.3" fill="#263238" /></g>;
  if (id === "butterfly") return <g stroke="#76506b" strokeWidth="2"><path d="M47 49C35 25 18 28 24 47c3 9 12 11 23 7Z" fill="#c98bda" /><path d="M49 49c12-24 29-21 23-2-3 9-12 11-23 7Z" fill="#8bb8e7" /><path d="M48 44v24M45 43l-7-9m13 9 7-9" fill="none" /></g>;
  if (id === "turtle") return <g stroke="#4e6c4c" strokeWidth="2"><ellipse cx="48" cy="56" rx="25" ry="17" fill={color} /><path d="M35 44 48 56l13-12M32 60l16-4 17 5M48 40v32" fill="none" opacity="0.45" /><circle cx="76" cy="54" r="7" fill="#7aa36f" /></g>;
  const longEars = id === "bunny";
  const roundEars = ["bear", "panda", "lion"].includes(id);
  const pointedEars = ["cat", "fox", "wolf"].includes(id);
  const horned = ["unicorn", "dragon", "deer"].includes(id);
  return (
    <g stroke="#5d4b45" strokeWidth="1.8" strokeLinejoin="round">
      <ellipse cx="48" cy="61" rx="24" ry="18" fill={color} /><circle cx="48" cy="38" r="18" fill={color} />
      {longEars ? <><path d="M35 25c-6-22 8-26 9-3l-2 6Z" fill={color} /><path d="M54 28c1-26 15-21 8 1Z" fill={color} /></> : null}
      {roundEars ? <><circle cx="34" cy="25" r="7" fill={color} /><circle cx="62" cy="25" r="7" fill={color} /></> : null}
      {pointedEars ? <><path d="m31 28 3-16 11 13Z" fill={color} /><path d="m65 28-3-16-11 13Z" fill={color} /></> : null}
      {horned ? <path d="M48 20 55 7l2 17" fill={id === "dragon" ? color : "#efe0bd"} /> : null}
      {id === "penguin" ? <ellipse cx="48" cy="61" rx="13" ry="15" fill="#f6f2e9" stroke="none" /> : null}
      <circle cx="41" cy="37" r="2" fill="#2e2725" /><circle cx="55" cy="37" r="2" fill="#2e2725" /><path d="M45 45q3 3 6 0" fill="none" strokeLinecap="round" />
    </g>
  );
}

function ItemVisual({ id }: { readonly id: string }) {
  const stroke = "#62534c";
  if (["sword", "staff", "wand", "hammer"].includes(id)) return <g stroke={stroke} strokeWidth="2"><path d={id === "hammer" ? "M48 18h29v17H48Z" : "m65 16-9 49-8 8 2-12 15-45Z"} fill={id === "staff" || id === "wand" ? "#8b6b4d" : "#cbd5df"} /><path d="M48 60 31 79" fill="none" strokeWidth="5" strokeLinecap="round" /></g>;
  if (id === "shield") return <path d="M48 15 74 26v21c0 18-11 29-26 36-15-7-26-18-26-36V26l26-11Z" fill="#8fa6bd" stroke={stroke} strokeWidth="2.5" />;
  if (["book", "scroll"].includes(id)) return <g stroke={stroke} strokeWidth="2"><path d="M20 26h28c7 0 12 4 12 10v42H32c-7 0-12-4-12-10V26Z" fill="#efe0bf" /><path d="M76 26H48v52h16c7 0 12-4 12-10V26Z" fill="#f6ead2" /></g>;
  if (id === "flower") return <g stroke={stroke} strokeWidth="1.6"><path d="M49 42v38" /><circle cx="48" cy="34" r="8" fill="#d86878" /><circle cx="39" cy="39" r="8" fill="#e88791" /><circle cx="57" cy="39" r="8" fill="#e88791" /><circle cx="48" cy="46" r="8" fill="#d86878" /></g>;
  if (["gem", "crystal", "ring"].includes(id)) return <g stroke={stroke} strokeWidth="2"><path d="M48 18 70 36 61 70 48 82 35 70 26 36 48 18Z" fill="#77c2d8" />{id === "ring" ? <ellipse cx="48" cy="72" rx="18" ry="10" fill="none" stroke="#d2a447" strokeWidth="6" /> : null}</g>;
  if (["lantern", "candle"].includes(id)) return <g stroke={stroke} strokeWidth="2"><rect x="34" y="35" width="28" height="38" rx="5" fill="#b76e4c" /><path d="M38 35c0-18 20-18 20 0" fill="none" strokeWidth="3" /><path d="M48 39c11 12 1 21-5 12-4-6 2-10 5-12Z" fill="#f3b547" /></g>;
  if (id === "crown") return <path d="m19 37 14 11 15-28 15 28 14-11-5 34H24l-5-34Z" fill="#e4bb4f" stroke={stroke} strokeWidth="2" />;
  if (id === "mask") return <g stroke={stroke} strokeWidth="2"><ellipse cx="48" cy="43" rx="24" ry="27" fill="#d8d0c8" /><ellipse cx="48" cy="43" rx="17" ry="20" fill="#faf7f3" /></g>;
  if (id === "potion") return <g stroke={stroke} strokeWidth="2"><path d="M40 25h16v17l8 15c5 10-1 20-12 20h-8c-11 0-17-10-12-20l8-15V25Z" fill="#8fd0bd" /><path d="M39 25h18" strokeWidth="5" /></g>;
  if (id === "guitar") return <g stroke={stroke} strokeWidth="2"><ellipse cx="39" cy="60" rx="18" ry="20" fill="#b8794c" /><ellipse cx="53" cy="46" rx="14" ry="16" fill="#c88a58" /><path d="M55 38 72 17" strokeWidth="7" /></g>;
  if (id === "umbrella") return <g stroke={stroke} strokeWidth="2"><path d="M19 46c7-27 51-27 58 0-10-5-19-5-29 0-10-5-19-5-29 0Z" fill="#8fb5d2" /><path d="M48 45v29c0 10 12 10 12 1" fill="none" strokeWidth="4" /></g>;
  if (id === "bowWeapon") return <g fill="none" stroke={stroke} strokeWidth="3"><path d="M29 18c23 10 23 50 0 60M29 18l42 30-42 30M71 48H32" /></g>;
  if (id === "balloon") return <g stroke={stroke} strokeWidth="1.8"><ellipse cx="48" cy="37" rx="19" ry="25" fill="#e2858c" /><path d="M48 62v20" /></g>;
  if (id === "heartProp") return <path d="M48 78 19 49c-18-19 9-41 29-19 20-22 47 0 29 19L48 78Z" fill="#dd6f83" stroke={stroke} strokeWidth="2" />;
  if (id === "moon") return <path d="M64 17c-21 3-32 20-27 38 5 17 22 27 40 20-11 13-32 16-47 5-18-13-22-38-9-56 10-14 28-20 43-7Z" fill="#e2ca70" stroke={stroke} strokeWidth="2" />;
  if (id === "sun") return <g stroke="#c38d35" strokeWidth="3"><circle cx="48" cy="48" r="19" fill="#efc657" /><path d="M48 13v10M48 73v10M13 48h10M73 48h10M23 23l7 7m36 36 7 7m0-50-7 7M30 66l-7 7" /></g>;
  return <rect x="25" y="24" width="46" height="52" rx="12" fill="#a78d7c" />;
}

function EffectVisual({ id }: { readonly id: string }) {
  if (id === "cloud") return <g fill="#dce7ef" stroke="#73828d" strokeWidth="1.8"><circle cx="31" cy="55" r="13" /><circle cx="45" cy="45" r="18" /><circle cx="61" cy="53" r="15" /></g>;
  if (id === "fire") return <path d="M49 14c12 17 20 24 17 42-2 15-11 25-19 26-13 1-25-9-24-25 1-12 9-20 17-29 0 12 5 15 9 18 5-8 7-19 0-32Z" fill="#ef7f42" stroke="#9f4f31" strokeWidth="2" />;
  if (id === "lightning") return <path d="m55 13-29 44h19l-5 27 31-45H51l4-26Z" fill="#efc54f" stroke="#9f7a2c" strokeWidth="2" />;
  if (id === "rainbow") return <g fill="none" strokeWidth="7"><path d="M17 68a31 31 0 0 1 62 0" stroke="#d46b6b" /><path d="M24 68a24 24 0 0 1 48 0" stroke="#e6a84d" /><path d="M31 68a17 17 0 0 1 34 0" stroke="#6fa37b" /></g>;
  if (id === "bubbles") return <g fill="#cce8ef" fillOpacity="0.6" stroke="#68a9ba" strokeWidth="1.6"><circle cx="31" cy="60" r="13" /><circle cx="58" cy="50" r="17" /><circle cx="68" cy="26" r="8" /></g>;
  if (id === "snowflake") return <g stroke="#70a7cb" strokeWidth="3"><path d="M48 15v66M19 32l58 32M19 64l58-32" /></g>;
  if (id === "leaves") return <g fill="#7da36c" stroke="#5f7b56" strokeWidth="1.5"><path d="M27 62c-9-21 10-27 20-10-4 13-10 17-20 10Z" /><path d="M56 43c-2-22 18-23 21-4-8 10-14 11-21 4Z" /></g>;
  if (id === "feather") return <path d="M66 18c15 21 3 46-28 56 10-13 7-23 9-34 2-10 7-18 19-22Z" fill="#e8dfd3" stroke="#8f8175" strokeWidth="1.7" />;
  return <path d="m48 15 8 22 23 2-18 14 6 23-19-13-19 13 6-23-18-14 23-2 8-22Z" fill="#efc65a" stroke="#a8802e" strokeWidth="2" />;
}

export function StudioVrmScenePropVisual({ prop, className = "size-8" }: { readonly prop: ScenePropDef; readonly className?: string }) {
  return (
    <PreviewFrame label={`${prop.label} 3D 오브젝트 미리보기`} className={className}>
      {prop.category === "animal" ? <AnimalVisual id={prop.id} /> : null}
      {prop.category === "item" ? <ItemVisual id={prop.id} /> : null}
      {prop.category === "effect" ? <EffectVisual id={prop.id} /> : null}
    </PreviewFrame>
  );
}
