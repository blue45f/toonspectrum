import { AlertTriangle, ArrowRight, Check, Hand, LoaderCircle, ShieldCheck, UsersRound, X } from "lucide-react";
import { Fragment, useEffect, useId, useRef, type ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioSpatialInteractionPhase } from "./studio-virtual-space-interaction-state";
import type { StudioSpatialAction, StudioSpatialActionId } from "./studio-virtual-space-spatial-actions";
import type { StudioWorldInteractionDefinition, StudioWorldRoomDefinition } from "./studio-virtual-space-world-manifest";

export function StudioVirtualSpaceActionSheet({
  interaction,
  room,
  actions,
  phase = "choosing",
  selectedActionId = null,
  onChoose,
  onConfirm,
  onClose,
  modal = true,
}: {
  readonly interaction: StudioWorldInteractionDefinition;
  readonly room?: StudioWorldRoomDefinition;
  readonly actions: readonly StudioSpatialAction[];
  readonly phase?: StudioSpatialInteractionPhase;
  readonly selectedActionId?: StudioSpatialActionId | null;
  readonly onChoose: (id: StudioSpatialActionId) => void;
  readonly onConfirm?: () => void;
  readonly onClose: () => void;
  /**
   * true(기본): 네이티브 모달 시트. false: 데스크톱 비모달 카드 — 월드 이동을 막지 않고,
   * 멀어지면 Page가 닫는다. Esc는 어느 쪽이든 닫는다.
   */
  readonly modal?: boolean;
}) {
  const bt = useBilingual("StudioVirtualSpaceActionSheet");
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const selectedAction = actions.find((item) => item.id === selectedActionId) ?? null;
  const confirmationVisible = phase === "confirming" && selectedAction !== null;
  const busy = phase === "checking-authority" || phase === "running";
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // 모달이면 네이티브 모달이 배경을 inert로 만들고 키보드 포커스를 시트 안에 유지한다.
    // 비모달이면 배경을 막지 않고 열기만 한다(show가 없는 환경은 open 속성으로 연다).
    if (modal) element.showModal();
    else if (typeof element.show === "function") element.show();
    else element.setAttribute("open", "");
    return () => {
      element.close();
      if (returnFocus?.isConnected && !returnFocus.closest("[inert]")) returnFocus.focus({ preventScroll: true });
    };
  }, [interaction.id, modal]);
  useEffect(() => {
    // 동작 선택에서 확인 단계로 바뀌면 사라진 버튼 대신 취소 버튼에 포커스를 둔다.
    const target = confirmationVisible ? cancel.current : busy ? close.current : first.current ?? close.current;
    target?.focus({ preventScroll: true });
  }, [interaction.id, phase, confirmationVisible, busy]);

  return <dialog ref={dialog} className="studio-vspace-action-backdrop" data-space-interactive="true" data-modal={modal ? "true" : "false"}
    aria-modal={modal ? "true" : "false"} aria-labelledby="studio-vspace-action-title" aria-busy={busy}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      const escape = event.key === "Escape" && !event.nativeEvent.isComposing;
      // 비모달 카드에서는 이동 키가 월드로 가도록 Esc만 여기서 멈춘다.
      if (modal || escape) event.stopPropagation();
      if (escape) { event.preventDefault(); onClose(); }
    }} onKeyUp={(event) => { if (modal) event.stopPropagation(); }}>
    <section className="studio-vspace-action-sheet"
      data-interaction-phase={phase}>
      <header>
        <div>
          <p><Hand size={14} aria-hidden /> {room ? bt(room.labelKo, room.labelEn) : bt("공간 오브젝트", "World object")}</p>
          <h2 id="studio-vspace-action-title">{bt(interaction.labelKo, interaction.labelEn)}</h2>
          <span>{modal ? bt(
            "가까이 왔습니다. 실행할 동작을 선택하세요. 아무 기능도 자동으로 실행하지 않습니다.",
            "You are close enough. Choose an action; proximity never starts a tool automatically.",
          ) : bt(
            "가까이 왔어요. 실행할 동작을 선택하세요. 걸어서 멀어지면 이 카드는 닫혀요.",
            "You are close enough. Choose an action. Walk away and this card closes.",
          )}</span>
        </div>
        <button ref={close} type="button" onClick={onClose} aria-label={bt("닫기", "Close")}><X size={19} aria-hidden /></button>
      </header>
      {confirmationVisible && selectedAction ? <section className="studio-vspace-action-confirm" role="group"
        aria-labelledby="studio-vspace-action-confirm-title">
        <span className="studio-vspace-action-icon" aria-hidden>{selectedAction.risk === "authority"
          ? <ShieldCheck size={21} /> : <UsersRound size={21} />}</span>
        <div>
          <strong id="studio-vspace-action-confirm-title">{bt(selectedAction.labelKo, selectedAction.labelEn)}</strong>
          <p>{bt(selectedAction.descriptionKo, selectedAction.descriptionEn)}</p>
          <small>{selectedAction.risk === "authority"
            ? bt(
              "권한이 필요한 화면을 엽니다. 실제 변경·게시·초대는 다음 화면에서 다시 확인합니다.",
              "This opens an authority-gated screen. Changes, publishing and invitations require another explicit confirmation there.",
            )
            : bt(
              "팀원에게 협업 요청을 보냅니다. 상대방이 수락하기 전에는 대화나 미디어가 시작되지 않습니다.",
              "This sends a collaboration request. Conversation and media do not start until the other participants accept.",
            )}</small>
        </div>
        <div className="studio-vspace-action-confirm-buttons">
          <button ref={cancel} type="button" onClick={onClose}>{bt("취소", "Cancel")}</button>
          <button type="button" onClick={onConfirm}><Check size={16} aria-hidden />{bt("확인하고 계속", "Confirm and continue")}</button>
        </div>
      </section> : busy ? <div className="studio-vspace-action-progress" role="status">
        <LoaderCircle size={22} aria-hidden />
        {bt("권한과 현재 공간 상태를 확인하고 있어요…", "Checking authority and current spatial state…")}
      </div> : <div className="studio-vspace-action-list">
        {actions.map((item, index) => <button key={item.id} ref={index === 0 ? first : undefined}
          type="button" data-risk={item.risk} disabled={phase !== "choosing"} onClick={() => onChoose(item.id)}>
          <span className="studio-vspace-action-icon" aria-hidden>{item.risk === "collaborative" ? <UsersRound size={18} />
            : item.risk === "authority" ? <ShieldCheck size={18} /> : <ArrowRight size={18} />}</span>
          <span>
            <strong>{bt(item.labelKo, item.labelEn)}{item.recommended ? <b>{bt("추천", "Recommended")}</b> : null}</strong>
            <small>{bt(item.descriptionKo, item.descriptionEn)}</small>
          </span>
          <ArrowRight size={17} aria-hidden />
        </button>)}
      </div>}
      <footer><AlertTriangle size={14} aria-hidden />{bt(
        "대화·회의·검수 초대는 상대방의 수락 후 시작되고, 마이크·카메라는 별도로 직접 켭니다.",
        "Conversation, meeting and review invitations start only after consent; microphone and camera remain explicit choices.",
      )}</footer>
    </section>
  </dialog>;
}

