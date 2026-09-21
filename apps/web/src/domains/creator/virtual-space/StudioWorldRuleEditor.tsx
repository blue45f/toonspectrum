import { useLayoutEffect, useState } from "react";
import { studioWorldInteractionRuleSchema, type StudioWorldInteractionRule } from "@toonspectrum/studio-project-model/world-publication";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { studioWorldInteractions, validateStudioWorldManifest, type StudioVirtualSpaceWorldManifest as World } from "./studio-virtual-space-world-manifest";
import type { StudioVirtualSpaceActivity } from "./studio-virtual-space-model";
import { evaluateStudioWorldInteraction } from "./studio-world-interaction-rule";

const control = "min-h-11 max-w-full rounded-lg border border-line bg-card px-3 text-sm disabled:opacity-50";
const actions = ["community", "story", "comic", "canvas", "review", "assets", "assistant", "live"] as const;
const activities = [["available", "작업 가능", "Available"], ["focused", "집중 중", "Focused"], ["reviewing", "검수 중", "Reviewing"], ["away", "자리 비움", "Away"]] as const;
interface Draft { readonly base: World; readonly rule: StudioWorldInteractionRule; readonly existing: boolean }
export function StudioWorldRuleEditor({ world, scope, disabled, onChange }: { readonly world: World; readonly scope: string;
  readonly disabled: boolean; readonly onChange: (world: World) => void }) {
  const bt = useBilingual("StudioWorldRuleEditor"), [draft, setDraft] = useState<Draft | null>(null), [message, setMessage] = useState("");
  const [testActivity, setTestActivity] = useState<StudioVirtualSpaceActivity>("available"), [removing, setRemoving] = useState<{ id: string; base: World } | null>(null);
  const targets = studioWorldInteractions(world), rules = world.interactionRules ?? [];
  useLayoutEffect(() => { setDraft(null); setRemoving(null); setMessage(""); }, [scope, disabled]);
  const change = (patch: Partial<StudioWorldInteractionRule>) => setDraft((current) => current ? { ...current, rule: { ...current.rule, ...patch } } : null);
  const apply = (next: World, base: World) => {
    if (disabled || base !== world) { setMessage(bt("편집 중 다른 변경이 적용되었습니다. 입력을 복사한 뒤 최신 내용으로 다시 선택하세요.", "The world changed during editing. Preserve your input and reselect the current rule.")); return; }
    if (validateStudioWorldManifest(next).length) { setMessage(bt("조건·대상·공간 연결을 확인하세요. 초안은 바뀌지 않았습니다.", "Check conditions, target and world references. Your draft was not changed.")); return; }
    onChange(next); setDraft(null); setRemoving(null); setMessage(bt("공간 초안에 규칙을 저장했습니다. 팀 반영은 별도 게시가 필요합니다.", "Saved the rule to the world draft. Team use requires separate publication."));
  };
  const save = () => {
    if (!draft || disabled) return;
    const parsed = studioWorldInteractionRuleSchema.safeParse(draft.rule);
    if (!parsed.success) { setMessage(bt("안내문과 하나 이상의 작업 상태를 입력하세요.", "Enter both messages and at least one activity.")); return; }
    const rest = rules.filter((rule) => rule.id !== parsed.data.id);
    apply({ ...world, interactionRules: [...rest, parsed.data] }, draft.base);
  };
  const simulation = draft && targets.find((target) => target.id === draft.rule.interactionId);
  const evaluated = simulation && draft ? evaluateStudioWorldInteraction({ ...world, interactionRules: [draft.rule] }, simulation, testActivity) : null;
  return <section className="space-y-3 rounded-xl border border-line bg-card p-3" aria-label={bt("노코드 공간 동작 규칙", "No-code world action rules")}>
    <p className="text-xs text-fg-2">{bt("사용자가 도구 연결점을 직접 누를 때만 작동합니다. 현재 작업 상태를 조건으로 등록된 도구를 선택하고 다시 확인을 받습니다. 자동 스크립트·미디어·공유·결제·권한 작업은 지원하지 않습니다.", "Runs only when a user explicitly uses a tool anchor. Their activity selects a registered tool and requires confirmation. Automatic scripts, media, sharing, payments and permission changes are not supported.")}</p>
    <ul className="space-y-2">{rules.map((rule) => <li className="rounded-lg border border-line p-3 text-sm" key={rule.id}>
      <p className="break-all">{targets.find((item) => item.id === rule.interactionId)?.labelKo ?? rule.interactionId} → {rule.action}</p>
      <p className="mt-1 whitespace-pre-wrap break-words">{bt(rule.messageKo, rule.messageEn)}</p>
      <div className="mt-2 flex flex-wrap gap-2"><button className={control} type="button" disabled={disabled} onClick={() => { setDraft({ base: world, rule, existing: true }); setMessage(""); }}>{bt("규칙 편집", "Edit rule")}</button>
        <button className={control} type="button" disabled={disabled} onClick={() => setRemoving({ id: rule.id, base: world })}>{bt("규칙 제거…", "Remove rule…")}</button></div>
    </li>)}</ul>
    <button className={control} type="button" disabled={disabled || rules.length >= 32 || !targets.length} onClick={() => {
      const target = targets.find((item) => !rules.some((rule) => rule.interactionId === item.id)); if (!target) return;
      setDraft({ base: world, existing: false, rule: { id: `rule-${crypto.randomUUID()}`, interactionId: target.id, trigger: "explicit-use",
        activities: ["available", "reviewing"], action: target.action, messageKo: "", messageEn: "" } }); setMessage("");
    }}>{bt("동작 규칙 추가", "Add action rule")} · {rules.length}/32</button>
    {draft ? <form className="space-y-3 rounded-lg border border-line p-3" onSubmit={(event) => { event.preventDefault(); save(); }}>
      {draft.base !== world ? <p role="alert" className="text-sm">{bt("다른 변경이 반영되었습니다. 이전 입력으로 덮어쓰지 않습니다.", "The world changed. Older input will not overwrite it.")}</p> : null}
      <fieldset className="space-y-3" disabled={disabled}>
        <label className="block text-sm">{bt("직접 누를 도구 연결점", "Tool anchor used explicitly")}<select className={`${control} mt-1 block w-full`} value={draft.rule.interactionId} onChange={(event) => change({ interactionId: event.target.value })}>
          {targets.filter((target) => !rules.some((rule) => rule.id !== draft.rule.id && rule.interactionId === target.id)).map((item) => <option key={item.id} value={item.id}>{bt(item.labelKo, item.labelEn)}</option>)}</select></label>
        <fieldset><legend className="text-sm">{bt("실행 가능한 작업 상태", "Allowed activity states")}</legend><div className="flex flex-wrap gap-3">{activities.map(([value, ko, en]) => <label className="flex min-h-11 items-center gap-2 text-sm" key={value}>
          <input type="checkbox" checked={draft.rule.activities.includes(value)} onChange={(event) => change({ activities: event.target.checked ? [...draft.rule.activities, value] : draft.rule.activities.filter((item) => item !== value) })} />{bt(ko, en)}</label>)}</div></fieldset>
        <label className="block text-sm">{bt("확인 후 열 도구", "Tool to open after confirmation")}<select className={`${control} mt-1 block w-full`} value={draft.rule.action} onChange={(event) => change({ action: event.target.value as StudioWorldInteractionRule["action"] })}>{actions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
        <label className="block text-sm">{bt("한국어 확인 안내", "Korean confirmation message")}<input className={`${control} mt-1 block w-full`} maxLength={160} required value={draft.rule.messageKo} onChange={(event) => change({ messageKo: event.target.value })} /></label>
        <label className="block text-sm">{bt("영어 확인 안내", "English confirmation message")}<input className={`${control} mt-1 block w-full`} maxLength={160} required value={draft.rule.messageEn} onChange={(event) => change({ messageEn: event.target.value })} /></label>
        <div className="rounded-lg border border-line p-3"><label className="text-sm">{bt("로컬 조건 시험", "Local condition test")} <select className={control} value={testActivity} onChange={(event) => setTestActivity(event.target.value as StudioVirtualSpaceActivity)}>{activities.map(([value, ko, en]) => <option key={value} value={value}>{bt(ko, en)}</option>)}</select></label>
          <p role="status" className="mt-2 text-xs">{evaluated?.kind === "confirm" ? bt("확인 창을 거쳐 선택한 도구를 열게 됩니다. 지금은 실행하지 않았습니다.", "Would ask for confirmation before opening the chosen tool. Nothing was executed.")
            : evaluated?.kind === "blocked" ? bt("이 상태에서는 실행하지 않습니다.", "Does not run in this activity.") : bt("조건과 안내를 먼저 입력하세요.", "Complete the conditions and messages first.")}</p></div>
        <button className={control} type="submit" disabled={draft.base !== world}>{bt("검증하고 규칙 저장", "Validate and save rule")}</button>
      </fieldset><button className={control} type="button" onClick={() => setDraft(null)}>{bt("규칙 편집 취소", "Cancel rule edit")}</button>
    </form> : null}
    {removing ? <p className="rounded-lg border border-line p-3 text-sm">{bt("이 공간 규칙만 제거하고 원래 도구 연결로 되돌립니다.", "Remove only this rule and restore the original tool action.")} <button type="button" className={control} disabled={disabled || removing.base !== world} onClick={() => apply({ ...world, interactionRules: rules.filter((rule) => rule.id !== removing.id) }, removing.base)}>{bt("규칙 제거 확인", "Confirm rule removal")}</button> <button type="button" className={control} onClick={() => setRemoving(null)}>{bt("취소", "Cancel")}</button></p> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </section>;
}
