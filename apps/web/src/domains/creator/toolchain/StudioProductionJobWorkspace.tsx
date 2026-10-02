import {
  Check,
  CircleX,
  Download,
  FileUp,
  LoaderCircle,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  createStudioProductionJob,
  mergeStudioProductionJobSnapshot,
  retainStudioProductionJobs,
  type StudioProductionJob,
} from "./studio-production-jobs";
import { openStudioProductionJobRepository } from "./studio-production-job-repository";
import { StudioProductionOptionFields } from "./StudioProductionOptionFields";
import {
  defaultStudioProductionOperationOptions,
  mergeStudioProductionOperationOptions,
  studioProductionOperationOptions,
  type StudioProductionOptionValue,
} from "./studio-production-operation-options";
import {
  admitStudioProductionTool,
  isStudioProductionOperationExecutable,
  STUDIO_PRODUCTION_TOOLS,
  type StudioToolchainProfileId,
} from "./studio-production-toolchain";

import type { StudioToonBridgeConnectionState } from "./useStudioToonBridgeConnection";

const STATUS_LABELS: Readonly<Record<StudioProductionJob["status"], { readonly ko: string; readonly en: string }>> = {
  draft: { ko: "준비 전", en: "Draft" },
  preparing: { ko: "파일 준비", en: "Preparing files" },
  queued: { ko: "실행 대기", en: "Queued" },
  running: { ko: "처리 중", en: "Running" },
  completed: { ko: "완료", en: "Completed" },
  failed: { ko: "실패", en: "Failed" },
  cancelled: { ko: "취소됨", en: "Cancelled" },
};

const ACTIVE_STATUSES: ReadonlySet<StudioProductionJob["status"]> = new Set(["preparing", "queued", "running"]);

type PersistenceState = "loading" | "durable" | "memory";
type JobFilter = "all" | "active" | "completed" | "stopped";

function matchesJobFilter(job: StudioProductionJob, filter: JobFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return ACTIVE_STATUSES.has(job.status) || job.status === "draft";
  if (filter === "completed") return job.status === "completed";
  return job.status === "failed" || job.status === "cancelled";
}

