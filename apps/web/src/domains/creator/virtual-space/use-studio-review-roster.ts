import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getAuthSessionRevision, getAuthUserId, listeners as sessionListeners } from "@/compat/auth-session-state";
import { getStudioTeam, type StudioTeamMember } from "../studio-team-client";
import { studioReviewAssignmentCandidates } from "./studio-review-comment-assignment";

const LEASE_MS = 15_000;
const RENEW_BEFORE_MS = 5_000;
type RosterStatus = "idle" | "loading" | "failed";
interface RosterState {
  readonly scope: string; readonly session: number; readonly expiresAt: number;
  readonly members: readonly StudioTeamMember[] | null;
  readonly candidates: readonly StudioTeamMember[] | null; readonly status: RosterStatus;
}
export interface StudioReviewRoster {
  readonly members: readonly StudioTeamMember[] | null;
  readonly candidates: readonly StudioTeamMember[] | null;
  readonly status: RosterStatus;
  readonly refresh: () => void;
}

export function studioReviewRosterName(roster: StudioReviewRoster, userId: string): string | null {
  const name = roster.members?.find((member) => member.userId === userId)?.name.trim();
  // The team client uses a user ID as its missing-name fallback. Keep that
  // internal identifier out of the normal review prose as well.
  return name && name !== userId ? name : null;
}

/** One panel owns this read-only subscription and shares it with every name/candidate consumer. */
export function useStudioReviewRoster({ workId, actorId, enabled, autoStart = false }: {
  readonly workId: string | null; readonly actorId: string | null; readonly enabled: boolean; readonly autoStart?: boolean;
}): StudioReviewRoster {
  const scope = JSON.stringify([workId, actorId]);
  const [startedScope, setStartedScope] = useState<string | null>(null);
  const [state, setState] = useState<RosterState | null>(null);
  const active = enabled && Boolean(workId && actorId) && (autoStart || startedScope === scope);
  const refreshCurrent = useRef<(() => void) | null>(null), stopCurrent = useRef<(() => void) | null>(null);
  const hasLease = useRef(false);
  useLayoutEffect(() => () => stopCurrent.current?.(), [scope, active]);
  useEffect(() => {
    if (!active || !workId || !actorId) return;
    let alive = true, generation = 0;
    let pending: AbortController | null = null;
    let renewal: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      ++generation; hasLease.current = false; pending?.abort(); pending = null;
      clearTimeout(renewal); clearTimeout(expiry); clearTimeout(timeout);
    };
    const clear = (status: RosterStatus) => {
      cancel();
      if (alive) setState({ scope, session: getAuthSessionRevision(), expiresAt: 0, members: null, candidates: null, status });
    };
    const load = async () => {
      if (!alive || pending || document.visibilityState === "hidden" || getAuthUserId() !== actorId) return;
      const own = ++generation, session = getAuthSessionRevision(), expiresAt = Date.now() + LEASE_MS;
      const abort = new AbortController(); pending = abort;
      clearTimeout(renewal);
      setState((previous) => previous?.scope === scope && previous.session === session && previous.expiresAt > Date.now()
        ? { ...previous, status: "loading" }
        : { scope, session, expiresAt: 0, members: null, candidates: null, status: "loading" });
      timeout = setTimeout(() => clear("failed"), LEASE_MS);
      try {
        const team = await getStudioTeam(workId, abort.signal);
        if (!alive || own !== generation || session !== getAuthSessionRevision() || getAuthUserId() !== actorId) return;
        if (Date.now() >= expiresAt || team.workId !== workId || team.viewer.userId !== actorId
          || team.viewer.status !== "active" || !team.viewer.capabilities.view) { clear("failed"); return; }
        const candidates = team.viewer.capabilities.comment ? studioReviewAssignmentCandidates(team, workId, actorId) : [];
        pending = null; hasLease.current = true; clearTimeout(timeout); clearTimeout(expiry);
        setState({ scope, session, expiresAt, status: "idle", members: team.members.filter((member) => member.status === "active"), candidates });
        // A renewal never extends the previous lease until its fresh read succeeds.
        renewal = setTimeout(() => { void load(); }, Math.max(0, expiresAt - Date.now() - RENEW_BEFORE_MS));
        expiry = setTimeout(() => clear("failed"), Math.max(0, expiresAt - Date.now()));
      } catch {
        if (alive && own === generation) clear("failed");
      }
    };
    const visibility = () => { if (document.visibilityState === "hidden") clear("idle"); else void load(); };
    const published = () => { clear("idle"); if (getAuthUserId() === actorId) void load(); };
    const focus = () => { void load(); };
    const stop = () => { alive = false; cancel(); };
    stopCurrent.current = stop; refreshCurrent.current = () => { void load(); };
    sessionListeners.add(published); document.addEventListener("visibilitychange", visibility); globalThis.addEventListener("focus", focus);
    void load();
    return () => {
      stop(); sessionListeners.delete(published); document.removeEventListener("visibilitychange", visibility); globalThis.removeEventListener("focus", focus);
      if (stopCurrent.current === stop) { stopCurrent.current = null; refreshCurrent.current = null; }
    };
  }, [active, actorId, workId, scope]);
  const refresh = useCallback(() => {
    if (!enabled || !actorId || !workId || getAuthUserId() !== actorId || document.visibilityState === "hidden") return;
    setStartedScope(scope); refreshCurrent.current?.();
  }, [enabled, actorId, workId, scope]);
  const current = active && getAuthUserId() === actorId && document.visibilityState !== "hidden"
    && state?.scope === scope && state.session === getAuthSessionRevision() ? state : null;
  // Expiry is published by the timer; response admission also checks the clock.
  const valid = hasLease.current && current && current.expiresAt > 0;
  return { members: valid ? current.members : null, candidates: valid ? current.candidates : null, status: current?.status ?? "idle", refresh };
}
