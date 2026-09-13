import type { useStudioDurableSaveIntent } from "./use-studio-durable-save-intent";

export function StudioDurableSaveIntentPanel({ state, saving, deferredSave }: {
  state: ReturnType<typeof useStudioDurableSaveIntent>;
  saving: boolean;
  deferredSave: boolean;
}) {
  return (
            <section aria-label="재실행 후 저장 대기" className="mt-3 rounded-xl border border-warning/40 bg-warning-soft/20 p-3 text-xs text-warning">
              <p role="status" className="font-bold">
                {state.phase === "writing" ? "기기에 저장 대기 기록 중" : state.entry ? "다시 켜도 저장 대기를 기억해요" : "저장 대기 기록 확인 필요"}
              </p>
              <p className="mt-1 leading-relaxed">
                원고 내용과 별개로 이 계정·문서의 저장 대기만 기기에 기록합니다. 재실행 후에는 복구할 원고를 확인하고 직접 서버에 저장해 주세요. 자동으로 덮어쓰지 않습니다.
              </p>
              {state.error ? <p role="status" className="mt-2 font-semibold">{state.error} 프로젝트 백업도 보관해 주세요.</p> : null}
              {!deferredSave ? (
                <button type="button" onClick={() => void state.cancel()} disabled={saving}
                  className="mt-2 min-h-9 rounded-lg border border-current/30 px-2.5 py-1.5 font-bold hover:bg-warning-soft/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
                  대기 기록 지우기
                </button>
              ) : null}
            </section>
  );
}
