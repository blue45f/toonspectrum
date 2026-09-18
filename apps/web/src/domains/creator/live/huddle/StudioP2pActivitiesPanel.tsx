import { useEffect, useState } from "react";
import { HUDDLE_CHALLENGES } from "./studio-p2p-activities";
import type { StudioP2pCreativeHuddleController } from "./studio-p2p-creative-huddle-controller";
import { P2P_CONTROL_CLASS as control } from "./StudioP2pMediaTile";

const inputClass = "min-h-11 min-w-0 w-full rounded-lg border border-line bg-card px-2 text-xs";
function time(remaining: number): string {
  const seconds = Math.ceil(remaining / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function StudioP2pActivitiesPanel({ controller }: { controller: StudioP2pCreativeHuddleController }) {
  const [view, setView] = useState(() => controller.snapshot());
  const [template, setTemplate] = useState<string>(HUDDLE_CHALLENGES[0].id);
  const [question, setQuestion] = useState("어떤 구도가 더 좋을까요?");
  const [options, setOptions] = useState(["A안", "B안", "", ""]);
  const [open, setOpen] = useState(false);
  const hasRunningChallenge = view.activities.some((activity) =>
    Boolean(activity.challenge?.running && activity.challenge.remainingMs > 0));
  useEffect(() => {
    const refresh = () => setView(controller.snapshot());
    refresh();
    return controller.subscribe(refresh);
  }, [controller]);
  useEffect(() => {
    if (!open || !hasRunningChallenge) return undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    const refresh = () => setView(controller.snapshot());
    const syncTimer = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (document.visibilityState === "hidden") return;
      refresh();
      timer = setInterval(refresh, 1000);
    };
    document.addEventListener("visibilitychange", syncTimer);
    syncTimer();
    return () => {
      document.removeEventListener("visibilitychange", syncTimer);
      if (timer !== null) clearInterval(timer);
    };
  }, [controller, hasRunningChallenge, open]);
  return <details className="rounded-xl border border-line p-2" data-studio-p2p-activities="true"
    onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer content-center text-xs font-bold">함께 그리기·투표</summary>
    <div className="space-y-3 pt-2">
      <label className="block text-xs">드로잉 챌린지<select aria-label="드로잉 챌린지" className={inputClass} value={template}
        onChange={(e) => setTemplate(e.target.value)}>{HUDDLE_CHALLENGES.map((c) =>
          <option key={c.id} value={c.id}>{c.title} · {c.seconds / 60}분</option>)}</select></label>
      <button type="button" className={control} disabled={!view.peers.length}
        onClick={() => controller.startChallenge(template)}>함께 시작</button>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); controller.createPoll(question, options.filter((o) => o.trim())); }}>
        <label className="block text-xs">투표 질문<input className={inputClass} value={question} maxLength={160}
          onChange={(e) => setQuestion(e.target.value)} required /></label>
        <div className="grid grid-cols-2 gap-2">{options.map((option, index) =>
          <label key={index} className="text-xs">선택지 {index + 1}{index > 1 ? " (선택)" : ""}
            <input className={inputClass} value={option} maxLength={60} required={index < 2}
              onChange={(e) => setOptions(options.map((o, i) => i === index ? e.target.value : o))} /></label>)}</div>
        <button type="submit" className={control} disabled={!view.peers.length || !question.trim()}>투표 시작</button>
      </form>
      {view.activities.map((activity) => <section key={activity.owner} className="space-y-2 rounded-lg bg-card p-2"
        aria-label={`${activity.self ? "내" : "상대"} 공동 활동`}>
        <p className="text-xs font-bold">{activity.self ? "내 활동" : view.peers.find((p) => p.participant.sessionId === activity.owner)?.participant.displayName}</p>
        {activity.challenge && <div className="space-y-1">
          <h4 className="text-xs font-bold">{activity.challenge.title}</h4>
          <p className="text-xs leading-relaxed">{activity.challenge.prompt}</p>
          <p role="timer" aria-label={`${activity.challenge.title} 남은 시간`} className="text-lg tabular-nums">
            {time(activity.challenge.remainingMs)} · {activity.challenge.remainingMs === 0 ? "완료" : activity.challenge.running ? "진행 중" : "일시정지"}</p>
          {activity.self && <div className="flex gap-2"><button type="button" className={control}
            disabled={activity.challenge.remainingMs === 0} onClick={() => controller.toggleChallenge()}>
            {activity.challenge.running ? "타이머 일시정지" : "타이머 이어하기"}</button>
            <button type="button" className={control} onClick={() => controller.clearChallenge()}>챌린지 지우기</button></div>}
        </div>}
        {activity.poll && <div className="space-y-2">
          <h4 className="text-xs font-bold">{activity.poll.question}</h4>
          <div className="grid gap-1">{activity.poll.options.map((option, index) =>
            <button type="button" key={option} className={control} aria-pressed={activity.poll?.myChoice === index}
              onClick={() => controller.vote(activity.owner, index)}>
              {option} · {activity.poll?.counts[index] ?? 0}표</button>)}</div>
          <p className="text-[11px] text-fg-3">현재 참여 세션 {activity.poll.voters}표 · 선택 변경 가능</p>
          {activity.self && <button type="button" className={control} onClick={() => controller.clearPoll()}>투표 지우기</button>}
        </div>}
      </section>)}
      <p className="text-[11px] leading-relaxed text-fg-3">타이머는 네트워크 지연만큼 차이 날 수 있습니다. 활동을 만든 사람만 일시정지·삭제할 수 있습니다.
        투표는 비밀 투표가 아닌 실시간 피드백이며 세션당 한 표입니다. 나간 참여자의 활동·표는 제거되고 서버에 저장되지 않습니다.</p>
    </div>
  </details>;
}
