import { Check, ClipboardCopy, LockKeyhole, ShieldCheck, UserCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  PRODUCTION_ROLE_PRESETS,
  productionRolePreset,
  type ProductionRolePreset,
} from "./production-manuscript-competitive-model";

export function ProductionRolePresetPanel({ canManage }: { readonly canManage: boolean }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("rolePreset") as ProductionRolePreset["id"] | null;
  const selected = useMemo(() => productionRolePreset(
    PRODUCTION_ROLE_PRESETS.some((preset) => preset.id === requested) ? requested! : "producer",
  ), [requested]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 2_500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const select = (id: ProductionRolePreset["id"]) => {
    const next = new URLSearchParams(params);
    next.set("rolePreset", id);
    setParams(next, { replace: true });
  };

  const copy = async () => {
    const text = [
      `${selected.label} 권한 프리셋`,
      `워크스페이스 역할: ${selected.workspaceRole}`,
      `프로젝트 역할: ${selected.projectRole}`,
      `허용: ${selected.allowedActions.join(", ")}`,
      `차단: ${selected.blockedActions.join(", ")}`,
      `capabilities: ${selected.capabilities.join(", ")}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setNotice("권한 미리보기를 복사했습니다.");
    } catch {
      setNotice("복사 권한이 없습니다. 내용을 직접 확인해 주세요.");
    }
  };

  return <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="role-preset-title" data-production-role-presets="">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">ROLE PRESETS · ACTION PREVIEW</p><h2 id="role-preset-title" className="mt-2 text-xl font-black text-fg">역할 이름보다 실제 가능한 행동을 먼저 확인합니다</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">프리셋은 최소 권한을 설명하고 초대 폼을 채우는 보조 도구입니다. 서버가 강제하지 않는 공정별 ACL을 있다고 주장하거나 기존 작품 권한을 넓히지 않습니다.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copy()} className={buttonClass({ variant: "outline", size: "sm" })}><ClipboardCopy className="size-4" aria-hidden="true" /> 미리보기 복사</button><Link to={`/production/workspaces?rolePreset=${encodeURIComponent(selected.id)}`} className={buttonClass({ size: "sm" })}><UserCog className="size-4" aria-hidden="true" /> 팀 초대에서 사용</Link></div>
    </div>

    <div className="mt-5 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="제작 역할 프리셋">
      {PRODUCTION_ROLE_PRESETS.map((preset) => <button key={preset.id} type="button" role="tab" aria-selected={selected.id === preset.id} onClick={() => select(preset.id)} className={cn("min-h-11 shrink-0 rounded-xl border px-3 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", selected.id === preset.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg-2")}>{preset.label}</button>)}
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_18rem]">
      <article className="rounded-2xl border border-good/30 bg-good/10 p-4"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-good" aria-hidden="true" /><h3 className="font-black text-fg">허용되는 행동</h3></div><p className="mt-2 text-xs text-fg-2">{selected.description}</p><ul className="mt-3 space-y-2">{selected.allowedActions.map((action) => <li key={action} className="flex items-start gap-2 text-sm text-fg-2"><Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />{action}</li>)}</ul></article>
      <article className="rounded-2xl border border-warn/30 bg-warn/10 p-4"><div className="flex items-center gap-2"><LockKeyhole className="size-4 text-warn" aria-hidden="true" /><h3 className="font-black text-fg">차단·별도 승인 행동</h3></div><p className="mt-2 text-xs text-fg-2">권한 저장 전에 사용자가 할 수 없는 작업을 명시합니다.</p><ul className="mt-3 space-y-2">{selected.blockedActions.map((action) => <li key={action} className="flex items-start gap-2 text-sm text-fg-2"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />{action}</li>)}</ul></article>
      <aside className="rounded-2xl border border-line bg-panel p-4"><h3 className="font-black text-fg">적용 제안</h3><dl className="mt-3 space-y-3 text-xs"><div><dt className="text-fg-3">워크스페이스</dt><dd className="mt-1 font-bold text-fg">{selected.workspaceRole}</dd></div><div><dt className="text-fg-3">프로젝트</dt><dd className="mt-1 font-bold text-fg">{selected.projectRole}</dd></div><div><dt className="text-fg-3">세부 capability</dt><dd className="mt-1 break-words font-mono text-[0.625rem] text-fg-2">{selected.capabilities.join(" · ")}</dd></div></dl>{!canManage ? <p className="mt-4 rounded-xl border border-line bg-card p-3 text-xs text-fg-3">현재 계정은 권한 미리보기만 할 수 있습니다.</p> : null}</aside>
    </div>
    {notice ? <p className="mt-4 text-xs text-fg-2" role="status">{notice}</p> : null}
  </section>;
}
