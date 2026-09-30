import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  buildCloneLink,
  createSpaceSnapshot,
  parseCloneLink,
  summarizeSpaceSnapshot,
  type StudioSpaceSnapshot,
  type StudioSpaceSnapshotSummary,
} from "./studio-virtual-space-clone";
import type { StudioTileEffectDefinition } from "./studio-virtual-space-tile-effects";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

const control = "min-h-11 max-w-full rounded-lg border border-line bg-card px-3 text-sm disabled:opacity-50";
const field = `${control} mt-1 block w-full`;

interface ImportProposal {
  readonly snapshot: StudioSpaceSnapshot;
  readonly summary: StudioSpaceSnapshotSummary;
}

/**
 * Space-clone panel: create a shareable clone link for the current space draft,
 * or paste a link to preview and hand its snapshot to the caller.
 * Local serialization only; no server publication happens here.
 * `tileEffects` are the D-1 tile-effect editor's placements; they ride along in
 * the clone link because the world manifest does not store them.
 */
export function StudioVirtualSpaceClonePanel({ world, tileEffects = [], disabled, onApplySnapshot }: {
  readonly world: StudioVirtualSpaceWorldManifest;
  readonly tileEffects?: readonly StudioTileEffectDefinition[];
  readonly disabled: boolean;
  readonly onApplySnapshot: (snapshot: StudioSpaceSnapshot) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceClonePanel");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [pasted, setPasted] = useState("");
  const [proposal, setProposal] = useState<ImportProposal | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const makeLink = () => {
    if (disabled) return;
    try {
      const snapshot = createSpaceSnapshot(world, { name, description, author }, new Date(), { tileEffects });
      const base = window.location.href.split("#")[0] ?? window.location.href;
      setLink(buildCloneLink(base, snapshot));
      setMessage(bt("복제 링크를 만들었습니다. 링크를 공유해도 서버에 게시되지는 않습니다.", "Clone link created. Sharing the link does not publish anything to a server."));
    } catch {
      setMessage(bt("링크를 만들지 못했습니다. 공간 이름과 현재 공간 구성을 확인하세요.", "Could not create the link. Check the space name and the current space layout."));
    }
  };

  const copyLink = async () => {
    if (!link || disabled) return;
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(link);
      setMessage(bt("복제 링크를 복사했습니다.", "Clone link copied."));
    } catch {
      setMessage(bt("복사에 실패했습니다. 링크를 직접 선택해 복사하세요.", "Copy failed. Select the link and copy it manually."));
    }
  };

  const inspectPasted = () => {
    if (disabled) return;
    const parsed = parseCloneLink(pasted.trim());
    setConfirmed(false);
    if (!parsed) {
      setProposal(null);
      setMessage(bt("링크를 해석하지 못했습니다. 복제 링크 전체를 붙여넣으세요.", "Could not read this link. Paste the full clone link."));
      return;
    }
    setProposal({ snapshot: parsed, summary: summarizeSpaceSnapshot(parsed) });
    setMessage("");
  };

  const apply = () => {
    if (disabled || !proposal || !confirmed) return;
    onApplySnapshot(proposal.snapshot);
    setProposal(null);
    setConfirmed(false);
    setPasted("");
    setMessage(bt("스냅샷 적용 요청을 전달했습니다. 실제 적용은 호출 측에서 처리합니다.", "Handed the snapshot apply request off. The caller handles the actual apply."));
  };

  return <section className="space-y-3 rounded-xl border border-line bg-card p-3" aria-label={bt("공간 복제 링크", "Space clone link")}>
    <p className="text-xs text-fg-2">{bt("잘 만든 공간을 링크로 복제·공유합니다. 직렬화·역직렬화는 이 장치에서만 일어나며 서버에 전송되지 않습니다.", "Clone and share a well-crafted space through a link. Serialization stays on this device and nothing is sent to a server.")}</p>
    <div className="space-y-3 rounded-lg border border-line p-3">
      <h3 className="text-sm font-semibold">{bt("이 공간 복제 링크 만들기", "Create a clone link for this space")}</h3>
      <label className="block text-sm">{bt("공간 이름", "Space name")}<input className={field} maxLength={160} value={name} disabled={disabled}
        onChange={(event) => setName(event.target.value)} /></label>
      <label className="block text-sm">{bt("설명", "Description")}<textarea className={field} rows={2} maxLength={4000} value={description} disabled={disabled}
        onChange={(event) => setDescription(event.target.value)} /></label>
      <label className="block text-sm">{bt("구성 작성자", "Layout author")}<input className={field} maxLength={160} value={author} disabled={disabled}
        onChange={(event) => setAuthor(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <button className={control} type="button" disabled={disabled || !name.trim()} onClick={makeLink}>{bt("복제 링크 만들기", "Create clone link")}</button>
        {link ? <button className={control} type="button" disabled={disabled} onClick={() => { void copyLink(); }}>{bt("링크 복사", "Copy link")}</button> : null}
      </div>
      {link ? <label className="block text-sm">{bt("복제 링크", "Clone link")}<input className={field} readOnly value={link}
        aria-label={bt("복제 링크", "Clone link")} onFocus={(event) => event.target.select()} /></label> : null}
    </div>
    <div className="space-y-3 rounded-lg border border-line p-3">
      <h3 className="text-sm font-semibold">{bt("링크로 공간 가져오기", "Import a space from a link")}</h3>
      <label className="block text-sm">{bt("복제 링크 붙여넣기", "Paste a clone link")}<textarea className={field} rows={3} value={pasted} disabled={disabled}
        onChange={(event) => setPasted(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <button className={control} type="button" disabled={disabled || !pasted.trim()} onClick={inspectPasted}>{bt("링크 확인", "Inspect link")}</button>
        {proposal ? <button className={control} type="button" onClick={() => { setProposal(null); setConfirmed(false); }}>{bt("가져오기 취소", "Cancel import")}</button> : null}
      </div>
      {proposal ? <div className="space-y-2 rounded-lg border border-line p-3" aria-label={bt("가져오기 전 미리보기", "Preview before import")}>
        <h4 className="break-words font-semibold">{proposal.snapshot.name}</h4>
        <p className="text-sm">{bt("방 / 소품 / NPC", "Rooms / props / NPCs")} · {proposal.summary.rooms} / {proposal.summary.props} / {proposal.summary.npcs}</p>
        <p className="text-xs">{bt("총 오브젝트", "Total objects")} · {proposal.summary.objects}</p>
        {proposal.summary.tileEffects > 0 ? <p className="text-xs">{bt("타일 효과", "Tile effects")} · {proposal.summary.tileEffects}</p> : null}
        {proposal.snapshot.author ? <p className="text-xs">{bt("작성자", "Author")} · {proposal.snapshot.author}</p> : null}
        <p className="text-xs">{bt("위 정보는 보낸 사람이 적은 주장입니다. 프로그램 검증은 공유 권한을 보증하지 않습니다.", "These details are the sender's claims. Software validation does not certify sharing rights.")}</p>
        <label className="flex min-h-11 items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} disabled={disabled}
          onChange={(event) => setConfirmed(event.target.checked)} />
          {bt("현재 공간 초안이 이 스냅샷의 구성으로 교체될 수 있음을 확인합니다. 서버 게시에는 영향이 없습니다.", "I understand that this may replace the current space draft with the snapshot layout. Server publication is not affected.")}</label>
        <button className={control} type="button" disabled={disabled || !confirmed} onClick={apply}>{bt("이 구성 적용", "Apply this layout")}</button>
      </div> : null}
    </div>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </section>;
}
