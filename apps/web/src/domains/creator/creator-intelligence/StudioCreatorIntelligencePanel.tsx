import {
  AudioLines,
  BookOpenCheck,
  Box,
  Braces,
  CheckCircle2,
  CloudSun,
  Languages,
  Loader2,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { studioProjectSectionHref } from "../studio-project-views";
import {
  creatorIntelligenceClient,
  type AniListReference,
  type CreatorIntelligenceProviderState,
  type CreatorIntelligenceReference,
  type CreatorIntelligenceReferenceProvider,
  type CreatorIntelligenceStatus,
  type CreatorIntelligenceTranslationProvider,
  type MeshyJobResponse,
  type SafeSearchResponse,
  type SceneReferenceResponse,
  type SoundEffectReference,
} from "./studio-creator-intelligence-client";import {
  createSavedSceneReference,
  loadStudioCreatorIntelligenceStore,
  patchStudioCreatorIntelligenceStore,
  saveStudioCreatorIntelligenceStore,
  type StudioCreatorIntelligenceStore,
  type StudioProjectReference,
} from "./studio-creator-intelligence-store";

interface Props {
  readonly projectId: string;
  readonly locale: "ko" | "en";
}

const CARD = "rounded-3xl border border-line bg-panel p-5 shadow-sm";
const INPUT = "min-h-10 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent";
const BUTTON = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-raised px-3 py-2 text-sm font-semibold text-fg transition hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = `${BUTTON} border-accent bg-accent text-white hover:bg-accent/90`;
const EMPTY_SOUND_CAPTIONS = "data:text/vtt;charset=utf-8,WEBVTT%0A%0A";

function message(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "요청을 처리하지 못했습니다.";
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function stateLabel(state: CreatorIntelligenceProviderState, locale: Props["locale"]): string {
  if (state === "ready") return locale === "ko" ? "사용 가능" : "Ready";
  if (state === "disabled") return locale === "ko" ? "운영 비활성" : "Disabled";
  return locale === "ko" ? "설정 필요" : "Setup required";
}function ProviderBadge({
  state,
  locale,
}: {
  readonly state: CreatorIntelligenceProviderState;
  readonly locale: Props["locale"];
}) {
  const tone = state === "ready"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : state === "disabled"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-line bg-raised text-fg-3";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone}`}>
      {stateLabel(state, locale)}
    </span>
  );
}

function capabilityLinks(projectId: string) {
  return [
    ["pose", "Pose Director", "/studio/poser", "웹캠·사진 포즈 추출과 33 랜드마크 스켈레톤"],
    ["references", "Reference Vault", "#reference-vault", "출처·라이선스 메타데이터를 보존하는 레퍼런스 보드"],
    ["continuity", "Continuity Guardian", studioProjectSectionHref(projectId, "story", "characters"), "캐릭터 Bible과 결정적 연속성 검사"],
    ["lettering", "Smart Lettering", `/studio/work/${encodeURIComponent(projectId)}/canvas`, "말풍선 fitting·꼬리·금칙처리·세로쓰기"],
    ["localization", "Localization Studio", studioProjectSectionHref(projectId, "story", "localization"), "용어집·번역 메모리·말풍선 재조판"],
    ["review", "Realtime Review", studioProjectSectionHref(projectId, "review", "comments"), "좌표 댓글·멘션·승인·CRDT 협업"],
    ["lift3d", "2D → 3D Reference", "/studio/lift3d", "기기 내 GLB 변환 + 선택적 Meshy 작업"],
    ["scene", "Scene Reference", "#scene-reference", "장소·과거 날씨·일출·일몰 기반 장면 카드"],
    ["sfx", "Sound FX Lab", "#sound-fx", "Freesound 검색 + 선택적 생성형 효과음"],
    ["preflight", "Publish Preflight", studioProjectSectionHref(projectId, "export", "preflight"), "로컬 품질 검사 + 선택적 외부 SafeSearch"],
    ["timeline", "Story Timeline", studioProjectSectionHref(projectId, "story", "timeline"), "사건·상태 변화의 시간 순서 검증"],
    ["graph", "World Wiki & Relations", studioProjectSectionHref(projectId, "story", "relations"), "캐릭터·조직·사건 관계 그래프"],
    ["motion", "Motion Comic", `/studio/work/${encodeURIComponent(projectId)}/motion`, "pan·zoom·cue·SFX 기반 애니매틱/영상 출력"],
    ["anilist", "AniList Explorer", "#anilist-reference", "계약 확인 후 메타데이터 전용 작품 탐색"],
  ] as const;
}

function ToolHeader({ icon: Icon, title, detail }: { readonly icon: typeof Search; readonly title: string; readonly detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent"><Icon size={18} aria-hidden="true" /></span>
      <div><h3 className="font-bold text-fg">{title}</h3><p className="mt-1 text-sm leading-6 text-fg-2">{detail}</p></div>
    </div>
  );
}

export function StudioCreatorIntelligencePanel({ projectId, locale }: Props) {
  const [providerStatus, setProviderStatus] = useState<CreatorIntelligenceStatus | null>(null);
  const [projectStore, setProjectStore] = useState<StudioCreatorIntelligenceStore>(() =>
    loadStudioCreatorIntelligenceStore(storage(), projectId));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const [referenceProvider, setReferenceProvider] = useState<CreatorIntelligenceReferenceProvider>("openverse");
  const [referenceScope, setReferenceScope] = useState<"project" | "episode" | "scene">("project");
  const [referenceScopeId, setReferenceScopeId] = useState("");
  const [referenceQuery, setReferenceQuery] = useState("");
  const [referenceResults, setReferenceResults] = useState<readonly CreatorIntelligenceReference[]>([]);

  const [scenePlace, setScenePlace] = useState("");
  const [sceneDate, setSceneDate] = useState(new Date().toISOString().slice(0, 10));
  const [sceneResult, setSceneResult] = useState<SceneReferenceResponse | null>(null);

  const [aniQuery, setAniQuery] = useState("");
  const [aniType, setAniType] = useState<"MANGA" | "ANIME">("MANGA");
  const [aniResults, setAniResults] = useState<readonly AniListReference[]>([]);

  const [soundQuery, setSoundQuery] = useState("");
  const [soundResults, setSoundResults] = useState<readonly SoundEffectReference[]>([]);
  const [soundPrompt, setSoundPrompt] = useState("");
  const [soundDuration, setSoundDuration] = useState(4);
  const [generatedAudio, setGeneratedAudio] = useState("");

  const [translationProvider, setTranslationProvider] = useState<CreatorIntelligenceTranslationProvider>("deepl");
  const [translationText, setTranslationText] = useState("");
  const [translationTarget, setTranslationTarget] = useState("EN");
  const [translatedText, setTranslatedText] = useState("");  const [meshImageUrl, setMeshImageUrl] = useState("");
  const [meshJob, setMeshJob] = useState<MeshyJobResponse | null>(null);
  const [safeSearchResult, setSafeSearchResult] = useState<SafeSearchResponse | null>(null);

  useEffect(() => {
    setProjectStore(loadStudioCreatorIntelligenceStore(storage(), projectId));
  }, [projectId]);

  useEffect(() => {
    let disposed = false;
    void creatorIntelligenceClient.status()
      .then((next) => { if (!disposed) setProviderStatus(next); })
      .catch((cause: unknown) => { if (!disposed) setError(message(cause)); });
    return () => { disposed = true; };
  }, []);

  const capabilities = useMemo(() => capabilityLinks(projectId), [projectId]);

  const persist = (
    patch: Partial<Pick<StudioCreatorIntelligenceStore, "references" | "scenes" | "catalog" | "sounds" | "meshJobs">>,
  ) => {
    setProjectStore((current) => {
      const next = patchStudioCreatorIntelligenceStore(current, patch);
      if (!saveStudioCreatorIntelligenceStore(storage(), next)) {
        setError(locale === "ko" ? "프로젝트 브라우저 저장소에 기록하지 못했습니다." : "Could not save to project browser storage.");
      }
      return next;
    });
  };

  const run = async <T,>(name: string, operation: () => Promise<T>, success: (value: T) => void) => {
    setBusy(name);
    setError("");
    try {
      success(await operation());
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy("");
    }
  };  const saveReference = (item: CreatorIntelligenceReference) => {
    const targetId = referenceScope === "project" ? projectId : referenceScopeId.trim();
    if (!targetId) {
      setError(locale === "ko" ? "에피소드/장면 ID를 입력하세요." : "Enter an episode/scene id.");
      return;
    }
    const saved: StudioProjectReference = {
      ...item,
      target: { kind: referenceScope, id: targetId },
      savedAt: new Date().toISOString(),
    };
    persist({ references: [saved, ...projectStore.references] });
  };

  const searchReferences = () => run(
    "references",
    () => creatorIntelligenceClient.references(referenceProvider, referenceQuery),
    (value) => {
      setReferenceResults(value.items);
      if (value.status !== "ready") setError(stateLabel(value.status, locale));
    },
  );

  const searchScene = () => run(
    "scene",
    () => creatorIntelligenceClient.scene(scenePlace, sceneDate),
    (value) => {
      setSceneResult(value);
      if (value.status !== "ready") setError(stateLabel(value.status, locale));
    },
  );

  const searchAniList = () => run(
    "anilist",
    () => creatorIntelligenceClient.anilist(aniQuery, aniType),
    (value) => {
      setAniResults(value.items);
      if (value.status !== "ready") setError(stateLabel(value.status, locale));
    },
  );

  const searchSounds = () => run(
    "sound-search",
    () => creatorIntelligenceClient.soundSearch(soundQuery),
    (value) => {
      setSoundResults(value.items);
      if (value.status !== "ready") setError(stateLabel(value.status, locale));
    },
  );  const generateSound = () => run(
    "sound-generate",
    () => creatorIntelligenceClient.soundGenerate(soundPrompt, soundDuration, false),
    (value) => {
      if (value.status !== "ready" || !value.audioBase64 || !value.mimeType) {
        setGeneratedAudio("");
        setError(stateLabel(value.status, locale));
        return;
      }
      setGeneratedAudio(`data:${value.mimeType};base64,${value.audioBase64}`);
    },
  );

  const translate = () => run(
    "translation",
    () => creatorIntelligenceClient.translate({
      provider: translationProvider,
      text: translationText,
      targetLanguage: translationTarget,
    }),
    (value) => {
      setTranslatedText(value.text ?? "");
      if (value.status !== "ready") setError(stateLabel(value.status, locale));
    },
  );

  const createMesh = () => run(
    "mesh-create",
    () => creatorIntelligenceClient.meshCreate(meshImageUrl),
    (value) => {
      setMeshJob(value);
      if (value.status !== "ready") setError(stateLabel(value.status, locale));
    },
  );  const refreshMesh = () => {
    if (!meshJob?.jobId) return;
    void run(
      "mesh-status",
      () => creatorIntelligenceClient.meshStatus(meshJob.jobId ?? ""),
      (value) => {
        setMeshJob(value);
        if (value.status !== "ready") setError(stateLabel(value.status, locale));
      },
    );
  };

  const runSafeSearch = (file: File | null) => {
    if (!file) return;
    if (!/^image\/(?:png|jpeg|webp)$/u.test(file.type) || file.size > 2 * 1024 * 1024) {
      setError(locale === "ko" ? "PNG/JPEG/WebP 2MB 이하 파일을 선택하세요." : "Choose a PNG/JPEG/WebP file up to 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError(locale === "ko" ? "이미지를 읽지 못했습니다." : "Could not read the image.");
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      void run(
        "safe-search",
        () => creatorIntelligenceClient.safeSearch(dataUrl),
        (value) => {
          setSafeSearchResult(value);
          if (value.status !== "ready") setError(stateLabel(value.status, locale));
        },
      );
    };
    reader.readAsDataURL(file);
  };

  const savedCounts = [
    [locale === "ko" ? "레퍼런스" : "References", projectStore.references.length],
    [locale === "ko" ? "장면 카드" : "Scene cards", projectStore.scenes.length],
    ["AniList", projectStore.catalog.length],
    [locale === "ko" ? "효과음" : "SFX", projectStore.sounds.length],
    ["3D jobs", projectStore.meshJobs.length],
  ] as const;  return (
    <section className="space-y-5" aria-label="Creator Intelligence">
      <div className={`${CARD} overflow-hidden bg-gradient-to-br from-accent-soft/50 via-panel to-panel`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
              <Sparkles size={14} aria-hidden="true" /> Creator Intelligence
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-fg">
              {locale === "ko" ? "창작 워크플로우를 프로젝트 하나로 연결" : "Connect the creative workflow in one project"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {locale === "ko"
                ? "기존 로컬 제작 엔진은 그대로 재사용하고, 외부 API가 필요한 기능만 권리·비용 게이트를 거쳐 선택적으로 연결합니다. 외부 키는 브라우저 저장소에 남기지 않습니다."
                : "Existing local production engines stay authoritative. External APIs are optional, rights/cost-gated providers, and their keys are never stored in browser project data."}
            </p>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {savedCounts.map(([label, count]) => (
              <div key={label} className="min-w-20 rounded-2xl border border-line bg-canvas/80 p-3 text-center">
                <p className="text-lg font-bold text-fg">{count}</p><p className="text-[10px] text-fg-3">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-fg">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {capabilities.map(([id, title, href, detail]) => {
          const content = <><p className="font-bold text-fg">{title}</p><p className="mt-1 text-xs leading-5 text-fg-2">{detail}</p></>;
          const className = "rounded-2xl border border-line bg-card p-4 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-sm";
          return href.startsWith("#")
            ? <a key={id} className={className} href={href}>{content}</a>
            : <Link key={id} className={className} to={href}>{content}</Link>;
        })}
      </div>      <div className={CARD}>
        <ToolHeader icon={ShieldCheck} title={locale === "ko" ? "외부 Provider 상태" : "External provider status"} detail={locale === "ko" ? "유료·상업 라이선스·개인정보 전송이 가능한 기능은 명시적으로 활성화된 경우에만 호출합니다." : "Paid, commercially gated, or externally processed capabilities only call providers after explicit operator enablement."} />
        <div className="mt-4 flex flex-wrap gap-2">
          {providerStatus ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">Openverse <ProviderBadge state={providerStatus.references.openverse.status} locale={locale} /></span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">Pexels <ProviderBadge state={providerStatus.references.pexels.status} locale={locale} /></span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">Pixabay <ProviderBadge state={providerStatus.references.pixabay.status} locale={locale} /></span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">DeepL <ProviderBadge state={providerStatus.translation.deepl.status} locale={locale} /></span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">Scene <ProviderBadge state={providerStatus.scene.status} locale={locale} /></span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">AniList <ProviderBadge state={providerStatus.anilist.status} locale={locale} /></span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">Freesound <ProviderBadge state={providerStatus.freesound.status} locale={locale} /></span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">Meshy <ProviderBadge state={providerStatus.meshy.status} locale={locale} /></span>
            </>
          ) : <span className="inline-flex items-center gap-2 text-sm text-fg-3"><Loader2 className="size-4 animate-spin" /> {locale === "ko" ? "상태 확인 중" : "Checking providers"}</span>}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section id="reference-vault" className={CARD}>
          <ToolHeader icon={Search} title="Reference Vault" detail={locale === "ko" ? "Openverse/Pexels/Pixabay를 동일 계약으로 탐색하고 출처·라이선스 상태를 프로젝트에 보존합니다." : "Search Openverse/Pexels/Pixabay through one contract while preserving provenance and license state."} />
          <div className="mt-4 grid gap-2 sm:grid-cols-[9rem_1fr_auto]">
            <select className={INPUT} value={referenceProvider} onChange={(event) => setReferenceProvider(event.target.value as CreatorIntelligenceReferenceProvider)} aria-label="reference provider">
              <option value="openverse">Openverse</option><option value="pexels">Pexels</option><option value="pixabay">Pixabay</option>
            </select>
            <input className={INPUT} value={referenceQuery} onChange={(event) => setReferenceQuery(event.target.value)} placeholder={locale === "ko" ? "복식, 배경, 소품…" : "Costume, background, prop…"} />
            <button type="button" className={PRIMARY} disabled={busy === "references" || referenceQuery.trim().length < 2} onClick={searchReferences}>{busy === "references" ? <Loader2 className="size-4 animate-spin" /> : <Search size={15} />} {locale === "ko" ? "검색" : "Search"}</button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[9rem_1fr]">
            <select className={INPUT} value={referenceScope} onChange={(event) => setReferenceScope(event.target.value as "project" | "episode" | "scene")} aria-label="reference scope">
              <option value="project">Project</option><option value="episode">Episode</option><option value="scene">Scene</option>
            </select>
            {referenceScope === "project" ? <div className="flex min-h-10 items-center rounded-xl border border-line bg-canvas px-3 text-xs text-fg-3">{projectId}</div> : <input className={INPUT} value={referenceScopeId} onChange={(event) => setReferenceScopeId(event.target.value)} placeholder={referenceScope === "episode" ? "episode-id" : "scene-id"} aria-label="reference scope id" />}
          </div>
          <div className="mt-4 space-y-2">
            {referenceResults.slice(0, 8).map((item) => {
              const targetId = referenceScope === "project" ? projectId : referenceScopeId.trim();
              const saved = projectStore.references.some((candidate) => candidate.id === item.id && candidate.target.kind === referenceScope && candidate.target.id === targetId);
              return (
                <article key={item.id} className="rounded-2xl border border-line bg-canvas p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-bold text-fg">{item.title}</p><p className="mt-1 text-xs text-fg-3">{item.creator || item.provider} · {item.license || "license verify"}</p></div>
                    <button type="button" className={BUTTON} disabled={saved} onClick={() => saveReference(item)}>{saved ? <CheckCircle2 size={15} /> : <BookOpenCheck size={15} />} {saved ? (locale === "ko" ? "저장됨" : "Saved") : (locale === "ko" ? "보관" : "Save")}</button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs"><a className="text-accent underline" href={item.sourceUrl} target="_blank" rel="noreferrer">source</a>{item.licenseUrl ? <a className="text-accent underline" href={item.licenseUrl} target="_blank" rel="noreferrer">license</a> : null}<span className="text-fg-3">{item.rightsStatus}</span></div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="scene-reference" className={CARD}>
          <ToolHeader icon={CloudSun} title="Scene Reference" detail={locale === "ko" ? "운영자가 계약한 지오코딩/기상 엔드포인트가 있을 때만 장소와 과거 날씨를 장면 카드로 만듭니다." : "Build scene cards from geocoding and historical weather only when contracted endpoints are configured."} />
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
            <input className={INPUT} value={scenePlace} onChange={(event) => setScenePlace(event.target.value)} placeholder={locale === "ko" ? "예: 서울 종로" : "e.g. Jongno, Seoul"} />
            <input className={INPUT} type="date" value={sceneDate} onChange={(event) => setSceneDate(event.target.value)} />
            <button type="button" className={PRIMARY} disabled={busy === "scene" || scenePlace.trim().length < 2} onClick={searchScene}>{busy === "scene" ? <Loader2 className="size-4 animate-spin" /> : <CloudSun size={15} />} {locale === "ko" ? "장면 카드" : "Build"}</button>
          </div>
          {sceneResult?.status === "ready" && sceneResult.location && sceneResult.weather ? (
            <div className="mt-4 rounded-2xl border border-line bg-canvas p-4 text-sm text-fg-2">
              <p className="font-bold text-fg">{sceneResult.location.label}</p>
              <p className="mt-2">{sceneResult.date} · {sceneResult.weather.temperatureMinC ?? "?"}–{sceneResult.weather.temperatureMaxC ?? "?"}℃ · {locale === "ko" ? "강수" : "precip"} {sceneResult.weather.precipitationMm ?? "?"}mm</p>
              <p className="mt-1">{locale === "ko" ? "일출" : "sunrise"} {sceneResult.weather.sunrise || "?"} · {locale === "ko" ? "일몰" : "sunset"} {sceneResult.weather.sunset || "?"}</p>
              <button type="button" className={`${BUTTON} mt-3`} onClick={() => { const saved = createSavedSceneReference(sceneResult); if (saved) persist({ scenes: [saved, ...projectStore.scenes] }); }}><BookOpenCheck size={15} /> {locale === "ko" ? "프로젝트에 저장" : "Save to project"}</button>
            </div>
          ) : null}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className={CARD}>
          <ToolHeader icon={Languages} title="Localization Provider Bridge" detail={locale === "ko" ? "기존 번역 메모리·용어집·말풍선 fitting 위에 DeepL 또는 자체 LibreTranslate 엔드포인트를 선택적으로 연결합니다." : "Optionally bridge DeepL or a self-hosted LibreTranslate endpoint into the existing translation-memory and balloon-fit workflow."} />
          <div className="mt-4 grid gap-2 sm:grid-cols-[10rem_7rem_1fr]">
            <select className={INPUT} value={translationProvider} onChange={(event) => setTranslationProvider(event.target.value as CreatorIntelligenceTranslationProvider)}><option value="deepl">DeepL</option><option value="libretranslate">LibreTranslate</option></select>
            <input className={INPUT} value={translationTarget} onChange={(event) => setTranslationTarget(event.target.value.toUpperCase())} placeholder="EN" aria-label="target language" />
            <button type="button" className={PRIMARY} disabled={busy === "translation" || translationText.trim().length < 2} onClick={translate}>{busy === "translation" ? <Loader2 className="size-4 animate-spin" /> : <Languages size={15} />} {locale === "ko" ? "번역" : "Translate"}</button>
          </div>
          <textarea className={`${INPUT} mt-2 min-h-28 resize-y`} value={translationText} onChange={(event) => setTranslationText(event.target.value)} placeholder={locale === "ko" ? "번역할 대사를 입력하세요." : "Enter dialogue to translate."} />
          {translatedText ? <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-line bg-canvas p-4 text-sm leading-6 text-fg">{translatedText}</div> : null}
          <Link className={`${BUTTON} mt-3`} to={studioProjectSectionHref(projectId, "story", "localization")}><Braces size={15} /> {locale === "ko" ? "현지화 스튜디오에서 다듬기" : "Refine in Localization Studio"}</Link>
        </section>

        <section id="anilist-reference" className={CARD}>
          <ToolHeader icon={BookOpenCheck} title="AniList Metadata Explorer" detail={locale === "ko" ? "운영자가 상업/API 조건을 확인해 활성화한 경우에만 작품 메타데이터를 레퍼런스로 탐색합니다. 이미지 재사용 권한으로 간주하지 않습니다." : "Explore work metadata only after the operator confirms API/commercial terms. Results never imply artwork reuse permission."} />
          <div className="mt-4 grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
            <select className={INPUT} value={aniType} onChange={(event) => setAniType(event.target.value as "MANGA" | "ANIME")}><option value="MANGA">Manga</option><option value="ANIME">Anime</option></select>
            <input className={INPUT} value={aniQuery} onChange={(event) => setAniQuery(event.target.value)} placeholder={locale === "ko" ? "작품명 탐색" : "Search title"} />
            <button type="button" className={PRIMARY} disabled={busy === "anilist" || aniQuery.trim().length < 2} onClick={searchAniList}>{busy === "anilist" ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch size={15} />} {locale === "ko" ? "탐색" : "Explore"}</button>
          </div>
          <div className="mt-4 space-y-2">            {aniResults.slice(0, 8).map((item) => {
              const saved = projectStore.catalog.some((candidate) => candidate.id === item.id);
              return (
                <article key={item.id} className="rounded-2xl border border-line bg-canvas p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-bold text-fg">{item.title}</p><p className="mt-1 text-xs text-fg-3">{item.format || item.type} · {item.year ?? "?"} · {item.genres.slice(0, 3).join(" / ")}</p></div>
                    <button type="button" className={BUTTON} disabled={saved} onClick={() => persist({ catalog: [item, ...projectStore.catalog] })}>{saved ? <CheckCircle2 size={15} /> : <BookOpenCheck size={15} />} {saved ? (locale === "ko" ? "저장됨" : "Saved") : (locale === "ko" ? "메타데이터 저장" : "Save metadata")}</button>
                  </div>
                  <a className="mt-2 inline-block text-xs text-accent underline" href={item.sourceUrl} target="_blank" rel="noreferrer">AniList source</a>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section id="sound-fx" className={CARD}>
          <ToolHeader icon={AudioLines} title="Sound FX Lab" detail={locale === "ko" ? "Freesound는 항목별 라이선스를 보존해 검색하고, ElevenLabs는 운영자가 유료 생성을 명시 활성화한 경우에만 효과음을 만듭니다." : "Freesound keeps per-item license metadata; ElevenLabs generation only runs after explicit paid-provider enablement."} />
          <div className="mt-4 flex gap-2"><input className={INPUT} value={soundQuery} onChange={(event) => setSoundQuery(event.target.value)} placeholder={locale === "ko" ? "예: metal door slam" : "e.g. metal door slam"} /><button type="button" className={PRIMARY} disabled={busy === "sound-search" || soundQuery.trim().length < 2} onClick={searchSounds}>{busy === "sound-search" ? <Loader2 className="size-4 animate-spin" /> : <Search size={15} />} {locale === "ko" ? "검색" : "Search"}</button></div>
          <div className="mt-3 space-y-2">            {soundResults.slice(0, 6).map((item) => {
              const saved = projectStore.sounds.some((candidate) => candidate.id === item.id);
              return (
                <article key={item.id} className="rounded-2xl border border-line bg-canvas p-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-fg">{item.title}</p><p className="mt-1 text-xs text-fg-3">{item.creator} · {item.durationSeconds?.toFixed(1) ?? "?"}s</p></div><button type="button" className={BUTTON} disabled={saved} onClick={() => persist({ sounds: [item, ...projectStore.sounds] })}>{saved ? <CheckCircle2 size={15} /> : <BookOpenCheck size={15} />} {saved ? (locale === "ko" ? "저장됨" : "Saved") : (locale === "ko" ? "보관" : "Save")}</button></div>
                  <div className="mt-2 flex items-center gap-3">{item.previewUrl ? <audio controls preload="none" className="h-8 max-w-full" src={item.previewUrl}><track kind="captions" src={EMPTY_SOUND_CAPTIONS} srcLang="zxx" label="No speech" /></audio> : null}<a className="text-xs text-accent underline" href={item.sourceUrl} target="_blank" rel="noreferrer">source/license</a></div>
                </article>
              );
            })}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-fg-3">Generate · paid provider</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_6rem_auto]"><input className={INPUT} value={soundPrompt} onChange={(event) => setSoundPrompt(event.target.value)} placeholder={locale === "ko" ? "철문이 창고에서 세게 닫히는 소리" : "Heavy metal warehouse door slam"} /><input className={INPUT} type="number" min={0.5} max={15} step={0.5} value={soundDuration} onChange={(event) => setSoundDuration(Number(event.target.value))} /><button type="button" className={PRIMARY} disabled={busy === "sound-generate" || soundPrompt.trim().length < 2} onClick={generateSound}>{busy === "sound-generate" ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles size={15} />} {locale === "ko" ? "생성" : "Generate"}</button></div>
            {generatedAudio ? <div className="mt-3 flex flex-wrap items-center gap-3"><audio controls src={generatedAudio}><track kind="captions" src={EMPTY_SOUND_CAPTIONS} srcLang="zxx" label="No speech" /></audio><a className={BUTTON} download="toonspectrum-sfx.mp3" href={generatedAudio}>{locale === "ko" ? "음원 저장" : "Download"}</a></div> : null}
          </div>
        </section>        <section className={`${CARD} space-y-5`}>
          <div>
            <ToolHeader icon={Box} title="2D → 3D Provider Bridge" detail={locale === "ko" ? "로컬 이미지는 기존 기기 내 Lift3D가 기본입니다. 공개 HTTPS 레퍼런스만 명시적으로 Meshy 작업으로 보낼 수 있습니다." : "Local images default to on-device Lift3D. Only an explicit public HTTPS reference can be sent to Meshy."} />
            <div className="mt-4 flex gap-2"><input className={INPUT} value={meshImageUrl} onChange={(event) => setMeshImageUrl(event.target.value)} placeholder="https://…" /><button type="button" className={PRIMARY} disabled={busy === "mesh-create" || !meshImageUrl.startsWith("https://")} onClick={createMesh}>{busy === "mesh-create" ? <Loader2 className="size-4 animate-spin" /> : <Box size={15} />} Meshy</button></div>
            <Link className={`${BUTTON} mt-2`} to="/studio/lift3d">{locale === "ko" ? "기기 내 Lift3D 열기" : "Open on-device Lift3D"}</Link>
            {meshJob?.jobId ? (
              <div className="mt-3 rounded-2xl border border-line bg-canvas p-3 text-sm text-fg-2">
                <p className="font-bold text-fg">Job {meshJob.jobId}</p><p className="mt-1">{meshJob.jobStatus || "created"} · {meshJob.progress ?? 0}%</p>
                <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={BUTTON} disabled={busy === "mesh-status"} onClick={refreshMesh}>{locale === "ko" ? "상태 새로고침" : "Refresh"}</button><button type="button" className={BUTTON} onClick={() => persist({ meshJobs: [{ jobId: meshJob.jobId ?? "", imageUrl: meshImageUrl, jobStatus: meshJob.jobStatus ?? "created", progress: meshJob.progress ?? null, glbUrl: meshJob.glbUrl ?? "", thumbnailUrl: meshJob.thumbnailUrl ?? "", savedAt: new Date().toISOString() }, ...projectStore.meshJobs] })}>{locale === "ko" ? "작업 기록 저장" : "Save job record"}</button>{meshJob.glbUrl ? <a className={BUTTON} href={meshJob.glbUrl} target="_blank" rel="noreferrer">GLB</a> : null}</div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-line pt-5">
            <ToolHeader icon={ShieldCheck} title="Optional SafeSearch" detail={locale === "ko" ? "기본 Publish Preflight는 로컬 검사입니다. 사용자가 파일을 선택한 경우에만 2MB 이하 이미지를 외부 SafeSearch로 보내며 결과는 차단이 아니라 사람 검토 플래그입니다." : "Publish Preflight stays local by default. Only a user-selected image up to 2MB is sent to optional SafeSearch, and results are human-review flags rather than automatic blocks."} />
            <input className={`${INPUT} mt-4`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy === "safe-search"} onChange={(event) => runSafeSearch(event.target.files?.[0] ?? null)} />
            {busy === "safe-search" ? <p className="mt-2 inline-flex items-center gap-2 text-sm text-fg-3"><Loader2 className="size-4 animate-spin" /> checking…</p> : null}
            {safeSearchResult?.status === "ready" && safeSearchResult.values ? <div className="mt-3 rounded-2xl border border-line bg-canvas p-3 text-sm"><p className="font-bold text-fg">{safeSearchResult.reviewRequired ? (locale === "ko" ? "사람 검토 권장" : "Human review recommended") : (locale === "ko" ? "외부 플래그 없음" : "No external review flag")}</p><p className="mt-1 text-fg-3">adult {safeSearchResult.values.adult} · violence {safeSearchResult.values.violence} · racy {safeSearchResult.values.racy}</p></div> : null}
          </div>
        </section>
      </div>

      <div className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
        <div><p className="font-bold text-fg">{locale === "ko" ? "기존 제작 엔진 연결 완료" : "Existing production engines remain connected"}</p><p className="mt-1 text-sm text-fg-2">Pose · Continuity · Lettering · Localization QA · CRDT Review · Lift3D · Preflight · Timeline/Relations · Motion Comic</p></div>
        <div className="flex flex-wrap gap-2"><Link className={BUTTON} to={`/studio/work/${encodeURIComponent(projectId)}/canvas`}><Sparkles size={15} /> Canvas</Link><Link className={BUTTON} to={studioProjectSectionHref(projectId, "review", "comments")}><UsersRound size={15} /> Review</Link><Link className={BUTTON} to={studioProjectSectionHref(projectId, "export", "preflight")}><ShieldCheck size={15} /> Preflight</Link></div>
      </div>
    </section>
  );
}
