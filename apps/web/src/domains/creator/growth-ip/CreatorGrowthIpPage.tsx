import {
  BookOpen,
  CheckCircle2,
  Clapperboard,
  Download,
  ExternalLink,
  GraduationCap,
  Headphones,
  Link2,
  Mic2,
  MonitorCheck,
  Plus,
  Scale,
  Share2,
  ShieldCheck,
  Sparkles,
  UserRoundSearch,
  UsersRound,
  WandSparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { SharePageButton } from "@/shared/components/share-page-button";
import { Container } from "@/shared/components/section";
import {
  getPwaInstallServerSnapshot,
  getPwaInstallSnapshot,
  requestPwaInstall,
  subscribePwaInstall,
} from "@/shared/lib/pwa-install-store";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { copyText } from "@/shared/lib/copy-text";

import {
  choosePreferredDialogueVoice,
  createBrowserDialogueSpeechAdapter,
} from "../lettering/studio-dialogue-read-aloud";
import {
  creatorAgePolicy,
  createWebtoonAdaptationPlan,
  EMPTY_CREATOR_GROWTH_IP_STATE,
  loadCreatorGrowthIpState,
  matchAssistantCandidates,
  saveCreatorGrowthIpState,
  WEBTOON_CURRICULUM_GUIDE,
  type AssistantBrief,
  type AssistantCandidate,
  type CreatorAgeBand,
  type CreatorCapability,
  type CreatorGrowthIpState,
  type CreatorSupportArea,
  type EducationProgram,
  type RightsInquiry,
  type RookieCreatorProfile,
  type VoiceDialogue,
  type WebNovelChapter,
} from "./creator-growth-ip-model";

const bi = <T,>(ko: T, en: T): T => translateBilingualValueForActiveLocale("CreatorGrowthIpPage", ko, en);
const CARD = "rounded-2xl border border-line bg-card p-4 sm:p-5";
const INPUT = "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";
const BUTTON_BASE = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON = `${BUTTON_BASE} border-line bg-card text-fg-2 hover:bg-raised hover:text-fg`;
const PRIMARY = `${BUTTON_BASE} border-accent/40 bg-accent text-on-accent hover:bg-accent-2`;

const AGE_BANDS: readonly CreatorAgeBand[] = ["unknown", "under-14", "14-15", "16-17", "18-plus"];
const CAPABILITIES: readonly CreatorCapability[] = ["browse", "learning", "community-posting", "public-profile", "direct-messaging", "assistant-hiring", "payments", "rights-offers", "mature-content"];
const SUPPORT_AREAS: readonly CreatorSupportArea[] = ["mentoring", "editing", "legal", "tax", "translation", "marketing", "assistant", "education", "publishing"];
const RIGHTS_MEDIA: readonly RightsInquiry["medium"][] = ["film", "animation", "drama", "game", "translation", "audio", "merchandise"];

const supportLabel: Record<CreatorSupportArea, string> = {
  mentoring: "멘토링", editing: "편집·기획", legal: "법무·계약", tax: "세무", translation: "번역", marketing: "마케팅", assistant: "어시스트", education: "교육", publishing: "연재·출판",
};
const capabilityLabel: Record<CreatorCapability, string> = {
  browse: "공개 탐색", learning: "학습", "community-posting": "커뮤니티 게시", "public-profile": "공개 프로필", "direct-messaging": "DM", "assistant-hiring": "업무 매칭", payments: "결제·정산", "rights-offers": "판권 제안", "mature-content": "성인 콘텐츠",
};
const ageLabel: Record<CreatorAgeBand, string> = {
  unknown: "미확인", "under-14": "만 14세 미만", "14-15": "만 14–15세", "16-17": "만 16–17세", "18-plus": "만 18세 이상",
};

function splitTags(value: string): string[] {
  return [...new Set(value.split(/[,\n]/u).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

function safeUuid(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}

function SectionHeading({ icon: Icon, eyebrow, title, description, id }: {
  readonly icon: typeof Sparkles;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly id: string;
}) {
  return <header id={id} className="scroll-mt-24 mb-4 flex items-start gap-3">
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={19} aria-hidden /></span>
    <div className="min-w-0"><p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-accent">{eyebrow}</p><h2 className="mt-1 text-xl font-black text-fg sm:text-2xl">{title}</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-fg-2">{description}</p></div>
  </header>;
}

function EnvironmentDiagnostics() {
  const rows = useMemo(() => {
    if (typeof window === "undefined") return [];
    const capability = (label: string, ok: boolean, note: string) => ({ label, ok, note });
    const webgl2 = (() => {
      try { return Boolean(document.createElement("canvas").getContext("webgl2")); }
      catch { return false; }
    })();
    return [
      capability("HTTPS / Secure Context", window.isSecureContext, window.isSecureContext ? "카메라·클립보드·PWA 권한 사용에 적합" : "일부 브라우저 기능이 제한될 수 있음"),
      capability("Service Worker", "serviceWorker" in navigator, "오프라인 캐시·업데이트 기반"),
      capability("IndexedDB", "indexedDB" in window, "큰 프로젝트 데이터 저장 기반"),
      capability("Web Share", typeof navigator.share === "function", "모바일 공유 시트 연동"),
      capability("Media Devices", Boolean(navigator.mediaDevices?.getUserMedia), "웹캠·마이크 기능 기반"),
      capability("Pointer Events", "PointerEvent" in window, "펜·터치·마우스 입력 통합"),
      capability("WebGL2", webgl2, "3D·고급 렌더링 호환성"),
      capability("Speech Synthesis", "speechSynthesis" in window, "브라우저 음성 안내·대사 검수"),
    ];
  }, []);
  return <div className="grid gap-2 sm:grid-cols-2">{rows.map((row) => <div key={row.label} className="flex items-start gap-2 rounded-xl border border-line bg-panel p-3"><span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${row.ok ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>{row.ok ? <CheckCircle2 size={14} /> : "!"}</span><div><strong className="text-sm text-fg">{row.label}</strong><p className="mt-1 text-xs leading-5 text-fg-3">{row.note}</p></div></div>)}</div>;
}

export function CreatorGrowthIpPage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("작가 성장·IP 확장", "Creator growth & IP"));
  const [state, setState] = useState<CreatorGrowthIpState>(() => {
    try { return loadCreatorGrowthIpState(globalThis.localStorage); }
    catch { return structuredClone(EMPTY_CREATOR_GROWTH_IP_STATE); }
  });
  const [notice, setNotice] = useState(bi("개인 작업 데이터는 현재 브라우저에 저장됩니다. 공개·계약·고용 기능은 명시적 확인 전까지 자동 실행하지 않습니다.", "Personal working data is stored in this browser. Publishing, contracts and hiring never execute automatically."));
  const pwa = useSyncExternalStore(subscribePwaInstall, getPwaInstallSnapshot, getPwaInstallServerSnapshot);
  const speechAdapter = useMemo(() => createBrowserDialogueSpeechAdapter(), []);
  const audioUrls = useRef(new Map<string, string>());

  const [rookieDraft, setRookieDraft] = useState({ penName: "", stage: "rookie" as RookieCreatorProfile["stage"], genres: "", portfolioUrl: "", goal: "" });
  const [supportDraft, setSupportDraft] = useState({ area: "mentoring" as CreatorSupportArea, title: "", detail: "" });
  const [brief, setBrief] = useState<AssistantBrief>({ roles: ["flat-color"], languages: ["ko", "en"], regions: [], timezoneOverlapHours: 3, maxHourlyUsd: 0 });
  const [candidateDraft, setCandidateDraft] = useState({ displayName: "", roles: "flat-color", languages: "en", region: "", timezoneOverlapHours: "3", hourlyUsd: "0", portfolioUrl: "", verified: false });
  const [chapterDraft, setChapterDraft] = useState({ title: "", summary: "", wordCount: "0", status: "draft" as WebNovelChapter["status"] });
  const [rightsDraft, setRightsDraft] = useState({ medium: "animation" as RightsInquiry["medium"], company: "", contact: "", territory: "", scope: "" });
  const [voiceDraft, setVoiceDraft] = useState({ episode: "1", panel: "1", speaker: "", text: "", locale: "ko-KR" });
  const [educationDraft, setEducationDraft] = useState({ institution: "", program: "", region: "", mode: "hybrid" as EducationProgram["mode"], level: "beginner" as EducationProgram["level"], duration: "", url: "", tags: "" });
  const [guideSpeaking, setGuideSpeaking] = useState(false);

  useEffect(() => {
    try { saveCreatorGrowthIpState(globalThis.localStorage, state); }
    catch (error) { setNotice(error instanceof Error ? error.message : bi("저장하지 못했습니다.", "Could not save.")); }
  }, [state]);

  useEffect(() => () => {
    speechAdapter.cancel();
    for (const url of audioUrls.current.values()) URL.revokeObjectURL(url);
    audioUrls.current.clear();
  }, [speechAdapter]);

  const assistantMatches = useMemo(() => matchAssistantCandidates(brief, state.assistantCandidates), [brief, state.assistantCandidates]);
  const assistantPolicy = creatorAgePolicy(state.ageBand, "assistant-hiring");
  const rightsPolicy = creatorAgePolicy(state.ageBand, "rights-offers");
  const publicProfilePolicy = creatorAgePolicy(state.ageBand, "public-profile");

  const addRookieProfile = () => {
    if (!rookieDraft.penName.trim()) { setNotice(bi("활동명/필명을 입력하세요.", "Enter a creator display name.")); return; }
    const profile: RookieCreatorProfile = { id: safeUuid(), penName: rookieDraft.penName.trim().slice(0, 80), stage: rookieDraft.stage, genres: splitTags(rookieDraft.genres), portfolioUrl: rookieDraft.portfolioUrl.trim(), goal: rookieDraft.goal.trim().slice(0, 800), discoveryStatus: publicProfilePolicy.allowed && !publicProfilePolicy.guardianRequired ? "discoverable" : "review" };
    setState((current) => ({ ...current, rookieProfiles: [...current.rookieProfiles, profile].slice(-100) }));
    setRookieDraft({ penName: "", stage: "rookie", genres: "", portfolioUrl: "", goal: "" });
    setNotice(publicProfilePolicy.guardianRequired ? bi("프로필을 검토 대기로 저장했습니다. 미성년 공개 프로필은 보호자/운영 검토를 거치도록 설계했습니다.", "Profile saved for review. Minor public profiles require guardian/operator review.") : bi("신인 작가 발굴 프로필을 저장했습니다.", "Creator discovery profile saved."));
  };

  const addSupportRequest = () => {
    if (!supportDraft.title.trim()) { setNotice(bi("지원 요청 제목을 입력하세요.", "Enter a support request title.")); return; }
    const request: CreatorGrowthIpState["supportRequests"][number] = {
      id: safeUuid(),
      area: supportDraft.area,
      title: supportDraft.title.trim().slice(0, 160),
      detail: supportDraft.detail.trim().slice(0, 3000),
      status: "requested",
      createdAt: new Date().toISOString(),
    };
    setState((current) => ({ ...current, supportRequests: [...current.supportRequests, request].slice(-200) }));
    setSupportDraft((current) => ({ ...current, title: "", detail: "" }));
    setNotice(bi("지원 요청을 등록했습니다. 자동 계약이나 결제는 발생하지 않습니다.", "Support request saved. No contract or payment is executed automatically."));
  };

  const addCandidate = () => {
    if (!assistantPolicy.allowed) { setNotice(assistantPolicy.reason); return; }
    if (!candidateDraft.displayName.trim()) { setNotice(bi("후보 이름 또는 소싱 식별자를 입력하세요.", "Enter a candidate name or sourcing identifier.")); return; }
    const candidate: AssistantCandidate = {
      id: safeUuid(), displayName: candidateDraft.displayName.trim().slice(0, 100), roles: splitTags(candidateDraft.roles), languages: splitTags(candidateDraft.languages), region: candidateDraft.region.trim().slice(0, 100), timezoneOverlapHours: Math.max(0, Math.min(24, Number(candidateDraft.timezoneOverlapHours) || 0)), hourlyUsd: Math.max(0, Number(candidateDraft.hourlyUsd) || 0), portfolioUrl: candidateDraft.portfolioUrl.trim(), verified: candidateDraft.verified,
    };
    setState((current) => ({ ...current, assistantCandidates: [...current.assistantCandidates, candidate].slice(-200) }));
    setCandidateDraft({ displayName: "", roles: "flat-color", languages: "en", region: "", timezoneOverlapHours: "3", hourlyUsd: "0", portfolioUrl: "", verified: false });
    setNotice(bi("후보를 소싱 보드에 추가했습니다. 신원·계약·세금·송금 검증은 별도 단계입니다.", "Candidate added to the sourcing board. Identity, contract, tax and payment checks remain separate."));
  };

  const addChapter = () => {
    if (!chapterDraft.title.trim() && !chapterDraft.summary.trim()) { setNotice(bi("회차 제목 또는 요약을 입력하세요.", "Enter a chapter title or summary.")); return; }
    const chapter: WebNovelChapter = { id: safeUuid(), title: chapterDraft.title.trim().slice(0, 160), summary: chapterDraft.summary.trim().slice(0, 5000), wordCount: Math.max(0, Number(chapterDraft.wordCount) || 0), status: chapterDraft.status };
    setState((current) => ({ ...current, novelChapters: [...current.novelChapters, chapter].slice(-500) }));
    setChapterDraft({ title: "", summary: "", wordCount: "0", status: "draft" });
  };

  const rebuildAdaptation = () => {
    setState((current) => ({ ...current, adaptationEpisodes: createWebtoonAdaptationPlan(current.novelChapters, 2) }));
    setNotice(bi("웹소설 회차를 2개 단위로 묶은 웹툰 각색 초안을 만들었습니다. 원문을 변형하거나 외부로 전송하지 않았습니다.", "Built a two-chapter-per-episode adaptation draft without modifying or uploading the source."));
  };

  const addRightsInquiry = () => {
    if (!rightsPolicy.allowed) { setNotice(rightsPolicy.reason); return; }
    if (!rightsDraft.company.trim() || !rightsDraft.scope.trim()) { setNotice(bi("제안 회사와 제안 범위를 입력하세요.", "Enter the proposing company and scope.")); return; }
    const inquiry: RightsInquiry = {
      id: safeUuid(),
      ...rightsDraft,
      company: rightsDraft.company.trim().slice(0, 160),
      contact: rightsDraft.contact.trim().slice(0, 240),
      territory: rightsDraft.territory.trim().slice(0, 160),
      scope: rightsDraft.scope.trim().slice(0, 3000),
      status: "received",
      createdAt: new Date().toISOString(),
    };
    setState((current) => ({ ...current, rightsInquiries: [...current.rightsInquiries, inquiry].slice(-200) }));
    setRightsDraft((current) => ({ ...current, company: "", contact: "", territory: "", scope: "" }));
    setNotice(bi("IP 제안 CRM에 기록했습니다. 계약 체결은 이 화면에서 자동 실행되지 않습니다.", "Recorded in the IP inquiry CRM. Contracts are not executed from this screen."));
  };

  const addVoiceDialogue = () => {
    if (!voiceDraft.text.trim()) { setNotice(bi("대사를 입력하세요.", "Enter dialogue text.")); return; }
    const row: VoiceDialogue = { id: safeUuid(), episode: Math.max(1, Number(voiceDraft.episode) || 1), panel: Math.max(1, Number(voiceDraft.panel) || 1), speaker: voiceDraft.speaker.trim().slice(0, 100), text: voiceDraft.text.trim().slice(0, 3000), locale: voiceDraft.locale.trim().slice(0, 32) || "ko-KR" };
    setState((current) => ({ ...current, voiceDialogues: [...current.voiceDialogues, row].slice(-1000) }));
    setVoiceDraft((current) => ({ ...current, panel: String(Math.max(1, Number(current.panel) || 1) + 1), speaker: "", text: "" }));
  };

  const speakDialogue = (dialogue: VoiceDialogue) => {
    speechAdapter.cancel();
    const voice = choosePreferredDialogueVoice(speechAdapter.getVoices(), { lang: dialogue.locale }, dialogue.locale);
    const started = speechAdapter.speak({ text: dialogue.text, rate: 1, voice, onEnd: () => setNotice(bi("음성 대사 재생을 마쳤습니다.", "Dialogue read-aloud finished.")), onError: () => setNotice(bi("이 브라우저에서 음성 대사를 재생하지 못했습니다.", "Could not play dialogue speech in this browser.")) });
    setNotice(started ? bi("브라우저 음성 엔진으로 대사를 재생합니다. 자동 재생은 사용하지 않습니다.", "Playing with the browser speech engine. Autoplay is disabled." ) : bi("브라우저 음성 합성을 지원하지 않습니다.", "Browser speech synthesis is unavailable."));
  };

  const attachVoiceAudio = (dialogue: VoiceDialogue, file: File | undefined) => {
    if (!file) return;
    if (!/^audio\/(?:mpeg|wav|x-wav|ogg|mp4|webm)$/u.test(file.type) || file.size > 20_000_000) { setNotice(bi("음성 파일은 MP3/WAV/OGG/MP4/WebM, 20MB 이하여야 합니다.", "Voice files must be MP3/WAV/OGG/MP4/WebM and 20MB or less.")); return; }
    const previous = audioUrls.current.get(dialogue.id); if (previous) URL.revokeObjectURL(previous);
    const url = URL.createObjectURL(file); audioUrls.current.set(dialogue.id, url);
    setState((current) => ({ ...current, voiceDialogues: current.voiceDialogues.map((item) => item.id === dialogue.id ? { ...item, audioName: file.name.slice(0, 240) } : item) }));
    setNotice(bi("이 브라우저 세션에 음성 파일을 연결했습니다. 원본 오디오는 서버로 업로드하지 않습니다.", "Attached the voice file for this browser session. The original audio is not uploaded."));
  };

  const playAttachedAudio = (dialogueId: string) => {
    const url = audioUrls.current.get(dialogueId); if (!url) { setNotice(bi("현재 세션에 연결된 음성 파일이 없습니다. 다시 첨부해 주세요.", "No voice file is attached in this session. Attach it again.")); return; }
    const audio = new Audio(url); void audio.play().catch(() => setNotice(bi("브라우저가 오디오 재생을 허용하지 않았습니다.", "The browser blocked audio playback.")));
  };

  const addEducationProgram = () => {
    if (!educationDraft.institution.trim() || !educationDraft.program.trim()) { setNotice(bi("교육기관과 과정명을 입력하세요.", "Enter an institution and program name.")); return; }
    const program: EducationProgram = { id: safeUuid(), institution: educationDraft.institution.trim().slice(0, 160), program: educationDraft.program.trim().slice(0, 200), region: educationDraft.region.trim().slice(0, 160), mode: educationDraft.mode, level: educationDraft.level, duration: educationDraft.duration.trim().slice(0, 120), url: educationDraft.url.trim(), tags: splitTags(educationDraft.tags) };
    setState((current) => ({ ...current, educationPrograms: [...current.educationPrograms, program].slice(-300) }));
    setEducationDraft({ institution: "", program: "", region: "", mode: "hybrid", level: "beginner", duration: "", url: "", tags: "" });
  };

  const speakGuide = () => {
    if (guideSpeaking) { speechAdapter.cancel(); setGuideSpeaking(false); setNotice(bi("음성 안내를 중지했습니다.", "Stopped voice guidance.")); return; }
    const copy = bi("이 작업대에서는 신인 작가 지원, 업무 보조 인력 소싱, 웹소설과 웹툰 기획, 판권 제안, 음성 대사, 교육 과정, 앱 설치와 사용 환경 점검을 한곳에서 관리할 수 있습니다. 계약과 결제는 자동 실행하지 않습니다.", "This workspace brings creator support, assistant sourcing, web novel and webtoon planning, rights inquiries, voice dialogue, education, app installation and environment checks together. Contracts and payments are never automatic.");
    const voice = choosePreferredDialogueVoice(speechAdapter.getVoices(), { lang: "ko-KR" }, "ko-KR");
    const started = speechAdapter.speak({ text: copy, rate: 1, voice, onEnd: () => setGuideSpeaking(false), onError: () => setGuideSpeaking(false) });
    setGuideSpeaking(started);
    if (!started) setNotice(bi("브라우저 음성 안내를 사용할 수 없습니다.", "Browser voice guidance is unavailable."));
  };

  const installPwa = async () => {
    const result = await requestPwaInstall();
    const message = result === "accepted" || result === "installed" ? bi("앱 설치 흐름을 완료했습니다.", "App installation flow completed.") : result === "manual" ? bi("iPhone/iPad에서는 Safari 공유 메뉴의 ‘홈 화면에 추가’를 사용하세요.", "On iPhone/iPad, use Add to Home Screen from Safari's share menu.") : result === "dismissed" ? bi("설치 요청을 닫았습니다. 필요할 때 다시 실행할 수 있습니다.", "Install request dismissed. You can retry later.") : bi("현재 브라우저에서는 자동 설치 프롬프트를 사용할 수 없습니다. 브라우저 메뉴의 앱 설치/홈 화면 추가를 사용하세요.", "The automatic install prompt is unavailable. Use your browser's install/add-to-home-screen command.");
    setNotice(message);
  };

  const shareToManualPlatform = async (platform: "linkedin" | "instagram" | "tiktok") => {
    const url = new URL("/studio/growth-ip", window.location.origin).toString();
    if (platform === "linkedin") {
      const target = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
      window.open(target, "_blank", "noopener,noreferrer");
      setNotice(bi("LinkedIn 공유 화면을 열었습니다.", "Opened LinkedIn sharing."));
      return;
    }
    const copied = await copyText(url);
    setNotice(copied ? bi(`${platform === "instagram" ? "Instagram" : "TikTok"}은 일반 웹 URL 직접 공유 API가 제한적이어서 링크를 복사했습니다. 앱의 지원되는 공유/프로필/메시지 화면에 붙여넣으세요.`, `Direct arbitrary web URL sharing to ${platform === "instagram" ? "Instagram" : "TikTok"} is limited, so the link was copied for pasting into a supported app surface.`) : bi("링크를 복사하지 못했습니다.", "Could not copy the link."));
  };

  return <Container size="wide" className="py-7 sm:py-10 lg:py-12">
    <header className="overflow-hidden rounded-3xl border border-line bg-panel/70 p-6 sm:p-8">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">CREATOR GROWTH · STORY · IP</p>
      <h1 className="mt-2 max-w-5xl text-3xl font-black tracking-tight text-fg sm:text-5xl">{bi("신인 발굴부터 연재·협업·판권 확장까지", "From creator discovery to publishing, collaboration and IP expansion")}</h1>
      <p className="mt-4 max-w-4xl text-sm leading-7 text-fg-2">{bi("웹툰·웹소설 창작자가 성장 과정에서 필요한 지원과 업무 기능을 하나의 작업 흐름으로 묶었습니다. 민감한 계약·고용·결제는 자동화하지 않고 검토 상태와 다음 행동을 명확히 남깁니다.", "A unified workspace for creator support and webtoon/web-novel operations. Sensitive contracts, hiring and payments stay reviewable instead of being automated.")}</p>
      <div className="mt-5 flex flex-wrap gap-2"><button type="button" className={PRIMARY} onClick={speakGuide}><Headphones size={16} />{guideSpeaking ? bi("음성 안내 중지", "Stop voice guide") : bi("음성으로 안내", "Voice guide")}</button><SharePageButton path="/studio/growth-ip" text={bi("작가 성장·IP 확장 작업대", "Creator growth & IP workspace")} description={bi("신인작가 지원, 웹소설→웹툰 각색, 판권·교육·협업 기능", "Creator support, adaptation, rights, education and collaboration")} label={bi("공유", "Share")} className="min-h-11 rounded-xl" /><Link to="/studio/ecosystem" className={BUTTON}><Sparkles size={16} />{bi("기존 창작 생태계", "Creator ecosystem")}</Link></div>
    </header>

    <nav className="mt-4 flex gap-2 overflow-x-auto rounded-2xl border border-line bg-card p-2 text-xs font-bold text-fg-2" aria-label={bi("작업대 섹션", "Workspace sections")}>
      {[["age", "연령 정책"], ["support", "작가 지원"], ["environment", "환경·PWA"], ["share", "SNS"], ["assistants", "어시스트"], ["story", "시놉시스·웹소설"], ["rights", "판권"], ["voice", "음성 대사"], ["education", "교육"]].map(([id, label]) => <a key={id} href={`#${id}`} className="shrink-0 rounded-xl px-3 py-2 hover:bg-raised hover:text-fg">{label}</a>)}
    </nav>
    <p className="my-5 rounded-xl border border-line bg-card px-4 py-3 text-sm leading-6 text-fg-2" role="status">{notice}</p>

    <section className="mt-8"><SectionHeading id="age" icon={ShieldCheck} eyebrow="AGE-SAFE POLICY" title={bi("연령대별 기능 제한과 보호자 검토", "Age-aware capability policy")} description={bi("정확한 생년월일을 이 작업대에 저장하지 않고 연령대만 사용합니다. 지역별 법률 확정값이 아니라, 미성년자에게 계약·DM·성인 콘텐츠가 기본 개방되지 않도록 하는 제품 안전 기본값입니다.", "Only an age band is stored here, not a birth date. This is a product-safety baseline rather than a jurisdiction-specific legal determination.")} />
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]"><div className={CARD}><label className="grid gap-2 text-sm font-bold text-fg">{bi("연령대", "Age band")}<select className={INPUT} value={state.ageBand} onChange={(event) => setState((current) => ({ ...current, ageBand: event.target.value as CreatorAgeBand }))}>{AGE_BANDS.map((band) => <option key={band} value={band}>{ageLabel[band]}</option>)}</select></label><p className="mt-3 text-xs leading-5 text-fg-3">{bi("실서비스에서는 국가/지역, 보호자 동의 증빙, 정책 버전을 별도 서버 정책으로 결합할 수 있습니다.", "Production can combine jurisdiction, guardian verification and policy versions server-side.")}</p></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{CAPABILITIES.map((capability) => { const decision = creatorAgePolicy(state.ageBand, capability); return <article key={capability} className="rounded-xl border border-line bg-card p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-fg">{capabilityLabel[capability]}</strong><span className={`rounded-full px-2 py-1 text-[0.65rem] font-black ${decision.allowed ? "border border-good/40 bg-good/15 text-fg" : "border border-bad/40 bg-bad/10 text-fg"}`}>{decision.allowed ? "ALLOW" : "BLOCK"}</span></div><p className="mt-2 text-xs leading-5 text-fg-3">{decision.reason}</p>{decision.guardianRequired ? <p className="mt-2 text-[0.68rem] font-bold text-warn">{bi("보호자/법정대리인 검토 필요", "Guardian/legal-representative review required")}</p> : null}</article>; })}</div></div>
    </section>

    <section className="mt-10"><SectionHeading id="support" icon={UserRoundSearch} eyebrow="DISCOVERY & SUPPORT" title={bi("신인 작가 발굴과 실무 지원", "Rookie creator discovery and practical support")} description={bi("학생·신인·독립작가가 공개 범위를 통제하면서 포트폴리오와 성장 목표를 기록하고, 멘토링·편집·법무·세무·번역·마케팅·연재 준비 지원을 요청할 수 있습니다.", "Creators can control discovery visibility while recording portfolio goals and requesting mentoring, editorial, legal, tax, localization, marketing and publishing support.")} />
      <div className="grid gap-4 xl:grid-cols-2"><div className={CARD}><h3 className="font-black text-fg">{bi("발굴 프로필", "Discovery profile")}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2"><input className={INPUT} value={rookieDraft.penName} onChange={(e) => setRookieDraft((c) => ({ ...c, penName: e.target.value }))} placeholder={bi("활동명 / 필명", "Display / pen name")} /><select className={INPUT} value={rookieDraft.stage} onChange={(e) => setRookieDraft((c) => ({ ...c, stage: e.target.value as RookieCreatorProfile["stage"] }))}><option value="student">student</option><option value="rookie">rookie</option><option value="independent">independent</option><option value="professional">professional</option></select><input className={INPUT} value={rookieDraft.genres} onChange={(e) => setRookieDraft((c) => ({ ...c, genres: e.target.value }))} placeholder={bi("장르: romance, fantasy", "Genres: romance, fantasy")} /><input className={INPUT} value={rookieDraft.portfolioUrl} onChange={(e) => setRookieDraft((c) => ({ ...c, portfolioUrl: e.target.value }))} placeholder="https:// portfolio" /></div><textarea className={`${INPUT} mt-2 min-h-24`} value={rookieDraft.goal} onChange={(e) => setRookieDraft((c) => ({ ...c, goal: e.target.value }))} placeholder={bi("성장 목표·찾는 기회", "Growth goal and opportunities sought")} /><button type="button" className={`${PRIMARY} mt-3`} onClick={addRookieProfile}><Plus size={15} />{bi("프로필 저장", "Save profile")}</button><div className="mt-4 grid gap-2">{state.rookieProfiles.slice(-5).reverse().map((profile) => <article key={profile.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-fg">{profile.penName}</strong><span className="rounded-full bg-raised px-2 py-1 text-[0.65rem]">{profile.stage}</span><span className="rounded-full bg-accent-soft px-2 py-1 text-[0.65rem] text-accent">{profile.discoveryStatus}</span></div><p className="mt-2 text-xs text-fg-3">{profile.genres.join(" · ") || bi("장르 미입력", "No genres")}{profile.goal ? ` · ${profile.goal}` : ""}</p></article>)}</div></div>
        <div className={CARD}><h3 className="font-black text-fg">{bi("서포트 요청", "Support request")}</h3><div className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr]"><select className={INPUT} value={supportDraft.area} onChange={(e) => setSupportDraft((c) => ({ ...c, area: e.target.value as CreatorSupportArea }))}>{SUPPORT_AREAS.map((area) => <option key={area} value={area}>{supportLabel[area]}</option>)}</select><input className={INPUT} value={supportDraft.title} onChange={(e) => setSupportDraft((c) => ({ ...c, title: e.target.value }))} placeholder={bi("필요한 지원 한 줄 요약", "One-line support need")} /></div><textarea className={`${INPUT} mt-2 min-h-28`} value={supportDraft.detail} onChange={(e) => setSupportDraft((c) => ({ ...c, detail: e.target.value }))} placeholder={bi("상황·마감·예상 산출물·민감정보 제외", "Context, deadline and deliverables; omit sensitive data")} /><button type="button" className={`${PRIMARY} mt-3`} onClick={addSupportRequest}><Plus size={15} />{bi("요청 등록", "Add request")}</button><ul className="mt-4 grid gap-2">{state.supportRequests.slice(-6).reverse().map((request) => <li key={request.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-fg">{request.title}</strong><span className="text-[0.68rem] font-bold text-accent">{supportLabel[request.area]} · {request.status}</span></div><p className="mt-1 text-xs leading-5 text-fg-3">{request.detail || "—"}</p></li>)}</ul></div></div>
    </section>

    <section className="mt-10"><SectionHeading id="environment" icon={MonitorCheck} eyebrow="ENVIRONMENT · PWA" title={bi("사용 환경 진단과 앱 설치", "Environment diagnostics and PWA install")} description={bi("브라우저가 실제로 제공하는 기능을 감지해 드로잉·웹캠·마이크·오프라인·3D·음성 기능의 준비 상태를 보여 주고, 기존 PWA 설치 캡처와 연결합니다.", "Detects real browser capabilities for drawing, camera, microphone, offline, 3D and speech, and connects to the existing PWA install flow.")} />
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]"><div className={CARD}><EnvironmentDiagnostics /></div><aside className={CARD}><div className="flex items-center gap-2"><span className={`grid size-9 place-items-center rounded-xl ${pwa.online ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>{pwa.online ? <Wifi size={17} /> : <WifiOff size={17} />}</span><div><strong className="text-sm text-fg">PWA · {pwa.platform}</strong><p className="text-xs text-fg-3">{pwa.status} · SW {pwa.serviceWorkerStatus}</p></div></div><button type="button" className={`${PRIMARY} mt-4 w-full`} disabled={pwa.status === "installed"} onClick={() => void installPwa()}><Download size={16} />{pwa.status === "installed" ? bi("설치됨", "Installed") : bi("앱 설치 / 안내", "Install / help")}</button><Link to="/studio/environment" className={`${BUTTON} mt-2 w-full`}><MonitorCheck size={15} />{bi("상세 사용 환경 안내", "Full environment guide")}</Link><p className="mt-3 text-xs leading-5 text-fg-3">{bi("iOS는 브라우저 제한 때문에 수동 홈 화면 추가 안내가 표시될 수 있습니다. 오프라인 상태와 업데이트 대기도 함께 보여 줍니다.", "iOS may require manual Add to Home Screen. Offline and pending-update states remain visible.")}</p></aside></div>
    </section>

    <section className="mt-10"><SectionHeading id="share" icon={Share2} eyebrow="SOCIAL DISTRIBUTION" title={bi("SNS 공유와 현실적인 플랫폼 제약", "Social sharing with truthful platform constraints")} description={bi("카카오·X·Facebook·Naver·LINE·Telegram·메일·QR은 기존 통합 공유기를 사용합니다. LinkedIn은 공식 공유 URL을 열고, Instagram·TikTok은 일반 웹의 임의 URL 직접 공유 제약 때문에 링크 복사/OS 공유 시트 방식으로 안내합니다.", "The existing share dialog covers Kakao, X, Facebook, Naver, LINE, Telegram, email and QR. LinkedIn uses its share URL; Instagram and TikTok fall back to copy/native share because arbitrary web URL sharing is restricted.")} />
      <div className={CARD}><div className="flex flex-wrap gap-2"><SharePageButton path="/studio/growth-ip" text={bi("작가 성장·IP 확장 작업대", "Creator growth & IP workspace")} description={bi("창작자 성장·협업·IP 확장 기능", "Creator growth, collaboration and IP expansion")} label={bi("통합 공유", "Share")} className="min-h-11 rounded-xl" /><button type="button" className={BUTTON} onClick={() => void shareToManualPlatform("linkedin")}><Link2 size={15} />LinkedIn</button><button type="button" className={BUTTON} onClick={() => void shareToManualPlatform("instagram")}><Link2 size={15} />Instagram</button><button type="button" className={BUTTON} onClick={() => void shareToManualPlatform("tiktok")}><Link2 size={15} />TikTok</button></div><p className="mt-3 text-xs leading-5 text-fg-3">{bi("공유 링크에는 기존 공통 공유 모듈의 UTM 추적이 적용됩니다. Instagram/TikTok에는 ‘직접 게시 성공’처럼 확인할 수 없는 상태를 표시하지 않습니다.", "Existing share attribution remains intact. Instagram/TikTok never report a direct-post success that the browser cannot verify.")}</p></div>
    </section>

    <section className="mt-10"><SectionHeading id="assistants" icon={UsersRound} eyebrow="GLOBAL ASSISTANT SOURCING" title={bi("해외 어시스트·업무보조 소싱 보드", "Global assistant sourcing board")} description={bi("국가·언어·역할·시간대 겹침·단가·포트폴리오·검증 여부를 비교합니다. 플랫폼이 실제 고용주가 되거나 송금을 대행하는 것으로 오인되지 않도록 ‘후보 수집 → 검증 → 계약’ 단계를 분리합니다.", "Compare region, language, role, time overlap, rate, portfolio and verification. Candidate collection, verification and contracting stay separate.")} />
      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><div className={CARD}><fieldset disabled={!assistantPolicy.allowed}><div className="grid gap-2 sm:grid-cols-2"><input className={INPUT} value={candidateDraft.displayName} onChange={(e) => setCandidateDraft((c) => ({ ...c, displayName: e.target.value }))} placeholder={bi("후보 이름/식별자", "Candidate name / identifier")} /><input className={INPUT} value={candidateDraft.region} onChange={(e) => setCandidateDraft((c) => ({ ...c, region: e.target.value }))} placeholder={bi("국가/지역", "Country / region")} /><input className={INPUT} value={candidateDraft.roles} onChange={(e) => setCandidateDraft((c) => ({ ...c, roles: e.target.value }))} placeholder="flat-color, background" /><input className={INPUT} value={candidateDraft.languages} onChange={(e) => setCandidateDraft((c) => ({ ...c, languages: e.target.value }))} placeholder="en, vi, ko" /><input className={INPUT} type="number" min="0" max="24" value={candidateDraft.timezoneOverlapHours} onChange={(e) => setCandidateDraft((c) => ({ ...c, timezoneOverlapHours: e.target.value }))} aria-label={bi("시간대 겹침 시간", "Timezone overlap hours")} /><input className={INPUT} type="number" min="0" value={candidateDraft.hourlyUsd} onChange={(e) => setCandidateDraft((c) => ({ ...c, hourlyUsd: e.target.value }))} aria-label={bi("시간당 USD", "Hourly USD")} /><input className={`${INPUT} sm:col-span-2`} value={candidateDraft.portfolioUrl} onChange={(e) => setCandidateDraft((c) => ({ ...c, portfolioUrl: e.target.value }))} placeholder="https:// portfolio" /></div><label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-fg-2"><input type="checkbox" checked={candidateDraft.verified} onChange={(e) => setCandidateDraft((c) => ({ ...c, verified: e.target.checked }))} />{bi("외부 검증 완료 표시(운영자가 증빙 확인한 경우만)", "Mark externally verified only after evidence review")}</label><button type="button" className={`${PRIMARY} mt-2`} onClick={addCandidate}><Plus size={15} />{bi("후보 추가", "Add candidate")}</button></fieldset>{!assistantPolicy.allowed ? <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs leading-5 text-warn">{assistantPolicy.reason}</p> : null}</div>
        <div className={CARD}><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input className={INPUT} value={brief.roles.join(", ")} onChange={(e) => setBrief((c) => ({ ...c, roles: splitTags(e.target.value) }))} aria-label={bi("필요 역할", "Wanted roles")} /><input className={INPUT} value={brief.languages.join(", ")} onChange={(e) => setBrief((c) => ({ ...c, languages: splitTags(e.target.value) }))} aria-label={bi("필요 언어", "Wanted languages")} /><input className={INPUT} type="number" min="0" max="24" value={brief.timezoneOverlapHours} onChange={(e) => setBrief((c) => ({ ...c, timezoneOverlapHours: Math.max(0, Number(e.target.value) || 0) }))} aria-label={bi("최소 시간대 겹침", "Minimum overlap")} /><input className={INPUT} type="number" min="0" value={brief.maxHourlyUsd} onChange={(e) => setBrief((c) => ({ ...c, maxHourlyUsd: Math.max(0, Number(e.target.value) || 0) }))} aria-label={bi("최대 시간당 USD", "Maximum hourly USD")} /></div><div className="mt-4 grid gap-2">{assistantMatches.length ? assistantMatches.map((candidate) => <article key={candidate.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-fg">{candidate.displayName}</strong><span className="rounded-full bg-accent-soft px-2 py-1 text-[0.68rem] font-black text-accent">MATCH {candidate.score}</span></div><p className="mt-1 text-xs text-fg-3">{candidate.region} · ${candidate.hourlyUsd}/h · {candidate.timezoneOverlapHours}h overlap · {candidate.verified ? "verified" : "verify"}</p><p className="mt-2 text-xs leading-5 text-fg-3">{candidate.reasons.join(" · ")}</p>{candidate.portfolioUrl ? <a href={candidate.portfolioUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-accent">{bi("포트폴리오", "Portfolio")}<ExternalLink size={12} /></a> : null}</article>) : <p className="text-sm text-fg-3">{bi("후보를 직접 추가하면 조건에 맞춰 점수를 계산합니다. 실제 인력인 것처럼 가짜 프로필을 미리 채우지 않습니다.", "Add real sourced candidates to calculate matches; no fictional people are pre-seeded.")}</p>}</div></div></div>
    </section>

    <section className="mt-10"><SectionHeading id="story" icon={BookOpen} eyebrow="SYNOPSIS · WEB NOVEL · ADAPTATION" title={bi("시놉시스와 웹소설 → 웹툰 각색 흐름", "Synopsis and web novel → webtoon adaptation")} description={bi("로그라인·기획의도·세계관·캐릭터·시즌 아크를 작품 기획으로 관리하고, 웹소설 회차를 웹툰 에피소드 묶음으로 변환하는 편집 가능한 각색 초안을 만듭니다.", "Manage logline, premise, world, characters and season arc, then build editable webtoon episode groupings from novel chapters.")} />
      <div className="grid gap-4 xl:grid-cols-2"><div className={CARD}><h3 className="font-black text-fg">{bi("웹툰 시놉시스", "Webtoon synopsis")}</h3><div className="mt-3 grid gap-2"><input className={INPUT} value={state.synopsis.title} onChange={(e) => setState((c) => ({ ...c, synopsis: { ...c.synopsis, title: e.target.value } }))} placeholder={bi("작품명", "Title")} /><input className={INPUT} value={state.synopsis.logline} onChange={(e) => setState((c) => ({ ...c, synopsis: { ...c.synopsis, logline: e.target.value } }))} placeholder={bi("한 줄 로그라인", "One-line logline")} /><textarea className={`${INPUT} min-h-24`} value={state.synopsis.premise} onChange={(e) => setState((c) => ({ ...c, synopsis: { ...c.synopsis, premise: e.target.value } }))} placeholder={bi("기획 의도 / premise", "Premise")} /><div className="grid gap-2 sm:grid-cols-2"><textarea className={`${INPUT} min-h-28`} value={state.synopsis.world} onChange={(e) => setState((c) => ({ ...c, synopsis: { ...c.synopsis, world: e.target.value } }))} placeholder={bi("세계관", "World")} /><textarea className={`${INPUT} min-h-28`} value={state.synopsis.characters} onChange={(e) => setState((c) => ({ ...c, synopsis: { ...c.synopsis, characters: e.target.value } }))} placeholder={bi("주요 인물", "Characters")} /></div><textarea className={`${INPUT} min-h-28`} value={state.synopsis.seasonArc} onChange={(e) => setState((c) => ({ ...c, synopsis: { ...c.synopsis, seasonArc: e.target.value } }))} placeholder={bi("시즌/에피소드 아크", "Season / episode arc")} /></div></div>
        <div className={CARD}><div className="flex items-center justify-between gap-3"><h3 className="font-black text-fg">{bi("웹소설 회차", "Web novel chapters")}</h3><button type="button" className={BUTTON} disabled={!state.novelChapters.length} onClick={rebuildAdaptation}><WandSparkles size={15} />{bi("각색 플랜 생성", "Build adaptation")}</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><input className={INPUT} value={chapterDraft.title} onChange={(e) => setChapterDraft((c) => ({ ...c, title: e.target.value }))} placeholder={bi("회차 제목", "Chapter title")} /><input className={INPUT} type="number" min="0" value={chapterDraft.wordCount} onChange={(e) => setChapterDraft((c) => ({ ...c, wordCount: e.target.value }))} aria-label={bi("글자/단어 수", "Word count")} /></div><textarea className={`${INPUT} mt-2 min-h-24`} value={chapterDraft.summary} onChange={(e) => setChapterDraft((c) => ({ ...c, summary: e.target.value }))} placeholder={bi("핵심 사건·감정 변화·클리프행어", "Core event, emotion shift and cliffhanger")} /><button type="button" className={`${BUTTON} mt-2`} onClick={addChapter}><Plus size={15} />{bi("회차 추가", "Add chapter")}</button><div className="mt-4 grid gap-2">{state.adaptationEpisodes.map((episode) => <article key={episode.id} className="rounded-xl border border-line bg-panel p-3"><strong className="text-sm text-fg">{episode.title}</strong><p className="mt-1 text-xs text-accent">source: {episode.sourceChapterIds.join(", ")}</p><p className="mt-2 text-xs leading-5 text-fg-3">{episode.hook}</p></article>)}</div></div></div>
    </section>

    <section className="mt-10"><SectionHeading id="rights" icon={Scale} eyebrow="RIGHTS · FILM · ANIMATION" title={bi("판권·영화화·애니화 제안 CRM", "Rights, film and animation inquiry CRM")} description={bi("작품별 제안 수신·검토·법률 검토 필요·거절·종료 상태를 기록합니다. 제안 기록과 실제 계약 체결을 분리해, 클릭 한 번으로 권리가 이전되거나 동의된 것처럼 보이지 않게 합니다.", "Track inbound proposals and review states while keeping inquiry records separate from actual contract execution or rights transfer.")} />
      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]"><div className={CARD}><fieldset disabled={!rightsPolicy.allowed}><select className={INPUT} value={rightsDraft.medium} onChange={(e) => setRightsDraft((c) => ({ ...c, medium: e.target.value as RightsInquiry["medium"] }))}>{RIGHTS_MEDIA.map((medium) => <option key={medium}>{medium}</option>)}</select><input className={`${INPUT} mt-2`} value={rightsDraft.company} onChange={(e) => setRightsDraft((c) => ({ ...c, company: e.target.value }))} placeholder={bi("제안 회사/스튜디오", "Company / studio")} /><input className={`${INPUT} mt-2`} value={rightsDraft.contact} onChange={(e) => setRightsDraft((c) => ({ ...c, contact: e.target.value }))} placeholder={bi("담당자 연락 식별자", "Contact identifier")} /><input className={`${INPUT} mt-2`} value={rightsDraft.territory} onChange={(e) => setRightsDraft((c) => ({ ...c, territory: e.target.value }))} placeholder={bi("지역/권역", "Territory")} /><textarea className={`${INPUT} mt-2 min-h-28`} value={rightsDraft.scope} onChange={(e) => setRightsDraft((c) => ({ ...c, scope: e.target.value }))} placeholder={bi("옵션/판권 범위·기간·독점 여부 등 받은 내용을 사실 그대로 기록", "Record scope, term, exclusivity and other received terms factually")} /><button type="button" className={`${PRIMARY} mt-3`} onClick={addRightsInquiry}><Plus size={15} />{bi("제안 기록", "Record inquiry")}</button></fieldset>{!rightsPolicy.allowed ? <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-warn">{rightsPolicy.reason}</p> : null}</div><div className={CARD}>{state.rightsInquiries.length ? <div className="grid gap-2">{state.rightsInquiries.slice().reverse().map((item) => <article key={item.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-fg">{item.company} · {item.medium}</strong><select className="rounded-lg border border-line bg-card px-2 py-1 text-xs text-fg" value={item.status} onChange={(e) => setState((current) => ({ ...current, rightsInquiries: current.rightsInquiries.map((row) => row.id === item.id ? { ...row, status: e.target.value as RightsInquiry["status"] } : row) }))}><option value="received">received</option><option value="reviewing">reviewing</option><option value="needs-counsel">needs-counsel</option><option value="declined">declined</option><option value="closed">closed</option></select></div><p className="mt-2 text-xs leading-5 text-fg-3">{item.territory || "—"} · {item.scope}</p></article>)}</div> : <p className="text-sm text-fg-3">{bi("아직 기록한 판권 제안이 없습니다.", "No rights inquiries recorded yet.")}</p>}</div></div>
    </section>

    <section className="mt-10"><SectionHeading id="voice" icon={Mic2} eyebrow="VOICE DIALOGUE" title={bi("웹툰 컷·말풍선 단위 음성 대사", "Panel and balloon-level voice dialogue")} description={bi("회차·컷·화자·언어 메타데이터를 저장하고 브라우저 TTS로 바로 검수하거나, 권리를 확보한 음성 파일을 현재 세션에 연결해 재생합니다. 자동 재생은 기본으로 사용하지 않습니다.", "Store episode, panel, speaker and locale metadata, proof with browser TTS, or attach owned voice audio for the current session. Autoplay stays off.")} />
      <div className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]"><div className={CARD}><div className="grid grid-cols-2 gap-2"><input className={INPUT} type="number" min="1" value={voiceDraft.episode} onChange={(e) => setVoiceDraft((c) => ({ ...c, episode: e.target.value }))} aria-label={bi("회차", "Episode")} /><input className={INPUT} type="number" min="1" value={voiceDraft.panel} onChange={(e) => setVoiceDraft((c) => ({ ...c, panel: e.target.value }))} aria-label={bi("컷", "Panel")} /></div><div className="mt-2 grid gap-2 sm:grid-cols-2"><input className={INPUT} value={voiceDraft.speaker} onChange={(e) => setVoiceDraft((c) => ({ ...c, speaker: e.target.value }))} placeholder={bi("화자", "Speaker")} /><input className={INPUT} value={voiceDraft.locale} onChange={(e) => setVoiceDraft((c) => ({ ...c, locale: e.target.value }))} placeholder="ko-KR" /></div><textarea className={`${INPUT} mt-2 min-h-32`} value={voiceDraft.text} onChange={(e) => setVoiceDraft((c) => ({ ...c, text: e.target.value }))} placeholder={bi("대사", "Dialogue")} /><button type="button" className={`${PRIMARY} mt-3`} onClick={addVoiceDialogue}><Plus size={15} />{bi("음성 대사 추가", "Add voice dialogue")}</button></div><div className={`${CARD} grid gap-2`}>{state.voiceDialogues.length ? state.voiceDialogues.slice().reverse().map((dialogue) => <article key={dialogue.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-fg">EP {dialogue.episode} · CUT {dialogue.panel} · {dialogue.speaker || bi("화자 미정", "Speaker TBD")}</strong><span className="text-[0.68rem] font-bold text-accent">{dialogue.locale}</span></div><p className="mt-2 text-sm leading-6 text-fg-2">{dialogue.text}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={BUTTON} onClick={() => speakDialogue(dialogue)}><Headphones size={14} />TTS</button><label className={`${BUTTON} cursor-pointer`}><Mic2 size={14} />{bi("음성 파일", "Voice file")}<input className="sr-only" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/webm" onChange={(e) => { attachVoiceAudio(dialogue, e.target.files?.[0]); e.target.value = ""; }} /></label>{dialogue.audioName ? <button type="button" className={BUTTON} onClick={() => playAttachedAudio(dialogue.id)}><Headphones size={14} />{dialogue.audioName}</button> : null}</div></article>) : <p className="text-sm text-fg-3">{bi("대사를 추가하면 컷 단위 음성 검수 목록이 만들어집니다.", "Add dialogue to build a panel-level voice proofing list.")}</p>}</div></div>
    </section>

    <section className="mb-12 mt-10"><SectionHeading id="education" icon={GraduationCap} eyebrow="SCHOOL · CURRICULUM · TRAINING" title={bi("웹툰 학교·학과·학원·교육원 정보와 교육과정", "Webtoon schools, programs and curriculum guidance")} description={bi("실제 교육기관 데이터는 운영자가 출처를 확인해 등록하도록 비워 두고, 사용자가 기관·과정을 직접 기록할 수 있게 했습니다. 동시에 웹툰 제작에 필요한 표준 학습 로드맵을 제공합니다.", "Institution data stays source-verified rather than prefilled with fictional schools. Users can record real programs while following a generic production curriculum map.")} />
      <div className="grid gap-4 xl:grid-cols-2"><div className={CARD}><h3 className="font-black text-fg">{bi("교육과정 로드맵", "Curriculum roadmap")}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{WEBTOON_CURRICULUM_GUIDE.map((phase) => <article key={phase.phase} className="rounded-xl border border-line bg-panel p-3"><strong className="text-sm text-accent">{phase.phase}</strong><ul className="mt-2 grid gap-1 text-xs text-fg-3">{phase.subjects.map((subject) => <li key={subject}>· {subject}</li>)}</ul></article>)}</div><div className="mt-3 flex flex-wrap gap-2"><Link to="/learn" className={BUTTON}><BookOpen size={15} />{bi("내부 학습실", "Learning hub")}</Link><Link to="/learn/studio" className={BUTTON}><Clapperboard size={15} />{bi("Studio 실습", "Studio practice")}</Link></div></div>
        <div className={CARD}><h3 className="font-black text-fg">{bi("확인한 교육기관/과정 등록", "Record a verified institution/program")}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2"><input className={INPUT} value={educationDraft.institution} onChange={(e) => setEducationDraft((c) => ({ ...c, institution: e.target.value }))} placeholder={bi("기관명", "Institution")} /><input className={INPUT} value={educationDraft.program} onChange={(e) => setEducationDraft((c) => ({ ...c, program: e.target.value }))} placeholder={bi("학과/과정명", "Program")} /><input className={INPUT} value={educationDraft.region} onChange={(e) => setEducationDraft((c) => ({ ...c, region: e.target.value }))} placeholder={bi("지역", "Region")} /><input className={INPUT} value={educationDraft.duration} onChange={(e) => setEducationDraft((c) => ({ ...c, duration: e.target.value }))} placeholder={bi("기간", "Duration")} /><select className={INPUT} value={educationDraft.mode} onChange={(e) => setEducationDraft((c) => ({ ...c, mode: e.target.value as EducationProgram["mode"] }))}><option value="offline">offline</option><option value="online">online</option><option value="hybrid">hybrid</option></select><select className={INPUT} value={educationDraft.level} onChange={(e) => setEducationDraft((c) => ({ ...c, level: e.target.value as EducationProgram["level"] }))}><option value="beginner">beginner</option><option value="intermediate">intermediate</option><option value="advanced">advanced</option></select><input className={INPUT} value={educationDraft.url} onChange={(e) => setEducationDraft((c) => ({ ...c, url: e.target.value }))} placeholder="https:// official source" /><input className={INPUT} value={educationDraft.tags} onChange={(e) => setEducationDraft((c) => ({ ...c, tags: e.target.value }))} placeholder={bi("태그", "Tags")} /></div><button type="button" className={`${PRIMARY} mt-3`} onClick={addEducationProgram}><Plus size={15} />{bi("과정 등록", "Add program")}</button><div className="mt-4 grid gap-2">{state.educationPrograms.map((program) => <article key={program.id} className="rounded-xl border border-line bg-panel p-3"><strong className="text-sm text-fg">{program.institution} · {program.program}</strong><p className="mt-1 text-xs text-fg-3">{program.region || "—"} · {program.mode} · {program.level} · {program.duration || "—"}</p>{program.url ? <a href={program.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-accent">{bi("공식/확인 링크", "Source link")}<ExternalLink size={12} /></a> : null}</article>)}</div></div></div>
    </section>
  </Container>;
}
