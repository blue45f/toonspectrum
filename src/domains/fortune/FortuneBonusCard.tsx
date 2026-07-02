import { usePlatform } from "@heejun/platform-bridge";
import { useFx } from "@toonspectrum/core/fx";
import { Clapperboard, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ConfettiBurst } from "./fortune-fx";
import { todayKst, useFortuneStore } from "./fortune-store";

import {
  onRewardedAdEvent,
  showRewardedAd,
  useRewardedAd,
} from "@/src/compat/rewarded-ad";

/**
 * 스페셜 부적 카드 — 보상형 광고 옵트인 보상(운세 페이지).
 *
 * - 토스 환경에서 보상형 광고 provider 가 게시된 경우에만 CTA 를 노출한다(웹/미구성 → 숨김).
 *   단, 이미 오늘 잠금해제한 카드는 환경과 무관하게 보여준다(영속 보상 존중).
 * - 보상(잠금해제)은 SDK `userEarnedReward` 이벤트에서만 지급한다. 광고를 끝까지 보지 않고
 *   닫으면 카드는 열리지 않는다.
 * - 광고 노출 전 `onAdStart`(운세 낭독 Web Speech 일시정지), 종료 후 `onAdEnd`(재개)를 부른다 —
 *   BGM/AudioContext 는 광고 훅(pauseAudioForAd)이, 낭독은 페이지가 책임진다.
 * - 카드 내용은 (캐릭터, KST 날짜) 결정적 유도 — "같은 날에는 결과가 바뀌지 않아요" 원칙 유지.
 */

interface BonusCharacter {
  id: string;
  name: string;
}

interface FortuneBonusCardProps {
  character: BonusCharacter;
  /** 광고 노출 직전(사용자 제스처 안) — 페이지 낭독 등 광고 훅이 못 멈추는 오디오를 멈춘다. */
  onAdStart?: () => void;
  /** 광고 종료(보상 여부 무관 — dismissed/실패 포함) 후 1회. */
  onAdEnd?: () => void;
}

const CHARMS = [
  { name: "해돋이 부적", emoji: "🌅", blessing: "머뭇거리던 시작 위로 첫 빛이 비쳐요. 오늘 미뤄둔 1화를 여세요." },
  { name: "달빛 부적", emoji: "🌙", blessing: "소란이 잦아들면 마음의 소리가 선명해져요. 밤의 정주행이 답을 줘요." },
  { name: "네잎클로버 부적", emoji: "🍀", blessing: "우연이 세 번 겹치면 그건 행운이에요. 오늘의 추천작을 지나치지 마세요." },
  { name: "유성우 부적", emoji: "🌠", blessing: "빌어둔 소원 하나가 궤도에 올라요. 완결작 몰아보기에 좋은 날이에요." },
  { name: "종이학 부적", emoji: "🕊️", blessing: "전하지 못한 진심이 무사히 도착해요. 좋아한 작품에 리뷰를 남겨보세요." },
  { name: "등불 부적", emoji: "🏮", blessing: "어두운 길목에서 길잡이를 만나요. 새 장르에 입문하기 좋은 기운이에요." },
  { name: "파도 부적", emoji: "🌊", blessing: "막혔던 흐름이 한 번에 트여요. 쉬어가던 연재를 다시 따라잡아 보세요." },
  { name: "별사탕 부적", emoji: "⭐", blessing: "작은 달콤함이 하루의 방향을 바꿔요. 짧은 단편 한 편이 특효예요." },
] as const;

const LUCKY_KEYWORDS = ["재회", "몰입", "정리", "고백", "환기", "직감", "완결", "저장"] as const;
const LUCKY_HOURS = ["오전 7시", "오전 11시", "오후 2시", "오후 5시", "오후 8시", "밤 10시"] as const;

