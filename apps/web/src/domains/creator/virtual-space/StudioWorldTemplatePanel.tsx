import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import type { StudioWorldTemplatePackage } from "./studio-world-template-contract";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { createStudioWorldStarterTemplate, createStudioWorldTemplatePackage, parseStudioWorldTemplatePackage, pinStudioWorldAssets,
  retainStudioWorldPrivacy, verifyStudioWorldTemplatePackage, STUDIO_WORLD_PACKAGE_MAX_TEXT, type WorldStarterTemplate } from "./studio-world-template-package";
import { validateStudioWorldManifest, type StudioVirtualSpaceWorldManifest as World } from "./studio-virtual-space-world-manifest";

const control = "min-h-11 max-w-full rounded-lg border border-line bg-card px-3 text-sm disabled:opacity-50";
const field = `${control} mt-1 block w-full`;
interface Proposal { readonly base: World; readonly scope: string; readonly world: World; readonly title: string;
  readonly source?: StudioWorldTemplatePackage; readonly raw?: string; readonly verified: boolean }
export function StudioWorldTemplatePanel({ world, scope, disabled, onChange }: {
  readonly world: World; readonly scope: string; readonly disabled: boolean; readonly onChange: (next: World) => void;
}) {
  const bt = useBilingual("StudioWorldTemplatePanel"), input = useRef<HTMLInputElement>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [releasePins, setReleasePins] = useState<World | null>(null);
  const [title, setTitle] = useState(""), [author, setAuthor] = useState(""), [statement, setStatement] = useState(""), [rightsConfirmed, setRightsConfirmed] = useState(false);
  const request = useRef<AbortController | null>(null), epoch = useRef(0), latest = useRef({ world, scope, disabled }); latest.current = { world, scope, disabled };
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (deadline.current) clearTimeout(deadline.current); deadline.current = null; ++epoch.current; request.current?.abort(); request.current = null; setBusy(false); };
  useLayoutEffect(() => { stop(); setProposal(null); setReleasePins(null); setConfirmed(false); setRightsConfirmed(false); }, [world, scope, disabled]);
  useLayoutEffect(() => {
    const hidden = () => { if (document.visibilityState === "hidden") { stop(); setProposal(null); setConfirmed(false); } };
    document.addEventListener("visibilitychange", hidden);
    return () => { if (deadline.current) clearTimeout(deadline.current); request.current?.abort(); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  const begin = () => {
    stop(); const abort = new AbortController(); request.current = abort; const own = epoch.current;
    setBusy(true); setMessage("");
    deadline.current = setTimeout(() => {
      if (own !== epoch.current) return;
      ++epoch.current; abort.abort(); setBusy(false);
      setMessage(bt("자산 확인 시간이 초과되었습니다. 초안은 변경하지 않았습니다.", "Asset verification timed out. Your draft was not changed."));
    }, 30_000);
    return { abort, epoch: own, world, scope };
  };
  const current = (token: ReturnType<typeof begin>) => !token.abort.signal.aborted && token.epoch === epoch.current
    && token.world === latest.current.world && token.scope === latest.current.scope && !latest.current.disabled;
  const failure = () => setMessage(bt("형식·자산·권한 경계를 검증하지 못했습니다. 현재 초안은 변경하지 않았습니다.", "Format, assets or permission boundaries could not be verified. Your current draft was not changed."));
  const chooseTemplate = (kind: WorldStarterTemplate) => {
    stop(); if (disabled) return;
    try { const next = createStudioWorldStarterTemplate(kind, world); setConfirmed(false);
      setProposal({ base: world, scope, world: next, title: kind === "solo" ? bt("개인 집중 작업실", "Solo focus studio") : kind === "team" ? bt("소규모 팀 작업실", "Small-team studio") : bt("검수 시작 작업실", "Review-first studio"), verified: true });
    } catch { failure(); }
  };
  const load = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || disabled) return;
    if (file.size > STUDIO_WORLD_PACKAGE_MAX_TEXT) { failure(); return; }
    const token = begin(); setProposal(null); setConfirmed(false);
    try {
      const raw = await file.text(), parsed = await parseStudioWorldTemplatePackage(raw);
      if (!current(token)) return;
      const candidate = retainStudioWorldPrivacy(world, parsed.manifest);
      if (validateStudioWorldManifest(candidate).length) throw new Error("Invalid world");
      setProposal({ base: world, scope, world: candidate, title: parsed.title, source: parsed, raw, verified: false });
    } catch { if (current(token)) failure(); }
    finally { if (current(token)) { if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setBusy(false); } }
  };
  const verify = async () => {
    if (!proposal?.raw || disabled) return;
    const candidate = proposal, token = begin();
    try { await verifyStudioWorldTemplatePackage(candidate.raw!, token.abort.signal);
      if (current(token)) setProposal({ ...candidate, verified: true });
    } catch { if (current(token)) failure(); } finally { if (current(token)) { if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setBusy(false); } }
  };
  const pin = async () => {
    if (disabled) return;
    const token = begin();
    try { const next = await pinStudioWorldAssets(world, token.abort.signal);
      if (current(token)) { setProposal({ base: world, scope, world: next, title: bt("현재 이미지 바이트 고정", "Pin current image bytes"), verified: true }); setConfirmed(false); }
    } catch { if (current(token)) failure(); } finally { if (current(token)) { if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setBusy(false); } }
  };
  const exportPackage = async () => {
    if (disabled || busy || !title.trim() || !author.trim() || !statement.trim() || !rightsConfirmed) return;
    const token = begin();
    try {
      const result = await createStudioWorldTemplatePackage(world, { packageId: world.id, packageVersion: "1.0.0", title, description: "",
        rights: { author, statement } }, token.abort.signal);
      if (!current(token)) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
      try { const link = document.createElement("a"); link.href = url; link.download = `${world.id}.world-package.json`; link.click(); }
      finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
      setMessage(bt("검증한 템플릿 패키지를 내보냈습니다. 팀 게시나 외부 업로드는 실행하지 않았습니다.", "Exported the verified template package. No team publication or external upload was performed."));
    } catch { if (current(token)) failure(); } finally { if (current(token)) { if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setBusy(false); } }
  };
  const apply = () => {
    if (disabled || busy || !proposal || !proposal.verified || !confirmed || proposal.base !== world || proposal.scope !== scope) return;
    try { const next = retainStudioWorldPrivacy(world, proposal.world); if (validateStudioWorldManifest(next).length) throw new Error("Invalid world");
      onChange(next); setProposal(null); setConfirmed(false); setMessage(bt("로컬 초안에 한 번 적용했습니다. 팀 반영은 별도 게시가 필요합니다.", "Applied once to the local draft. Team adoption requires separate publication."));
    } catch { failure(); }
  };
  return <section className="space-y-3 rounded-xl border border-line bg-card p-3" aria-label={bt("공간 템플릿·재사용 패키지", "World templates and reusable packages")}>
    <p className="text-xs text-fg-2">{bt("원본 화풍·도구를 유지한 목적별 시작 구성입니다. 선택만으로 초안·팀 권한·문서·서버 게시를 바꾸지 않습니다.", "Purpose-oriented starter layouts preserve the original art and tools. Selection alone does not change your draft, team permissions, document or publication.")}</p>
    <div className="flex flex-wrap gap-2">{([["solo", "개인 집중 구성", "Solo focus"], ["team", "소규모 팀 구성", "Small team"], ["review", "검수 시작 구성", "Review-first"]] as const).map(([kind, ko, en]) => <button className={control} type="button" disabled={disabled || busy} key={kind} onClick={() => chooseTemplate(kind)}>{bt(ko, en)}</button>)}</div>
    <p className="text-xs">{bt("기존 비공개 영역·문 정책은 유지해야 하며 호환되지 않는 템플릿은 적용하지 않습니다.", "Existing private areas and door policies must be preserved; incompatible templates are not applied.")}</p>
    <div className="flex flex-wrap gap-2"><button className={control} type="button" disabled={disabled || busy} onClick={() => input.current?.click()}>{bt("템플릿 패키지 살펴보기", "Inspect template package")}</button>
      <button className={control} type="button" disabled={disabled || busy} onClick={() => { void pin(); }}>{bt("현재 자산 검증·고정", "Verify and pin current assets")}</button>
      {busy ? <button type="button" className={control} onClick={() => { stop(); setMessage(bt("작업을 취소했습니다. 초안은 유지됩니다.", "Cancelled. Your draft is unchanged.")); }}>{bt("검증 취소", "Cancel verification")}</button> : null}
      <input type="file" accept=".json,application/json" ref={input} className="hidden" aria-label={bt("템플릿 패키지 파일", "Template package file")} onChange={(event) => { void load(event); }} />
    </div>
    {world.assetIntegrity ? <p className="text-xs">{bt("고정된 자산", "Pinned assets")} · {world.assetIntegrity.length} · {(world.assetIntegrity.reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024).toFixed(2)} MiB</p> : <p className="text-xs">{bt("이 초안은 아직 이미지 내용 해시가 고정되지 않았습니다.", "This draft does not yet pin image content digests.")}</p>}
    {world.assetIntegrity ? <button className={control} type="button" disabled={disabled || busy} onClick={() => setReleasePins(world)}>{bt("이미지 교체를 위해 고정 해제…", "Unpin before replacing images…")}</button> : null}
    {releasePins ? <div className="space-y-2 rounded-lg border border-line p-3">
      <p className="text-sm">{bt("현재 초안에서 이미지 내용 고정을 해제합니다. 이후 자산을 교체하고 다시 검증할 수 있습니다. 이미 게시된 버전은 변경되지 않으며, 다음 패키지 출력에는 새 검증이 필요합니다.", "Remove image content pins from this local draft so assets can be replaced and verified again. Published revisions are unchanged; package export requires a new verification.")}</p>
      <button type="button" className={control} disabled={disabled || busy || releasePins !== world} onClick={() => {
        if (releasePins !== world || disabled || busy) return;
        const { assetIntegrity: _pins, ...next } = world; onChange(next); setReleasePins(null);
      }}>{bt("초안의 자산 고정 해제 확인", "Confirm unpinning this draft")}</button>
      <button type="button" className={control} onClick={() => setReleasePins(null)}>{bt("고정 유지", "Keep pins")}</button>
    </div> : null}
    {proposal ? <div className="space-y-2 rounded-lg border border-line p-3" aria-label={bt("적용 전 변경 확인", "Review before applying")}>
      <h4 className="break-words font-semibold">{proposal.title}</h4>
      <p className="text-sm">{bt("방 / 소품 / NPC", "Rooms / props / NPCs")} · {proposal.world.rooms.length} / {proposal.world.props.length} / {proposal.world.npcs.length}</p>
      {proposal.source ? <><p className="text-xs">v{proposal.source.packageVersion} · {proposal.source.rights.author}</p>
        <p className="whitespace-pre-wrap break-words text-sm">{proposal.source.rights.statement}</p>
        <p className="text-xs">{bt("위 조건은 작성자의 주장입니다. 프로그램 검증은 저작권 허가를 보증하지 않습니다.", "These conditions are the author's statement. Software verification does not guarantee legal permission.")}</p>
        <details><summary className="min-h-11 cursor-pointer text-sm">{bt("검증할 이미지 위치", "Image locations to verify")}</summary><ul className="space-y-1 text-xs">{proposal.source.manifest.assetIntegrity?.map((asset) => <li key={asset.url} className="break-all">{asset.url} · {asset.bytes} bytes</li>)}</ul></details>
        {!proposal.verified ? <button type="button" className={control} disabled={busy || disabled} onClick={() => { void verify(); }}>{bt("표시된 위치에서 이미지 읽기·검증", "Read and verify images at the listed locations")}</button> : null}</> : null}
      <label className="flex min-h-11 items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} disabled={!proposal.verified || busy || disabled} onChange={(event) => setConfirmed(event.target.checked)} />
        {bt("현재 공간 초안의 구성이 교체되며 실행 취소할 수 있음을 확인합니다. 문서·권한·서버 게시에는 영향이 없습니다.", "I understand that this replaces the local world draft and can be undone. Documents, permissions and server publication do not change.")}</label>
      <div className="flex flex-wrap gap-2"><button className={control} type="button" disabled={!proposal.verified || !confirmed || busy || disabled} onClick={apply}>{bt("확인한 구성 적용", "Apply reviewed layout")}</button>
        <button className={control} type="button" onClick={() => { stop(); setProposal(null); setConfirmed(false); }}>{bt("구성 선택 취소", "Cancel layout choice")}</button></div>
    </div> : null}
    <details className="rounded-lg border border-line p-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{bt("현재 공간을 패키지로 내보내기", "Export this world as a package")}</summary>
      <form className="mt-2 space-y-3" onSubmit={(event) => { event.preventDefault(); void exportPackage(); }}><fieldset className="space-y-3" disabled={busy || disabled}>
        <label className="block text-sm">{bt("패키지 이름", "Package name")}<input className={field} maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="block text-sm">{bt("구성 작성자", "Layout author")}<input className={field} maxLength={160} required value={author} onChange={(event) => setAuthor(event.target.value)} /></label>
        <label className="block text-sm">{bt("출처·사용 조건·제한", "Sources, usage conditions and restrictions")}<textarea className={field} rows={3} maxLength={4000} required value={statement} onChange={(event) => setStatement(event.target.value)} /></label>
        <label className="flex min-h-11 items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />{bt("공간 이름·자산 URL·조건이 파일에 포함됨을 확인했습니다. 공유할 권한과 민감 정보를 직접 확인했습니다.", "I checked that room names, asset URLs and conditions are included, and reviewed sharing rights and sensitive information.")}</label>
        <button type="submit" className={control} disabled={!rightsConfirmed || !title.trim() || !author.trim() || !statement.trim()}>{bt("자산 검증 후 패키지 내보내기", "Verify assets and export package")}</button>
      </fieldset></form></details>
    {busy ? <p role="status" className="text-sm">{bt("형식과 실제 이미지 바이트 검증 중…", "Verifying format and actual image bytes…")}</p> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </section>;
}
