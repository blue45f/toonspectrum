import {
  BookOpenCheck,
  ChevronRight,
  Clapperboard,
  Cloud,
  CloudOff,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { requestStudioAiComicComposerOpen } from "../../ai/studio-ai-comic-composer-intent";
import { createStudioAiComicDirectorApiClient } from "../../ai/studio-ai-comic-director-api";
import {
  createStudioAiComicDirectorId,
  createStudioAiComicDirectorSession,
  loadStudioAiComicDirectorSession,
  reconcileStudioAiComicDirectorJobs,
  saveStudioAiComicDirectorSession,
  studioAiComicDirectorCandidateDigest,
  updateStudioAiComicDirectorSession,
  type StudioAiComicDirectorSessionDocument,
  type StudioAiVisualBibleEntry,
} from "../../ai/studio-ai-comic-director-session";
import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../../studio-panel-ui";

import type { StudioCompositionRouteResolution } from "../studio-route-manifest";

import { cn } from "@/shared/lib/utils";

interface StudioAiComicDirectorRouteProps {
  readonly resolution: StudioCompositionRouteResolution;
}

function routePath(
  resolution: StudioCompositionRouteResolution,
  sessionId: string,
): string {
  if (resolution.workId) {
    return `/studio/work/${encodeURIComponent(resolution.workId)}/compose/${encodeURIComponent(sessionId)}`;
  }
  if (resolution.remixSourceWorkId) {
    return `/studio/remix/${encodeURIComponent(resolution.remixSourceWorkId)}/compose/${encodeURIComponent(sessionId)}`;
  }
  return `/studio/compose/${encodeURIComponent(sessionId)}`;
}

function initialSession(
  resolution: StudioCompositionRouteResolution,
): StudioAiComicDirectorSessionDocument {
  if (typeof window !== "undefined" && resolution.sessionId !== "new") {
    const saved = loadStudioAiComicDirectorSession(
      window.localStorage,
      resolution.sessionId,
    );
    if (saved) {
      return {
        ...saved,
        jobs: reconcileStudioAiComicDirectorJobs(saved.jobs),
      };
    }
  }
  return createStudioAiComicDirectorSession({
    id: resolution.sessionId === "new" ? createStudioAiComicDirectorId() : resolution.sessionId,
    workId: resolution.workId,
    remixSourceWorkId: resolution.remixSourceWorkId,
    title: "새 AI 코믹 디렉터 세션",
  });
}

const BIBLE_KINDS: readonly {
  readonly id: StudioAiVisualBibleEntry["kind"];
  readonly label: string;
  readonly description: string;
}[] = [
  { id: "character", label: "캐릭터", description: "얼굴·체형·실루엣·식별 특징" },
  { id: "costume", label: "의상", description: "버전·색·재질·손상 상태" },
  { id: "location", label: "장소", description: "랜드마크·평면·카메라 앵커" },
  { id: "prop", label: "소품", description: "소유자·방향·상태 timeline" },
  { id: "style", label: "화풍", description: "선·팔레트·명암·질감" },
  { id: "lighting", label: "광원", description: "시간대·방향·색온도·대비" },
];

const STAGES = [
  ["brief", "01", "이야기·기준"],
  ["direction", "02", "컷 연출"],
  ["production", "03", "제작·수리"],
  ["finish", "04", "마감·추가"],
] as const;

export function StudioAiComicDirectorRoute({
  resolution,
}: StudioAiComicDirectorRouteProps): ReactElement {
  const navigate = useNavigate();
  const api = useMemo(() => createStudioAiComicDirectorApiClient(), []);
  const [session, setSession] = useState(() => initialSession(resolution));
  const [syncState, setSyncState] = useState<
    "local" | "loading" | "saved" | "conflict" | "error"
  >("local");
  const [message, setMessage] = useState<string | null>(null);
  const [newBibleName, setNewBibleName] = useState("");
  const [newBibleKind, setNewBibleKind] = useState<StudioAiVisualBibleEntry["kind"]>(
    "character",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    saveStudioAiComicDirectorSession(window.localStorage, session);
  }, [session]);

  useEffect(() => {
    let active = true;
    const synchronize = async () => {
      setSyncState("loading");
      if (resolution.sessionId === "new") {
        const created = await api.createSession(session);
        if (!active) return;
        if (created.ok) {
          setSession(created.data);
          setSyncState("saved");
        } else {
          setSyncState(created.code === "not_authenticated" ? "local" : "error");
          setMessage(created.message);
        }
        navigate(routePath(resolution, session.id), { replace: true });
        return;
      }

      const remote = await api.getSession(resolution.sessionId);
      if (!active) return;
      if (remote.ok) {
        setSession({
          ...remote.data,
          jobs: reconcileStudioAiComicDirectorJobs(remote.data.jobs),
        });
        setSyncState("saved");
        return;
      }
      if (remote.code === "not_found") {
        const created = await api.createSession(session);
        if (!active) return;
        if (created.ok) {
          setSession(created.data);
          setSyncState("saved");
        } else {
          setSyncState(created.code === "not_authenticated" ? "local" : "error");
          setMessage(created.message);
        }
        return;
      }
      setSyncState(remote.code === "not_authenticated" ? "local" : "error");
      setMessage(remote.message);
    };
    void synchronize();
    return () => {
      active = false;
    };
  }, [api, navigate, resolution, session.id]);

  const patchSession = (
    patch: Partial<
      Omit<StudioAiComicDirectorSessionDocument, "version" | "id" | "revision">
    >,
  ) => {
    setSession((current) => updateStudioAiComicDirectorSession(current, patch));
    setSyncState("local");
    setMessage(null);
  };

  const saveRemote = async () => {
    setSyncState("loading");
    const result = await api.updateSession(session, session.revision);
    if (result.ok) {
      setSession(result.data);
      setSyncState("saved");
      setMessage("클라우드 세션과 작품 기준을 저장했습니다.");
      return;
    }
    setSyncState(result.code === "conflict" ? "conflict" : result.code === "not_authenticated" ? "local" : "error");
    setMessage(result.message);
  };

  const reloadRemote = async () => {
    setSyncState("loading");
    const result = await api.getSession(session.id);
    if (result.ok) {
      setSession(result.data);
      setSyncState("saved");
      setMessage("최신 클라우드 revision을 불러왔습니다.");
    } else {
      setSyncState(result.code === "not_authenticated" ? "local" : "error");
      setMessage(result.message);
    }
  };

  const addBibleEntry = () => {
    const name = newBibleName.normalize("NFKC").trim();
    if (!name) return;
    const entry: StudioAiVisualBibleEntry = {
      id: createStudioAiComicDirectorId(),
      kind: newBibleKind,
      name,
      version: "v1",
      referenceAssetIds: [],
      constraints: [],
      rightsStatus: "review_required",
      canSendToExternalProvider: false,
    };
    patchSession({
      visualBible: {
        ...session.visualBible,
        revision: session.visualBible.revision + 1,
        entries: [...session.visualBible.entries, entry],
        updatedAt: new Date().toISOString(),
      },
    });
    setNewBibleName("");
  };

  const saveBibleRevision = async () => {
    setSyncState("loading");
    const result = await api.appendVisualBibleRevision(
      session.id,
      session.visualBible,
    );
    if (result.ok) {
      patchSession({ visualBible: result.data });
      setSyncState("saved");
      setMessage(`작품 바이블 revision ${result.data.revision}을 저장했습니다.`);
    } else {
      setSyncState(result.code === "not_authenticated" ? "local" : "error");
      setMessage(result.message);
    }
  };

  const continueInEditor = () => {
    requestStudioAiComicComposerOpen({
      version: 1,
      source: "episode-production-director",
      episodeTitle: session.title,
      storyText: session.storyText,
      characterDescription: session.characterDescription,
      variants: 2,
      modeLabel: "AI 코믹 디렉터 제작용",
      totalCuts: session.scenes.length,
      projectedOutputCount: session.scenes.length * 2,
      generationWorkUnits: session.scenes.length * 2,
      scenes: session.scenes.map((scene, index) => ({
        sourceSceneNumber: index + 1,
        sourceCutNumber: index + 1,
        beatType: scene.beatType,
        summary: scene.summary,
        imagePrompt: scene.imagePrompt,
        dialogue: scene.dialogue,
        continuity: scene.continuity,
      })),
    });
    navigate(resolution.editorHref);
  };

  const candidateDigest = studioAiComicDirectorCandidateDigest(session.scenes);
  const activeApproval =
    session.approval?.status === "active"
    && session.approval.sessionRevision === session.revision
    && session.approval.candidateDigest === candidateDigest;

  return (
    <main
      className="min-h-[calc(100dvh-4rem)] bg-canvas px-3 py-4 text-fg sm:px-5 lg:px-8"
      data-studio-ai-comic-director-route="true"
    >
      <div className="mx-auto max-w-[90rem]">
        <header className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-on-accent">
            <Clapperboard size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-accent">
              Production Workspace
            </p>
            <h1 className="truncate text-xl font-black tracking-tight">
              AI 코믹 디렉터
            </h1>
            <p className="text-xs text-fg-3">
              세션 {session.id} · revision {session.revision}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span
              role="status"
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[0.65rem] font-semibold",
                syncState === "saved"
                  ? "border-good/35 bg-good/10 text-good"
                  : syncState === "conflict"
                    ? "border-warn/35 bg-warn/10 text-warn"
                    : "border-line bg-card text-fg-3",
              )}
            >
              {syncState === "loading" ? (
                <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : syncState === "saved" ? (
                <Cloud size={12} aria-hidden />
              ) : (
                <CloudOff size={12} aria-hidden />
              )}
              {syncState === "saved"
                ? "클라우드 저장됨"
                : syncState === "loading"
                  ? "동기화 중"
                  : syncState === "conflict"
                    ? "revision 충돌"
                    : "로컬 자동 저장"}
            </span>
            {syncState === "conflict" ? (
              <button
                type="button"
                onClick={() => void reloadRemote()}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised",
                  STUDIO_FOCUS_RING,
                )}
              >
                <RefreshCw size={13} aria-hidden />
                최신 revision 불러오기
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void saveRemote()}
                className={cn(
                  "min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised",
                  STUDIO_FOCUS_RING,
                )}
              >
                클라우드 저장
              </button>
            )}
            <button
              type="button"
              onClick={continueInEditor}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              <Play size={13} aria-hidden />
              Studio에서 제작 계속
            </button>
          </div>
        </header>

        {message ? (
          <p
            role="status"
            className="mt-3 rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-2"
          >
            {message}
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label="AI 코믹 디렉터 제작 단계">
            <ol className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
              {STAGES.map(([id, number, label]) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={session.stage === id ? "step" : undefined}
                    onClick={() => patchSession({ stage: id })}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-2 rounded-xl border px-3 text-left",
                      STUDIO_TOUCH_TARGET,
                      STUDIO_FOCUS_RING,
                      session.stage === id
                        ? "border-accent/45 bg-accent-soft"
                        : "border-transparent text-fg-3 hover:bg-card hover:text-fg",
                    )}
                  >
                    <span className={cn("font-mono text-base font-black", session.stage === id ? "text-accent" : "text-fg-3")}>{number}</span>
                    <strong className="text-xs">{label}</strong>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <section className="min-w-0">
            {session.stage === "brief" ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
                <section className="rounded-2xl border border-line bg-panel p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <BookOpenCheck size={16} className="text-accent" aria-hidden />
                    <div>
                      <h2 className="text-sm font-bold">이야기와 제작 기준</h2>
                      <p className="text-[0.66rem] text-fg-3">
                        원문은 보존되고 Studio 편집기로 그대로 전달됩니다.
                      </p>
                    </div>
                  </div>
                  <label className="block text-xs font-semibold text-fg-2">
                    세션 제목
                    <input
                      type="text"
                      value={session.title}
                      onChange={(event) => patchSession({ title: event.target.value.slice(0, 160) })}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 outline-none focus:border-accent"
                    />
                  </label>
                  <label className="mt-3 block text-xs font-semibold text-fg-2">
                    이야기 또는 회차 대본
                    <textarea
                      value={session.storyText}
                      onChange={(event) => patchSession({ storyText: event.target.value.slice(0, 12_000) })}
                      rows={12}
                      className="mt-1 w-full resize-y rounded-xl border border-line bg-card px-3 py-2 leading-relaxed outline-none focus:border-accent"
                    />
                  </label>
                  <label className="mt-3 block text-xs font-semibold text-fg-2">
                    캐릭터·스타일 고정 설명
                    <textarea
                      value={session.characterDescription}
                      onChange={(event) => patchSession({ characterDescription: event.target.value.slice(0, 4_000) })}
                      rows={5}
                      className="mt-1 w-full resize-y rounded-xl border border-line bg-card px-3 py-2 outline-none focus:border-accent"
                    />
                  </label>
                </section>

                <aside className="rounded-2xl border border-line bg-panel p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-accent" aria-hidden />
                    <div>
                      <h2 className="text-sm font-bold">작품 바이블</h2>
                      <p className="text-[0.66rem] text-fg-3">
                        revision {session.visualBible.revision} · {session.visualBible.entries.length}개 기준
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {session.visualBible.entries.map((entry) => (
                      <article key={entry.id} className="rounded-xl border border-line bg-card p-2.5">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs">{entry.name}</strong>
                          <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[0.58rem] text-fg-3">
                            {BIBLE_KINDS.find((kind) => kind.id === entry.kind)?.label}
                          </span>
                        </div>
                        <p className="mt-1 text-[0.62rem] text-fg-3">
                          {entry.canSendToExternalProvider
                            ? "외부 생성 요청 허용"
                            : "외부 전송 확인 필요"}
                        </p>
                      </article>
                    ))}
                  </div>
                  <label className="mt-3 block text-[0.66rem] font-semibold text-fg-2">
                    기준 종류
                    <select
                      value={newBibleKind}
                      onChange={(event) => setNewBibleKind(event.target.value as StudioAiVisualBibleEntry["kind"])}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2"
                    >
                      {BIBLE_KINDS.map((kind) => (
                        <option key={kind.id} value={kind.id}>{kind.label} · {kind.description}</option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-2 block text-[0.66rem] font-semibold text-fg-2">
                    기준 이름
                    <input
                      type="text"
                      value={newBibleName}
                      onChange={(event) => setNewBibleName(event.target.value.slice(0, 120))}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={addBibleEntry}
                    disabled={!newBibleName.trim()}
                    className="mt-2 min-h-11 w-full rounded-lg border border-line bg-card text-xs font-semibold hover:bg-raised disabled:opacity-45"
                  >
                    작품 기준 추가
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveBibleRevision()}
                    className="mt-2 min-h-11 w-full rounded-lg bg-accent text-xs font-bold text-on-accent"
                  >
                    새 작품 바이블 revision 저장
                  </button>
                </aside>
              </div>
            ) : null}

            {session.stage === "direction" ? (
              <section className="rounded-2xl border border-line bg-panel p-4">
                <h2 className="text-sm font-bold">컷 연출 준비</h2>
                <p className="mt-1 text-xs text-fg-3">
                  현재 세션에는 {session.scenes.length}개 컷이 있습니다. Studio 편집기에서 체크박스 다중 선택, 비트·카메라·대사·연속성 기준을 조정할 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={continueInEditor}
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent"
                >
                  컷 연출 작업면 열기 <ChevronRight size={13} aria-hidden />
                </button>
              </section>
            ) : null}

            {session.stage === "production" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-2xl border border-line bg-panel p-4">
                  <div className="flex items-center gap-2"><Sparkles size={16} className="text-accent" aria-hidden /><h2 className="text-sm font-bold">제작 작업</h2></div>
                  <p className="mt-1 text-xs text-fg-3">생성·부분 수리·품질 분석·레이어 분리 작업은 operation ID와 lease를 가진 durable job으로 기록됩니다.</p>
                  <div className="mt-3 space-y-2">
                    {session.jobs.length ? session.jobs.map((job) => (
                      <article key={job.id} className="rounded-xl border border-line bg-card p-3">
                        <div className="flex items-center gap-2"><strong className="text-xs">{job.kind}</strong><span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[0.58rem]">{job.status}</span></div>
                        <p className="mt-1 text-[0.62rem] text-fg-3">{job.progressDone}/{job.progressTotal} · {job.operationId}</p>
                        {job.error ? <p className="mt-1 text-[0.62rem] text-bad">{job.error}</p> : null}
                      </article>
                    )) : <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3">아직 작업 기록이 없습니다.</p>}
                  </div>
                </section>
                <section className="rounded-2xl border border-line bg-panel p-4">
                  <div className="flex items-center gap-2"><Layers3 size={16} className="text-accent" aria-hidden /><h2 className="text-sm font-bold">후보·부분 수리·레이어</h2></div>
                  <p className="mt-1 text-xs text-fg-3">후보 {session.scenes.reduce((total, scene) => total + (scene.imageCandidates?.length ?? 0), 0)}개 · 편집 레이어 {session.scenes.reduce((total, scene) => total + (scene.layerManifest?.layers.length ?? 0), 0)}개</p>
                  <button type="button" onClick={continueInEditor} className="mt-4 min-h-11 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent">제작·수리 작업면 열기</button>
                </section>
              </div>
            ) : null}

            {session.stage === "finish" ? (
              <section className="rounded-2xl border border-line bg-panel p-4">
                <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-accent" aria-hidden /><h2 className="text-sm font-bold">검수 revision과 Studio 인계</h2></div>
                <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">세션 revision</dt><dd className="mt-1 font-bold">{session.revision}</dd></div>
                  <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">후보 digest</dt><dd className="mt-1 break-all font-mono font-bold">{candidateDigest}</dd></div>
                  <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">현재 승인</dt><dd className={cn("mt-1 font-bold", activeApproval ? "text-good" : "text-warn")}>{activeApproval ? "현재 revision 승인됨" : "검수 다시 필요"}</dd></div>
                  <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">적용 정책</dt><dd className="mt-1 font-bold">비파괴 추가 · 한 번의 Undo</dd></div>
                </dl>
                <button type="button" onClick={continueInEditor} className="mt-4 min-h-11 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent">Studio 마감·추가 열기</button>
              </section>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
