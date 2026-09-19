import { useEffect, useRef, useState } from "react";

import { createStudioNativeBrushProbeClient } from "./studio-native-brush-probe-client";
import {
  NATIVE_BRUSH_PROBE_BATCH, NATIVE_BRUSH_PROBE_HEIGHT as HEIGHT,
  NATIVE_BRUSH_PROBE_MAX_SAMPLES, NATIVE_BRUSH_PROBE_WIDTH as WIDTH,
} from "./studio-native-brush-probe-contract";

import type { StudioNativeBrushProbeClient } from "./studio-native-brush-probe-client";
import type { NativeBrushProbeEngine, NativeBrushProbeReply, NativeBrushProbeSample, NativeBrushProbeStyle } from "./studio-native-brush-probe-contract";
import type { PointerEvent as ReactPointerEvent } from "react";

interface Gesture {
  pointer: number; start: number; lastTime: number; pending: NativeBrushProbeSample[];
  accepted: number; busy: boolean; initialized: boolean; ended: boolean;
}
const CONTROL = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm text-fg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
export default function StudioNativeBrushEngineProbe({ color, strokeWidth }: { color: string; strokeWidth: number }) {
  const [engine, setEngine] = useState<NativeBrushProbeEngine>("libmypaint");
  const [style, setStyle] = useState<NativeBrushProbeStyle>("ink");
  const [ready, setReady] = useState(false), [active, setActive] = useState(false);
  const [status, setStatus] = useState("시험 시작을 누르면 선택한 엔진만 불러옵니다.");
  const canvas = useRef<HTMLCanvasElement>(null);
  const client = useRef<StudioNativeBrushProbeClient | null>(null);
  const gesture = useRef<Gesture | null>(null);
  useEffect(() => () => { const old = client.current; client.current = null; gesture.current = null; old?.dispose(); }, []);
  function stop() {
    const old = client.current; client.current = null; gesture.current = null; old?.dispose();
    setReady(false); setActive(false);
  }
  function reportFailure(owner: StudioNativeBrushProbeClient, error: unknown) {
    if (client.current !== owner) return;
    stop(); setStatus(error instanceof Error ? error.message : String(error));
  }
  function paint(reply: NativeBrushProbeReply) {
    if (reply.type !== "frame" || !reply.frame) return;
    const frame = reply.frame, context = canvas.current?.getContext("2d");
    if (frame.kind === "bitmap") {
      try { if (context) { context.clearRect(0, 0, WIDTH, HEIGHT); context.drawImage(frame.bitmap, 0, 0); } }
      finally { frame.bitmap.close(); }
    } else if (context) {
      // Native dirty frames are replacement pixels, including transparent/eraser changes.
      context.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), frame.x, frame.y);
    }
  }
  async function drain() {
    const current = gesture.current, owner = client.current;
    if (!current || !owner || current.busy || !current.initialized || (!current.pending.length && !current.ended)) return;
    current.busy = true;
    try {
      const reply = await owner.request(current.pending.length
        ? { type: "append", samples: current.pending.splice(0, NATIVE_BRUSH_PROBE_BATCH) }
        : { type: "finish" });
      if (client.current !== owner || gesture.current !== current) {
        if (reply.type === "frame" && reply.frame?.kind === "bitmap") reply.frame.bitmap.close();
        return;
      }
      paint(reply); current.busy = false;
      if (reply.type === "frame" && reply.finished) {
        gesture.current = null; setActive(false);
        setStatus(`${engine} · ${reply.samples}개 입력 처리 완료. 다시 그리면 새 시험 획으로 교체됩니다.`);
      } else { void drain(); }
    } catch (error) { reportFailure(owner, error); }
  }
  function enqueue(event: ReactPointerEvent<HTMLCanvasElement>, terminal = false) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId || current.ended) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const events = coalesced.length ? coalesced : [event.nativeEvent];
    for (const sample of events) {
      if (current.accepted >= NATIVE_BRUSH_PROBE_MAX_SAMPLES) { current.ended = true; break; }
      const time = Math.max(current.lastTime, sample.timeStamp - current.start, 0);
      current.lastTime = time;
      current.pending.push({
        x: Math.max(0, Math.min(WIDTH, (sample.clientX - rect.left) / rect.width * WIDTH)),
        y: Math.max(0, Math.min(HEIGHT, (sample.clientY - rect.top) / rect.height * HEIGHT)),
        pressure: Math.max(0, Math.min(1, sample.pointerType === "pen" ? sample.pressure : sample.pressure || (terminal ? 0 : 0.5))),
        tiltX: Math.max(-1, Math.min(1, (sample.tiltX || 0) / 90)),
        tiltY: Math.max(-1, Math.min(1, (sample.tiltY || 0) / 90)), tMs: time,
      });
      current.accepted += 1;
    }
    if (terminal) current.ended = true;
    void drain();
  }
  async function start() {
    stop(); setStatus("선택한 엔진을 준비하고 있습니다.");
    let owner: StudioNativeBrushProbeClient;
    try { owner = createStudioNativeBrushProbeClient(); client.current = owner; }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); return; }
    try {
      await owner.request({ type: "init", engine });
      if (client.current !== owner) return;
      setReady(true); setStatus(`${engine} 준비 완료. 아래에서 펜·손가락·마우스로 한 획을 그려보세요.`);
    } catch (error) { reportFailure(owner, error); }
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const owner = client.current;
    if (!ready || !owner || gesture.current || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const current: Gesture = { pointer: event.pointerId, start: event.timeStamp, lastTime: 0, pending: [], accepted: 0, busy: false, initialized: false, ended: false };
    gesture.current = current; setActive(true); setStatus("시험 획 처리 중…");
    enqueue(event);
    void owner.request({ type: "begin", config: {
      size: Math.min(128, Math.max(1, Number.isFinite(strokeWidth) ? strokeWidth : 12)),
      color: /^#[0-9a-f]{6}$/iu.test(color) ? color : "#123456", style, seed: 7,
    } }).then(() => {
      if (client.current !== owner || gesture.current !== current) return;
      canvas.current?.getContext("2d")?.clearRect(0, 0, WIDTH, HEIGHT);
      current.initialized = true; void drain();
    }).catch((error: unknown) => reportFailure(owner, error));
  }
  return <section className="space-y-3 rounded-xl border border-line p-3" aria-label="실제 브러시 엔진 시험">
    <h3 className="text-sm font-semibold text-fg">실제 엔진 시험 캔버스</h3>
    <p className="text-xs leading-relaxed text-fg-3">별도 Worker에서 한 획씩 비교합니다. 이 시험은 메인 작품과 저장 브러시 설정에 적용되지 않습니다.</p>
    <div className="flex flex-wrap gap-2">
      <select aria-label="시험 엔진" className={CONTROL} value={engine} disabled={active} onChange={(event) => { stop(); setEngine(event.target.value as NativeBrushProbeEngine); setStatus("시험 시작을 눌러 선택한 엔진을 준비하세요."); }}>
        <option value="libmypaint">libmypaint · 자연매체 WASM</option>
        <option value="canvaskit">CanvasKit · WebGL2</option>
        <option value="vello">Vello · WebGPU</option>
      </select>
      <select aria-label="MyPaint 시험 재질" className={CONTROL} value={style} disabled={active || engine !== "libmypaint"} onChange={(event) => setStyle(event.target.value as NativeBrushProbeStyle)}>
        <option value="ink">잉크</option><option value="wash">워시</option><option value="chalk">초크</option>
      </select>
      <button type="button" className={CONTROL} disabled={active} onClick={() => { void start(); }}>시험 시작</button>
      <button type="button" className={CONTROL} onClick={() => { stop(); setStatus("시험 엔진을 종료했습니다."); }}>시험 종료</button>
    </div>
    <canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="실제 엔진 한 획 시험 캔버스"
      className="block w-full rounded-lg border border-line bg-white" style={{ touchAction: "none", aspectRatio: "2 / 1" }}
      onPointerDown={pointerDown} onPointerMove={(event) => enqueue(event)}
      onPointerUp={(event) => { enqueue(event, true); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { stop(); setStatus("시험 획이 취소되었습니다. 시험 시작을 다시 눌러주세요."); }}
      onLostPointerCapture={(event) => { const current = gesture.current; if (current && current.pointer === event.pointerId && !current.ended) { current.ended = true; void drain(); } }} />
    <p role="status" className="text-xs leading-relaxed text-fg-2">{status}</p>
    <p className="text-xs leading-relaxed text-fg-3">CanvasKit과 Vello는 동일한 필압 벡터 윤곽선을, libmypaint는 선택한 자연매체 설정을 사용합니다. 시험 해상도는 512×256이며, 미지원 엔진은 다른 엔진으로 자동 전환하지 않습니다.</p>
  </section>;
}
