import { PROMO_FPS, promoVoiceGain, type PromoProject } from "./promo-model";

/** Called from a user gesture; no microphone, network inference, or voice cloning. */
export async function preparePromoVoicePreview(project: PromoProject, signal: AbortSignal): Promise<{ start: (frame: number) => void; stop: () => void } | null> {
  const voice = project.voiceover;
  if (!voice) return null;
  const context = new AudioContext();
  let source: AudioBufferSourceNode | null = null;
  const stop = () => {
    signal.removeEventListener("abort", stop);
    if (source) { try { source.stop(); } catch { /* Not started. */ } source.disconnect(); }
    if (context.state !== "closed") void context.close().catch(() => undefined);
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    await context.resume();
    if (signal.aborted) throw new DOMException("취소했어요.", "AbortError");
    const response = await fetch(voice.src, { signal });
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    if (signal.aborted) throw new DOMException("취소했어요.", "AbortError");
    if (Math.abs(buffer.duration - voice.durationSec) > 0.1) throw new Error("내레이션 길이가 맞지 않아요. 음원을 다시 추가해 주세요.");
    return {
      stop,
      start(frame) {
        const time = frame / PROMO_FPS;
        const end = Math.min(project.seconds, voice.startSec + buffer.duration);
        if (time >= end) return;
        source = context.createBufferSource();
        source.buffer = buffer;
        const gain = context.createGain();
        source.connect(gain); gain.connect(context.destination);
        const startAt = context.currentTime;
        for (let f = frame; f <= Math.ceil(end * PROMO_FPS); f += 1) {
          gain.gain.setValueAtTime(promoVoiceGain(project, f), startAt + (f - frame) / PROMO_FPS);
        }
        source.start(startAt + Math.max(0, voice.startSec - time), Math.max(0, time - voice.startSec));
        source.stop(startAt + Math.max(0, end - time));
      },
    };
  } catch (error) { stop(); throw error; }
}
