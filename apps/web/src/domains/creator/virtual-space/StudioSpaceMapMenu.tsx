import { useMemo, useState, type CSSProperties } from "react";
import {
  Archive,
  ArrowRight,
  BookOpen,
  Bot,
  Clapperboard,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Coffee,
  DoorOpen,
  Footprints,
  Gauge,
  Images,
  Map as MapIcon,
  Palette,
  Presentation,
  Rocket,
  SearchCheck,
  Snowflake,
  Sparkles,
  Sun,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_VIRTUAL_SPACE_ZONES,
  type StudioVirtualSpaceZone,
} from "./studio-virtual-space-model";
import {
  STUDIO_AMBIENT_NPC_DEFINITIONS,
  npcRoleLabel,
  type StudioAmbientNpcDefinition,
} from "./studio-virtual-space-npc";
import type { StudioWeatherCondition } from "./studio-virtual-space-weather";
import {
  STUDIO_SPACE_MAP_WEATHER_NAMES,
  countPeersPerZone,
  studioSpaceMapArtForZone,
  studioSpaceMapWeatherOverlay,
  type StudioSpaceMapScene,
} from "./studio-space-map-art";
import "./studio-space-map-menu.css";

export interface StudioSpaceMapMenuPeer {
  readonly x: number;
  readonly y: number;
}

export interface StudioSpaceMapMenuProps {
  /** 표시할 공간 목록. 기본값은 내장 14개 공간. */
  readonly zones?: readonly StudioVirtualSpaceZone[];
  /** 아바타가 현재 있는 공간 id. */
  readonly currentZoneId?: string | null;
  /** 공간별 인원 표시용 피어 위치. */
  readonly peers?: readonly StudioSpaceMapMenuPeer[];
  /** 카드에 얹는 실시간 날씨 연출. null이면 날씨 없음. */
  readonly weather?: StudioWeatherCondition | null;
  /** 상단에 표시할 상주 NPC. 기본값은 내장 4종. 빈 배열이면 숨긴다. */
  readonly npcs?: readonly StudioAmbientNpcDefinition[];
  /** 카드 선택 시 호출. 실제 이동(텔레포트/걷기)은 부모가 연결한다. */
  readonly onTravel: (zoneId: string) => void;
  /** 공간의 목적지 도구를 바로 열 때 호출. 없으면 도구 버튼을 숨긴다. */
  readonly onOpenDestination?: (
    destination: Exclude<StudioVirtualSpaceZone["destination"], "none">,
    zoneId: string,
  ) => void;
  readonly reducedMotion?: boolean;
}

const SCENE_ICONS: Record<StudioSpaceMapScene, LucideIcon> = {
  archive: Archive,
  gallery: Images,
  control: Gauge,
  release: Rocket,
  lab: BookOpen,
  easel: Palette,
  theater: Clapperboard,
  quality: SearchCheck,
  commons: UsersRound,
  cafe: Coffee,
  plaza: Sparkles,
  meeting: Presentation,
  desk: Bot,
  lobby: DoorOpen,
};

const WEATHER_ICONS: Record<StudioWeatherCondition, LucideIcon> = {
  clear: Sun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: Snowflake,
  thunderstorm: CloudLightning,
};

