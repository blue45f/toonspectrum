// 해외 어시스트 소싱 · 시놉시스와 웹소설 각색 · 컷 단위 음성 대사 섹션.
import { BookOpen, ExternalLink, Headphones, Mic2, Plus, UsersRound, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  choosePreferredDialogueVoice,
  type DialogueSpeechAdapter,
} from "../../lettering/studio-dialogue-read-aloud";
import {
  createWebtoonAdaptationPlan,
  creatorAgePolicy,
  matchAssistantCandidates,
  type AssistantBrief,
  type AssistantCandidate,
  type SynopsisDraft,
  type VoiceDialogue,
  type WebNovelChapter,
} from "../creator-growth-ip-model";
import { CHAPTER_STATUS_LABEL, CHAPTER_STATUSES, type LabelPair } from "../growth-ip-labels";
import {
  assistantMatchReasons,
  bi,
  biLabel,
  clampNumber,
  GROWTH_BUTTON,
  GROWTH_CARD,
  GROWTH_INPUT,
  GROWTH_ITEM,
  GROWTH_PRIMARY,
  policyReason,
  safeExternalUrl,
  safeUuid,
  splitTags,
  type GrowthSectionProps,
} from "../growth-ip-shared";
import { EmptyNote, GrowthField, GrowthSection, Pill } from "../GrowthIpUi";

const MAX_OVERLAP_HOURS = 24;
const MAX_HOURLY_USD = 10_000;
const CHAPTERS_PER_EPISODE = 2;
const RECENT_CHAPTER_COUNT = 6;
const VOICE_AUDIO_MAX_BYTES = 20_000_000;
const VOICE_AUDIO_TYPE = /^audio\/(?:mpeg|wav|x-wav|ogg|mp4|webm)$/u;

const EMPTY_CANDIDATE = { displayName: "", roles: "flat-color", languages: "en", region: "", timezoneOverlapHours: "3", hourlyUsd: "0", portfolioUrl: "", verified: false };

