import { ArrowLeft, Headphones, Music4, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { MusicTrackCard } from "./MusicTrackCard";
import { generateMusic, getMusicStatus } from "./studio-music-client";
import { deleteMusicTrack, loadMusicTracks, saveMusicTrack } from "./studio-music-library";

import type { LocalMusicTrack } from "./studio-music-client";

import { buildMusicPrompt, defaultMusicBrief, MUSIC_DURATIONS, MUSIC_INSTRUMENTS, MUSIC_MOODS, MUSIC_PURPOSES, MUSIC_TERMS_URL, parseMusicBrief, type MusicBrief, type MusicStatus } from "@/lib/studio-music";
import { useSession } from "@/src/compat/auth-session-store";
import { getApiErrorMessage } from "@/src/infrastructure/api";

const inputClass = "w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
function StudioMusicWorkspace({ ownerId }: { ownerId: string }) {
  const [params] = useSearchParams();
  const requestedWorkId = params.get("workId") ?? "";
  const workId = /^[a-zA-Z0-9_-]{1,80}$/.test(requestedWorkId) ? requestedWorkId : "";
  const [brief, setBrief] = useState<MusicBrief>(() => ({ ...defaultMusicBrief(), workId }));
  const [status, setStatus] = useState<MusicStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [tracks, setTracks] = useState<LocalMusicTrack[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [libraryLoading, setLibraryLoading] = useState(!!ownerId);
  const [busy, setBusy] = useState(false);
  const [savingTrack, setSavingTrack] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [onlyWork, setOnlyWork] = useState(!!workId);
  const [query, setQuery] = useState("");
  const pending = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setStatus(null); setStatusError("");
    void getMusicStatus(controller.signal).then(setStatus).catch(() => { if (!controller.signal.aborted) setStatusError("음악 서비스에 연결하지 못했습니다. 아직 생성 요청은 보내지 않았습니다."); });
    return () => controller.abort();
  }, [statusAttempt]);
  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    void loadMusicTracks(ownerId).then((loaded) => {
      if (!active) return;
      setTracks(loaded); setSavedIds(new Set(loaded.map((track) => track.metadata.id)));
    }).catch((reason: unknown) => { if (active) setNotice(reason instanceof Error ? reason.message : "기기 보관함을 열지 못했습니다."); })
      .finally(() => { if (active) setLibraryLoading(false); });
    return () => { active = false; };
  }, [ownerId]);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  const patch = (next: Partial<MusicBrief>) => setBrief((previous) => ({ ...previous, ...next }));
  const cancel = () => {
    pending.current?.abort();
    setNotice("생성 응답 수신을 취소했습니다. 공급자가 이미 처리한 요청은 과금될 수 있으며 자동으로 다시 요청하지 않습니다.");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || libraryLoading || !ownerId || !status?.enabled) return;
    setError(""); setNotice("");
    let parsed: MusicBrief;
    try { parsed = parseMusicBrief(brief); } catch (reason) { setError(reason instanceof Error ? reason.message : "입력을 확인해 주세요."); return; }
    if (tracks.length >= 20) { setError("보관함의 기존 곡을 다운로드한 뒤 삭제해 공간을 확보해 주세요. 최대 20곡입니다."); return; }
    const controller = new AbortController();
    pending.current = controller; setBusy(true);
    try {
      const track = await generateMusic(parsed, ownerId, crypto.randomUUID(), controller.signal);
      if (controller.signal.aborted) return;
      setTracks((previous) => [track, ...previous]);
      setSavingTrack(true);
      try {
        await saveMusicTrack(track);
        if (!controller.signal.aborted) { setSavedIds((previous) => new Set([...previous, track.metadata.id])); setNotice("음원을 생성해 이 기기에 저장했습니다. 재생 버튼으로 들어보세요."); }
      } catch (reason) {
        if (!controller.signal.aborted) setNotice(`음원 생성은 완료됐지만 기기에 저장하지 못했습니다. 페이지를 닫기 전에 MP3를 다운로드해 주세요. ${reason instanceof Error ? reason.message : ""}`);
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(await getApiErrorMessage(reason, "음악 생성에 실패했습니다. 자동 재시도하지 않습니다."));
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(false); setSavingTrack(false); }
    }
  };
  const remove = async (track: LocalMusicTrack) => {
    try {
      if (savedIds.has(track.metadata.id)) await deleteMusicTrack(track.metadata.id, ownerId);
      setTracks((previous) => previous.filter((item) => item.metadata.id !== track.metadata.id));
      setSavedIds((previous) => { const next = new Set(previous); next.delete(track.metadata.id); return next; });
      setNotice("이 기기의 음원을 삭제했습니다.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "음원을 삭제하지 못했습니다."); }
  };
  const preview = (() => { try { return buildMusicPrompt({ ...brief, rightsConfirmed: true }); } catch { return "장면 설명과 음악 설정을 입력하면 생성 프롬프트를 확인할 수 있어요."; } })();
  const visibleTracks = tracks.filter((track) => (!onlyWork || !workId || track.metadata.brief.workId === workId) && `${track.metadata.brief.title} ${track.metadata.brief.scene}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 px-4 py-6 text-fg sm:px-6 lg:py-10" data-testid="studio-music-page">
      <header className="relative overflow-hidden rounded-3xl border border-line bg-card p-6 sm:p-9">
        <div className="pointer-events-none absolute -right-12 -top-12 size-64 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <Link to={workId ? `/create/${encodeURIComponent(workId)}` : "/studio"} className="relative mb-6 inline-flex min-h-9 items-center gap-2 text-sm text-fg-2 hover:text-accent"><ArrowLeft size={16} aria-hidden />{workId ? "작품으로 돌아가기" : "툰스튜디오로"}</Link>
        <p className="relative mb-3 flex items-center gap-2 text-xs font-semibold tracking-widest text-accent"><Headphones size={16} aria-hidden />TOONSTUDIO SOUNDTRACK</p>
        <h1 className="relative text-3xl font-bold leading-tight sm:text-4xl">장면에 감정을,<br className="sm:hidden" /> 이야기에 음악을.</h1>
        <p className="relative mt-4 max-w-2xl text-sm leading-relaxed text-fg-2 sm:text-base">설레는 첫 만남부터 마지막 반전까지. 장면과 가사를 바탕으로 나만의 BGM, OST, 주제가를 만들어 보세요.</p>
        <div className="relative mt-5 flex flex-wrap gap-2 text-xs text-fg-2"><span className="rounded-full border border-line px-3 py-1.5">10가지 장면 분위기</span><span className="rounded-full border border-line px-3 py-1.5">15–60초 음악</span><span className="rounded-full border border-line px-3 py-1.5">MP3 · 제작 정보</span></div>
      </header>
      <section aria-label="음악 서비스 상태" className="rounded-xl border border-line bg-panel/40 p-4 text-sm leading-relaxed">
        {statusError ? <div className="flex flex-wrap items-center justify-between gap-3"><p>{statusError}</p><button type="button" className={buttonClass} onClick={() => setStatusAttempt((value) => value + 1)}>연결 다시 확인</button></div> : !status ? <p role="status">음악 서비스 연결을 확인하고 있습니다.</p> : !status.enabled ? <p><strong>음악 생성 연결 준비 중</strong> — 운영자의 음악 API·이용 조건·사용량 제한 설정이 필요합니다. 아래에서 장면과 음악 설정을 미리 구성할 수 있습니다. 데모 음원을 AI 결과로 표시하지 않습니다.</p> : <p><strong>Eleven Music 연결 설정됨</strong> — 로그인 후 생성할 수 있습니다. 실제 요청은 공급자 계정의 크레딧을 사용합니다. 연결 설정 상태는 실시간 크레딧 잔액을 보장하지 않습니다.</p>}
        {!ownerId && <p className="mt-2 text-fg-2">음악 생성과 개인 보관함은 로그인 후 이용할 수 있습니다. 사이트의 로그인 메뉴를 이용해 주세요.</p>}
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <form ref={formRef} onSubmit={(event) => void submit(event)} className="min-w-0 space-y-5 rounded-2xl border border-line bg-card p-5 sm:p-6" aria-label="AI 음악 만들기">
          <div><h2 className="flex items-center gap-2 text-xl font-semibold"><Sparkles size={20} aria-hidden />AI 음악 만들기</h2><p className="mt-1 text-sm text-fg-3">장면을 설명하고 원하는 음악의 결을 골라 주세요.</p></div>
          <fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
            <label className="block space-y-2 text-sm font-medium">음악 제목<input className={inputClass} required maxLength={80} value={brief.title} onChange={(event) => patch({ title: event.target.value })} /></label>
            <fieldset><legend className="mb-2 text-sm font-medium">어떤 장면인가요?</legend><div className="grid grid-cols-2 gap-2">{MUSIC_MOODS.map((mood) => <button key={mood.id} type="button" aria-pressed={brief.mood === mood.id} onClick={() => patch({ mood: mood.id, bpm: mood.bpm })} className={`min-h-16 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-accent ${brief.mood === mood.id ? "border-accent bg-accent/10" : "border-line hover:bg-panel"}`}><span className="block text-sm font-semibold">{mood.label}</span><span className="mt-1 block text-xs text-fg-3">{mood.hint}</span></button>)}</div></fieldset>
            <label className="block space-y-2 text-sm font-medium">장면 설명<textarea className={`${inputClass} min-h-28 resize-y leading-relaxed`} required maxLength={600} value={brief.scene} onChange={(event) => patch({ scene: event.target.value })} placeholder="어디에서, 누가, 어떤 감정을 느끼나요? 감정이 어떻게 바뀌는지도 알려 주세요." /></label>
            <div className="-mt-3 flex items-center justify-between gap-2 text-xs text-fg-3"><button type="button" className="min-h-8 text-accent underline underline-offset-4" onClick={() => patch({ scene: MUSIC_MOODS.find((mood) => mood.id === brief.mood)!.scene })}>선택한 분위기의 예시 넣기</button><span>{brief.scene.length}/600</span></div>
            <div className="grid grid-cols-2 gap-3"><label className="space-y-2 text-sm font-medium">음악 용도<select className={inputClass} value={brief.purpose} onChange={(event) => patch({ purpose: event.target.value })}>{MUSIC_PURPOSES.map((purpose) => <option key={purpose.id} value={purpose.id}>{purpose.label}</option>)}</select></label><label className="space-y-2 text-sm font-medium">길이<select className={inputClass} value={brief.seconds} onChange={(event) => patch({ seconds: Number(event.target.value) })}>{MUSIC_DURATIONS.map((seconds) => <option key={seconds} value={seconds}>{seconds}초</option>)}</select></label></div>
            <label className="block space-y-2 text-sm font-medium">템포 · {brief.bpm} BPM<input type="range" min={60} max={180} step={1} className="w-full accent-[var(--color-accent)]" value={brief.bpm} onChange={(event) => patch({ bpm: Number(event.target.value) })} /></label>
            <fieldset><legend className="mb-2 text-sm font-medium">주요 악기 <span className="text-xs font-normal text-fg-3">1–4개</span></legend><div className="flex flex-wrap gap-2">{MUSIC_INSTRUMENTS.map((instrument) => <button key={instrument.id} type="button" aria-pressed={brief.instruments.includes(instrument.id)} disabled={!brief.instruments.includes(instrument.id) && brief.instruments.length >= 4} className={`${buttonClass} ${brief.instruments.includes(instrument.id) ? "border-accent bg-accent/10" : ""}`} onClick={() => patch({ instruments: brief.instruments.includes(instrument.id) ? brief.instruments.filter((id) => id !== instrument.id) : [...brief.instruments, instrument.id] })}>{instrument.label}</button>)}</div></fieldset>
            <label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={brief.vocals} onChange={(event) => patch({ vocals: event.target.checked, lyrics: "" })} />보컬이 있는 주제가 만들기</label>
            {brief.vocals && <label className="block space-y-2 text-sm font-medium">직접 작성한 가사<textarea className={`${inputClass} min-h-32 resize-y`} required maxLength={1200} value={brief.lyrics} onChange={(event) => patch({ lyrics: event.target.value })} placeholder="[Verse]\n우리의 이야기가 시작되는 밤...\n\n[Chorus]\n" /><span className="block text-xs font-normal text-fg-3">타인의 노래 가사나 특정 가수의 목소리 복제 요청은 입력하지 마세요. 보컬·발음·가사 반영은 생성 결과를 직접 확인해 주세요.</span></label>}
            <label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={brief.loop} onChange={(event) => patch({ loop: event.target.checked })} />반복 감상에 어울리는 구성 요청</label>
            <p className="-mt-3 text-xs leading-relaxed text-fg-3">끊김 없는 루프·정확한 BPM·길이·가사 재현은 보장되지 않습니다. 생성 후 미리듣기로 확인해 주세요.</p>
            <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium">생성 프롬프트 확인</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-fg-2">{preview}</pre></details>
            <label className="flex items-start gap-3 rounded-xl border border-line bg-panel/40 p-3 text-xs leading-relaxed"><input type="checkbox" className="mt-1" required checked={brief.rightsConfirmed} onChange={(event) => patch({ rightsConfirmed: event.target.checked })} /><span>입력한 장면·가사를 사용할 권한이 있으며, 음악 생성을 위해 외부 공급자 ElevenLabs로 전송됨에 동의합니다. 유료 생성과 이용 조건을 확인했습니다.</span></label>
          </fieldset>
          <div className="flex gap-2"><button type="submit" className={`${buttonClass} flex-1 border-accent bg-accent font-semibold text-on-accent hover:bg-accent/90`} disabled={busy || libraryLoading || !ownerId || !status?.enabled || !brief.rightsConfirmed}><Music4 size={18} aria-hidden />{busy ? "음악 생성 중…" : "AI 음악 생성"}</button>{busy && !savingTrack && <button type="button" className={buttonClass} onClick={cancel}><Square size={14} aria-hidden />취소</button>}</div>
          <p className="text-xs leading-relaxed text-fg-3">중복 클릭은 한 번만 접수합니다. 취소·시간 초과 후에도 공급자 처리분은 과금될 수 있습니다. 생성 요청을 자동 재시도하지 않습니다.</p>
        </form>
        <section className="min-w-0 space-y-4" aria-labelledby="music-library-heading">
          <div className="flex items-center justify-between gap-3"><h2 id="music-library-heading" className="text-xl font-semibold">나의 사운드트랙</h2><span className="text-sm text-fg-3">{tracks.length}/20곡</span></div>
          <p className="text-sm leading-relaxed text-fg-2">이 브라우저·기기에 저장되는 개인 보관함입니다. 다른 기기와 동기화되지 않으며, 브라우저 데이터 삭제 시 사라질 수 있어 MP3를 별도로 보관해 주세요.</p>
          <label className="block space-y-2 text-sm">보관함 검색<input type="search" className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 또는 장면 검색" /></label>
          {workId && <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={onlyWork} onChange={(event) => setOnlyWork(event.target.checked)} />현재 작품에 연결해 만든 음악만 보기</label>}
          <div aria-live="polite" aria-atomic="true">{busy && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">장면에 맞는 음악을 생성하고 있습니다. 이 화면에서 결과를 받은 뒤 기기 보관함에 저장합니다.</p>}{notice && <p className="mt-3 rounded-xl border border-line bg-panel/40 p-4 text-sm leading-relaxed">{notice}</p>}</div>
          {error && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/5 p-4 text-sm text-bad">{error}</p>}
          {libraryLoading ? <p role="status" className="p-5 text-sm text-fg-3">기기 보관함을 여는 중…</p> : visibleTracks.length ? visibleTracks.map((track) => <MusicTrackCard key={track.metadata.id} track={track} saved={savedIds.has(track.metadata.id)} busy={busy} onDelete={() => remove(track)} onReuse={() => { setBrief({ ...track.metadata.brief, rightsConfirmed: false }); setNotice("이전 설정을 불러왔습니다. 내용을 수정한 뒤 생성하면 새로운 유료 요청이 접수됩니다."); formRef.current?.scrollIntoView({ block: "start" }); }} />) : <div className="rounded-2xl border border-dashed border-line p-10 text-center"><Headphones size={32} className="mx-auto mb-4 text-fg-3" aria-hidden /><h3 className="font-semibold">{tracks.length ? "검색 조건에 맞는 음악이 없어요" : "아직 만들어진 음악이 없어요"}</h3><p className="mt-2 text-sm leading-relaxed text-fg-3">분위기를 고르고 장면을 설명해 주세요.<br />실제로 생성된 음원만 이곳에 표시됩니다.</p></div>}
          <aside className="rounded-2xl border border-line bg-card p-5 text-sm leading-relaxed"><h3 className="font-semibold">작품에 사용할 때</h3><p className="mt-2 text-fg-2">음악을 만든 후 MP3와 제작 정보를 내려받아 영상 편집에 사용하세요. 작품 ID 연결은 보관함 분류용이며, 독자용 BGM을 자동 게시하지 않습니다. 효과툰의 오디오 URL에는 직접 호스팅한 지속적인 HTTPS 음원 주소가 필요합니다.</p><a href={MUSIC_TERMS_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block min-h-9 text-accent underline underline-offset-4">음원 이용 조건 확인</a><p className="text-xs text-fg-3">상용 이용 범위는 공급자 요금제·용도에 따라 달라집니다. 모든 배포·재판매에 대한 권리를 보장하지 않습니다.</p></aside>
        </section>
      </div>
    </div>
  );
}
export function StudioMusicPage() {
  const session = useSession();
  const ownerId = session.data?.user.id ?? "";
  return <StudioMusicWorkspace key={ownerId || "guest"} ownerId={ownerId} />;
}
