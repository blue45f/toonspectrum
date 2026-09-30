import { useMemo } from "react";
import { Mic, MicOff } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  speakerRingStates,
  type StudioSpeakerLevel,
} from "./studio-virtual-space-collaboration";
import { STUDIO_PROXIMITY_CHAT_RADIUS } from "./studio-virtual-space-proximity";

/** 근접 음성 대상 피어 입력. */
export interface StudioProximityVoicePeerInput {
  readonly sessionId: string;
  readonly displayName: string;
  /** 나와의 거리 (px). */
  readonly distance: number;
}

export interface StudioVirtualSpaceProximityVoiceProps {
  /** 거리 기준 음성 연결 대상 피어들. */
  readonly peers: readonly StudioProximityVoicePeerInput[];
  /** 기존 발화자 링 로직과 연동되는 오디오 레벨 스냅샷. */
  readonly levels: readonly StudioSpeakerLevel[];
  readonly now: number;
  readonly muted: boolean;
  readonly onToggleMute: () => void;
  /** 이 거리(px) 안에 있어야 음성이 연결된다. 기본값은 대화 힌트 반경. */
  readonly voiceRadius?: number;
}

type Bilingual = (ko: string, en: string) => string;

function isConnected(distance: number, radius: number): boolean {
  return Number.isFinite(distance) && distance >= 0 && distance <= radius;
}

/** 발화자 링 스냅샷을 세션별 발화 강도 맵으로 바꾼다. */
function buildSpeakingIntensityMap(
  levels: readonly StudioSpeakerLevel[],
  now: number,
): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const state of speakerRingStates(levels, now)) {
    map.set(state.sessionId, state.intensity);
  }
  return map;
}

/** "동료에게 다가가 보세요" 빈 상태 일러스트 (장식용). */
function EmptyVoiceIllustration() {
  return (
    <svg width="168" height="112" viewBox="0 0 168 112" aria-hidden="true" className="opacity-90">
      <defs>
        <linearGradient id="voice-peer-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id="voice-peer-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <ellipse cx="48" cy="98" rx="26" ry="6" fill="#10b981" opacity="0.15" />
      <ellipse cx="124" cy="98" rx="26" ry="6" fill="#38bdf8" opacity="0.15" />
      {/* 연결 반경 */}
      <circle cx="48" cy="66" r="32" fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="6 5" opacity="0.6" />
      {/* 나 (왼쪽 캐릭터) */}
      <circle cx="48" cy="52" r="11" fill="url(#voice-peer-a)" />
      <rect x="36" y="64" width="24" height="26" rx="10" fill="url(#voice-peer-a)" />
      {/* 말풍선 파동 */}
      <path d="M66 52a8 8 0 0 1 6 8" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <path d="M70 46a14 14 0 0 1 10 13" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      {/* 다가오는 동료 (오른쪽 캐릭터) */}
      <circle cx="124" cy="52" r="11" fill="url(#voice-peer-b)" />
      <rect x="112" y="64" width="24" height="26" rx="10" fill="url(#voice-peer-b)" />
      {/* 다가가는 움직임 화살표 */}
      <path d="M102 78 C 92 80, 88 80, 82 78" fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
      <path d="M78 74l-6 4 6 4" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 주변에 아무도 없을 때의 빈 상태: 일러스트 + 다음 행동 가이드. */
function EmptyVoiceState({ bt, voiceRadius }: { readonly bt: Bilingual; readonly voiceRadius: number }) {
  return (
    <div role="status" className="flex flex-col items-center gap-1.5 py-4 text-center">
      <EmptyVoiceIllustration />
      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {bt("주변에 아무도 없어요.", "Nobody is nearby.")}
      </p>
      <p className="max-w-[280px] text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        {bt(
          "캐릭터를 움직여 동료에게 다가가 보세요. 반경 안에 들어오면 음성이 자동으로 연결돼요.",
          "Move your character closer to a teammate. Voice connects automatically once you're inside the range.",
        )}
      </p>
      <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
        {bt(`연결 반경 ${voiceRadius}px`, `Range ${voiceRadius}px`)}
      </p>
    </div>
  );
}

