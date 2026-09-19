import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { listStudioVirtualSpaceReviewSubjects, type StudioVirtualSpaceReviewChoices, type StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-invitation";

export function StudioVirtualSpaceReviewPicker({ workId, peerName, disabled, onInvite, onClose }: {
  readonly workId: string;
  readonly peerName: string;
  readonly disabled: boolean;
  readonly onInvite: (subject: StudioVirtualSpaceReviewSubject, signal: AbortSignal) => Promise<boolean>;
  readonly onClose: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceReviewPicker");
  const selectId = useId();
  const [result, setResult] = useState<StudioVirtualSpaceReviewChoices | null>(null);
  const [selected, setSelected] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const proposal = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => { ++generation.current; proposal.current?.abort(); proposal.current = null; }, []);
  useEffect(() => {
    const own = ++generation.current;
    setResult(null); setSelected(""); setFailed(false); setSending(false);
    void listStudioVirtualSpaceReviewSubjects(workId).then((next) => {
      if (own !== generation.current) return;
      setResult(next);
      if (next.ok) setSelected(next.choices[0]?.subject.reviewId ?? "");
    }).catch(() => { if (own === generation.current) setResult({ ok: false, reason: "unavailable" }); });
    return invalidate;
  }, [workId, reload, invalidate]);
  const invite = async () => {
    const choice = result?.ok ? result.choices.find((item) => item.subject.reviewId === selected) : undefined;
    if (!choice || sending || disabled) return;
    const own = generation.current;
    const intent = new AbortController();
    proposal.current = intent;
    setSending(true); setFailed(false);
    try {
      const accepted = await onInvite(choice.subject, intent.signal);
      if (own !== generation.current) return;
      if (accepted) onClose(); else setFailed(true);
    } catch { if (own === generation.current) setFailed(true); }
    finally { if (own === generation.current) setSending(false); }
  };
  return <section className="vs2-panel studio-vspace-review-picker" aria-label={bt("검수본 선택", "Choose a review snapshot")} data-space-interactive="true">
    <h2>{bt("함께 볼 검수본", "Review the same snapshot")}</h2>
    <p>{bt(`${peerName} 님에게 보낼 검수본을 선택하세요. 서로 같은 버전을 확인하며 원고 편집권은 바뀌지 않아요.`, `Choose a snapshot to review with ${peerName}. You will see the same version; editing permissions stay as assigned.`)}</p>
    {!result ? <p role="status">{bt("검수본을 확인하고 있어요…", "Checking review snapshots…")}</p>
      : !result.ok ? <p role="status">{result.reason === "access-denied"
        ? bt("검수 초대 권한이 없어요. 작품 관리자에게 권한을 확인해 주세요.", "You cannot invite reviewers for this work. Check your access with the project owner.")
        : bt("검수본을 불러올 수 없어요. 연결을 확인한 뒤 다시 시도해 주세요.", "Snapshots could not be loaded. Check your connection and try again.")}</p>
        : !result.choices.length ? <p>{bt("진행 중인 검수본이 없어요. 작품의 버전 이력에서 검수본을 만든 뒤 초대할 수 있습니다.", "There are no open reviews. Create a review snapshot in this work before inviting a teammate.")}</p>
          : <><label htmlFor={selectId}>{bt("고정된 검수 버전", "Pinned review version")}</label>
            <select id={selectId} value={selected} onChange={(event) => setSelected(event.target.value)} disabled={sending}>
              {result.choices.map((choice) => <option key={choice.subject.reviewId} value={choice.subject.reviewId}>{choice.artifactTitle} · {choice.title} · {choice.subject.revisionId}</option>)}
            </select>
            {result.truncated ? <p>{bt("검수 목록 일부를 표시하고 있어요.", "Showing a limited review list.")}</p> : null}
            <button type="button" disabled={disabled || sending || !selected} onClick={() => { void invite(); }}>{sending ? bt("권한 확인 중…", "Verifying access…") : bt("이 검수본으로 초대", "Invite to this snapshot")}</button></>}
    {failed ? <p role="alert">{bt("초대를 보내지 못했어요. 검수 상태나 상대 연결이 바뀌었을 수 있습니다.", "The invitation was not sent. Review access or the teammate's connection may have changed.")}</p> : null}
    <button type="button" disabled={sending || !result} onClick={() => setReload((value) => value + 1)}>{bt("새로 확인", "Refresh")}</button>
    <button type="button" onClick={() => { invalidate(); onClose(); }}>{bt("닫기", "Close")}</button>
  </section>;
}
