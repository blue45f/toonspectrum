import { Clock3, FileAudio, LoaderCircle, Mic, Pause, Play, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES,
  STUDIO_REVIEW_VOICE_NOTE_MAX_DURATION_MS,
  studioReviewVoiceNoteContentTypeSchema,
  type StudioReviewVoiceNoteSubject,
  type StudioReviewVoiceNoteView,
} from "@toonspectrum/studio-project-model/review-voice-note";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  deleteStudioReviewVoiceNote,
  listStudioReviewVoiceNotes,
  readStudioReviewVoiceNote,
  uploadStudioReviewVoiceNote,
} from "./studio-review-voice-note-client";

interface VoiceDraft {
  readonly blob: Blob;
  readonly url: string;
  readonly durationMs: number;
  readonly noteId: string;
  readonly operationId: string;
}

type RecorderPhase = "idle" | "requesting" | "recording" | "ready" | "uploading";

function supportedRecorderMime(): string | null {
  if (typeof MediaRecorder !== "function") return null;
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]
    .find((value) => typeof MediaRecorder.isTypeSupported !== "function" || MediaRecorder.isTypeSupported(value)) ?? null;
}

function cleanMime(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function uploadMime(file: File): string {
  const declared = cleanMime(file.type);
  if (declared) return declared;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/u)?.[1];
  return extension === "webm" ? "audio/webm"
    : extension === "ogg" || extension === "oga" ? "audio/ogg"
      : extension === "mp3" || extension === "mpeg" ? "audio/mpeg"
        : extension === "m4a" || extension === "mp4" ? "audio/mp4"
          : extension === "wav" ? "audio/wav" : "";
}

function createAudioObjectUrl(file: Blob): string {
  const objectUrl = URL.createObjectURL(file);
  const encodedUrl = encodeURI(objectUrl);
  if (encodedUrl !== objectUrl || !encodedUrl.startsWith("blob:")) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("audio_object_url_invalid");
  }
  return encodedUrl;
}

