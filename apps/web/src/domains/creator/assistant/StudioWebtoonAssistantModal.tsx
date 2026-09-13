import { useEffect, useState } from "react";

import { studioWebtoonAssistantLoader } from "./studio-webtoon-assistant-loader";

import type { StudioWebtoonAssistantModalProps } from "./StudioWebtoonAssistantContent";

export type { AssistantActiveTab, StudioWebtoonAssistantModalProps } from "./StudioWebtoonAssistantContent";
type AssistantModule = typeof import("./StudioWebtoonAssistantContent");

/**
 * Keep the original assistant mounted after its first successful activation so closing and
 * reopening retains in-session tab/input/timer state. Before that intent, neither the modal
 * implementation nor its dictionaries are requested. Import failures never reload the canvas.
 */
export function StudioWebtoonAssistantModal(props: StudioWebtoonAssistantModalProps) {
  const { open, onClose } = props;
  const [loaded, setLoaded] = useState<AssistantModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    setFailed(false);
    void studioWebtoonAssistantLoader.load().then(
      (module) => { if (active) setLoaded(module); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [open, loaded, attempt]);

  useEffect(() => {
    if (!open || loaded) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [open, loaded, onClose]);

  if (loaded) return <loaded.StudioWebtoonAssistantModal {...props} />;
  if (!open) return null;
  return (
    <aside className="fixed bottom-4 right-4 z-[190] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-panel p-4 text-sm text-fg shadow-xl"
      aria-label="웹툰 창작 보조 센터 불러오기">
      <p role={failed ? "alert" : "status"}>{failed
        ? "보조 센터를 불러오지 못했습니다. 캔버스는 그대로 유지됩니다."
        : "웹툰 창작 보조 센터를 여는 중…"}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {failed ? <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={() => setAttempt((value) => value + 1)}>다시 시도</button> : null}
        <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={onClose}>열기 취소</button>
      </div>
    </aside>
  );
}
