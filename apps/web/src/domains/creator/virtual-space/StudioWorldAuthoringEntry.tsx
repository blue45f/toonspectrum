import { Component, lazy, Suspense, useState, type ComponentProps, type ReactNode } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { loadStudioWorldAuthoring } from "./load-studio-world-authoring";

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
  const current = attempt.scope === scope ? attempt : createAttempt(scope);
  if (current !== attempt) setAttempt(current);
  const { Editor } = current;
  return <AuthoringBoundary key={`${scope}:${current.sequence}`} fallback={<section role="alert" className="space-y-3 rounded-xl border border-line bg-card p-4 text-sm">
    <p>{bt("공간 편집 화면을 불러오지 못했습니다. 현재 공간과 초안은 그대로 유지됩니다.", "The world editor could not be loaded. Your world and draft are unchanged.")}</p>
    <button type="button" className="min-h-11 rounded-lg border border-line px-3" disabled={props.disabled}
      onClick={() => setAttempt(createAttempt(scope, current.sequence + 1))}>{bt("공간 편집 다시 불러오기", "Retry loading world editor")}</button>
  </section>}><Suspense fallback={<p role="status" className="rounded-lg border border-line bg-card p-4 text-sm">{bt("공간 편집 화면 불러오는 중…", "Loading world editor…")}</p>}>
    <Editor {...props} />
  </Suspense></AuthoringBoundary>;
}
