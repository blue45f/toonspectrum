import { Megaphone, Send, Square } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { MegaphoneScope } from "./studio-virtual-space-megaphone";
import type { StudioVirtualSpaceMegaphoneBinding } from "./use-studio-virtual-space-megaphone";

export interface StudioVirtualSpaceMegaphonePanelProps {
  readonly binding: StudioVirtualSpaceMegaphoneBinding;
}

/**
 * 메가폰 방송 패널 (죽은 동선 배선으로 도크 진입점을 연결).
 *
 * 정직 표기: 실제 음성 송출은 아직 실시간 채널에 연결되지 않았다. 방송
 * 상태·자막은 이 기기에서만 보이는 로컬 시뮬레이션이며, 화면 공유를 켜면
 * 기존 근접 미디어의 방송 범위 공유가 함께 시작된다.
 */
export function StudioVirtualSpaceMegaphonePanel({ binding }: StudioVirtualSpaceMegaphonePanelProps) {
  const bt = useBilingual("StudioVirtualSpaceMegaphonePanel");
  const [scope, setScope] = useState<MegaphoneScope>("room");
  const [shareScreen, setShareScreen] = useState(false);
  const [caption, setCaption] = useState("");
  const { snapshot } = binding;
  const broadcasting = snapshot.status === "broadcasting";

  return (
    <section aria-label={bt("메가폰 방송", "Megaphone broadcast")}>
      <h2><Megaphone size={17} aria-hidden /> {bt("메가폰 방송", "Megaphone broadcast")}</h2>
      <p className="space-panel-note">
        {bt(
          "아직 실제 음성 송출은 연결되지 않았어요. 방송 상태와 자막은 이 기기에서만 보이는 로컬 시뮬레이션이고, 화면 공유는 실제 근접 미디어로 시작돼요.",
          "Live voice delivery isn't connected yet. Broadcast state and captions are a local simulation visible only on this device; screen sharing does start through proximity media.",
        )}
      </p>
      {!binding.canBroadcast ? (
        <p role="status">
          {bt("메가폰 방송은 공간 소유자·관리자만 시작할 수 있어요.", "Only space owners and admins can start a megaphone broadcast.")}
        </p>
      ) : broadcasting ? (
        <>
          <p role="status">
            {bt(
              `방송 중 · ${snapshot.scope === "world" ? "공간 전체" : "지금 방"} · ${snapshot.broadcasterName}`,
              `Live · ${snapshot.scope === "world" ? "whole space" : "this room"} · ${snapshot.broadcasterName}`,
            )}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const text = caption.trim();
              if (!text) return;
              binding.pushCaption(text);
              setCaption("");
            }}
          >
            <label>
              {bt("자막 보내기", "Send a caption")}
              <input
                type="text"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder={bt("청취자에게 보일 한 줄 자막", "A one-line caption for listeners")}
              />
            </label>
            <button type="submit" disabled={!caption.trim()}>
              <Send size={14} aria-hidden /> {bt("자막 전송", "Send caption")}
            </button>
          </form>
          <button type="button" onClick={() => binding.stop()}>
            <Square size={14} aria-hidden /> {bt("방송 종료", "End broadcast")}
          </button>
        </>
      ) : (
        <>
          <fieldset>
            <legend>{bt("방송 범위", "Broadcast scope")}</legend>
            <div className="studio-vspace-customization-options">
              <button type="button" aria-pressed={scope === "room"} onClick={() => setScope("room")}>
                {bt("지금 방", "This room")}
              </button>
              <button type="button" aria-pressed={scope === "world"} onClick={() => setScope("world")}>
                {bt("공간 전체", "Whole space")}
              </button>
            </div>
          </fieldset>
          <label>
            <input type="checkbox" checked={shareScreen} onChange={(event) => setShareScreen(event.target.checked)} />
            {bt("화면 공유도 함께 시작", "Also start screen sharing")}
          </label>
          <button type="button" onClick={() => { void binding.start(scope, { shareScreen }); }}>
            <Megaphone size={14} aria-hidden /> {bt("방송 시작", "Start broadcast")}
          </button>
        </>
      )}
      {snapshot.status === "failed" && snapshot.error ? (
        <p role="alert">{snapshot.error}</p>
      ) : null}
      {broadcasting && snapshot.captions.length > 0 ? (
        <ul aria-label={bt("보낸 자막", "Sent captions")}>
          {snapshot.captions.map((line) => <li key={line.id}>{line.textKo}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
