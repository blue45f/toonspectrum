import { useCallback, useEffect, useRef, useState } from "react";

import { getApiErrorMessage } from "@/platform/api";

import {
  cancelInferenceJob,
  createInferenceJob,
  getInferenceJob,
  inferenceArtifact,
  inferenceStatus,
  isInferenceTerminal,
  listInferenceJobs,
  type InferenceJob,
  type InferenceRequest,
  type InferenceStatus,
} from "./media-inference-client";

const FIRST_POLL_DELAY_MS = 2_000;
const BASE_POLL_DELAY_MS = 3_000;
const MAX_POLL_DELAY_MS = 15_000;
const POLL_GIVE_UP_MS = 30 * 60 * 1_000;

export type MediaServerProbe =
  | { readonly phase: "checking" }
  | { readonly phase: "ready"; readonly status: InferenceStatus }
  | { readonly phase: "failed"; readonly detail: string };

export interface GeneratedResult {
  readonly url: string;
  readonly blob: Blob;
  readonly job: InferenceJob;
}

/** 화면이 언어별 문구로 바꾸는 오류 종류. detail은 서버가 준 설명이 있을 때만 채운다. */
export type MediaInferenceErrorKind =
  | "poll-stopped"
  | "poll-delayed"
  | "submit"
  | "result"
  | "history"
  | "cancel";

export interface MediaInferenceError {
  readonly kind: MediaInferenceErrorKind;
  readonly detail: string;
}

async function errorDetail(cause: unknown): Promise<string> {
  return getApiErrorMessage(cause, "");
}

async function requestFingerprint(input: InferenceRequest): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * ToonStudio 추론 서버의 상태 확인·작업 접수·상태 추적·결과 수신을 한곳에서 관리한다.
 * 같은 입력을 다시 제출하면 같은 Idempotency-Key를 재사용하고, 실패를 자동 재생성으로 덮지 않는다.
 */
export function useMediaInference() {
  const [probe, setProbe] = useState<MediaServerProbe>({ phase: "checking" });
  const [probeAttempt, setProbeAttempt] = useState(0);
  const [job, setJob] = useState<InferenceJob | null>(null);
  const [history, setHistory] = useState<readonly InferenceJob[] | null>(null);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MediaInferenceError | null>(null);
  const lifetime = useRef(new AbortController());
  const operation = useRef<{ fingerprint: string; key: string } | null>(null);
  const objectUrls = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const urls = objectUrls.current;
    return () => {
      controller.abort();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setProbe({ phase: "checking" });
    inferenceStatus(controller.signal)
      .then((status) => {
        if (!controller.signal.aborted) setProbe({ phase: "ready", status });
      })
      .catch(async (cause: unknown) => {
        if (controller.signal.aborted) return;
        const detail = await errorDetail(cause);
        if (!controller.signal.aborted) setProbe({ phase: "failed", detail });
      });
    return () => controller.abort();
  }, [probeAttempt]);

  const jobId = job?.id;
  const jobState = job?.state;
  useEffect(() => {
    if (!jobId || !jobState || isInferenceTerminal(jobState)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const started = Date.now();
    const poll = async () => {
      if (controller.signal.aborted) return;
      if (Date.now() - started > POLL_GIVE_UP_MS) {
        setError({ kind: "poll-stopped", detail: "" });
        return;
      }
      try {
        const current = await getInferenceJob(jobId, controller.signal);
        if (controller.signal.aborted) return;
        setJob(current);
        failures = 0;
        if (isInferenceTerminal(current.state)) return;
      } catch (cause) {
        if (controller.signal.aborted) return;
        failures += 1;
        setError({ kind: "poll-delayed", detail: await errorDetail(cause) });
      }
      timer = setTimeout(() => void poll(), Math.min(MAX_POLL_DELAY_MS, BASE_POLL_DELAY_MS * 2 ** Math.min(3, failures)));
    };
    timer = setTimeout(() => void poll(), FIRST_POLL_DELAY_MS);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [jobId, jobState]);

  const replaceResult = useCallback((next: GeneratedResult | null) => {
    setResult((previous) => {
      if (previous && previous.url !== next?.url) {
        URL.revokeObjectURL(previous.url);
        objectUrls.current.delete(previous.url);
      }
      return next;
    });
  }, []);

  const submit = useCallback(async (input: InferenceRequest) => {
    setError(null);
    setBusy(true);
    try {
      const fingerprint = await requestFingerprint(input);
      if (operation.current?.fingerprint !== fingerprint) {
        operation.current = { fingerprint, key: crypto.randomUUID() };
      }
      const created = await createInferenceJob(input, operation.current.key, lifetime.current.signal);
      setJob(created);
      replaceResult(null);
    } catch (cause) {
      if (!lifetime.current.signal.aborted) setError({ kind: "submit", detail: await errorDetail(cause) });
    } finally {
      setBusy(false);
    }
  }, [replaceResult]);

  const cancel = useCallback(async () => {
    if (!job) return;
    try {
      setJob(await cancelInferenceJob(job.id));
    } catch (cause) {
      setError({ kind: "cancel", detail: await errorDetail(cause) });
    }
  }, [job]);

  const loadResult = useCallback(async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await inferenceArtifact(job, lifetime.current.signal);
      const url = URL.createObjectURL(blob);
      objectUrls.current.add(url);
      replaceResult({ url, blob, job });
    } catch (cause) {
      if (!lifetime.current.signal.aborted) setError({ kind: "result", detail: await errorDetail(cause) });
    } finally {
      setBusy(false);
    }
  }, [job, replaceResult]);

  const loadHistory = useCallback(async () => {
    setError(null);
    try {
      setHistory(await listInferenceJobs(lifetime.current.signal));
    } catch (cause) {
      if (!lifetime.current.signal.aborted) setError({ kind: "history", detail: await errorDetail(cause) });
    }
  }, []);

  const selectJob = useCallback((next: InferenceJob) => {
    setJob(next);
    replaceResult(null);
  }, [replaceResult]);

  const retryStatus = useCallback(() => setProbeAttempt((value) => value + 1), []);

  return {
    probe,
    retryStatus,
    job,
    selectJob,
    history,
    loadHistory,
    result,
    clearResult: () => replaceResult(null),
    busy,
    error,
    clearError: () => setError(null),
    submit,
    cancel,
    loadResult,
  };
}
