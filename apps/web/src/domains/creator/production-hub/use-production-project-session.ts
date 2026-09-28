import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { getAuthSessionRevision, listeners } from "@/domains/auth/public/session/auth-session-state";
import { getApiErrorMessage, httpStatus } from "@/platform/api";
import { executeProductionCommand, getProductionProject, type ProductionClientCommand, type ProductionProjectAccess, type ProductionProjectRecord } from "./production-api";

export type ProductionSaveState = "idle" | "saving" | "saved" | "error";
const subscribeToSession = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
const NO_ACCESS: ProductionProjectAccess = { view: false, comment: false, edit: false, manage: false, owner: false, role: null };
const DEMO_ACCESS: ProductionProjectAccess = { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" };
const STALE = "계정이나 프로젝트가 변경되어 요청을 중지했습니다. 현재 화면에서 다시 시도하세요.";
interface Snapshot {
  readonly scope: string;
  readonly record: ProductionProjectRecord | null;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly error: string | null;
  readonly notice: string | null;
  readonly saveState: ProductionSaveState;
}
interface DemoAdapter {
  readonly create: () => ProductionProjectAggregate;
  readonly reduce: (current: ProductionProjectAggregate, command: ProductionClientCommand) => ProductionProjectAggregate;
}
export function useProductionProjectSession(projectId: string | undefined, actorId: string | null, demo: DemoAdapter) {
  const isDemo = !projectId || projectId === "sample-project";
  const authRevision = useSyncExternalStore(subscribeToSession, getAuthSessionRevision, getAuthSessionRevision);
  const scope = JSON.stringify([projectId, actorId, authRevision]);
  const empty: Snapshot = { scope, record: null, loading: true, refreshing: false, error: null, notice: null, saveState: "idle" };
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const state = snapshot.scope === scope ? snapshot : empty;
  const authority = useRef<ProductionProjectRecord | null>(null);
  const authorityScope = useRef<string | null>(null);
  const generation = useRef(0), reads = useRef(0), pendingWrites = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const queueEpoch = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    const epoch = ++generation.current;
    authorityScope.current = scope;
    const current = () => generation.current === epoch && getAuthSessionRevision() === authRevision;
    authority.current = null; pendingWrites.current = 0; queueEpoch.current += 1; queue.current = Promise.resolve();
    if (isDemo) {
      const record = { aggregate: demo.create(), access: DEMO_ACCESS };
      authority.current = record;
      setSnapshot({ scope, record, loading: false, refreshing: false, error: null, notice: null, saveState: "idle" });
      return () => { generation.current += 1; authority.current = null; };
    }
    setSnapshot({ scope, record: null, loading: Boolean(actorId), refreshing: false,
      error: actorId ? null : "로그인 후 제작 프로젝트를 열어 주세요.", notice: null, saveState: "idle" });
    if (!actorId || !projectId) return () => { generation.current += 1; };
    const refresh = async () => {
      if (!current() || pendingWrites.current > 0) return;
      const sequence = ++reads.current;
      setSnapshot((value) => value.scope === scope ? { ...value, refreshing: true } : value);
      try {
        const record = await getProductionProject(projectId);
        if (!current() || sequence !== reads.current) return;
        if (record.aggregate.projectId !== projectId || !record.access.view) { authority.current = null; throw new Error("프로젝트 접근 정보를 확인하지 못했습니다."); }
        if (authority.current && record.aggregate.revision < authority.current.aggregate.revision) return;
        authority.current = record;
        setSnapshot((value) => ({ ...value, scope, record, loading: false, refreshing: false, error: null,
          saveState: value.saveState === "error" ? "idle" : value.saveState,
          notice: value.saveState === "error" ? "최신 상태를 불러왔습니다. 저장 실패했던 입력은 확인 후 다시 저장해 주세요." : value.notice }));
      } catch (cause) {
        const message = await getApiErrorMessage(cause, "최신 프로젝트를 불러오지 못했습니다. 다시 시도해 주세요.");
        if (!current() || sequence !== reads.current) return;
        if ([401, 403, 404].includes(httpStatus(cause) ?? 0)) authority.current = null;
        setSnapshot((value) => ({ ...value, scope, record: authority.current, loading: false,
          refreshing: false, error: authority.current ? null : message, notice: message, saveState: "error" }));
      } finally {
        if (current() && sequence === reads.current) setSnapshot((value) => ({ ...value, refreshing: false }));
      }
    };
    refreshRef.current = refresh;
    const onWake = () => { if (document.visibilityState !== "hidden" && navigator.onLine !== false) void refresh(); };
    window.addEventListener("online", onWake); window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    const timer = window.setInterval(onWake, 30_000);
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel.current = new BroadcastChannel("toonstudio-production-projects-v1");
        channel.current.onmessage = (event: MessageEvent<unknown>) => {
          const value = event.data;
          if (value && typeof value === "object" && "projectId" in value && value.projectId === projectId) onWake();
        };
      }
    } catch { /* 교차 탭 채널을 사용할 수 없어도 재접속·주기적 조회로 갱신한다. */ }
    void refresh();
    return () => {
      generation.current += 1; reads.current += 1; authority.current = null;
      window.clearInterval(timer); window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake); document.removeEventListener("visibilitychange", onWake);
      channel.current?.close(); channel.current = null;
    };
  }, [scope, projectId, actorId, authRevision, isDemo, demo]);
  const queueCommand = useCallback((command: ProductionClientCommand, message: string, strict: boolean): Promise<void> => {
    const epoch = generation.current, session = getAuthSessionRevision(), batch = queueEpoch.current;
    const current = () => authorityScope.current === scope && generation.current === epoch && getAuthSessionRevision() === session && session === authRevision;
    const run = async () => {
      if (!current()) { if (strict) throw new Error(STALE); return; }
      if (batch !== queueEpoch.current) { if (strict) throw new Error("이전 저장이 실패하여 대기 중인 변경을 적용하지 않았습니다. 최신 내용을 확인한 뒤 다시 저장하세요."); return; }
      const record = authority.current;
      if (!record || (!isDemo && record.aggregate.projectId !== projectId)) {
        if (strict) throw new Error("저장할 프로젝트가 없습니다. 다시 불러온 뒤 시도하세요.");
        return;
      }
      if (!record.access.view || (!record.access.edit && !record.access.comment && !record.access.manage)) {
        if (strict) throw new Error("프로젝트 변경 권한이 없습니다.");
        return;
      }
      pendingWrites.current += 1; reads.current += 1;
      setSnapshot((value) => ({ ...value, saveState: "saving", notice: null, refreshing: false }));
      try {
        const next = isDemo ? demo.reduce(record.aggregate, command)
          : (await executeProductionCommand(record.aggregate.projectId, record.aggregate.revision, command)).aggregate;
        if (!current()) throw new Error(STALE);
        if (next.projectId !== record.aggregate.projectId || next.revision < record.aggregate.revision) throw new Error("저장 응답의 프로젝트나 버전을 확인하지 못했습니다.");
        authority.current = { aggregate: next, access: record.access };
        setSnapshot((value) => ({ ...value, record: authority.current, saveState: "saved", notice: message }));
        try { channel.current?.postMessage({ projectId: next.projectId, revision: next.revision }); }
        catch { /* 저장 성공은 유지하고 다른 탭은 주기적 재조회로 확인한다. */ }
      } catch (cause) {
        if (current()) queueEpoch.current += 1;
        let failure = await getApiErrorMessage(cause, "변경 내용을 저장하지 못했습니다.");
        if (!current()) { if (strict) throw new Error(STALE, { cause }); return; }
        if (!isDemo && httpStatus(cause) === 409) {
          try {
            const latest = await getProductionProject(record.aggregate.projectId);
            if (!current()) throw new Error(STALE, { cause });
            if (latest.aggregate.projectId !== projectId || !latest.access.view) { authority.current = null; throw new Error("프로젝트 접근 정보가 변경되었습니다.", { cause }); }
            authority.current = latest;
            failure += " 최신 상태를 불러왔습니다. 편집 내용을 확인한 뒤 다시 저장하세요.";
          } catch (refreshError) {
            if ([401, 403, 404].includes(httpStatus(refreshError) ?? 0)) authority.current = null;
            failure += " 최신 상태를 불러오지 못했습니다. 새로고침이 필요합니다.";
          }
        }
        if (!current()) { if (strict) throw new Error(STALE, { cause }); return; }
        if ([401, 403, 404].includes(httpStatus(cause) ?? 0)) authority.current = null;
        setSnapshot((value) => ({ ...value, record: authority.current, saveState: "error", notice: failure,
          error: authority.current ? null : failure }));
        if (strict) throw new Error(failure, { cause });
      } finally { if (current()) pendingWrites.current = Math.max(0, pendingWrites.current - 1); }
    };
    const operation = queue.current.then(run, run);
    queue.current = operation.catch(() => undefined);
    return operation;
  }, [scope, authRevision, isDemo, projectId, demo]);
  const execute = useCallback((command: ProductionClientCommand, message: string) => queueCommand(command, message, false), [queueCommand]);
  const executeStrict = useCallback((command: ProductionClientCommand, message: string) => queueCommand(command, message, true), [queueCommand]);
  const refresh = useCallback(() => refreshRef.current(), []);
  return { aggregate: state.record?.aggregate ?? null, access: state.record?.access ?? NO_ACCESS,
    loading: state.loading, error: state.error, saveState: state.saveState, notice: state.notice,
    refreshing: state.refreshing, refresh, execute, executeStrict, isDemo };
}