async function audioDuration(file: Blob): Promise<number> {
  const url = createAudioObjectUrl(file);
  try {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    return await new Promise<number>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => reject(new Error("audio_metadata_timeout")), 10_000);
      const finish = (value: number | null) => {
        globalThis.clearTimeout(timeout);
        audio.removeAttribute("src");
        audio.load();
        if (value === null) reject(new Error("audio_metadata_invalid")); else resolve(value);
      };
      audio.onloadedmetadata = () => {
        const milliseconds = Math.round(audio.duration * 1_000);
        finish(Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : null);
      };
      audio.onerror = () => finish(null);
      audio.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function newIdentity(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function captionTrack(text: string): string {
  const body = `WEBVTT\n\n00:00.000 --> 02:00.000\n${text.replace(/[\r\n]+/gu, " ")}\n`;
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(body)}`;
}

export function StudioReviewVoiceNotes({ subject, canComment }: {
  readonly subject: StudioReviewVoiceNoteSubject;
  readonly canComment: boolean;
}) {
  const bt = useBilingual("StudioReviewVoiceNotes");
  const [items, setItems] = useState<readonly StudioReviewVoiceNoteView[]>([]);
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [retentionDays, setRetentionDays] = useState(14);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState<Readonly<Record<string, string>>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const generationRef = useRef(0);
  const mediaRequestRef = useRef(0);
  const recordMime = useMemo(() => supportedRecorderMime(), []);

  const clearTimers = useCallback(() => {
    if (stopTimerRef.current !== null) globalThis.clearTimeout(stopTimerRef.current);
    if (tickTimerRef.current !== null) globalThis.clearInterval(tickTimerRef.current);
    stopTimerRef.current = null; tickTimerRef.current = null;
  }, []);
  const stopTracks = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);
  const releaseDraft = useCallback(() => {
    setDraft((current) => { if (current) URL.revokeObjectURL(current.url); return null; });
  }, []);
  const refresh = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true); setNotice("");
    try {
      const result = await listStudioReviewVoiceNotes(subject);
      if (generation === generationRef.current) setItems(result.items);
    } catch {
      if (generation === generationRef.current) setNotice(bt("설명 기록을 불러오지 못했어요.", "Could not load recorded explanations."));
    } finally { if (generation === generationRef.current) setLoading(false); }
  }, [bt, subject]);

  useEffect(() => {
    const generation = generationRef;
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]);
  useEffect(() => () => {
    mediaRequestRef.current += 1;
    clearTimers();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null; stopTracks();
    if (draft) URL.revokeObjectURL(draft.url);
  }, [clearTimers, draft, stopTracks]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState !== "hidden" || recorderRef.current?.state !== "recording") return;
      recorderRef.current.stop(); clearTimers(); stopTracks();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [clearTimers, stopTracks]);

  const finishRecording = useCallback((blob: Blob, durationMs: number) => {
    releaseDraft();
    const normalized = cleanMime(blob.type);
    if (!studioReviewVoiceNoteContentTypeSchema.safeParse(normalized).success || blob.size <= 0 || blob.size > STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES
      || durationMs <= 0 || durationMs > STUDIO_REVIEW_VOICE_NOTE_MAX_DURATION_MS) {
      setPhase("idle"); setNotice(bt("녹음 길이 또는 파일 형식을 확인해 주세요.", "Check the recording length and format.")); return;
    }
    const url = createAudioObjectUrl(blob);
    setDraft({ blob: new Blob([blob], { type: normalized }), url, durationMs, noteId: newIdentity("review-voice"), operationId: newIdentity("review-voice-op") });
    setTitle((current) => current || bt("검수 설명", "Review explanation"));
    setPhase("ready"); setElapsed(durationMs);
  }, [bt, releaseDraft]);

  const startRecording = async () => {
    if (!canComment || phase !== "idle" || !recordMime || !navigator.mediaDevices?.getUserMedia) return;
    setPhase("requesting"); setNotice("");
    const request = ++mediaRequestRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (request !== mediaRequestRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream; chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: recordMime });
      recorderRef.current = recorder; startedAtRef.current = Date.now(); setElapsed(0);
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const durationMs = Math.min(STUDIO_REVIEW_VOICE_NOTE_MAX_DURATION_MS, Math.max(1, Date.now() - startedAtRef.current));
        const blob = new Blob(chunksRef.current, { type: cleanMime(recorder.mimeType || recordMime) });
        recorderRef.current = null; clearTimers(); stopTracks(); finishRecording(blob, durationMs);
      };
      recorder.onerror = () => { recorderRef.current = null; clearTimers(); stopTracks(); setPhase("idle"); setNotice(bt("녹음을 완료하지 못했어요.", "Recording could not be completed.")); };
      recorder.start(500); setPhase("recording");
      tickTimerRef.current = globalThis.setInterval(() => setElapsed(Date.now() - startedAtRef.current), 250);
      stopTimerRef.current = globalThis.setTimeout(() => recorder.state === "recording" && recorder.stop(), STUDIO_REVIEW_VOICE_NOTE_MAX_DURATION_MS);
    } catch {
      stopTracks(); setPhase("idle"); setNotice(bt("마이크 사용이 허용되지 않았어요. 브라우저 권한을 확인해 주세요.", "Microphone access was not granted. Check browser permissions."));
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };
  const cancelDraft = () => {
    mediaRequestRef.current += 1;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    clearTimers(); stopTracks(); releaseDraft(); setPhase("idle"); setElapsed(0); setNotice("");
  };
  const chooseFile = async (file: File | undefined) => {
    if (!file || !canComment || phase === "recording" || phase === "uploading") return;
    setNotice("");
    const mime = uploadMime(file);
    if (!studioReviewVoiceNoteContentTypeSchema.safeParse(mime).success || file.size <= 0 || file.size > STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES) {
      setNotice(bt("5MB 이하의 WebM, Ogg, MP3, M4A 또는 WAV 파일을 선택해 주세요.", "Choose a WebM, Ogg, MP3, M4A or WAV file up to 5MB.")); return;
    }
    try {
      const durationMs = await audioDuration(file);
      if (durationMs > STUDIO_REVIEW_VOICE_NOTE_MAX_DURATION_MS) throw new Error("duration");
      finishRecording(new Blob([file], { type: mime }), durationMs);
      setTitle(file.name.replace(/\.[^.]+$/u, "").slice(0, 160) || bt("검수 설명", "Review explanation"));
    } catch { setNotice(bt("2분 이하의 재생 가능한 오디오인지 확인해 주세요.", "Choose playable audio no longer than two minutes.")); }
  };

  const upload = async () => {
    if (!draft || phase !== "ready" || !title.trim()) return;
    setPhase("uploading"); setNotice("");
    try {
      await uploadStudioReviewVoiceNote({
        operationId: draft.operationId,
        noteId: draft.noteId,
        subject,
        title: title.trim(),
        transcript: transcript.trim(),
        durationMs: draft.durationMs,
        retentionDays,
      }, draft.blob);
      releaseDraft(); setPhase("idle"); setElapsed(0); setTitle(""); setTranscript("");
      setNotice(bt("이 검수 버전에 설명 녹음을 저장했어요.", "The recorded explanation was saved to this review version."));
      await refresh();
    } catch { setPhase("ready"); setNotice(bt("저장 결과를 확인하지 못했어요. 같은 초안으로 다시 시도할 수 있어요.", "The upload could not be confirmed. You can retry with the same draft.")); }
  };

  const play = async (item: StudioReviewVoiceNoteView) => {
    if (playing[item.note.id]) return;
    setNotice("");
    try {
      const result = await readStudioReviewVoiceNote(subject.workId, item.note.id);
      setPlaying((current) => ({ ...current, [item.note.id]: result.signedRead.url }));
    } catch { setNotice(bt("재생 권한이나 보존 기간을 다시 확인해 주세요.", "Check playback access or the retention period.")); }
  };
  const remove = async (item: StudioReviewVoiceNoteView) => {
    if (deleting !== item.note.id) { setDeleting(item.note.id); return; }
    setNotice("");
    try {
      await deleteStudioReviewVoiceNote(subject.workId, item.note.id, { operationId: newIdentity("review-voice-delete"), expectedSha256: item.note.sha256 });
      setDeleting(null); setPlaying((current) => { const next = { ...current }; delete next[item.note.id]; return next; });
      await refresh();
    } catch { setNotice(bt("삭제 결과를 확인하지 못했어요. 목록을 새로 확인해 주세요.", "The delete result could not be confirmed. Refresh the list.")); }
  };

  return <section className="mt-4 rounded-xl border border-line bg-panel/50 p-4" aria-label={bt("검수 설명 녹음", "Recorded review explanations")}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="flex items-center gap-2 text-xs font-bold text-accent"><FileAudio size={15} aria-hidden />VOICE NOTES</p>
        <h3 className="mt-1 font-bold">{bt("이 버전에 고정된 짧은 설명", "Short explanations pinned to this version")}</h3></div>
      <button type="button" className="min-h-11 rounded-lg border border-line px-3" disabled={loading} onClick={() => void refresh()} aria-label={bt("설명 기록 새로고침", "Refresh explanations")}><RefreshCw size={16} aria-hidden /></button>
    </header>
    <p className="mt-2 text-xs text-fg-2">{bt("통화 녹음이 아닙니다. 직접 시작한 2분 이하 설명만 이 검수본에 저장되며 보존 기간 뒤 삭제됩니다.", "This is not call recording. Only explanations you explicitly start, up to two minutes, are stored on this exact review and deleted after retention expires.")}</p>

    {canComment ? <div className="mt-3 rounded-lg border border-line p-3">
      {phase === "idle" ? <div className="flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-lg border border-line px-3" disabled={!recordMime} onClick={() => void startRecording()}><Mic size={16} aria-hidden /> {bt("설명 녹음", "Record explanation")}</button>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-3"><Upload size={16} aria-hidden />{bt("오디오 파일 선택", "Choose audio file")}<input className="sr-only" type="file" accept="audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </div> : null}
      {phase === "requesting" ? <p role="status" className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={16} aria-hidden />{bt("브라우저 마이크 권한을 확인 중…", "Checking browser microphone permission…")}</p> : null}
      {phase === "recording" ? <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-sm" aria-live="polite">{formatDuration(elapsed)} / 2:00</span>
        <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={stopRecording}><Pause size={16} aria-hidden /> {bt("녹음 종료", "Stop recording")}</button>
        <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={cancelDraft}><X size={16} aria-hidden /> {bt("취소", "Cancel")}</button></div> : null}
      {draft && (phase === "ready" || phase === "uploading") ? <div className="grid gap-3">
        <audio controls preload="metadata" src={draft.url}><track kind="captions" src={captionTrack(transcript.trim() || title.trim() || bt("검수 설명", "Review explanation"))} srcLang="ko" label={bt("설명 자막", "Explanation transcript")} default />{bt("오디오 재생을 지원하지 않는 브라우저입니다.", "Your browser does not support audio playback.")}</audio>
        <label className="text-sm">{bt("설명 제목", "Explanation title")}<input className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3" maxLength={160} value={title} disabled={phase === "uploading"} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="text-sm">{bt("텍스트 설명·자막", "Text alternative / transcript")}<textarea className="mt-1 w-full rounded-lg border border-line bg-card p-3" rows={3} maxLength={4_000} value={transcript} disabled={phase === "uploading"} onChange={(event) => setTranscript(event.target.value)} /></label>
        <label className="text-sm">{bt("보존 기간", "Retention")}<select className="ml-2 min-h-11 rounded-lg border border-line bg-card px-2" value={retentionDays} disabled={phase === "uploading"} onChange={(event) => setRetentionDays(Number(event.target.value))}><option value={7}>{bt("7일", "7 days")}</option><option value={14}>{bt("14일", "14 days")}</option><option value={30}>{bt("30일", "30 days")}</option></select></label>
        <div className="flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded-lg border border-line px-3" disabled={phase === "uploading" || !title.trim() || !transcript.trim()} onClick={() => void upload()}>{phase === "uploading" ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : <Upload size={16} aria-hidden />} {bt("이 검수본에 저장", "Save to this review")}</button>
          <button type="button" className="min-h-11 rounded-lg border border-line px-3" disabled={phase === "uploading"} onClick={cancelDraft}><X size={16} aria-hidden /> {bt("초안 버리기", "Discard draft")}</button></div>
      </div> : null}
    </div> : null}

    <div className="mt-3 grid gap-2">
      {loading ? <p role="status">{bt("설명 기록 불러오는 중…", "Loading explanations…")}</p> : null}
      {items.map((item) => <article key={item.note.id} className="rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="block text-sm">{item.note.title}</strong><span className="mt-1 flex items-center gap-1 text-xs text-fg-3"><Clock3 size={13} aria-hidden />{formatDuration(item.note.durationMs)} · <time dateTime={item.note.expiresAt}>{new Date(item.note.expiresAt).toLocaleString()}</time></span></div>
          <div className="flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={() => void play(item)}><Play size={15} aria-hidden />{bt("재생 준비", "Prepare playback")}</button>
            {item.canDelete ? <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={() => void remove(item)}><Trash2 size={15} aria-hidden />{deleting === item.note.id ? bt("삭제 확인", "Confirm delete") : bt("삭제", "Delete")}</button> : null}</div></div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-fg-2">{item.note.transcript}</p>
        {playing[item.note.id] ? <audio className="mt-2 w-full" controls preload="none" src={playing[item.note.id]}><track kind="captions" src={captionTrack(item.note.transcript)} srcLang="ko" label={bt("설명 자막", "Explanation transcript")} default /></audio> : null}
      </article>)}
      {!loading && !items.length ? <p className="text-sm text-fg-3">{bt("이 검수 버전에 저장된 설명 녹음이 없어요.", "There are no recorded explanations on this review version.")}</p> : null}
    </div>
    {notice ? <p className="mt-3 text-sm" role="status">{notice}</p> : null}
  </section>;
}