// (캐릭터 id + 날짜) → 안정 해시. 같은 날 같은 캐릭터면 항상 같은 부적(결정성).
function hashSeed(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function FortuneBonusCard({ character, onAdStart, onAdEnd }: FortuneBonusCardProps) {
  const { available, ready } = useRewardedAd();
  const bonusDates = useFortuneStore((s) => s.bonusDates);
  const recordBonusUnlock = useFortuneStore((s) => s.recordBonusUnlock);
  const fx = useFx();
  const platform = usePlatform();

  const today = todayKst();
  const unlockedToday = bonusDates.includes(today);

  const cardRef = useRef<HTMLDivElement>(null);
  // 이 컴포넌트가 시작한 광고에만 반응한다(다른 표면의 보상형 광고와 혼선 방지).
  const pendingRef = useRef(false);
  const onAdEndRef = useRef(onAdEnd);
  // 렌더 중 ref 변이는 React Compiler 규칙 위반 — 커밋 후 동기화한다.
  useEffect(() => {
    onAdEndRef.current = onAdEnd;
  }, [onAdEnd]);
  // 방금 잠금해제 — 축포/등장 연출용(재방문 렌더와 구분).
  const [justUnlocked, setJustUnlocked] = useState(false);

  useEffect(
    () =>
      onRewardedAdEvent((event) => {
        if (!pendingRef.current) return;
        if (event.type === "reward") {
          // 보상 지급은 userEarnedReward 수신 시에만.
          recordBonusUnlock();
          setJustUnlocked(true);
          fx.sfx("success");
          fx.burstAt(cardRef.current, { count: 26, chars: ["✨", "🌟", "🍀"], spread: 1.15 });
          platform.haptic("confetti");
        }
        if (event.type === "closed") {
          pendingRef.current = false;
          onAdEndRef.current?.();
        }
      }),
    [fx, platform, recordBonusUnlock],
  );

  const handleWatch = () => {
    if (!ready || pendingRef.current) return;
    // 낭독(Web Speech)은 광고 훅의 pauseAudioForAd 가 못 멈추므로 페이지에 먼저 알린다.
    onAdStart?.();
    pendingRef.current = true;
    if (!showRewardedAd()) {
      pendingRef.current = false;
      onAdEndRef.current?.();
    }
  };

  // 오늘 카드가 열려 있으면 어디서든(웹 포함) 보상 카드를 보여준다.
  if (unlockedToday) {
    const seed = hashSeed(`${character.id}:${today}`);
    const charm = CHARMS[seed % CHARMS.length];
    const keyword = LUCKY_KEYWORDS[(seed >> 3) % LUCKY_KEYWORDS.length];
    const hour = LUCKY_HOURS[(seed >> 6) % LUCKY_HOURS.length];
    return (
      <section
        ref={cardRef}
        aria-label="오늘의 스페셜 부적 카드"
        className="relative overflow-hidden rounded-2xl border border-accent/35 p-5"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--char-accent, var(--color-accent)) 16%, var(--color-card)) 0%, color-mix(in oklab, var(--char-accent, var(--color-accent)) 5%, var(--color-card)) 55%, color-mix(in oklab, var(--char-accent, var(--color-accent)) 22%, var(--color-card)) 100%)",
        }}
      >
        {justUnlocked && <ConfettiBurst count={30} />}
        <div className="flex items-start gap-4">
          <span aria-hidden className="text-4xl leading-none drop-shadow-sm">
            {charm.emoji}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-accent">
              Special Charm · {character.name}의 선물
            </p>
            <h4 className="mt-0.5 text-lg font-extrabold text-fg font-display">{charm.name}</h4>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-2">{charm.blessing}</p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              <div className="flex items-baseline gap-1.5">
                <dt className="font-bold text-fg-3">행운 키워드</dt>
                <dd className="font-semibold text-fg">{keyword}</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="font-bold text-fg-3">행운 시간</dt>
                <dd className="font-semibold text-fg">{hour}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    );
  }

  // 미잠금 + provider 미게시(웹/미구성 토스)면 아무것도 그리지 않는다.
  if (!available) return null;

  return (
    <section
      aria-label="스페셜 부적 카드 잠금해제"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-accent/40 bg-accent-soft/40 px-4 py-3.5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Sparkles aria-hidden className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">오늘의 스페셜 부적 카드가 잠들어 있어요</p>
          <p className="mt-0.5 text-xs text-fg-3">
            짧은 광고를 끝까지 보면 {character.name}의 행운 부적이 열려요 (하루 1회)
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
        {ready ? "광고 보고 스페셜 카드 받기 ✨" : "광고 준비 중…"}
      </button>
    </section>
  );
}
