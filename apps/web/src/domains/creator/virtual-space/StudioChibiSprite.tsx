import type { CSSProperties } from "react";

import "./studio-chibi-sprite.css";

export type StudioChibiDirection = "up" | "down" | "left" | "right";
export type StudioChibiMotion = "idle" | "walk" | "talk" | "draw" | "review";

type StudioChibiPalette = {
  readonly hair: string;
  readonly hairLight: string;
  readonly skin: string;
  readonly outfit: string;
  readonly accent: string;
  readonly eye: string;
  readonly accessory: "ribbon" | "headset" | "cat" | "beret" | "star" | "none";
};

const PALETTES: readonly StudioChibiPalette[] = [
  { hair: "#4a2737", hairLight: "#7b4157", skin: "#ffd9c5", outfit: "#fff4eb", accent: "#ff8ca8", eye: "#684a80", accessory: "ribbon" },
  { hair: "#edf0ff", hairLight: "#ffffff", skin: "#f9d6c7", outfit: "#252839", accent: "#9c8dff", eye: "#7194cc", accessory: "headset" },
  { hair: "#33222d", hairLight: "#6d4250", skin: "#ffd7c0", outfit: "#f5e7da", accent: "#6d79ff", eye: "#65405a", accessory: "none" },
  { hair: "#ff94b7", hairLight: "#ffc0d3", skin: "#ffdac6", outfit: "#332b4d", accent: "#ff6f9a", eye: "#8f4d78", accessory: "cat" },
  { hair: "#7b5ac9", hairLight: "#aa8dea", skin: "#f7d3c3", outfit: "#2b2846", accent: "#c995ff", eye: "#7d61be", accessory: "star" },
  { hair: "#2d2c42", hairLight: "#555474", skin: "#fed5bf", outfit: "#f0e8dd", accent: "#67c8ff", eye: "#3d547d", accessory: "beret" },
  { hair: "#77bfe8", hairLight: "#b5e4ff", skin: "#ffd7c7", outfit: "#f7f3ff", accent: "#6e8cff", eye: "#4b77a0", accessory: "ribbon" },
  { hair: "#6d3d35", hairLight: "#a25b4d", skin: "#f8d0b9", outfit: "#2a2936", accent: "#ffb36a", eye: "#79523e", accessory: "headset" },
  { hair: "#e9a6c3", hairLight: "#ffd0e2", skin: "#ffdacb", outfit: "#fff3f8", accent: "#fe7ca6", eye: "#8d6688", accessory: "star" },
  { hair: "#352b38", hairLight: "#6f576d", skin: "#f8cfbb", outfit: "#e9ecff", accent: "#8e9cff", eye: "#655778", accessory: "none" },
  { hair: "#ede4d7", hairLight: "#fffdf7", skin: "#f6d2c0", outfit: "#2f3447", accent: "#6ad5c5", eye: "#62869f", accessory: "cat" },
  { hair: "#5e3d57", hairLight: "#986b8d", skin: "#fed7c5", outfit: "#f0e5ff", accent: "#c078ff", eye: "#79577a", accessory: "beret" },
] as const;

function Accessory({ palette }: { readonly palette: StudioChibiPalette }) {
  if (palette.accessory === "ribbon") {
    return <g className="studio-chibi-accessory"><path d="M19 22 9 16l2 12zM61 22l10-6-2 12z" fill={palette.accent} /></g>;
  }
  if (palette.accessory === "headset") {
    return <g className="studio-chibi-accessory"><path d="M13 46c0-25 54-25 54 0" fill="none" stroke={palette.accent} strokeWidth="5" strokeLinecap="round" /><rect x="9" y="44" width="9" height="16" rx="4" fill={palette.accent}/><rect x="62" y="44" width="9" height="16" rx="4" fill={palette.accent}/></g>;
  }
  if (palette.accessory === "cat") {
    return <g className="studio-chibi-accessory"><path d="M22 25 14 7 33 20zM58 25 66 7 47 20z" fill={palette.hair}/><path d="m21 19-4-8 10 7zm38 0 4-8-10 7z" fill={palette.accent}/></g>;
  }
  if (palette.accessory === "beret") {
    return <g className="studio-chibi-accessory"><ellipse cx="40" cy="16" rx="22" ry="9" fill={palette.accent}/><rect x="38" y="7" width="4" height="8" rx="2" fill={palette.accent}/></g>;
  }
  if (palette.accessory === "star") {
    return <path className="studio-chibi-accessory" d="m64 21 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill={palette.accent}/>;
  }
  return null;
}