function VoicePeerRow({
  bt,
  peer,
  connected,
  intensity,
}: {
  readonly bt: Bilingual;
  readonly peer: StudioProximityVoicePeerInput;
  readonly connected: boolean;
  readonly intensity: number;
}) {
  const isSpeaking = connected && intensity > 0;
  return (
    <li
      data-testid={`proximity-voice-peer-${peer.sessionId}`}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2",
        "transition-all motion-reduce:transition-none",
        isSpeaking
          ? "border-emerald-400 bg-emerald-50 shadow-sm shadow-emerald-500/20 dark:border-emerald-600 dark:bg-emerald-950"
          : "border-neutral-200 dark:border-neutral-700",
      )}
      style={isSpeaking ? { boxShadow: `0 0 0 ${1 + intensity * 3}px rgba(16, 185, 129, ${0.25 + intensity * 0.35})` } : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-2.5 w-2.5 shrink-0 rounded-full",
          connected ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600",
          isSpeaking && "animate-pulse motion-reduce:animate-none",
        )}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {peer.displayName}
      </span>
      {isSpeaking ? (
        <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white dark:bg-emerald-500 dark:text-emerald-950">
          {bt("말하는 중", "Speaking")}
        </span>
      ) : null}
      <span
        className={cn(
          "shrink-0 text-xs",
          connected
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-neutral-500 dark:text-neutral-400",
        )}
      >
        {connected
          ? bt("연결됨", "Connected")
          : bt("범위 밖", "Out of range")}
      </span>
    </li>
  );
}

/**
 * 거리 기반 근접 음성 채팅 UI.
 *
 * - 반경 안: "연결됨", 반경 밖: "범위 밖"으로 연결 상태를 표시한다.
 * - 음소거 토글 버튼을 제공한다.
 * - 기존 `speakerRingStates` 로직으로 말하는 사람을 하이라이트한다.
 */
export function StudioVirtualSpaceProximityVoice({
  peers,
  levels,
  now,
  muted,
  onToggleMute,
  voiceRadius = STUDIO_PROXIMITY_CHAT_RADIUS,
}: StudioVirtualSpaceProximityVoiceProps) {
  const bt = useBilingual("StudioVirtualSpaceProximityVoice");

  const speaking = useMemo(() => buildSpeakingIntensityMap(levels, now), [levels, now]);

  const sortedPeers = useMemo(
    () => [...peers].sort((left, right) =>
      left.displayName.localeCompare(right.displayName)
      || left.sessionId.localeCompare(right.sessionId),
    ),
    [peers],
  );

  return (
    <section
      aria-label={bt("근접 음성 채팅", "Proximity voice chat")}
      className={cn(
        "flex w-full flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3",
        "dark:border-neutral-800 dark:bg-neutral-900",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {bt("근접 음성 채팅", "Proximity voice chat")}
        </h2>
        <button
          type="button"
          aria-pressed={muted}
          aria-label={muted
            ? bt("음소거 해제", "Unmute")
            : bt("음소거", "Mute")}
          onClick={onToggleMute}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold",
            "transition-all motion-reduce:transition-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600",
            muted
              ? "bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/25 hover:from-rose-600 hover:to-orange-600"
              : "border border-neutral-300 text-neutral-700 hover:border-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-800",
          )}
        >
          {muted ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
          {muted ? bt("음소거 중", "Muted") : bt("음소거", "Mute")}
        </button>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {bt(
          `가까이 있는 사람과 자동으로 음성이 연결돼요. (연결 반경 ${voiceRadius}px)`,
          `Voice connects automatically with people nearby. (Range ${voiceRadius}px)`,
        )}
      </p>

      {sortedPeers.length === 0 ? (
        <EmptyVoiceState bt={bt} voiceRadius={voiceRadius} />
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label={bt("주변 참가자", "Nearby participants")}>
          {sortedPeers.map((peer) => (
            <VoicePeerRow
              key={peer.sessionId}
              bt={bt}
              peer={peer}
              connected={isConnected(peer.distance, voiceRadius)}
              intensity={speaking.get(peer.sessionId) ?? 0}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