export interface StudioVirtualSpaceMenuSheetItem {
  readonly id: string;
  readonly icon?: ReactNode;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo?: string;
  readonly descriptionEn?: string;
  /** 현재 열린 패널이면 강조 표시한다. */
  readonly active?: boolean;
  /** 같은 묶음 이름이 이어지는 항목 앞에 묶음 제목을 한 번 보여 준다. */
  readonly groupKo?: string;
  readonly groupEn?: string;
  /** 비활성 사유. 있으면 aria-disabled로 두고 사유를 읽어 주며 눌러도 닫히지 않는다. */
  readonly disabledReasonKo?: string;
  readonly disabledReasonEn?: string;
  readonly shortcut?: string;
}

/**
 * 커맨드바 "더보기" 같은 오버플로우 메뉴용 공용 바텀시트.
 *
 * StudioVirtualSpaceActionSheet와 같은 네이티브 dialog 패턴을 쓴다:
 * showModal로 배경을 inert 처리·포커스 트랩, Escape로 닫기, 닫을 때 포커스 복원.
 * 항목을 선택하면 onSelect(id) 뒤 자동으로 닫힌다.
 */
export function StudioVirtualSpaceMenuSheet({ titleKo, titleEn, descriptionKo, descriptionEn, items, onSelect, onClose, variant = "cards" }: {
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo?: string;
  readonly descriptionEn?: string;
  readonly items: readonly StudioVirtualSpaceMenuSheetItem[];
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
  /** cards: 설명이 있는 2열 카드(기본). list: 항목이 많은 메뉴를 위한 1열 목록. */
  readonly variant?: "cards" | "list";
}) {
  const bt = useBilingual("StudioVirtualSpaceMenuSheet");
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    first.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      if (returnFocus?.isConnected && !returnFocus.closest("[inert]")) returnFocus.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="studio-vspace-action-backdrop" data-space-interactive="true"
    aria-modal="true" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); }
    }} onKeyUp={(event) => event.stopPropagation()}>
    <section className="studio-vspace-action-sheet">
      <header>
        <div>
          <h2 id={titleId}>{bt(titleKo, titleEn)}</h2>
          {descriptionKo || descriptionEn ? <span>{bt(descriptionKo ?? titleKo, descriptionEn ?? titleEn)}</span> : null}
        </div>
        <button type="button" onClick={onClose} aria-label={bt("닫기", "Close")}><X size={19} aria-hidden /></button>
      </header>
      <div className="studio-vspace-action-list" role="menu" aria-labelledby={titleId} data-variant={variant}>
        {items.map((item, index) => {
          const group = item.groupKo ? bt(item.groupKo, item.groupEn ?? item.groupKo) : null;
          const previous = items[index - 1];
          const reason = item.disabledReasonKo ? bt(item.disabledReasonKo, item.disabledReasonEn ?? item.disabledReasonKo) : null;
          const reasonId = `${titleId}-${item.id}-reason`;
          return <Fragment key={item.id}>
            {group && previous?.groupKo !== item.groupKo ? <p className="studio-vspace-menu-group" aria-hidden>{group}</p> : null}
            <button ref={index === 0 ? first : undefined}
              type="button" role="menuitem" data-menu-item={item.id} aria-current={item.active || undefined}
              aria-disabled={reason ? true : undefined} aria-describedby={reason ? reasonId : undefined}
              aria-keyshortcuts={item.shortcut}
              onClick={() => { if (reason) return; onSelect(item.id); onClose(); }}>
              <span className="studio-vspace-action-icon" aria-hidden>{item.icon ?? <ArrowRight size={18} />}</span>
              <span>
                <strong>{bt(item.labelKo, item.labelEn)}{item.active ? <b>{bt("열림", "Open")}</b> : null}</strong>
                {item.descriptionKo || item.descriptionEn
                  ? <small>{bt(item.descriptionKo ?? item.labelKo, item.descriptionEn ?? item.labelEn)}</small> : null}
                {reason ? <small id={reasonId}>{reason}</small> : null}
              </span>
              {item.shortcut ? <kbd aria-hidden>{item.shortcut}</kbd> : <ArrowRight size={17} aria-hidden />}
            </button>
          </Fragment>;
        })}
      </div>
    </section>
  </dialog>;
}
