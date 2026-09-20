import { useCallback, useEffect, useRef, useState } from "react";

import { collabButton, collabInput } from "../collaboration-ui";

const pageIsHidden = () => document.visibilityState === "hidden";

export function DeviceTest() {
  const generation = useRef(0);
  const pending = useRef<object | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState("꺼짐");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"both" | "audio" | "video">("both");
  const stop = useCallback((message = "꺼짐") => {
    generation.current++;
    clearTimeout(timer.current); timer.current = undefined;
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (mounted.current) setState(message);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (pageIsHidden()) stop(); };
    const pagehide = () => stop();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pagehide);
    return () => {
      mounted.current = false; stop();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pagehide);
    };
  }, [stop]);
  async function test() {
    if (pending.current || pageIsHidden()) return;
    stop();
    const token = {}; pending.current = token;
    const current = generation.current;
    setBusy(true); setState("브라우저의 장치 권한 응답을 기다리고 있어요.");
    timer.current = setTimeout(() => stop("장치 권한 응답이 없어 테스트를 중지했어요. 브라우저 권한 창에서 허용 또는 차단을 선택해 주세요."), 30000);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
      const captured = await navigator.mediaDevices.getUserMedia({ audio: mode !== "video", video: mode !== "audio" });
      if (!mounted.current || current !== generation.current || pageIsHidden()) {
        captured.getTracks().forEach((track) => track.stop()); return;
      }
      clearTimeout(timer.current);
      stream.current = captured;
      if (video.current) video.current.srcObject = mode === "audio" ? null : captured;
      setState("이 기기에서만 확인 중 · 30초 뒤 자동 종료");
      timer.current = setTimeout(() => stop(), 30000);
    } catch {
      if (mounted.current && current === generation.current) {
        clearTimeout(timer.current); timer.current = undefined;
        setState("장치를 열지 못했어요. 브라우저 권한과 장치 연결을 확인해 주세요.");
      }
    } finally {
      if (pending.current === token) { pending.current = null; if (mounted.current) setBusy(false); }
    }
  }
  return <details onToggle={(event) => { if (!event.currentTarget.open) stop(); }}>
    <summary className="cursor-pointer py-2">내 마이크·카메라 장치 확인</summary>
    <p className="my-2 text-xs">버튼을 누를 때만 선택한 장치를 엽니다. 전송·녹음하거나 테스트 소리를 재생하지 않습니다. 창을 접거나 다른 탭으로 이동하면 장치를 끕니다.</p>
    <label className="my-3 flex items-center gap-2">테스트할 장치
      <select className={collabInput} disabled={busy} value={mode} onChange={(event) => { stop(); setMode(event.target.value as typeof mode); }}>
        <option value="both">마이크·카메라</option><option value="audio">마이크만</option><option value="video">카메라만</option>
      </select>
    </label>
    <div className="flex gap-2"><button type="button" className={collabButton} disabled={busy} onClick={() => { void test(); }}>장치 테스트 시작</button><button type="button" className={collabButton} onClick={() => stop()}>장치 끄기</button></div>
    {busy && <p className="my-2 text-xs">권한 창은 브라우저에서 닫아 주세요. 이전 권한 요청이 끝나기 전에는 중복 요청하지 않습니다.</p>}
    <p role="status" className="my-2 text-sm">{state}</p>
    <video ref={video} muted autoPlay playsInline className="max-h-48 w-full rounded bg-black" aria-label="내 기기 카메라 미리보기" />
  </details>;
}
