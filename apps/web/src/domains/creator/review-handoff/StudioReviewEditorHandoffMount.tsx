import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { listeners as authListeners } from "@/domains/auth/public/session/auth-session-state";
import { Button } from "@/shared/components/ui/button";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioReviewCaptureHostBindings } from "../review-capture/studio-review-capture-host-context";
import { useStudioStableHandlers } from "../studio-stable-handlers";

import { readStudioReviewEditorAuthority } from "./studio-review-editor-authority";
import { EMPTY_STUDIO_REVIEW_EDITOR, StudioReviewEditorError, StudioReviewEditorHandoff,
  type StudioReviewEditorFailure, type StudioReviewEditorRequest } from "./studio-review-editor-handoff";
import { studioReviewEditorHostBindings, type StudioReviewEditorHostNavigation } from "./studio-review-editor-host";
import { studioReviewEditorRequestFromLocation } from "./studio-review-editor-route";

interface Props { readonly bindings: StudioReviewCaptureHostBindings; readonly navigation: StudioReviewEditorHostNavigation }
function message(reason: StudioReviewEditorFailure, bt: (ko: string, en: string) => string) {
  switch (reason) {
    case "access-denied": return bt("현재 원고나 검수본의 편집 권한을 확인할 수 없어요.", "Editing access to this manuscript or review could not be confirmed.");
    case "unmapped": return bt("이 의견에는 정확한 원고 위치가 없어요. 검수본에서 내용을 확인해 주세요.", "This comment has no exact manuscript location. Read it in the review.");
    case "source-changed": return bt("현재 저장본이 의견의 검수본과 달라요. 최신 검수본의 의견을 열어 주세요.", "The current saved manuscript differs from this review. Open a comment from its latest review.");
    case "unsaved": return bt("저장되지 않은 변경이 있어 위치를 선택하지 않았어요. 변경을 저장한 뒤 최신 검수본을 확인해 주세요.", "Unsaved changes prevented selection. Save your changes, then check the latest review.");
    case "navigation-rejected": return bt("페이지를 이동할 수 없어 위치를 선택하지 않았어요. 진행 중인 입력을 마친 뒤 다시 확인해 주세요.", "The page could not be opened. Finish the current input, then try again.");
    case "context-changed": return bt("확인 중 문서나 작업 상태가 바뀌었어요. 준비되면 다시 확인해 주세요.", "The document or editing state changed during verification. Try again when ready.");
    default: return bt("원고를 불러오고 진행 중인 입력을 마친 뒤 다시 확인해 주세요.", "Wait for the manuscript to load and finish any active input, then try again.");
  }
}

function Handoff({ bindings, navigation, request }: Props & { readonly request: StudioReviewEditorRequest }) {
  const bt = useBilingual("StudioReviewEditorHandoffMount");
  const host = useStudioStableHandlers(studioReviewEditorHostBindings(bindings, navigation));
  const current = useRef<{ controller: StudioReviewEditorHandoff; unsubscribe: () => void } | null>(null);
  const [snapshot, setSnapshot] = useState(EMPTY_STUDIO_REVIEW_EDITOR);
  const [dismissed, setDismissed] = useState(false);
  const cancel = useCallback(() => { current.current?.controller.cancel(); }, []);
  const start = useCallback(() => {
    let owner = current.current;
    if (!owner) {
      const controller = new StudioReviewEditorHandoff({ ...host, now: Date.now,
        readAuthority: readStudioReviewEditorAuthority,
        readSaved: async (id, signal) => {
          const client = await import("../studio-shared-document-client");
          try { return await client.getStudioSharedDocument(id, signal); }
          catch (error) {
            if (client.isStudioSharedDocumentAccessError(error)) throw new StudioReviewEditorError("access-denied");
            throw error;
          }
        },
        digest: async (doc) => (await import("../virtual-space/studio-virtual-space-review-producer")).studioReviewCaptureContentDigest(doc),
      });
      owner = { controller, unsubscribe: controller.subscribe(() => {
        if (current.current?.controller === controller) setSnapshot(controller.getSnapshot());
      }) };
      current.current = owner;
    }
    void owner.controller.start(request);
  }, [host, request]);
  useLayoutEffect(() => {
    const invalidate = () => { current.current?.controller.cancel(); };
    const hide = () => { if (document.visibilityState === "hidden") invalidate(); };
    authListeners.add(invalidate);
    window.addEventListener("blur", invalidate); document.addEventListener("visibilitychange", hide);
    return () => {
      authListeners.delete(invalidate); window.removeEventListener("blur", invalidate);
      document.removeEventListener("visibilitychange", hide);
      const owner = current.current; current.current = null;
      owner?.unsubscribe(); owner?.controller.dispose();
    };
  }, []);
  if (dismissed) return null;
  const checking = snapshot.phase === "checking";
  const detail = snapshot.reason ? message(snapshot.reason, bt)
    : snapshot.phase === "selected" ? snapshot.extent === "object"
      ? bt("의견에 연결된 요소를 선택했어요.", "Selected the element linked to this comment.")
      : snapshot.extent === "cut" ? bt("의견에 연결된 컷을 선택했어요.", "Selected the cut linked to this comment.")
        : bt("의견에 연결된 페이지를 열었어요. 좌표·영역은 검수본에서 확인할 수 있어요.", "Opened the comment’s page. Check the review for its exact point or region.")
    : checking ? bt("저장본과 편집 권한, 의견 위치를 확인하고 있어요.", "Checking the saved manuscript, editing access and comment location.")
      : snapshot.phase === "cancelled" ? bt("위치 확인을 중단했어요. 다시 눌러 확인할 수 있어요.", "Location verification stopped. Select again to retry.")
        : bt("현재 저장본과 검수본이 같을 때 의견의 페이지·컷·요소를 선택해요.", "Select the comment’s page, cut or element when this manuscript matches the review.");
  return <aside aria-label={bt("검수 의견 위치", "Review comment location")}
    className="fixed bottom-4 left-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border bg-background p-4 shadow-lg">
    <p role="status" className="text-sm">{detail}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" size="sm" className="min-h-11" disabled={checking} onClick={start}>
        {bt("의견 위치 선택", "Select comment location")}
      </Button>
      {checking && <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={cancel}>
        {bt("확인 중단", "Stop checking")}</Button>}
      <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => { cancel(); setDismissed(true); }}>
        {bt("닫기", "Close")}</Button>
    </div>
  </aside>;
}

export function StudioReviewEditorHandoffMount({ bindings, navigation }: Props) {
  const request = studioReviewEditorRequestFromLocation(bindings.workId, navigation.search);
  if (!request) return null;
  return <Handoff key={JSON.stringify([bindings.studioAuthUserId, request])} bindings={bindings} navigation={navigation} request={request} />;
}
