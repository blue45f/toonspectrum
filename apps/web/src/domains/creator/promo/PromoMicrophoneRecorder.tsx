import { useEffect, useRef, useState } from "react";

const MAX_RECORDING_MS = 180_000;
const MAX_RECORDING_BYTES = 20_000_000;

function preferredRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PromoMicrophoneRecorder({
  disabled,
  onRecorded,
}: {
  disabled: boolean;
  onRecorded: (blob: Blob) => Promise<void> | void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [message, setMessage] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const supported = typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== "undefined";

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };
  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };
  const finishRecorder = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  useEffect(() => () => {
    cancelledRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = () => {
    if (!recording) return;
    finishRecorder();
  };

  const cancel = () => {
    cancelledRef.current = true;
    chunksRef.current = [];
    finishRecorder();
    stopTimer();
    stopTracks();
    setRecording(false);
    setElapsedMs(0);
    setMessage("마이크 녹음을 취소했어요.");
  };

  const start = async () => {
    if (!supported || disabled || recording) return;
    cancelledRef.current = false;
    chunksRef.current = [];
    setMessage("");
    setElapsedMs(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (disabled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = preferredRecordingMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128_000,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setMessage("마이크 녹음 중 오류가 발생했어요.");
        stopTimer();
        stopTracks();
        setRecording(false);
      };
      recorder.onstop = () => {
        const cancelled = cancelledRef.current;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        recorderRef.current = null;
        stopTimer();
        stopTracks();
        setRecording(false);
        if (cancelled) return;
        if (blob.size === 0) {
          setMessage("녹음된 음성이 비어 있어요. 마이크 권한과 입력 장치를 확인해 주세요.");
          return;
        }
        if (blob.size > MAX_RECORDING_BYTES) {
          setMessage("녹음 파일이 20MB를 넘었어요. 더 짧게 녹음해 주세요.");
          return;
        }
        void Promise.resolve(onRecorded(blob)).then(
          () => setMessage("마이크 녹음을 내레이션 트랙에 연결했어요."),
          (reason: unknown) => setMessage(
            reason instanceof Error ? reason.message : "녹음 파일을 적용하지 못했어요.",
          ),
        );
      };
      recorder.start(250);
      startedAtRef.current = Date.now();
      setRecording(true);
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_RECORDING_MS) finishRecorder();
      }, 250);
    } catch (reason) {
      stopTracks();
      setRecording(false);
      setMessage(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "마이크 권한이 거부되었어요. 브라우저 사이트 설정에서 마이크를 허용해 주세요."
          : reason instanceof Error
            ? reason.message
            : "마이크를 시작하지 못했어요.",
      );
    }
  };

  return (
    <section className="promo-microphone-recorder" aria-labelledby="promo-mic-title">
      <div className="promo-section-head">
        <h3 id="promo-mic-title">직접 녹음</h3>
        <span>{recording ? formatElapsed(elapsedMs) : "기기에서 처리"}</span>
      </div>
      <div className="promo-button-row">
        {!recording ? (
          <button
            type="button"
            disabled={disabled || !supported}
            onClick={() => { void start(); }}
          >
            마이크 녹음 시작
          </button>
        ) : (
          <>
            <button type="button" className="promo-primary" onClick={stop}>
              녹음 완료
            </button>
            <button type="button" onClick={cancel}>취소</button>
          </>
        )}
      </div>
      <p className="promo-muted">
        최대 3분까지 브라우저에서 녹음하며, 에코 제거·노이즈 억제·자동 게인을
        지원하는 환경에서는 함께 적용합니다. 녹음 원본은 서버로 전송하지 않습니다.
        {!supported ? " 현재 브라우저는 마이크 녹음을 지원하지 않아요." : ""}
      </p>
      {message ? <p className="promo-muted" role="status">{message}</p> : null}
    </section>
  );
}