function statusTone(status: StudioProductionJob["status"]): string {
  if (status === "completed") return "border border-good/40 bg-good/15 text-fg";
  if (status === "failed") return "border border-bad/40 bg-bad/12 text-fg";
  if (status === "cancelled") return "bg-raised text-fg-3";
  if (status === "running") return "border border-cool/40 bg-cool/15 text-fg";
  return "border border-warn/40 bg-warn/15 text-fg";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fileDescriptors(files: readonly File[]) {
  return files.map((file, index) => ({
    id: `input_${index + 1}`,
    name: file.name,
    mime: file.type || "application/octet-stream",
    bytes: file.size,
    sha256: null,
    uploaded: false,
  }));
}

function mergeJobList(
  jobs: readonly StudioProductionJob[],
  incoming: StudioProductionJob,
): readonly StudioProductionJob[] {
  const previous = jobs.find((job) => job.id === incoming.id);
  const next = previous
    ? jobs.map((job) => job.id === incoming.id
      ? mergeStudioProductionJobSnapshot(job, incoming)
      : job)
    : [incoming, ...jobs];
  return retainStudioProductionJobs(next);
}

export interface StudioProductionJobWorkspaceProps {
  readonly projectId?: string | null;
  readonly profile: StudioToolchainProfileId;
  readonly connection: StudioToonBridgeConnectionState;
  readonly compact?: boolean;
}

export function StudioProductionJobWorkspace({
  projectId = null,
  profile,
  connection,
  compact = false,
}: StudioProductionJobWorkspaceProps) {
  const bt = useBilingual("StudioProductionJobWorkspace");
  const repository = useMemo(() => openStudioProductionJobRepository(), []);
  const [filter, setFilter] = useState<JobFilter>("all");
  const [jobs, setJobs] = useState<readonly StudioProductionJob[]>([]);
  const jobsRef = useRef<readonly StudioProductionJob[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [persistence, setPersistence] = useState<PersistenceState>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [files, setFiles] = useState<readonly File[]>([]);
  const [toolId, setToolId] = useState("");
  const [operationId, setOperationId] = useState("");
  const [optionsText, setOptionsText] = useState("{}");
  const [optionValues, setOptionValues] = useState<Readonly<Record<string, StudioProductionOptionValue>>>({});
  const [submitting, setSubmitting] = useState(false);

  const probeByTool = useMemo(
    () => new Map(connection.probes.map((probe) => [probe.toolId, probe])),
    [connection.probes],
  );
  const runnableTools = useMemo(() => STUDIO_PRODUCTION_TOOLS.filter((tool) => {
    const admission = admitStudioProductionTool(tool, profile);
    const probe = probeByTool.get(tool.id);
    return admission.allowed
      && probe?.state === "available"
      && probe.executable
      && tool.operations.some((operation) =>
        isStudioProductionOperationExecutable(tool.id, operation.id)
      );
  }), [probeByTool, profile]);

  const selectedTool = runnableTools.find((tool) => tool.id === toolId) ?? runnableTools[0] ?? null;
  const runnableOperations = selectedTool?.operations.filter((operation) =>
    isStudioProductionOperationExecutable(selectedTool.id, operation.id)
  ) ?? [];
  const selectedOperation = runnableOperations.find((operation) => operation.id === operationId)
    ?? runnableOperations[0]
    ?? null;
  const optionDescriptors = selectedTool && selectedOperation
    ? studioProductionOperationOptions(selectedTool.id, selectedOperation.id)
    : Object.freeze([]);

  useEffect(() => {
    if (!selectedTool) {
      setToolId("");
      setOperationId("");
      return;
    }
    if (toolId !== selectedTool.id) setToolId(selectedTool.id);
    if (selectedOperation && operationId !== selectedOperation.id) {
      setOperationId(selectedOperation.id);
    }
  }, [operationId, selectedOperation, selectedTool, toolId]);

  useEffect(() => {
    if (!selectedTool || !selectedOperation) {
      setOptionValues({});
      return;
    }
    setOptionValues(defaultStudioProductionOperationOptions(
      selectedTool.id,
      selectedOperation.id,
    ));
    setOptionsText("{}");
  }, [selectedOperation, selectedTool]);

  useEffect(() => {
    let cancelled = false;
    jobsRef.current = Object.freeze([]);
    setJobs(Object.freeze([]));
    setPersistence("loading");
    void repository.load(projectId).then((loaded) => {
      if (cancelled) return;
      jobsRef.current = loaded;
      setJobs(loaded);
      setPersistence("durable");
    }).catch((cause) => {
      if (cancelled) return;
      setPersistence("memory");
      setNotice(`SQLite/OPFS 작업 이력을 열지 못해 이 탭에만 보관합니다: ${cause instanceof Error ? cause.message : String(cause)}`);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, repository]);

  const commitJobs = useCallback(async (
    next: readonly StudioProductionJob[],
  ): Promise<void> => {
    const retained = retainStudioProductionJobs(next);
    jobsRef.current = retained;
    setJobs(retained);
    if (persistence === "memory") return;
    const saveAttempt = saveQueueRef.current.then(() =>
      repository.save(retained, projectId)
    );
    saveQueueRef.current = saveAttempt.catch(() => undefined);
    try {
      await saveAttempt;
      setPersistence("durable");
    } catch (cause) {
      setPersistence("memory");
      setNotice(`작업 이력을 영구 저장하지 못해 이 탭에만 유지합니다: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }, [persistence, projectId, repository]);

  const applySnapshot = useCallback(async (
    snapshot: StudioProductionJob,
  ): Promise<void> => {
    await commitJobs(mergeJobList(jobsRef.current, snapshot));
  }, [commitJobs]);

  const refreshActiveJobs = useCallback(async (): Promise<void> => {
    if (!connection.client) return;
    const currentJobs = jobsRef.current;
    const active = currentJobs.filter((job) => ACTIVE_STATUSES.has(job.status));
    if (active.length === 0) return;
    const snapshots = await Promise.all(active.map(async (job) => {
      try {
        return await connection.client?.getJob(job.remoteId ?? job.id) ?? job;
      } catch {
        return job;
      }
    }));
    const latestJobs = jobsRef.current;
    let next = latestJobs;
    for (const snapshot of snapshots) next = mergeJobList(next, snapshot);
    if (JSON.stringify(next) !== JSON.stringify(latestJobs)) await commitJobs(next);
  }, [commitJobs, connection.client]);

  useEffect(() => {
    if (!connection.client || !jobs.some((job) => ACTIVE_STATUSES.has(job.status))) {
      return;
    }
    let disposed = false;
    const run = () => {
      if (!disposed) void refreshActiveJobs();
    };
    run();
    const interval = globalThis.setInterval(run, 1_500);
    return () => {
      disposed = true;
      globalThis.clearInterval(interval);
    };
  }, [connection.client, jobs, refreshActiveJobs]);

  const createJob = useCallback(async (): Promise<void> => {
    if (!connection.client || !selectedTool || !selectedOperation) {
      throw new Error("연결된 실행 가능한 도구를 선택하세요.");
    }
    if (files.length === 0) throw new Error("입력 파일을 하나 이상 선택하세요.");
    setSubmitting(true);
    setNotice(null);
    try {
      let parsedOptions: unknown;
      try {
        parsedOptions = JSON.parse(optionsText);
      } catch {
        throw new Error("작업 옵션 JSON을 확인하세요.");
      }
      if (
        typeof parsedOptions !== "object"
        || parsedOptions === null
        || Array.isArray(parsedOptions)
      ) {
        throw new Error("고급 옵션 JSON은 객체여야 합니다.");
      }
      const mergedOptions = mergeStudioProductionOperationOptions(
        selectedTool.id,
        selectedOperation.id,
        parsedOptions as Readonly<Record<string, unknown>>,
        optionValues,
      );
      const local = createStudioProductionJob({
        projectId,
        profile,
        toolId: selectedTool.id,
        operationId: selectedOperation.id,
        inputs: fileDescriptors(files),
        options: mergedOptions,
      });
      let remote = await connection.client.createJob(local);
      await commitJobs(mergeJobList(jobsRef.current, remote));
      for (const [index, file] of files.entries()) {
        const input = remote.inputs[index];
        if (!input) throw new Error("실행기가 입력 슬롯을 보존하지 않았습니다.");
        remote = await connection.client.uploadInput(
          remote.remoteId ?? remote.id,
          input,
          file,
        );
        await commitJobs(mergeJobList(jobsRef.current, remote));
      }
      remote = await connection.client.startJob(remote.remoteId ?? remote.id);
      await commitJobs(mergeJobList(jobsRef.current, remote));
      setFiles([]);
      setOptionsText("{}");
      setOptionValues(defaultStudioProductionOperationOptions(
        selectedTool.id,
        selectedOperation.id,
      ));
      setNotice(`${selectedTool.name} · ${selectedOperation.name} 작업을 시작했습니다.`);
    } finally {
      setSubmitting(false);
    }
  }, [
    commitJobs,
    connection.client,
    files,
    optionValues,
    optionsText,
    profile,
    projectId,
    selectedOperation,
    selectedTool,
  ]);

  const cancelJob = useCallback(async (job: StudioProductionJob): Promise<void> => {
    if (!connection.client) throw new Error("로컬 실행기에 연결되어 있지 않습니다.");
    const snapshot = await connection.client.cancelJob(job.remoteId ?? job.id);
    await applySnapshot(snapshot);
  }, [applySnapshot, connection.client]);

  const removeJob = useCallback(async (job: StudioProductionJob): Promise<void> => {
    const next = jobsRef.current.filter((entry) => entry.id !== job.id);
    await commitJobs(next);
  }, [commitJobs]);

  const downloadOutput = useCallback(async (
    job: StudioProductionJob,
    outputId: string,
    name: string,
  ): Promise<void> => {
    if (!connection.client) throw new Error("로컬 실행기에 연결되어 있지 않습니다.");
    const blob = await connection.client.downloadOutput(job.remoteId ?? job.id, outputId);
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = name;
    anchor.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(href), 30_000);
  }, [connection.client]);

  const visibleJobs = jobs.filter((job) => matchesJobFilter(job, filter));
  const filterCounts: Readonly<Record<JobFilter, number>> = {
    all: jobs.length,
    active: jobs.filter((job) => matchesJobFilter(job, "active")).length,
    completed: jobs.filter((job) => matchesJobFilter(job, "completed")).length,
    stopped: jobs.filter((job) => matchesJobFilter(job, "stopped")).length,
  };
  const readiness = [
    { done: connection.connected, ko: "실행기 연결", en: "Connect runner" },
    { done: Boolean(selectedTool && selectedOperation), ko: "도구·작업 선택", en: "Pick tool & task" },
    { done: files.length > 0, ko: "입력 파일 추가", en: "Add input files" },
    { done: false, ko: "작업 시작", en: "Start the job" },
  ];

  return (
    <section className="space-y-4" aria-labelledby="production-jobs-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-[0.15em] text-accent">
            Production jobs
          </p>
          <h2 id="production-jobs-title" className="mt-1 font-display text-xl font-bold text-fg sm:text-2xl">
            {bt("처리 중 작업", "Production jobs")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-3">
            {bt("원본은 브라우저가 선택한 로컬 실행기로만 전송됩니다. 실패한 외부 도구를 다른 품질의 결과로 자동 대체하지 않습니다.", "Sources go only to the local runner you chose. A failed tool is never silently replaced by a different-quality result.")}
          </p>
        </div>
        <span className={cn(
          "rounded-full px-3 py-1.5 text-xs font-bold",
          persistence === "durable"
            ? "border border-good/40 bg-good/15 text-fg"
            : persistence === "memory"
              ? "border border-warn/40 bg-warn/15 text-fg"
              : "bg-raised text-fg-3",
        )}>
          {persistence === "durable" ? bt("이 기기에 이력 저장", "History saved on this device") : persistence === "memory" ? bt("현재 탭 임시", "This tab only") : bt("이력 확인 중", "Checking history")}
        </span>
      </div>

      {notice ? (
        <p role="status" className="rounded-xl border border-line bg-card px-3 py-2 text-xs leading-5 text-fg-2">
          {notice}
        </p>
      ) : null}

      {!compact ? (
        <form
          aria-label={bt("새 제작 작업", "New production job")}
          className="rounded-2xl border border-line bg-panel/70 p-4 shadow-sm sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void createJob().catch((cause) => setNotice(cause instanceof Error ? cause.message : String(cause)));
          }}
        >
          <ol className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={bt("작업 준비 순서", "Job checklist")}>
            {readiness.map((step, index) => (
              <li
                key={step.en}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-bold",
                  step.done ? "border-good/40 bg-good/10 text-fg" : "border-line bg-card/70 text-fg-3",
                )}
              >
                <span aria-hidden="true" className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[0.7rem]", step.done ? "bg-good text-canvas" : "bg-raised")}>
                  {step.done ? <Check size={13} /> : index + 1}
                </span>
                {bt(step.ko, step.en)}
                <span className="sr-only">{step.done ? bt(" · 완료", " · done") : bt(" · 남음", " · to do")}</span>
              </li>
            ))}
          </ol>
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
              {bt("제작 도구", "Tool")}
              <select
                value={selectedTool?.id ?? ""}
                onChange={(event) => {
                  setToolId(event.currentTarget.value);
                  setOperationId("");
                }}
                disabled={!connection.connected || runnableTools.length === 0}
                className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent"
              >
                {runnableTools.length === 0 ? <option value="">{bt("설치된 실행 도구 없음", "No runnable tools installed")}</option> : null}
                {runnableTools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
              {bt("작업", "Task")}
              <select
                value={selectedOperation?.id ?? ""}
                onChange={(event) => setOperationId(event.currentTarget.value)}
                disabled={!selectedTool || runnableOperations.length === 0}
                className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent"
              >
                {runnableOperations.map((operation) => (
                  <option key={operation.id} value={operation.id}>{operation.name}</option>
                ))}
              </select>
            </label>
          </div>

          <StudioProductionOptionFields
            descriptors={optionDescriptors}
            values={optionValues}
            onChange={(key, value) => {
              setOptionValues((current) => ({ ...current, [key]: value }));
            }}
          />

          <div className="mt-3">
            <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
              {bt("입력 파일", "Input files")}
              <span className="relative flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-canvas px-4 py-3 text-center focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30 hover:border-accent/60">
                <FileUp size={22} className="text-accent" aria-hidden="true" />
                <span className="mt-2 text-sm font-bold text-fg">
                  {files.length > 0 ? bt(`${files.length}개 파일 선택됨`, `${files.length} files selected`) : bt("파일 선택", "Choose files")}
                </span>
                <span className="mt-1 text-xs text-fg-3">{bt("최대 16개 · 파일당 2GB", "Up to 16 files · 2 GB each")}</span>
                <input
                  type="file"
                  multiple
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []).slice(0, 16))}
                />
              </span>
            </label>
          </div>

          <details className="mt-3 rounded-xl border border-line bg-card/55 px-3 py-2">
            <summary className="flex min-h-11 cursor-pointer items-center text-xs font-bold text-fg-2">
              {bt("고급 옵션 JSON", "Advanced options (JSON)")}
            </summary>
            <p className="mt-2 text-xs leading-5 text-fg-3">
              {bt("일반 작업은 위 옵션만으로 충분합니다. 추가 어댑터 옵션이 필요할 때만 JSON 객체를 입력하세요. 같은 키는 위 화면 값이 우선합니다.", "The options above are enough for most jobs. Enter a JSON object only for extra adapter options; on-screen values win for the same key.")}
            </p>
            <textarea
              value={optionsText}
              onChange={(event) => setOptionsText(event.currentTarget.value)}
              spellCheck={false}
              rows={4}
              aria-label={bt("고급 옵션 JSON", "Advanced options (JSON)")}
              className="mt-2 min-h-24 w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent"
            />
          </details>

          {files.length > 0 ? (
            <ul className="mt-3 grid gap-1.5 text-xs text-fg-3 sm:grid-cols-2">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-raised/65 px-3 py-2">
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 tabular-nums">{formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-fg-3">
              {selectedTool
                ? `${selectedTool.license} · ${selectedTool.description}`
                : connection.connected
                  ? bt("설치된 실행 도구가 없습니다. 설치·라이선스 화면에서 설치 상태를 확인하세요.", "No runnable tools yet. Check installs on the Installs & licenses page.")
                  : bt("로컬 제작 실행기에 먼저 연결하세요.", "Connect the local runner first.")}
            </p>
            <button
              type="submit"
              disabled={submitting || !connection.connected || !selectedTool || !selectedOperation || files.length === 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              {submitting ? bt("작업 준비 중", "Preparing") : bt("작업 시작", "Start job")}
            </button>
          </div>
        </form>
      ) : null}

      {jobs.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={bt("작업 상태로 거르기", "Filter jobs by status")}>
          {([
            ["all", "전체", "All"],
            ["active", "진행 중", "In progress"],
            ["completed", "완료", "Completed"],
            ["stopped", "실패·취소", "Failed & cancelled"],
          ] as const).map(([value, ko, en]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-xs font-bold",
                filter === value ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:text-fg",
              )}
            >
              {bt(ko, en)}
              <span className="rounded-full bg-raised px-1.5 text-xs tabular-nums text-fg-3">{filterCounts[value]}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3">
        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-panel/40 px-5 py-10 text-center">
            <p className="text-sm font-bold text-fg">{bt("아직 제작 작업이 없습니다.", "No production jobs yet.")}</p>
            <p className="mt-1 text-xs leading-5 text-fg-3">{bt("OCR, 벡터화, 영상 변환, 3D 렌더, PDF 검사 결과가 여기에 모입니다.", "OCR, vectorizing, video conversion, 3D renders and PDF checks collect here.")}</p>
          </div>
        ) : visibleJobs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-panel/40 px-5 py-6 text-center text-sm text-fg-3">
            {bt("이 상태의 작업이 없습니다.", "No jobs with this status.")}
          </p>
        ) : visibleJobs.map((job) => {
          const tool = STUDIO_PRODUCTION_TOOLS.find((entry) => entry.id === job.toolId);
          const operation = tool?.operations.find((entry) => entry.id === job.operationId);
          const canCancel = ACTIVE_STATUSES.has(job.status);
          const status = STATUS_LABELS[job.status];
          return (
            <article key={job.id} className="rounded-2xl border border-line bg-card/75 p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-sm font-bold text-fg sm:text-base">
                      {tool?.name ?? job.toolId} · {operation?.name ?? job.operationId}
                    </h3>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", statusTone(job.status))}>
                      {bt(status.ko, status.en)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-fg-3">
                    {new Date(job.updatedAt).toLocaleString()} · {bt(`${job.inputs.length}개 입력 · ${job.outputs.length}개 결과`, `${job.inputs.length} inputs · ${job.outputs.length} outputs`)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canCancel ? (
                    <button
                      type="button"
                      onClick={() => void cancelJob(job).catch((cause) => setNotice(cause instanceof Error ? cause.message : String(cause)))}
                      disabled={!connection.connected}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-fg-3 hover:border-bad/40 hover:text-bad disabled:opacity-40"
                    >
                      <CircleX size={14} aria-hidden="true" /> {bt("취소", "Cancel")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void removeJob(job)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-fg-3 hover:text-fg"
                    >
                      <Trash2 size={14} aria-hidden="true" /> {bt("기록 지우기", "Remove record")}
                    </button>
                  )}
                </div>
              </div>

              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-raised"
                role="progressbar"
                aria-label={bt("작업 진행률", "Job progress")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(job.progress.value * 100)}
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${Math.round(job.progress.value * 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-fg-3">
                <span>{job.progress.phase || bt(status.ko, status.en)}</span>
                <span className="tabular-nums">{Math.round(job.progress.value * 100)}%</span>
              </div>

              {job.failure ? (
                <p role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-xs leading-5 text-fg">
                  {job.failure.message} {job.failure.retryable ? bt("다시 시도할 수 있습니다.", "You can try again.") : bt("자동 재시도하지 않습니다.", "No automatic retry.")}
                </p>
              ) : null}

              {job.outputs.length > 0 ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {job.outputs.map((output) => (
                    <button
                      key={output.id}
                      type="button"
                      onClick={() => void downloadOutput(job, output.id, output.name).catch((cause) => setNotice(cause instanceof Error ? cause.message : String(cause)))}
                      disabled={!connection.connected}
                      className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-panel px-3 text-left hover:border-accent/45 disabled:opacity-40"
                    >
                      <Download size={16} className="shrink-0 text-accent" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-xs text-fg">{output.name}</strong>
                        <span className="mt-0.5 block text-xs text-fg-3">{formatBytes(output.bytes)} · {bt("SHA-256 확인됨", "SHA-256 verified")}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {job.receipt ? (
                <details className="mt-4 rounded-xl border border-line bg-panel/60 px-3 py-2 text-xs text-fg-3">
                  <summary className="flex min-h-11 cursor-pointer items-center font-bold text-fg-2">{bt("실행·라이선스 영수증", "Run & license receipt")}</summary>
                  <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                    <dt>{bt("버전", "Version")}</dt><dd className="break-all">{job.receipt.toolVersion}</dd>
                    <dt>{bt("라이선스", "License")}</dt><dd>{job.receipt.license}</dd>
                    <dt>{bt("명령 영수증", "Command digest")}</dt><dd className="break-all font-mono">{job.receipt.commandDigest}</dd>
                    <dt>{bt("완료 시각", "Finished")}</dt><dd>{new Date(job.receipt.finishedAt).toLocaleString()}</dd>
                  </dl>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>

      {jobs.some((job) => ACTIVE_STATUSES.has(job.status)) ? (
        <button
          type="button"
          onClick={() => void refreshActiveJobs()}
          disabled={!connection.connected}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-xs font-bold text-fg-2 hover:border-line-strong hover:text-fg disabled:opacity-40"
        >
          <RotateCcw size={15} aria-hidden="true" /> {bt("상태 새로 고침", "Refresh status")}
        </button>
      ) : null}
    </section>
  );
}
