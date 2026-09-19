import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest, StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

const SEEN_KEY = "toonspectrum:virtual-studio-guide:v1";
const STOPS = [null, "story", "canvas", "review", "assets", null] as const;
/** User-operated guide: showing, skipping or changing a step never moves or opens a tool. */
export function StudioVirtualSpaceGuide({ manifest, onMove, onOpen, onStop, onFocus }: {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly onMove: (point: StudioVirtualSpacePoint) => void;
  readonly onOpen: (action: StudioWorldInteractionDefinition["action"]) => void;
  readonly onStop: () => void;
  readonly onFocus: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceGuide");
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLElement>(null);
  const moving = useRef(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(SEEN_KEY) === "seen"; } catch { return false; } });
  const stop = useCallback(() => { if (moving.current) onStop(); moving.current = false; }, [onStop]);
  const close = useCallback(() => {
    stop(); setOpen(false); setSeen(true);
    try { localStorage.setItem(SEEN_KEY, "seen"); } catch { /* The guide still works without storage. */ }
    trigger.current?.focus();
  }, [stop]);
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
      </nav>
    </div> : null}
  </section>;
}
