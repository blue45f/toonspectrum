import { formatI18nTemplate, translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { useId } from "react";
import type { FortuneSceneTheme } from "./fortune-cinematic-model";

const INKS: Record<FortuneSceneTheme, [string, string, string]> = {
  violet: ["#30244e", "#a98be9", "#f1d49c"],
  rose: ["#422339", "#e5a2b6", "#f7dab0"],
  mint: ["#193d3b", "#88cbbb", "#f5daab"],
  gold: ["#39304b", "#b9a4df", "#f7cb7f"],
};

/** Original vector scene. No remote image/font requests or third-party character artwork. */
export function FortuneSceneArt({ theme = "violet", closeup = false }: { theme?: FortuneSceneTheme; closeup?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const [night, light, gold] = INKS[theme];
  return <svg className="fo-scene-art" viewBox={closeup ? "60 25 360 300" : "0 0 480 360"} aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={formatI18nTemplate(translateCurrentStaticSourceText("domains.fortune.FortuneSceneArt", "en", "{v0}-sky"), { v0: String(uid) })}><stop stopColor={light} stopOpacity=".35" /><stop offset="1" stopColor={night} /></radialGradient>
      <linearGradient id={formatI18nTemplate(translateCurrentStaticSourceText("domains.fortune.FortuneSceneArt", "en", "{v0}-paper"), { v0: String(uid) })} x2="0" y2="1"><stop stopColor="#fff1d8" /><stop offset="1" stopColor="#d8bfaa" /></linearGradient>
      <pattern id={formatI18nTemplate(translateCurrentStaticSourceText("domains.fortune.FortuneSceneArt", "en", "{v0}-dots"), { v0: String(uid) })} width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill={light} opacity=".18" /></pattern>
    </defs>
    <rect width="480" height="360" fill={night} />
    <rect width="480" height="360" fill={formatI18nTemplate(translateCurrentStaticSourceText("domains.fortune.FortuneSceneArt", "en", "url(#{v0}-sky)"), { v0: String(uid) })} />
    <rect width="480" height="360" fill={formatI18nTemplate(translateCurrentStaticSourceText("domains.fortune.FortuneSceneArt", "en", "url(#{v0}-dots)"), { v0: String(uid) })} />
    <g fill="none" stroke={light} strokeWidth="1.2" opacity=".5">
      <path d="M84 270V144a156 156 0 0 1 312 0v126M105 270V145a135 135 0 0 1 270 0v125M240 15v198M104 143h272M115 91h250" />
      <circle cx="241" cy="137" r="87" /><ellipse cx="241" cy="137" rx="117" ry="43" transform="rotate(-28 241 137)" />
      <path d="m0 64 80 16m-69 49 58-4M409 80l71-19m-65 72 65 1M25 226l68-30m300 0 70 30" />
    </g>
    <g fill={gold}>
      <path d="M286 39a50 50 0 1 0 32 79 42 42 0 0 1-32-79Z" />
      <circle cx="166" cy="94" r="3" /><circle cx="333" cy="166" r="2" /><circle cx="134" cy="179" r="2" />
      {[[68,48],[385,53],[188,35],[346,222],[54,186],[226,107],[412,192]].map(([x,y]) => <path key={`${x}-${y}`} d={`M${x} ${y-7}q0 7 7 7-7 0-7 7 0-7-7-7 7 0 7-7Z`} />)}
    </g>
    <g stroke="#141326" strokeWidth="3" strokeLinejoin="round">
      <path d="M12 301q216-55 456 0l-16 59H24Z" fill="#211c35" />
      <path d="M16 301q208-48 448 0" fill="none" stroke={light} strokeWidth="2" />
      <ellipse cx="247" cy="298" rx="139" ry="21" fill="#0e1020" stroke="none" opacity=".45" />
      <path d="M180 274q-10-17 0-32-12-19 6-29l-2-43 33 23q20-7 40 0l32-25-1 46q15 11 10 31 9 21-8 34Z" fill="#d4c8e9" />
      <path d="m189 180 18 17-17 5Zm91 0-17 17 15 5Z" fill="#a58cbe" stroke="none" />
      <path d="M204 222q8-10 15 0m32 0q8-10 15 0" fill="none" />
      <path d="m233 232 5 4 5-4m-5 4v5m0-1q-9 8-15 0m15 0q9 8 15 0" fill="none" strokeWidth="2" />
      <path d="m211 236-20-2m20 8-22 3m74-11 20-2m-20 10 22 4" fill="none" strokeWidth="1.5" />
      <path d="m179 257 60 15 60-16-8 25-53 7-50-7Z" fill={light} />
      <circle cx="240" cy="275" r="8" fill={gold} /><path d="m240 268 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#6b506c" stroke="none" />
      <path d="M151 281q47-14 89 10 49-25 91-11l-14 53q-34-13-77 1-40-13-78 0Z" fill={formatI18nTemplate(translateCurrentStaticSourceText("domains.fortune.FortuneSceneArt", "en", "url(#{v0}-paper)"), { v0: String(uid) })} />
      <path d="m240 292 0 41m-78-43q36-6 66 8m-63 1q32-6 61 7m-58 3q31-5 57 6m29-17q30-13 64-9m-64 17q29-12 62-9m-61 18q28-11 58-8" fill="none" stroke="#78658a" strokeWidth="1.5" />
      <path d="M99 304h31l-3-25h-24Z" fill={light} /><path d="m114 280 16-74q24 11 7 35-7 10-15 17m-7 17 27-54" fill={gold} strokeWidth="2" />
      <path d="m355 265 31 3-9 35-31-3Z" fill="#6f5988" /><path d="m362 276 13 1-2 14-13-1Z" fill="none" stroke={gold} strokeWidth="1.5" />
    </g>
    <g fill={gold} opacity=".7"><circle cx="218" cy="161" r="2" /><circle cx="314" cy="199" r="2" /><circle cx="174" cy="155" r="1.5" /></g>
  </svg>;
}
