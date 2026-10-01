import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BookOpen, MousePointerClick, Move, Smile, X } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioNpcRole } from "./studio-virtual-space-npc-director";
import type { StudioVirtualNpcGuideTourState } from "./studio-virtual-space-npc-guide";
import type { StudioVirtualSpaceWorldManifest, StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

const SEEN_KEY = "toonspectrum:virtual-studio-guide:v1";
const STOPS = [null, "story", "canvas", "review", "assets", null] as const;
/** User-operated guide: showing, skipping or changing a step never moves or opens a tool. */
export function StudioVirtualSpaceGuide({ manifest, onMove, onOpen, onStop, onFocus, guideTour = null,
  tourRequested = false, onStartTour, onCancelTour, onReplayMiniTour }: {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly onMove: (point: StudioVirtualSpacePoint) => void;
  readonly onOpen: (action: StudioWorldInteractionDefinition["action"]) => void;
  readonly onStop: () => void;
  readonly onFocus: () => void;
  readonly guideTour?: StudioVirtualNpcGuideTourState | null;
  readonly tourRequested?: boolean;
  readonly onStartTour?: (guideId: string) => void;
  readonly onCancelTour?: () => void;
  /** 첫 방문 3단계 미니 투어를 다시 보여준다. "다시 보지 않기"를 되돌리는 용도. */
  readonly onReplayMiniTour?: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceGuide");
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLElement>(null);
  const moving = useRef(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(SEEN_KEY) === "seen"; } catch { return false; } });
  const guide = manifest.npcs.find((npc) => studioNpcRole(npc) === "guide");
  const touring = tourRequested && guideTour?.status !== "complete" && guideTour?.status !== "cancelled";
  const stop = useCallback(() => { if (moving.current) onStop(); moving.current = false; }, [onStop]);
  const close = useCallback(() => {
    if (touring) onCancelTour?.();
    stop(); setOpen(false); setSeen(true);
    try { localStorage.setItem(SEEN_KEY, "seen"); } catch { /* The guide still works without storage. */ }
    trigger.current?.focus();
  }, [onCancelTour, stop, touring]);
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !(event.target instanceof Node) || !region.current?.contains(event.target)) return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [open, close]);
  const action = STOPS[step];
  const place = action ? manifest.interactions.find((item) => item.action === action) : undefined;
  const titles = [bt("내 속도로 둘러보기", "Explore at your own pace"), bt("대본에서 시작하기", "Start with the story"),
    bt("원고 그리기", "Draw your pages"), bt("같은 버전 검토하기", "Review the same version"),
    bt("작품의 소재 찾기", "Find project assets"), bt("함께하기와 집중하기", "Collaborate and focus")];
  const descriptions = [
    bt("빈 바닥을 누르거나 방향키·WASD로 이동하세요. 터치 화면에서는 조이스틱을 사용할 수 있어요. 이동 중 직접 조작하면 이전 경로가 취소됩니다.", "Click empty floor or use the arrow keys or WASD. On touch screens, use the joystick. Manual movement cancels your previous route."),
    bt("작가 데스크에서 이 작품의 대본을 이어 쓸 수 있어요. 방으로 걸어가거나 도구를 바로 여세요.", "Continue this project's script at the writer's desk. Walk there or open its tool directly."),
    bt("드로잉 스튜디오는 현재 작품의 작업 캔버스로 이어집니다. 방에 가지 않아도 같은 도구를 사용할 수 있어요.", "The drawing studio opens this project's working canvas. The same tool is available without walking there."),
    bt("팀원에게 함께 검토를 요청할 때 검수본을 고르세요. 서로 수락한 뒤에도 원래 작품 권한은 그대로 적용됩니다.", "Choose a review snapshot when inviting a teammate. Existing project permissions still apply after both of you accept."),
    bt("에셋 선반에서 이 작품의 소재와 사용 정보를 확인하세요. 자료 선택과 원고에 적용하는 동작은 구분됩니다.", "Open the asset shelf to check project assets and usage. Choosing a reference does not apply it to your manuscript."),
    bt("팀원을 선택해 인사하거나 대화를 제안하세요. NPC는 도우미이며 접속 인원에 포함되지 않아요. 집중 모드는 새 요청을 쉬고, 진행 중인 함께하기를 종료합니다.", "Select a teammate to wave or propose a conversation. NPC helpers are not online people. Focus mode pauses invitations and ends your current shared activity."),
  ];
  return <section ref={region} className="vs2-panel studio-vspace-guide" aria-label={bt("스튜디오 시작 안내", "Getting started in the studio")} data-space-interactive="true">
    <button ref={trigger} type="button" className="studio-vspace-guide-trigger" aria-expanded={open} aria-controls={panelId}
      onClick={() => { if (open) close(); else { setStep(0); setOpen(true); } }}>
      <BookOpen size={16} aria-hidden />{seen ? bt("시작 안내 다시 보기", "Reopen getting started") : bt("처음 오셨나요? 시작 안내", "New here? Getting started")}
    </button>
    {open ? <div id={panelId} className="studio-vspace-guide-body">
      <header><h2>{titles[step]}</h2><button type="button" onClick={close} aria-label={bt("안내 닫기", "Close guide")}><X size={16} aria-hidden /></button></header>
      <p>{descriptions[step]}</p>
      <p className="studio-vspace-guide-progress" role="status">{bt(`${step + 1} / ${STOPS.length} 단계`, `Step ${step + 1} of ${STOPS.length}`)}</p>
      {guide && onStartTour ? <div className="studio-vspace-guide-actions" aria-label={bt("NPC와 함께 둘러보기", "Tour with an NPC")}>
        <p>{bt("가이드가 앞서 걷고, 멀어지면 기다려 줍니다. 직접 따라 걸으며 언제든 멈출 수 있어요.", "Your guide walks ahead and waits when you fall behind. Follow at your own pace and stop whenever you like.")}</p>
        {touring ? <>
          <p role="status">{guideTour?.status === "waiting-for-user"
            ? bt("가이드가 가까이 오기를 기다리고 있어요.", "Your guide is waiting for you to catch up.")
            : guideTour?.status === "at-stop"
              ? bt(`${guideTour.stopIndex + 1} / ${guideTour.stopCount} 장소에 도착했어요.`, `Arrived at stop ${guideTour.stopIndex + 1} of ${guideTour.stopCount}.`)
              : bt("가이드를 따라 걸어보세요.", "Walk along with your guide.")}</p>
          <button type="button" onClick={onCancelTour}>{bt("함께 둘러보기 멈추기", "Stop guided tour")}</button>
        </> : <>
          {guideTour?.status === "complete" ? <p role="status">{bt("스튜디오를 한 바퀴 둘러봤어요. 원하는 도구를 열어 작업을 시작하세요.", "You have explored the studio. Open a tool whenever you are ready to work.")}</p> : null}
          <button type="button" onClick={() => { stop(); onStartTour(guide.id); }}>{bt("가이드와 함께 둘러보기", "Start guided tour")}</button>
        </>}
      </div> : null}
      {place ? <div className="studio-vspace-guide-actions">
        <button type="button" onClick={() => { moving.current = true; onMove(place.point); }}>{bt("이곳으로 걸어가기", "Walk to this place")}</button>
        <button type="button" onClick={() => { stop(); onOpen(place.action); }}>{bt("도구 바로 열기", "Open the tool")}</button>
        <button type="button" onClick={stop}>{bt("이동 멈추기", "Stop walking")}</button>
      </div> : null}
      {step === STOPS.length - 1 ? <button type="button" onClick={() => { onFocus(); close(); }}>{bt("집중 모드로 시작", "Start in focus mode")}</button> : null}
      <nav aria-label={bt("안내 단계", "Guide steps")}>
        <button type="button" disabled={step === 0} onClick={() => { stop(); setStep((value) => value - 1); }}>{bt("이전", "Previous")}</button>
        {step < STOPS.length - 1 ? <button type="button" onClick={() => { stop(); setStep((value) => value + 1); }}>{bt("다음", "Next")}</button>
          : <button type="button" onClick={close}>{bt("안내 마치기", "Finish guide")}</button>}
        <button type="button" onClick={close}>{bt("나중에 보기", "Maybe later")}</button>
        {onReplayMiniTour ? <button type="button" onClick={() => { close(); onReplayMiniTour(); }}>
          {bt("미니 투어 다시 보기", "Replay mini tour")}
        </button> : null}
      </nav>
      <details className="studio-vspace-guide-shortcuts">
        <summary>{bt("키보드 단축키", "Keyboard shortcuts")}</summary>
        <ul>
          <li><span><kbd>WASD</kbd> · <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span><span>{bt("이동", "Move")}</span></li>
          <li><span><kbd>Shift</kbd></span><span>{bt("누른 채 이동하면 달리기", "Hold to run")}</span></li>
          <li><span><kbd>E</kbd></span><span>{bt("현재 방과 상호작용", "Interact with the current room")}</span></li>
          <li><span><kbd>1</kbd>–<kbd>4</kbd></span><span>{bt("리액션 보내기", "Send a reaction")}</span></li>
          <li><span><kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>K</kbd></span><span>{bt("방·팀원 찾기", "Find rooms & people")}</span></li>
          <li><span><kbd>Esc</kbd></span><span>{bt("열린 패널 닫기", "Close the open panel")}</span></li>
        </ul>
      </details>
    </div> : null}
  </section>;
}