export function StudioChibiSprite({
  variant = 0,
  direction = "down",
  motion = "idle",
  size = 92,
  label,
  online = false,
  className = "",
}: {
  readonly variant?: number;
  readonly direction?: StudioChibiDirection;
  readonly motion?: StudioChibiMotion;
  readonly size?: number;
  readonly label?: string;
  readonly online?: boolean;
  readonly className?: string;
}) {
  const palette = PALETTES[Math.abs(variant) % PALETTES.length] ?? PALETTES[0];
  const facingAway = direction === "up";
  const flip = direction === "left" ? -1 : 1;
  return (
    <span
      className={"studio-chibi " + className}
      data-motion={motion}
      data-direction={direction}
      style={{ "--studio-chibi-size": `${size}px`, "--studio-chibi-flip": flip } as CSSProperties}
      aria-label={label}
    >
      <svg viewBox="0 0 80 104" aria-hidden="true" focusable="false">
        <ellipse className="studio-chibi-shadow" cx="40" cy="98" rx="22" ry="5" />
        <g className="studio-chibi-body">
          <g className="studio-chibi-legs">
            <path d="M28 78c-2 9-2 14 0 19 4 3 8 3 11 0V79z" fill={palette.outfit}/>
            <path d="M41 79v18c3 3 7 3 11 0 2-5 2-10 0-19z" fill={palette.outfit}/>
            <ellipse cx="31" cy="98" rx="9" ry="4" fill="#272330"/>
            <ellipse cx="49" cy="98" rx="9" ry="4" fill="#272330"/>
          </g>
          <path d="M23 61c2-11 8-17 17-17s15 6 17 17l-4 25H27z" fill={palette.outfit}/>
          <path d="M27 64h26l-2 8H29z" fill={palette.accent} opacity=".75"/>
          <g className="studio-chibi-arm studio-chibi-arm--left"><path d="M26 59c-9 4-12 10-10 17 3 4 7 3 9 0l8-13z" fill={palette.outfit}/><circle cx="18" cy="76" r="4" fill={palette.skin}/></g>
          <g className="studio-chibi-arm studio-chibi-arm--right"><path d="M54 59c9 4 12 10 10 17-3 4-7 3-9 0l-8-13z" fill={palette.outfit}/><circle cx="62" cy="76" r="4" fill={palette.skin}/></g>
          <g className="studio-chibi-head">
            <ellipse cx="40" cy="36" rx="27" ry="29" fill={palette.hair}/>
            <ellipse cx="40" cy="39" rx="22" ry="23" fill={palette.skin}/>
            <path d="M17 34c3-21 43-31 48-3-13-11-29-5-45 7z" fill={palette.hair}/>
            <path d="M20 27c7-12 29-20 43-3-10-5-21-4-31 2-7 4-10 6-12 1z" fill={palette.hairLight} opacity=".5"/>
            {!facingAway ? (
              <>
                <ellipse cx="32" cy="41" rx="3.5" ry="5.2" fill={palette.eye}/>
                <ellipse cx="48" cy="41" rx="3.5" ry="5.2" fill={palette.eye}/>
                <circle cx="33" cy="39" r="1.1" fill="#fff"/>
                <circle cx="49" cy="39" r="1.1" fill="#fff"/>
                <path d="M36 50c3 2 5 2 8 0" fill="none" stroke="#c97978" strokeWidth="1.8" strokeLinecap="round"/>
                <ellipse cx="25" cy="49" rx="4" ry="2" fill="#f399a7" opacity=".4"/>
                <ellipse cx="55" cy="49" rx="4" ry="2" fill="#f399a7" opacity=".4"/>
              </>
            ) : (
              <path d="M24 30c8-15 28-18 36-4l-4 24H24z" fill={palette.hair} opacity=".95"/>
            )}
            <Accessory palette={palette}/>
          </g>
          {motion === "draw" ? <g className="studio-chibi-prop"><rect x="55" y="68" width="3" height="18" rx="1.5" fill="#f6d27a" transform="rotate(24 56 77)"/><path d="m58 67 3-4 1 5z" fill="#2f2b35"/></g> : null}
          {motion === "review" ? <g className="studio-chibi-prop"><rect x="50" y="66" width="16" height="20" rx="3" fill="#f5f2ff" stroke={palette.accent}/><path d="M54 72h8M54 76h8M54 80h5" stroke={palette.accent} strokeWidth="1.5" strokeLinecap="round"/></g> : null}
        </g>
      </svg>
      {label ? <span className="studio-chibi-label">{label}</span> : null}
      {online ? <i className="studio-chibi-online" aria-hidden="true" /> : null}
    </span>
  );
}

