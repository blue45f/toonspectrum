import { Component, lazy, Suspense, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { loadStudioWorldAuthoring } from "./load-studio-world-authoring";
import { reloadStudioWorldAfterDraftSave } from "./studio-world-authoring-reload";

// Type-only reference: the live page does not import the actual editor implementation.
type Props = ComponentProps<typeof import("./StudioVirtualSpaceWorldAuthoringPanel")["StudioVirtualSpaceWorldAuthoringPanel"]>;
const createAttempt = (scope: string, sequence = 0) => ({ scope, sequence, Editor: lazy(loadStudioWorldAuthoring) });
class AuthoringBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
/** Only mounted in explicit authoring mode. Retrying never writes the parent draft or publication. */
export function StudioWorldAuthoringEntry(props: Props) {
  const bt = useBilingual("StudioWorldAuthoringEntry");
  const scope = JSON.stringify([props.projectId, props.basePublishedRevisionId, Boolean(props.disabled)]);
  const [attempt, setAttempt] = useState(() => createAttempt(scope));
  const [reloadFailed, setReloadFailed] = useState(false);
  const latest = useRef(props); latest.current = props;
  const reloading = useRef(false);
  const saveAndReload = () => {
    if (props.disabled || latest.current !== props || reloading.current) return;
    reloading.current = true;
    const ok = reloadStudioWorldAfterDraftSave(props.projectId, props.manifest, props.basePublishedRevisionId);
    if (!ok) { reloading.current = false; setReloadFailed(true); }
  };
  const current = attempt.scope === scope ? attempt : createAttempt(scope);
  if (current !== attempt) setAttempt(current);
  const { Editor } = current;
  return <AuthoringBoundary key={`${scope}:${current.sequence}`} fallback={<section role="alert" className="space-y-3 rounded-xl border border-line bg-card p-4 text-sm">
    <p>{bt("공간 편집 화면을 불러오지 못했습니다. 현재 공간과 초안은 그대로 유지됩니다.", "The world editor could not be loaded. Your world and draft are unchanged.")}</p>
    <button type="button" className="min-h-11 rounded-lg border border-line px-3" disabled={props.disabled}
      onClick={() => setAttempt(createAttempt(scope, current.sequence + 1))}>{bt("공간 편집 다시 불러오기", "Retry loading world editor")}</button>
    <p className="text-xs">{bt("브라우저가 이전 로딩 오류를 기억하면 재시도만으로 복구되지 않을 수 있습니다. 아래 동작은 현재 공간 초안을 이 브라우저에 저장·확인한 후 페이지를 새로고칩니다.", "If the browser caches a module failure, retry alone may not recover. The next action saves and verifies this world draft locally before reloading the page.")}</p>
    <button type="button" className="min-h-11 rounded-lg border border-line px-3" disabled={props.disabled} onClick={saveAndReload}>{bt("공간 초안 저장 후 페이지 새로고침", "Save world draft and reload page")}</button>
    {reloadFailed ? <p role="status">{bt("초안 저장을 확인하지 못해 새로고침하지 않았습니다. 현재 입력은 이 화면에 유지됩니다.", "The draft could not be verified in storage, so the page was not reloaded. Your current input remains here.")}</p> : null}
  </section>}><Suspense fallback={<p role="status" className="rounded-lg border border-line bg-card p-4 text-sm">{bt("공간 편집 화면 불러오는 중…", "Loading world editor…")}</p>}>
    <Editor {...props} />
  </Suspense></AuthoringBoundary>;
}