function readReducedMotion(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 네 꼭지 반짝이 별 폴리곤. */
function sparklePoints(cx: number, cy: number, radius: number): string {
  const inner = radius * 0.28;
  return (
    `${cx},${cy - radius} ${cx + inner},${cy - inner} ${cx + radius},${cy} ` +
    `${cx + inner},${cy + inner} ${cx},${cy + radius} ${cx - inner},${cy + inner} ` +
    `${cx - radius},${cy} ${cx - inner},${cy - inner}`
  );
}

const DARK = "rgba(8, 10, 16, 0.55)";
const DARKER = "rgba(8, 10, 16, 0.68)";
const LIGHT = "rgba(255, 255, 255, 0.88)";
const MID = "rgba(255, 255, 255, 0.35)";

/**
 * 공간 분위기 일러스트. 카드 하단에 깔리는 플랫 스타일 SVG 장면이다.
 * 사진 에셋 없이도 각 공간이 "장소"처럼 느껴지도록 실루엣으로 그린다.
 */
function SpaceMapSceneArt({ scene, accent }: { readonly scene: StudioSpaceMapScene; readonly accent: string }) {
  const art = (() => {
    switch (scene) {
      case "archive":
        return (
          <g>
            <rect x="40" y="72" width="52" height="34" rx="3" fill={DARK} />
            <rect x="104" y="64" width="58" height="42" rx="3" fill={DARK} />
            <rect x="72" y="34" width="48" height="34" rx="3" fill={DARKER} />
            <rect x="62" y="72" width="8" height="34" fill={MID} />
            <rect x="128" y="64" width="8" height="42" fill={MID} />
            <rect x="48" y="82" width="20" height="6" rx="2" fill={LIGHT} opacity="0.5" />
            <rect x="112" y="76" width="22" height="6" rx="2" fill={LIGHT} opacity="0.5" />
          </g>
        );
      case "gallery":
        return (
          <g>
            <rect x="22" y="40" width="42" height="54" rx="2" fill={DARK} />
            <rect x="28" y="46" width="30" height="42" fill={accent} opacity="0.28" />
            <path d="M28 78 L38 62 L46 70 L52 60 L58 78 Z" fill={LIGHT} opacity="0.7" />
            <rect x="76" y="28" width="58" height="72" rx="2" fill={DARK} />
            <rect x="82" y="34" width="46" height="60" fill={accent} opacity="0.22" />
            <circle cx="118" cy="46" r="6" fill={LIGHT} opacity="0.8" />
            <path d="M82 84 L100 62 L112 74 L120 66 L128 84 Z" fill={LIGHT} opacity="0.6" />
            <rect x="146" y="44" width="36" height="48" rx="2" fill={DARK} />
            <rect x="151" y="49" width="26" height="38" fill={accent} opacity="0.2" />
          </g>
        );
      case "control":
        return (
          <g>
            <rect x="35" y="30" width="130" height="66" rx="8" fill={DARK} />
            <rect x="45" y="72" width="14" height="14" rx="2" fill={accent} opacity="0.85" />
            <rect x="63" y="64" width="14" height="22" rx="2" fill={accent} opacity="0.6" />
            <rect x="81" y="70" width="14" height="16" rx="2" fill={accent} opacity="0.4" />
            <polyline
              points="45,52 62,52 70,40 80,58 90,46 102,46 110,52 150,52"
              fill="none"
              stroke={accent}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="150" cy="40" r="4" fill={LIGHT} opacity="0.8" />
          </g>
        );
      case "release":
        return (
          <g>
            <ellipse cx="45" cy="40" rx="16" ry="6" fill={MID} />
            <ellipse cx="60" cy="28" rx="10" ry="4" fill={MID} />
            <polygon points="95,35 148,60 96,54 110,84" fill={LIGHT} opacity="0.92" />
            <line x1="60" y1="66" x2="86" y2="60" stroke={MID} strokeWidth="3" strokeLinecap="round" />
            <line x1="52" y1="80" x2="82" y2="74" stroke={MID} strokeWidth="3" strokeLinecap="round" />
            <path d="M162 96 L162 52 M152 62 L162 52 L172 62" stroke={accent} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      case "lab":
        return (
          <g>
            <path
              d="M100 62 C85 54 65 54 50 60 L50 96 C65 90 85 90 100 98 C115 90 135 90 150 96 L150 60 C135 54 115 54 100 62 Z"
              fill={DARK}
            />
            <line x1="100" y1="62" x2="100" y2="98" stroke={LIGHT} strokeWidth="2" opacity="0.5" />
            <polygon points={sparklePoints(58, 34, 9)} fill={accent} opacity="0.9" />
            <polygon points={sparklePoints(148, 30, 7)} fill={LIGHT} opacity="0.85" />
            <polygon points={sparklePoints(168, 62, 6)} fill={accent} opacity="0.7" />
          </g>
        );
      case "easel": {
        return (
          <g>
            <circle cx="162" cy="28" r="14" fill={accent} opacity="0.9" />
            <g stroke={accent} strokeWidth="3" strokeLinecap="round" opacity="0.7">
              <line x1="162" y1="6" x2="162" y2="12" />
              <line x1="140" y1="28" x2="146" y2="28" />
              <line x1="178" y1="28" x2="184" y2="28" />
              <line x1="146" y1="12" x2="150" y2="16" />
              <line x1="178" y1="12" x2="174" y2="16" />
            </g>
            <g stroke={DARKER} strokeWidth="5" strokeLinecap="round">
              <line x1="90" y1="82" x2="70" y2="112" />
              <line x1="118" y1="82" x2="138" y2="112" />
              <line x1="104" y1="82" x2="104" y2="112" />
            </g>
            <g transform="rotate(-4 104 60)">
              <rect x="78" y="36" width="52" height="46" rx="2" fill={LIGHT} opacity="0.94" />
              <circle cx="98" cy="56" r="8" fill={accent} opacity="0.85" />
              <path d="M84 72 L104 64 L124 72" stroke={DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
            </g>
          </g>
        );
      }
      case "theater":
        return (
          <g>
            <polygon points="55,0 85,0 68,88 38,88" fill={LIGHT} opacity="0.16" />
            <polygon points="145,0 115,0 132,88 162,88" fill={LIGHT} opacity="0.16" />
            <rect x="76" y="42" width="48" height="32" rx="3" fill={LIGHT} opacity="0.92" />
            <polygon points="94,50 94,66 108,58" fill={accent} />
            <path d="M45 108 A18 18 0 0 1 81 108 Z" fill={DARK} />
            <path d="M88 108 A18 18 0 0 1 124 108 Z" fill={DARK} />
            <path d="M131 108 A18 18 0 0 1 167 108 Z" fill={DARK} />
          </g>
        );
      case "quality":
        return (
          <g>
            <circle cx="88" cy="58" r="26" fill={accent} opacity="0.18" stroke={LIGHT} strokeWidth="7" />
            <line x1="107" y1="77" x2="132" y2="102" stroke={LIGHT} strokeWidth="9" strokeLinecap="round" />
            <path d="M76 58 l9 9 l17 -19" stroke={accent} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <polygon points={sparklePoints(140, 34, 7)} fill={LIGHT} opacity="0.8" />
          </g>
        );
      case "commons":
        return (
          <g>
            <circle cx="68" cy="54" r="12" fill={DARK} />
            <ellipse cx="68" cy="90" rx="20" ry="16" fill={DARK} />
            <circle cx="104" cy="46" r="14" fill={DARKER} />
            <ellipse cx="104" cy="88" rx="23" ry="18" fill={DARKER} />
            <circle cx="140" cy="54" r="12" fill={DARK} />
            <ellipse cx="140" cy="90" rx="20" ry="16" fill={DARK} />
            <polygon points={sparklePoints(104, 20, 7)} fill={accent} opacity="0.9" />
          </g>
        );
      case "cafe":
        return (
          <g>
            <path
              d="M158 22 A13 13 0 1 0 158 48 A10 10 0 1 1 158 22 Z"
              fill={LIGHT}
              opacity="0.75"
            />
            <rect x="66" y="62" width="56" height="42" rx="10" fill={DARK} />
            <path d="M122 70 C136 70 136 92 122 92" stroke={DARK} strokeWidth="7" fill="none" strokeLinecap="round" />
            <ellipse cx="94" cy="62" rx="28" ry="7" fill={accent} opacity="0.85" />
            <path d="M84 50 C80 42 88 38 84 30" stroke={MID} strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M102 50 C98 42 106 38 102 30" stroke={MID} strokeWidth="4" fill="none" strokeLinecap="round" />
          </g>
        );
      case "plaza":
        return (
          <g>
            <g fill="none" stroke={LIGHT} opacity="0.5" strokeWidth="2">
              <ellipse cx="100" cy="80" rx="72" ry="18" />
              <ellipse cx="100" cy="80" rx="50" ry="12" />
              <ellipse cx="100" cy="80" rx="30" ry="7" />
            </g>
            <ellipse cx="100" cy="80" rx="18" ry="5" fill={accent} opacity="0.9" />
            <polygon points={sparklePoints(100, 38, 11)} fill={accent} opacity="0.9" />
            <polygon points={sparklePoints(64, 30, 6)} fill={LIGHT} opacity="0.7" />
            <polygon points={sparklePoints(138, 32, 6)} fill={LIGHT} opacity="0.7" />
          </g>
        );
      case "meeting":
        return (
          <g>
            <rect x="48" y="58" width="17" height="22" rx="4" fill={DARKER} />
            <rect x="135" y="58" width="17" height="22" rx="4" fill={DARKER} />
            <rect x="76" y="88" width="17" height="20" rx="4" fill={DARKER} />
            <rect x="107" y="88" width="17" height="20" rx="4" fill={DARKER} />
            <ellipse cx="100" cy="72" rx="46" ry="15" fill={DARK} />
            <ellipse cx="100" cy="69" rx="46" ry="15" fill={LIGHT} opacity="0.22" />
            <circle cx="100" cy="69" r="6" fill={accent} opacity="0.9" />
          </g>
        );
      case "desk":
        return (
          <g>
            <line x1="100" y1="46" x2="100" y2="30" stroke={DARKER} strokeWidth="4" strokeLinecap="round" />
            <circle cx="100" cy="26" r="5" fill={accent} />
            <rect x="70" y="46" width="60" height="46" rx="15" fill={DARK} />
            <rect x="60" y="58" width="10" height="22" rx="5" fill={DARKER} />
            <rect x="130" y="58" width="10" height="22" rx="5" fill={DARKER} />
            <circle cx="88" cy="66" r="5.5" fill={accent} />
            <circle cx="112" cy="66" r="5.5" fill={accent} />
            <rect x="90" y="78" width="20" height="4" rx="2" fill={LIGHT} opacity="0.6" />
          </g>
        );
      case "lobby":
        return (
          <g>
            <path d="M68 108 L68 62 A32 32 0 0 1 132 62 L132 108 Z" fill={DARK} />
            <path d="M80 108 L80 66 A20 20 0 0 1 120 66 L120 108 Z" fill={accent} opacity="0.32" />
            <rect x="52" y="106" width="96" height="6" rx="2" fill={DARKER} />
            <line x1="162" y1="108" x2="162" y2="82" stroke={DARKER} strokeWidth="4" strokeLinecap="round" />
            <ellipse cx="152" cy="88" rx="9" ry="5" fill={accent} opacity="0.75" transform="rotate(-30 152 88)" />
            <ellipse cx="172" cy="88" rx="9" ry="5" fill={accent} opacity="0.75" transform="rotate(30 172 88)" />
          </g>
        );
    }
  })();

  return (
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      {art}
    </svg>
  );
}

/**
 * 창작 세계 공간 지도.
 *
 * 14개 공간을 이미지 같은 카드로 보여주는 시각 메뉴다. 각 카드는 그라데이션 +
 * SVG 장면 일러스트 + 실시간 날씨 오버레이로 꾸며지고, 현재 위치·인원 수를
 * 표시하며, 선택하면 `onTravel`로 즉시 이동한다.
 * 상단에는 상주 NPC 4종(모아·린·하루·윤)을 칩으로 보여준다.
 */
export function StudioSpaceMapMenu({
  zones = STUDIO_VIRTUAL_SPACE_ZONES,
  currentZoneId = null,
  peers = [],
  weather = null,
  npcs = STUDIO_AMBIENT_NPC_DEFINITIONS,
  onTravel,
  onOpenDestination,
  reducedMotion: reducedMotionProp,
}: StudioSpaceMapMenuProps) {
  const bt = useBilingual("StudioSpaceMapMenu");
  const [systemReducedMotion] = useState(readReducedMotion);
  const reducedMotion = reducedMotionProp ?? systemReducedMotion;

  const occupancy = useMemo(
    () => countPeersPerZone(zones, peers),
    [zones, peers],
  );
  const weatherOverlay = useMemo(
    () => (weather ? studioSpaceMapWeatherOverlay(weather) : null),
    [weather],
  );
  const WeatherIcon = weather ? WEATHER_ICONS[weather] : null;
  const weatherNames = weather ? STUDIO_SPACE_MAP_WEATHER_NAMES[weather] : null;

  return (
    <section
      className={`studio-space-map vs2-panel${reducedMotion ? " studio-space-map--reduced-motion" : ""}`}
      aria-label={bt("공간 지도", "Space map")}
    >
      <div className="studio-space-map-head">
        <div>
          <h2>
            <MapIcon size={18} aria-hidden="true" /> {bt("공간 지도", "Space map")}
          </h2>
          <p className="mt-1 text-xs text-fg-2">
            {bt(
              "가고 싶은 공간을 골라 바로 이동해요. 카드는 지금 바깥 날씨를 비춰줘요.",
              "Pick a place to travel instantly. Cards reflect the weather outside.",
            )}
          </p>
        </div>
        {weather && WeatherIcon && weatherNames ? (
          <span className="studio-space-map-weather-chip">
            <WeatherIcon size={15} aria-hidden="true" />
            {bt(`바깥 날씨 · ${weatherNames.ko}`, `Outside · ${weatherNames.en}`)}
          </span>
        ) : null}
      </div>

      {npcs.length > 0 ? (
        <div
          className="studio-space-map-npcs"
          aria-label={bt("지금 공간에 있는 NPC", "NPCs in the space now")}
        >
          <Bot size={14} aria-hidden="true" />
          <ul>
            {npcs.map((npc) => {
              const role = npcRoleLabel(npc.role);
              return (
                <li key={npc.id} className="studio-space-map-npc">
                  <span className="studio-space-map-npc-name">
                    {bt(npc.nameKo, npc.nameEn)}
                  </span>
                  <span className="studio-space-map-npc-role">
                    {bt(role.ko, role.en)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <ul className="studio-space-map-grid">
        {zones.map((zone) => {
          const art = studioSpaceMapArtForZone(zone.id);
          const Icon = SCENE_ICONS[art.scene];
          const isCurrent = currentZoneId === zone.id;
          const people = occupancy.get(zone.id) ?? 0;
          const [g1, g2, g3] = art.gradient;
          const cardStyle = {
            "--space-map-gradient": `linear-gradient(180deg, ${g1} 0%, ${g2} 55%, ${g3} 100%)`,
            "--space-map-accent": art.accent,
          } as CSSProperties;

          return (
            <li key={zone.id}>
              <article
                className="studio-space-map-card"
                data-zone={zone.id}
                data-current={isCurrent ? "true" : "false"}
                style={cardStyle}
              >
                <div className="studio-space-map-art" aria-hidden="true">
                  <SpaceMapSceneArt scene={art.scene} accent={art.accent} />
                </div>
                <div className="studio-space-map-vignette" aria-hidden="true" />
                {weatherOverlay ? (
                  <div
                    className="studio-space-map-weather"
                    data-effect={weatherOverlay.effect}
                    aria-hidden="true"
                    style={
                      {
                        "--space-map-weather-tint": weatherOverlay.tint,
                        "--space-map-weather-opacity": weatherOverlay.tintOpacity,
                      } as CSSProperties
                    }
                  />
                ) : null}

                <div className="studio-space-map-content">
                  <div className="studio-space-map-top">
                    <span className="studio-space-map-icon">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    {people > 0 ? (
                      <span className="studio-space-map-occupancy">
                        <UsersRound size={12} aria-hidden="true" />
                        {bt(`${people}명`, `${people}`)}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="studio-space-map-title">{bt(zone.labelKo, zone.labelEn)}</h3>
                  <p className="studio-space-map-desc">{bt(zone.descriptionKo, zone.descriptionEn)}</p>
                  <div className="studio-space-map-badges">
                    {isCurrent ? (
                      <span className="studio-space-map-badge-now">
                        <span className="dot" aria-hidden="true" />
                        {bt("현재 위치", "Here now")}
                      </span>
                    ) : null}
                    {zone.destination !== "none" && onOpenDestination ? (
                      <button
                        type="button"
                        className="studio-space-map-tool"
                        onClick={() => {
                          const dest = zone.destination;
                          if (dest !== "none") {
                            onOpenDestination(dest, zone.id);
                          }
                        }}
                        aria-label={bt(
                          `${zone.labelKo} 도구 바로 열기`,
                          `Open ${zone.labelEn} tool`,
                        )}
                      >
                        <Wrench size={12} aria-hidden="true" />
                        {bt("도구 열기", "Open tool")}
                      </button>
                    ) : null}
                  </div>
                  <span className="studio-space-map-cta" aria-hidden="true">
                    <Footprints size={14} />
                    {bt("이동하기", "Travel")}
                    <ArrowRight size={14} />
                  </span>
                </div>

                <button
                  type="button"
                  className="studio-space-map-travel"
                  onClick={() => onTravel(zone.id)}
                  aria-label={bt(
                    `${zone.labelKo}로 이동${isCurrent ? " (현재 위치)" : ""}`,
                    `Travel to ${zone.labelEn}${isCurrent ? " (current location)" : ""}`,
                  )}
                />
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
