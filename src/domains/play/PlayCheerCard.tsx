import { usePlatform } from "@heejun/platform-bridge";
import { useFx } from "@toonspectrum/core/fx";
import { Clapperboard, PartyPopper } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  onRewardedAdEvent,
  showRewardedAd,
  useRewardedAd,
} from "@/src/compat/rewarded-ad";

/**
 * 응원 파티클 샤워 — 놀이터 허브의 보상형 광고 옵트인.
 *
 * 광고를 끝까지 보면(`userEarnedReward` 수신 시에만) 화면 전체에 파티클 샤워 + 응원
 * 메시지 + 햅틱 축포를 터뜨린다. 토스에서 provider 가 게시된 경우에만 노출(웹 → 숨김),
 * 노출은 항상 사용자 버튼 탭에서만 일어난다.
 */

const CHEER_MESSAGES = [
  "오늘의 플레이, 이미 만렙이에요! 🏆",
  "당신의 승부사 기질, 캐릭터들이 응원해요! 🔥",
  "연승의 기운이 몰려오고 있어요! ⚡",
  "게임도 정주행도 페이스 조절이 반이에요. 파이팅! 🎮",
] as const;

const SHOWER_CHARS = ["🎉", "✨", "🎊", "⭐", "💖", "🍀"];
const SHOWER_BURSTS = 14;
const SHOWER_INTERVAL_MS = 150;

export function PlayCheerCard() {
  const { available, ready } = useRewardedAd();
  const fx = useFx();
  const platform = usePlatform();
  const pendingRef = useRef(false);
  const showerTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [cheerMsg, setCheerMsg] = useState<string | null>(null);

  // 언마운트 시 예약된 샤워 버스트 정리.
  useEffect(
    () => () => {
      showerTimersRef.current.forEach((t) => clearTimeout(t));
      showerTimersRef.current = [];
    },
    [],
  );

  useEffect(
    () =>
      onRewardedAdEvent((event) => {
        if (!pendingRef.current) return;
        if (event.type === "reward") {
          // 보상(응원 샤워)은 userEarnedReward 수신 시에만.
          setCheerMsg(CHEER_MESSAGES[Math.floor(Math.random() * CHEER_MESSAGES.length)]); // NOSONAR S2245 비암호화(연출)
          fx.sfx("success");
          platform.haptic("confetti");
          const w = globalThis.innerWidth || 360;
          const h = globalThis.innerHeight || 640;
          for (let i = 0; i < SHOWER_BURSTS; i += 1) {
            const timer = setTimeout(() => {
              fx.burst(
                Math.random() * w, // NOSONAR S2245 비암호화(연출)
                Math.random() * h * 0.8, // NOSONAR S2245 비암호화(연출)
                { count: 10, chars: SHOWER_CHARS, spread: 1.0, durationMs: 900 },
              );
            }, i * SHOWER_INTERVAL_MS);
            showerTimersRef.current.push(timer);
          }
        }
        if (event.type === "closed") {
          pendingRef.current = false;
        }
      }),
    [fx, platform],
  );

  const handleWatch = () => {
    if (!ready || pendingRef.current) return;
    pendingRef.current = true;
    if (!showRewardedAd()) {
      pendingRef.current = false;
    }
  };

  if (!available) return null;

  return (
    <section
      aria-label="응원 파티클 샤워"
      className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-accent/40 bg-accent-soft/40 px-4 py-3.5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <PartyPopper aria-hidden className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">
            {cheerMsg ?? "캐릭터들의 응원이 필요하신가요?"}
          </p>
          <p className="mt-0.5 text-xs text-fg-3">
            짧은 광고를 끝까지 보면 화면 가득 응원 파티클 샤워가 쏟아져요
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleWatch}
        disabled={!ready}
        className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-bold text-on-accent transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <Clapperboard aria-hidden className="h-3.5 w-3.5" />
        {ready ? "광고 보고 응원 샤워 받기 🎉" : "광고 준비 중…"}
      </button>
    </section>
  );
}