/**
 * 첫 방문(게스트 포함) 3단계 미니 투어.
 *
 * 입장 직후 스테이지 위에 한 번만 뜬다. 이동 → 상호작용 → 리액션 순서로
 * 핵심 조작 3가지만 안내하고, 건너뛰기와 "다음부터 보지 않기"를 지원한다.
 * 어떤 단계에서도 아바타를 움직이거나 도구를 열지 않는다.
 */
export function StudioVirtualSpaceMiniTour({ onDone }: {
  /** 투어가 닫힐 때 호출된다. seen=true면 다시 보지 않기로 저장한다. */
  readonly onDone: (seen: boolean) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceGuide");
  const titleId = useId();
  const [step, setStep] = useState(0);
  const [hideNextTime, setHideNextTime] = useState(true);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const steps = [
    {
      icon: <Move size={26} aria-hidden />,
      title: bt("이동하기", "Move around"),
      body: bt(
        "WASD·방향키로 걷고, 빈 공간을 클릭해도 이동해요. 모바일에서는 조이스틱을 드래그하세요.",
        "Walk with WASD or arrow keys, or click empty space. On mobile, drag the joystick.",
      ),
    },
    {
      icon: <MousePointerClick size={26} aria-hidden />,
      title: bt("상호작용하기", "Interact"),
      body: bt(
        "E 키를 눌러 현재 방과 상호작용하세요. 모바일에서는 화면 하단의 버튼을 누르세요.",
        "Press E to interact with the current room. On mobile, tap the button at the bottom of the screen.",
      ),
    },
    {
      icon: <Smile size={26} aria-hidden />,
      title: bt("리액션 보내기", "Send reactions"),
      body: bt(
        "1–4 키로 리액션을 보내세요. 모바일에서는 왼쪽의 웃음 버튼을 눌러 리액션을 여세요.",
        "Press 1–4 to send a reaction. On mobile, tap the smile button on the left to open reactions.",
      ),
    },
  ] as const;
  const lastStep = step === steps.length - 1;
  const current = steps[step]!;
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    // Escape으로 닫고, Tab 포커스를 투어 안에 가둔다(배경 스테이지는 건드리지 않는다).
    const handleKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onDone(hideNextTime);
        return;
      }
      if (event.key !== "Tab") return;
      const overlay = overlayRef.current;
      if (!overlay) return;
      const focusables = Array.from(overlay.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
      ));
      if (!focusables.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !overlay.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [hideNextTime, onDone]);
  return <div
    ref={overlayRef}
    className="absolute inset-0 z-[95] flex items-center justify-center bg-black/55 p-4"
    data-space-interactive="true"
  >
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="w-full max-w-sm rounded-3xl border border-line bg-panel p-5 shadow-2xl"
    >
      <header className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-base font-black">{bt("3단계로 시작하기", "Get started in 3 steps")}</h2>
        <button
          type="button"
          onClick={() => onDone(hideNextTime)}
          aria-label={bt("미니 투어 닫기", "Close mini tour")}
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-line text-fg-3 transition hover:text-fg"
        >
          <X size={17} aria-hidden />
        </button>
      </header>
      <div className="mt-4 flex flex-col items-center gap-2 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent" aria-hidden>
          {current.icon}
        </span>
        <h3 className="text-sm font-black">{current.title}</h3>
        <p className="text-[0.83rem] leading-6 text-fg-2">{current.body}</p>
      </div>
      <p className="mt-3 text-center text-xs font-bold text-fg-3" role="status">
        {bt(`${step + 1} / ${steps.length} 단계`, `Step ${step + 1} of ${steps.length}`)}
      </p>
      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-xs font-semibold text-fg-3">
        <input
          type="checkbox"
          checked={hideNextTime}
          onChange={(event) => setHideNextTime(event.target.checked)}
          className="size-4 accent-[var(--color-accent)]"
        />
        {bt("다음부터 보지 않기", "Don't show again")}
      </label>
      <nav aria-label={bt("미니 투어 단계", "Mini tour steps")} className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((value) => value - 1)}
          className="min-h-10 rounded-xl border border-line px-4 text-xs font-black text-fg-2 transition enabled:hover:text-fg disabled:opacity-40"
        >
          {bt("이전", "Back")}
        </button>
        <button
          type="button"
          onClick={() => onDone(hideNextTime)}
          className="min-h-10 rounded-xl px-3 text-xs font-bold text-fg-3 transition hover:text-fg"
        >
          {bt("건너뛰기", "Skip")}
        </button>
        {lastStep ? <button
          ref={primaryRef}
          type="button"
          onClick={() => onDone(true)}
          className="min-h-10 rounded-xl bg-accent px-5 text-xs font-black text-on-accent transition hover:brightness-110"
        >
          {bt("시작하기", "Start")}
        </button> : <button
          ref={primaryRef}
          type="button"
          onClick={() => setStep((value) => value + 1)}
          className="min-h-10 rounded-xl bg-accent px-5 text-xs font-black text-on-accent transition hover:brightness-110"
        >
          {bt("다음", "Next")}
        </button>}
      </nav>
    </section>
  </div>;
}
