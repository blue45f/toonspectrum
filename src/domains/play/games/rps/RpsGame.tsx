import { Box, Camera, CameraOff, Hand as HandIcon, RotateCcw } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import {
  EMPTY_SCORE,
  HAND_EMOJI,
  HAND_LABEL,
  matchOver,
  pickAiHand,
  resolveRound,
  scoreReducer,
  type Hand,
  type Outcome,
  type Score,
} from "./rps-logic";
import { useHandGesture } from "./use-hand-gesture";

import type { PlayGameProps } from "../../play-types";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


const RpsVrmStage = lazy(() => import("./RpsVrmStage"));

function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TARGET = 3;
const ALL: Hand[] = ["rock", "paper", "scissors"];
type Phase = "idle" | "counting" | "result" | "over";

const OUTCOME_KO: Record<Outcome, string> = { win: "승!", lose: "패…", draw: "무승부" };

export function RpsGame({ onExit }: PlayGameProps) {
  const [camera, setCamera] = useState(false);
  const { videoRef, gesture, status } = useHandGesture(camera);
  const [use3d, setUse3d] = useState(true);
  const [vrmReady, setVrmReady] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(3);
  const [score, setScore] = useState<Score>(EMPTY_SCORE);
  const [player, setPlayer] = useState<Hand | null>(null);
  const [ai, setAi] = useState<Hand | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [message, setMessage] = useState<string>("");

  const rngRef = useRef(seededRng(1));
  const historyRef = useRef<Hand[]>([]);
  const liveGesture = useRef<Hand | null>(null);

  useEffect(() => {
    liveGesture.current = gesture;
  }, [gesture]);

  const winner = matchOver(score, TARGET);

  function resolveShot(playerHand: Hand | null) {
    if (!playerHand) {
      setMessage("손을 인식하지 못했어요 — 또렷하게 내봐요!");
      setPhase("idle");
      return;
    }
    historyRef.current = [...historyRef.current.slice(-8), playerHand];
    const aiHand = pickAiHand(rngRef.current, historyRef.current, true);
    const out = resolveRound(playerHand, aiHand);
    setPlayer(playerHand);
    setAi(aiHand);
    setOutcome(out);
    setScore((s) => scoreReducer(s, out));
    setMessage("");
    setPhase("result");
  }

  // 카운트다운(3→2→1→샷) — 카메라 모드.
  useEffect(() => {
    if (phase !== "counting") return;
    if (count > 0) {
      const t = setTimeout(() => setCount((c) => c - 1), 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => resolveShot(liveGesture.current), 350);
    return () => clearTimeout(t);
     
  }, [phase, count]);

  // 결과 후 다음 라운드(또는 매치 종료).
  useEffect(() => {
    if (phase !== "result") return;
    const t = setTimeout(() => {
      setScore((s) => {
        if (matchOver(s, TARGET)) setPhase("over");
        else {
          setPhase("idle");
          setCount(3);
        }
        return s;
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [phase]);

  // 카메라 모드: idle이면 잠시 후 자동으로 다음 카운트다운 시작(연속 플레이).
  useEffect(() => {
    if (!camera || phase !== "idle" || winner) return;
    if (status !== "ready") return;
    const t = setTimeout(() => {
      setCount(3);
      setPhase("counting");
    }, 700);
    return () => clearTimeout(t);
  }, [camera, phase, winner, status]);

  function restart() {
    rngRef.current = seededRng((Math.floor(score.round) + 7) * 2654435761);
    historyRef.current = [];
    setScore(EMPTY_SCORE);
    setPlayer(null);
    setAi(null);
    setOutcome(null);
    setMessage("");
    setCount(3);
    setPhase("idle");
  }

  function toggleCamera() {
    setCamera((c) => !c);
    setPhase("idle");
    setCount(3);
    setMessage("");
  }

  const aiFace = outcome === "win" ? "😣" : outcome === "lose" ? "😎" : "🤖";

  return (
    <div className="flex flex-col gap-4">
      {/* 점수판 */}
      <div className="flex items-center justify-between rounded-xl border border-line bg-card/50 px-4 py-2 text-sm">
        <span className="font-semibold text-emerald-500">나 {score.win}</span>
        <span className="text-fg-3">선승 {TARGET} · {score.draw}무</span>
        <span className="font-semibold text-rose-500">{score.lose} 봇</span>
      </div>

      {/* 대결 무대 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 플레이어 */}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-3">
          {camera ? (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black/40">
              <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
              {status === "ready" && (
                <div className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-lg">
                  {gesture ? HAND_EMOJI[gesture] : "🖐?"}
                </div>
              )}
              {status !== "ready" && (
                <div className="absolute inset-0 grid place-items-center px-2 text-center text-[0.7rem] text-white/90">
                  {status === "loading" && "카메라 준비 중…"}
                  {status === "denied" && "카메라 권한이 거부됨 — 버튼으로 플레이하세요"}
                  {status === "error" && "카메라를 열 수 없어요 — 버튼으로 플레이"}
                </div>
              )}
            </div>
          ) : (
            <div className="grid aspect-[4/3] w-full place-items-center rounded-xl bg-emerald-500/10 text-5xl">
              {phase === "result" && player ? HAND_EMOJI[player] : "🙂"}
            </div>
          )}
          <span className="text-xs font-medium text-fg-2">나</span>
        </div>

        {/* 봇 — 3D VRM 캐릭터 상대(폴백: 이모지) */}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/5 p-3">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gradient-to-b from-rose-500/15 to-violet-500/10">
            {use3d ? (
              <>
                <Suspense fallback={null}>
                  <RpsVrmStage
                    hand={phase === "result" ? ai : null}
                    outcome={phase === "result" ? outcome : null}
                    onReady={() => setVrmReady(true)}
                  />
                </Suspense>
                {!vrmReady && <div className="absolute inset-0 grid place-items-center text-5xl">{aiFace}</div>}
                {/* 제스처 가독성 보조 오버레이 */}
                {phase === "result" && ai && (
                  <div className="absolute bottom-1 right-1 rounded-md bg-black/55 px-1.5 py-0.5 text-2xl">{HAND_EMOJI[ai]}</div>
                )}
                {phase === "counting" && <div className="absolute bottom-1 right-1 text-2xl">❓</div>}
              </>
            ) : (
              <div className="grid h-full w-full place-items-center text-5xl">
                {phase === "result" && ai ? HAND_EMOJI[ai] : phase === "counting" ? "❓" : aiFace}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setUse3d((v) => !v)}
            className="inline-flex items-center gap-1 text-[0.66rem] text-fg-3 hover:text-fg-2"
          >
            <Box className="h-3 w-3" /> {use3d ? "웹툰봇 (3D)" : "웹툰봇 (2D)"}
          </button>
        </div>
      </div>

      {/* 중앙 상태 */}
      <div className="min-h-[2.2rem] text-center" aria-live="polite">
        {phase === "counting" && <span className="text-2xl font-extrabold text-accent">{count > 0 ? count : "냅다!"}</span>}
        {phase === "result" && outcome && (
          <span
            className={cn(
              "text-xl font-extrabold",
              outcome === "win" && "text-emerald-500",
              outcome === "lose" && "text-rose-500",
              outcome === "draw" && "text-fg-2",
            )}
          >
            {OUTCOME_KO[outcome]} {player && ai && `(${HAND_LABEL[player]} vs ${HAND_LABEL[ai]})`}
          </span>
        )}
        {phase === "over" && (
          <span className="text-xl font-extrabold text-accent">
            {winner === "player" ? "🏆 최종 승리!" : "💀 최종 패배"}
          </span>
        )}
        {phase === "idle" && message && <span className="text-sm text-rose-500">{message}</span>}
        {phase === "idle" && !message && camera && status === "ready" && <span className="text-sm text-fg-3">손을 준비하세요…</span>}
      </div>

      {/* 조작 */}
      {phase === "over" ? (
        <div className="flex items-center justify-center gap-2">
          <Button variant="solid" onClick={restart}>
            <RotateCcw className="mr-1 h-4 w-4" /> 다시
          </Button>
          <Button variant="outline" onClick={onExit}>다른 게임</Button>
        </div>
      ) : (
        <>
          {!camera && (
            <div className="flex items-center justify-center gap-3">
              {ALL.map((h) => (
                <button
                  key={h}
                  type="button"
                  disabled={phase === "result"}
                  onClick={() => resolveShot(h)}
                  className={cn(
                    "grid h-16 w-16 place-items-center rounded-2xl border-2 border-line bg-card text-3xl transition",
                    "hover:-translate-y-1 hover:border-accent disabled:opacity-50",
                  )}
                  aria-label={HAND_LABEL[h]}
                >
                  {HAND_EMOJI[h]}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-center gap-2">
            <Button variant={camera ? "solid" : "outline"} size="sm" onClick={toggleCamera}>
              {camera ? <CameraOff className="mr-1 h-4 w-4" /> : <Camera className="mr-1 h-4 w-4" />}
              {camera ? "버튼으로 플레이" : "손동작으로 플레이"}
            </Button>
            {!camera && (
              <span className="inline-flex items-center gap-1 text-[0.7rem] text-fg-3">
                <HandIcon className="h-3.5 w-3.5" /> 버튼을 눌러 한 판
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default RpsGame;