export function AssistantSourcingSection({ state, update, notify, notice }: GrowthSectionProps) {
  const [candidate, setCandidate] = useState(EMPTY_CANDIDATE);
  const [brief, setBrief] = useState<AssistantBrief>({ roles: ["flat-color"], languages: ["ko", "en"], regions: [], timezoneOverlapHours: 3, maxHourlyUsd: 0 });
  const policy = creatorAgePolicy(state.ageBand, "assistant-hiring");
  const matches = useMemo(() => matchAssistantCandidates(brief, state.assistantCandidates), [brief, state.assistantCandidates]);

  const addCandidate = () => {
    if (!policy.allowed) {
      notify(policyReason(policy));
      return;
    }
    if (!candidate.displayName.trim()) {
      notify(bi("후보 이름 또는 소싱 식별자를 입력하세요.", "Enter a candidate name or sourcing identifier."));
      return;
    }
    const next: AssistantCandidate = {
      id: safeUuid(),
      displayName: candidate.displayName.trim().slice(0, 100),
      roles: splitTags(candidate.roles),
      languages: splitTags(candidate.languages),
      region: candidate.region.trim().slice(0, 100),
      timezoneOverlapHours: clampNumber(candidate.timezoneOverlapHours, 0, MAX_OVERLAP_HOURS, 0),
      hourlyUsd: clampNumber(candidate.hourlyUsd, 0, MAX_HOURLY_USD, 0),
      portfolioUrl: safeExternalUrl(candidate.portfolioUrl),
      verified: candidate.verified,
    };
    update((current) => ({ ...current, assistantCandidates: [...current.assistantCandidates, next].slice(-200) }));
    setCandidate(EMPTY_CANDIDATE);
    notify(bi("후보를 소싱 보드에 추가했습니다. 신원·계약·세금·송금 검증은 별도 단계입니다.", "Candidate added to the sourcing board. Identity, contract, tax and payment checks remain separate."));
  };

  return (
    <GrowthSection
      id="assistants"
      icon={UsersRound}
      eyebrow="GLOBAL ASSISTANT SOURCING"
      title={bi("해외 어시스트·업무보조 소싱 보드", "Global assistant sourcing board")}
      description={bi("국가·언어·역할·시간대 겹침·단가·포트폴리오·검증 여부를 비교합니다. 플랫폼이 실제 고용주가 되거나 송금을 대행하는 것으로 오인되지 않도록 ‘후보 수집 → 검증 → 계약’ 단계를 분리합니다.", "Compare region, language, role, time overlap, rate, portfolio and verification. Candidate collection, verification and contracting stay separate.")}
      notice={notice}
    >
      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className={GROWTH_CARD}>
          <h3 className="font-black text-fg">{bi("후보 추가", "Add a candidate")}</h3>
          <fieldset disabled={!policy.allowed} className="mt-3">
            <legend className="sr-only">{bi("후보 정보", "Candidate details")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <GrowthField label={bi("후보 이름/식별자", "Candidate name / identifier")}>
                <input className={GROWTH_INPUT} value={candidate.displayName} onChange={(e) => setCandidate((c) => ({ ...c, displayName: e.target.value }))} />
              </GrowthField>
              <GrowthField label={bi("국가/지역", "Country / region")}>
                <input className={GROWTH_INPUT} value={candidate.region} onChange={(e) => setCandidate((c) => ({ ...c, region: e.target.value }))} />
              </GrowthField>
              <GrowthField label={bi("역할(쉼표로 구분)", "Roles (comma separated)")}>
                <input className={GROWTH_INPUT} value={candidate.roles} onChange={(e) => setCandidate((c) => ({ ...c, roles: e.target.value }))} placeholder="flat-color, background" />
              </GrowthField>
              <GrowthField label={bi("사용 언어(쉼표로 구분)", "Languages (comma separated)")}>
                <input className={GROWTH_INPUT} value={candidate.languages} onChange={(e) => setCandidate((c) => ({ ...c, languages: e.target.value }))} placeholder="en, vi, ko" />
              </GrowthField>
              <GrowthField label={bi("겹치는 업무 시간(시간)", "Time-zone overlap (hours)")}>
                <input className={GROWTH_INPUT} type="number" min={0} max={MAX_OVERLAP_HOURS} value={candidate.timezoneOverlapHours} onChange={(e) => setCandidate((c) => ({ ...c, timezoneOverlapHours: e.target.value }))} />
              </GrowthField>
              <GrowthField label={bi("시간당 단가(USD)", "Hourly rate (USD)")}>
                <input className={GROWTH_INPUT} type="number" min={0} value={candidate.hourlyUsd} onChange={(e) => setCandidate((c) => ({ ...c, hourlyUsd: e.target.value }))} />
              </GrowthField>
              <GrowthField className="sm:col-span-2" label={bi("포트폴리오 주소", "Portfolio URL")}>
                <input className={GROWTH_INPUT} type="url" inputMode="url" value={candidate.portfolioUrl} onChange={(e) => setCandidate((c) => ({ ...c, portfolioUrl: e.target.value }))} placeholder="https://" />
              </GrowthField>
            </div>
            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-fg-2">
              <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={candidate.verified} onChange={(e) => setCandidate((c) => ({ ...c, verified: e.target.checked }))} />
              {bi("외부 검증 완료 표시(운영자가 증빙 확인한 경우만)", "Mark externally verified only after evidence review")}
            </label>
            <button type="button" className={`${GROWTH_PRIMARY} mt-2`} onClick={addCandidate}><Plus size={15} aria-hidden />{bi("후보 추가", "Add candidate")}</button>
          </fieldset>
          {!policy.allowed ? <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs leading-5 text-fg">{policyReason(policy)}</p> : null}
        </div>

        <div className={GROWTH_CARD}>
          <h3 className="font-black text-fg">{bi("찾는 조건", "What you need")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <GrowthField label={bi("필요 역할", "Wanted roles")}>
              <input className={GROWTH_INPUT} value={brief.roles.join(", ")} onChange={(e) => setBrief((c) => ({ ...c, roles: splitTags(e.target.value) }))} />
            </GrowthField>
            <GrowthField label={bi("필요 언어", "Wanted languages")}>
              <input className={GROWTH_INPUT} value={brief.languages.join(", ")} onChange={(e) => setBrief((c) => ({ ...c, languages: splitTags(e.target.value) }))} />
            </GrowthField>
            <GrowthField label={bi("최소 겹침(시간)", "Min. overlap (h)")}>
              <input className={GROWTH_INPUT} type="number" min={0} max={MAX_OVERLAP_HOURS} value={brief.timezoneOverlapHours} onChange={(e) => setBrief((c) => ({ ...c, timezoneOverlapHours: clampNumber(e.target.value, 0, MAX_OVERLAP_HOURS, 0) }))} />
            </GrowthField>
            <GrowthField label={bi("최대 단가(USD, 0=제한 없음)", "Max rate (USD, 0 = any)")}>
              <input className={GROWTH_INPUT} type="number" min={0} value={brief.maxHourlyUsd} onChange={(e) => setBrief((c) => ({ ...c, maxHourlyUsd: clampNumber(e.target.value, 0, MAX_HOURLY_USD, 0) }))} />
            </GrowthField>
          </div>
          <div className="mt-4 grid gap-2">
            {matches.length ? matches.map((match) => (
              <article key={match.id} className={GROWTH_ITEM}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-fg">{match.displayName}</strong>
                  <Pill tone="accent">{bi("적합도", "Match")} {match.score}</Pill>
                </div>
                <p className="mt-1 text-xs text-fg-2">
                  {[
                    match.region || bi("지역 미입력", "No region"),
                    `${bi("시간당", "Hourly")} $${match.hourlyUsd}`,
                    `${bi("겹치는 시간", "Overlap")} ${match.timezoneOverlapHours}h`,
                    match.verified ? bi("검증됨", "Verified") : bi("검증 필요", "Needs verification"),
                  ].join(" · ")}
                </p>
                <p className="mt-2 text-xs leading-5 text-fg-2">{assistantMatchReasons(match).join(" · ")}</p>
                {match.portfolioUrl ? (
                  <a href={match.portfolioUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-accent">
                    {bi("포트폴리오", "Portfolio")}<ExternalLink size={12} aria-hidden />
                  </a>
                ) : null}
              </article>
            )) : <EmptyNote>{bi("후보를 직접 추가하면 조건에 맞춰 적합도를 계산합니다. 실제 인력인 것처럼 가짜 프로필을 미리 채우지 않습니다.", "Add real sourced candidates to calculate matches; no fictional people are pre-seeded.")}</EmptyNote>}
          </div>
        </div>
      </div>
    </GrowthSection>
  );
}

/** 시놉시스 입력 칸 — wide는 두 칸을 모두 쓰는 긴 글. */
const SYNOPSIS_FIELDS: readonly { key: keyof SynopsisDraft; label: LabelPair; multiline?: boolean; wide?: boolean }[] = [
  { key: "title", label: ["작품명", "Title"] },
  { key: "logline", label: ["한 줄 로그라인", "One-line logline"] },
  { key: "theme", label: ["주제", "Theme"] },
  { key: "audience", label: ["타깃 독자", "Target readers"] },
  { key: "premise", label: ["기획 의도", "Premise"], multiline: true, wide: true },
  { key: "world", label: ["세계관", "World"], multiline: true },
  { key: "characters", label: ["주요 인물", "Characters"], multiline: true },
  { key: "seasonArc", label: ["시즌/에피소드 아크", "Season / episode arc"], multiline: true, wide: true },
];

const EMPTY_CHAPTER = { title: "", summary: "", wordCount: "0", status: "draft" as WebNovelChapter["status"] };

export function StoryAdaptationSection({ state, update, notify, notice }: GrowthSectionProps) {
  const [chapter, setChapter] = useState(EMPTY_CHAPTER);
  const chapterTitles = useMemo(() => new Map(state.novelChapters.map((item) => [item.id, item.title])), [state.novelChapters]);
  const sourceTitle = (sourceId: string): string => {
    const title = chapterTitles.get(sourceId);
    if (title === undefined) return bi("삭제된 회차", "Removed chapter");
    return title || bi("제목 없는 회차", "Untitled chapter");
  };

  const addChapter = () => {
    if (!chapter.title.trim() && !chapter.summary.trim()) {
      notify(bi("회차 제목 또는 요약을 입력하세요.", "Enter a chapter title or summary."));
      return;
    }
    const next: WebNovelChapter = {
      id: safeUuid(),
      title: chapter.title.trim().slice(0, 160),
      summary: chapter.summary.trim().slice(0, 5000),
      wordCount: clampNumber(chapter.wordCount, 0, 2_000_000, 0),
      status: chapter.status,
    };
    update((current) => ({ ...current, novelChapters: [...current.novelChapters, next].slice(-500) }));
    setChapter(EMPTY_CHAPTER);
    notify(bi("웹소설 회차를 추가했습니다. ‘각색 플랜 생성’으로 웹툰 에피소드 묶음을 만들 수 있어요.", "Chapter added. Use ‘Build adaptation’ to group it into webtoon episodes."));
  };

  const rebuildAdaptation = () => {
    update((current) => ({ ...current, adaptationEpisodes: createWebtoonAdaptationPlan(current.novelChapters, CHAPTERS_PER_EPISODE) }));
    notify(bi("웹소설 회차를 2개 단위로 묶은 웹툰 각색 초안을 만들었습니다. 원문을 변형하거나 외부로 전송하지 않았습니다.", "Built a two-chapter-per-episode adaptation draft without modifying or uploading the source."));
  };

  return (
    <GrowthSection
      id="story"
      icon={BookOpen}
      eyebrow="SYNOPSIS · WEB NOVEL · ADAPTATION"
      title={bi("시놉시스와 웹소설 → 웹툰 각색 흐름", "Synopsis and web novel → webtoon adaptation")}
      description={bi("로그라인·기획의도·세계관·캐릭터·시즌 아크를 작품 기획으로 관리하고, 웹소설 회차를 웹툰 에피소드 묶음으로 변환하는 편집 가능한 각색 초안을 만듭니다.", "Manage logline, premise, world, characters and season arc, then build editable webtoon episode groupings from novel chapters.")}
      notice={notice}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={GROWTH_CARD}>
          <h3 className="font-black text-fg">{bi("웹툰 시놉시스", "Webtoon synopsis")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {SYNOPSIS_FIELDS.map(({ key, label, multiline, wide }) => (
              <GrowthField key={key} className={wide ? "sm:col-span-2" : undefined} label={biLabel(label)}>
                {multiline ? (
                  <textarea className={`${GROWTH_INPUT} min-h-24`} value={state.synopsis[key]} onChange={(e) => update((c) => ({ ...c, synopsis: { ...c.synopsis, [key]: e.target.value } }))} />
                ) : (
                  <input className={GROWTH_INPUT} value={state.synopsis[key]} onChange={(e) => update((c) => ({ ...c, synopsis: { ...c.synopsis, [key]: e.target.value } }))} />
                )}
              </GrowthField>
            ))}
          </div>
          <p className="mt-3 text-xs text-fg-3">{bi("입력하는 대로 이 브라우저에 자동 저장됩니다.", "Saved in this browser as you type.")}</p>
        </div>

        <div className={GROWTH_CARD}>
          <h3 className="font-black text-fg">{bi("웹소설 회차", "Web novel chapters")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
            <GrowthField label={bi("회차 제목", "Chapter title")}>
              <input className={GROWTH_INPUT} value={chapter.title} onChange={(e) => setChapter((c) => ({ ...c, title: e.target.value }))} />
            </GrowthField>
            <GrowthField label={bi("글자/단어 수", "Word count")}>
              <input className={GROWTH_INPUT} type="number" min={0} value={chapter.wordCount} onChange={(e) => setChapter((c) => ({ ...c, wordCount: e.target.value }))} />
            </GrowthField>
            <GrowthField label={bi("상태", "Status")}>
              <select
                className={GROWTH_INPUT}
                value={chapter.status}
                onChange={(e) => {
                  const status = CHAPTER_STATUSES.find((item) => item === e.target.value);
                  if (status) setChapter((c) => ({ ...c, status }));
                }}
              >
                {CHAPTER_STATUSES.map((status) => <option key={status} value={status}>{biLabel(CHAPTER_STATUS_LABEL[status])}</option>)}
              </select>
            </GrowthField>
          </div>
          <GrowthField className="mt-3" label={bi("핵심 사건·감정 변화·클리프행어", "Core event, emotion shift and cliffhanger")}>
            <textarea className={`${GROWTH_INPUT} min-h-24`} value={chapter.summary} onChange={(e) => setChapter((c) => ({ ...c, summary: e.target.value }))} />
          </GrowthField>
          <button type="button" className={`${GROWTH_PRIMARY} mt-3`} onClick={addChapter}><Plus size={15} aria-hidden />{bi("회차 추가", "Add chapter")}</button>

          {state.novelChapters.length ? (
            <ol className="mt-4 grid gap-1.5" aria-label={bi("추가한 회차", "Added chapters")}>
              {state.novelChapters.slice(-RECENT_CHAPTER_COUNT).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs">
                  <span className="min-w-0 truncate font-bold text-fg">{item.title || bi("제목 없는 회차", "Untitled chapter")}</span>
                  <span className="flex items-center gap-2 text-fg-2">
                    {item.wordCount ? <span>{item.wordCount.toLocaleString()}{bi("자", " words")}</span> : null}
                    <Pill>{biLabel(CHAPTER_STATUS_LABEL[item.status])}</Pill>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div className="min-w-0">
              <h4 className="text-sm font-black text-fg">{bi("웹툰 각색 초안", "Webtoon adaptation draft")}</h4>
              <p className="mt-0.5 text-xs text-fg-2">{bi("회차를 2개씩 묶어 에피소드 뼈대를 만듭니다. 회차를 고친 뒤 다시 누르면 최신 내용으로 다시 묶어요.", "Groups two chapters per episode. Run again after editing chapters to regroup.")}</p>
            </div>
            <button type="button" className={GROWTH_BUTTON} disabled={!state.novelChapters.length} onClick={rebuildAdaptation}><WandSparkles size={15} aria-hidden />{bi("각색 플랜 생성", "Build adaptation")}</button>
          </div>
          <div className="mt-3 grid gap-2">
            {state.adaptationEpisodes.length ? state.adaptationEpisodes.map((episode) => (
              <article key={episode.id} className={GROWTH_ITEM}>
                <strong className="text-sm text-fg">{episode.title}</strong>
                <p className="mt-1 text-xs text-fg-2">
                  {bi("원작", "Source")}: {episode.sourceChapterIds.map(sourceTitle).join(", ")}
                </p>
                <p className="mt-2 text-xs leading-5 text-fg-2">{episode.hook}</p>
              </article>
            )) : <EmptyNote>{bi("회차를 추가한 뒤 ‘각색 플랜 생성’을 누르면 웹툰 에피소드 초안이 여기에 만들어집니다.", "Add chapters, then press ‘Build adaptation’ to see episode drafts here.")}</EmptyNote>}
          </div>
        </div>
      </div>
    </GrowthSection>
  );
}

const EMPTY_VOICE = { episode: "1", panel: "1", speaker: "", text: "", locale: "ko-KR" };

export function VoiceDialogueSection({ state, update, notify, notice, speechAdapter }: GrowthSectionProps & { readonly speechAdapter: DialogueSpeechAdapter }) {
  const [draft, setDraft] = useState(EMPTY_VOICE);
  // 첨부한 음성은 이 탭에서만 재생한다(서버 업로드 없음). 페이지를 떠나면 URL을 해제한다.
  const audioUrls = useRef(new Map<string, string>());

  useEffect(() => {
    const urls = audioUrls.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const addDialogue = () => {
    if (!draft.text.trim()) {
      notify(bi("대사를 입력하세요.", "Enter dialogue text."));
      return;
    }
    const row: VoiceDialogue = {
      id: safeUuid(),
      episode: clampNumber(draft.episode, 1, 100_000, 1),
      panel: clampNumber(draft.panel, 1, 100_000, 1),
      speaker: draft.speaker.trim().slice(0, 100),
      text: draft.text.trim().slice(0, 3000),
      locale: draft.locale.trim().slice(0, 32) || "ko-KR",
    };
    update((current) => ({ ...current, voiceDialogues: [...current.voiceDialogues, row].slice(-1000) }));
    setDraft((current) => ({ ...current, panel: String(clampNumber(current.panel, 1, 100_000, 1) + 1), speaker: "", text: "" }));
  };

  const speak = (dialogue: VoiceDialogue) => {
    speechAdapter.cancel();
    const voice = choosePreferredDialogueVoice(speechAdapter.getVoices(), { lang: dialogue.locale }, dialogue.locale);
    const started = speechAdapter.speak({
      text: dialogue.text,
      rate: 1,
      voice,
      onEnd: () => notify(bi("음성 대사 재생을 마쳤습니다.", "Dialogue read-aloud finished.")),
      onError: () => notify(bi("이 브라우저에서 음성 대사를 재생하지 못했습니다.", "Could not play dialogue speech in this browser.")),
    });
    notify(started ? bi("브라우저 음성 엔진으로 대사를 재생합니다. 자동 재생은 사용하지 않습니다.", "Playing with the browser speech engine. Autoplay is disabled.") : bi("브라우저 음성 합성을 지원하지 않습니다.", "Browser speech synthesis is unavailable."));
  };

  const attachAudio = (dialogue: VoiceDialogue, file: File | undefined) => {
    if (!file) return;
    if (!VOICE_AUDIO_TYPE.test(file.type) || file.size > VOICE_AUDIO_MAX_BYTES) {
      notify(bi("음성 파일은 MP3/WAV/OGG/MP4/WebM, 20MB 이하여야 합니다.", "Voice files must be MP3/WAV/OGG/MP4/WebM and 20MB or less."));
      return;
    }
    const previous = audioUrls.current.get(dialogue.id);
    if (previous) URL.revokeObjectURL(previous);
    audioUrls.current.set(dialogue.id, URL.createObjectURL(file));
    update((current) => ({ ...current, voiceDialogues: current.voiceDialogues.map((item) => (item.id === dialogue.id ? { ...item, audioName: file.name.slice(0, 240) } : item)) }));
    notify(bi("이 브라우저 세션에 음성 파일을 연결했습니다. 원본 오디오는 서버로 업로드하지 않습니다.", "Attached the voice file for this browser session. The original audio is not uploaded."));
  };

  const playAttached = (dialogueId: string) => {
    const url = audioUrls.current.get(dialogueId);
    if (!url) {
      notify(bi("현재 세션에 연결된 음성 파일이 없습니다. 다시 첨부해 주세요.", "No voice file is attached in this session. Attach it again."));
      return;
    }
    void new Audio(url).play().catch(() => notify(bi("브라우저가 오디오 재생을 허용하지 않았습니다.", "The browser blocked audio playback.")));
  };

  return (
    <GrowthSection
      id="voice"
      icon={Mic2}
      eyebrow="VOICE DIALOGUE"
      title={bi("웹툰 컷·말풍선 단위 음성 대사", "Panel and balloon-level voice dialogue")}
      description={bi("회차·컷·화자·언어 메타데이터를 저장하고 브라우저 TTS로 바로 검수하거나, 권리를 확보한 음성 파일을 현재 세션에 연결해 재생합니다. 자동 재생은 기본으로 사용하지 않습니다.", "Store episode, panel, speaker and locale metadata, proof with browser TTS, or attach owned voice audio for the current session. Autoplay stays off.")}
      notice={notice}
    >
      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <div className={GROWTH_CARD}>
          <div className="grid grid-cols-2 gap-3">
            <GrowthField label={bi("회차", "Episode")}>
              <input className={GROWTH_INPUT} type="number" min={1} value={draft.episode} onChange={(e) => setDraft((c) => ({ ...c, episode: e.target.value }))} />
            </GrowthField>
            <GrowthField label={bi("컷", "Panel")}>
              <input className={GROWTH_INPUT} type="number" min={1} value={draft.panel} onChange={(e) => setDraft((c) => ({ ...c, panel: e.target.value }))} />
            </GrowthField>
            <GrowthField label={bi("화자", "Speaker")}>
              <input className={GROWTH_INPUT} value={draft.speaker} onChange={(e) => setDraft((c) => ({ ...c, speaker: e.target.value }))} />
            </GrowthField>
            <GrowthField label={bi("언어 코드", "Locale")}>
              <input className={GROWTH_INPUT} value={draft.locale} onChange={(e) => setDraft((c) => ({ ...c, locale: e.target.value }))} placeholder="ko-KR" />
            </GrowthField>
          </div>
          <GrowthField className="mt-3" label={bi("대사", "Dialogue")}>
            <textarea className={`${GROWTH_INPUT} min-h-32`} value={draft.text} onChange={(e) => setDraft((c) => ({ ...c, text: e.target.value }))} />
          </GrowthField>
          <button type="button" className={`${GROWTH_PRIMARY} mt-3`} onClick={addDialogue}><Plus size={15} aria-hidden />{bi("음성 대사 추가", "Add voice dialogue")}</button>
        </div>
        <div className={`${GROWTH_CARD} grid content-start gap-2`}>
          {state.voiceDialogues.length ? state.voiceDialogues.slice().reverse().map((dialogue) => (
            <article key={dialogue.id} className={GROWTH_ITEM}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm text-fg">
                  {bi("회차", "EP")} {dialogue.episode} · {bi("컷", "CUT")} {dialogue.panel} · {dialogue.speaker || bi("화자 미정", "Speaker TBD")}
                </strong>
                <Pill>{dialogue.locale}</Pill>
              </div>
              <p className="mt-2 text-sm leading-6 text-fg-2">{dialogue.text}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={GROWTH_BUTTON} onClick={() => speak(dialogue)}><Headphones size={14} aria-hidden />{bi("음성으로 듣기", "Read aloud")}</button>
                <label className={`${GROWTH_BUTTON} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent`}>
                  <Mic2 size={14} aria-hidden />{bi("음성 파일 연결", "Attach voice file")}
                  <input className="sr-only" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/webm" onChange={(e) => { attachAudio(dialogue, e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                {dialogue.audioName ? <button type="button" className={GROWTH_BUTTON} onClick={() => playAttached(dialogue.id)}><Headphones size={14} aria-hidden />{dialogue.audioName}</button> : null}
              </div>
            </article>
          )) : <EmptyNote>{bi("대사를 추가하면 컷 단위 음성 검수 목록이 만들어집니다.", "Add dialogue to build a panel-level voice proofing list.")}</EmptyNote>}
        </div>
      </div>
    </GrowthSection>
  );
}
