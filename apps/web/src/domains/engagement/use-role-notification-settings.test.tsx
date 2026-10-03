// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRoleNotificationSettings } from "./use-role-notification-settings";

import {
  creatorRoleNotificationSettings,
  creatorRoleWorkspacePreferenceForProfile,
  type CreatorRoleWorkspacePreference,
  type CreatorRoleWorkspaceSnapshot,
} from "@/shared/lib/creator-role-workspace-contract";

const sessionState = vi.hoisted(() => ({
  ready: true,
  status: "authenticated" as string,
}));

const workspaceState = vi.hoisted(() => ({
  snapshot: null as unknown as CreatorRoleWorkspaceSnapshot,
  enabled: null as boolean | null,
  status: "ready" as string,
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ ready: sessionState.ready, status: sessionState.status }),
}));

vi.mock("@/shared/lib/use-creator-role-workspace", () => ({
  useCreatorRoleWorkspace: (
    _projectKey: string,
    _profile: unknown,
    enabled = true,
  ) => {
    workspaceState.enabled = enabled;
    return {
      snapshot: workspaceState.snapshot,
      status: workspaceState.status,
      reload: async () => null,
    };
  },
}));

function snapshotWith(
  document: CreatorRoleWorkspacePreference,
  source: CreatorRoleWorkspaceSnapshot["source"],
): CreatorRoleWorkspaceSnapshot {
  return { projectKey: "draft", revision: 1, document, updatedAt: null, source };
}

function documentWith(
  patch: Partial<CreatorRoleWorkspacePreference>,
): CreatorRoleWorkspacePreference {
  return { ...creatorRoleWorkspacePreferenceForProfile(null), ...patch };
}

beforeEach(() => {
  sessionState.ready = true;
  sessionState.status = "authenticated";
  workspaceState.snapshot = snapshotWith(documentWith({}), "server");
  workspaceState.enabled = null;
  workspaceState.status = "ready";
});

describe("useRoleNotificationSettings", () => {
  it("비인증 세션에서는 문서를 로드하지 않고 설정을 적용하지 않는다", () => {
    sessionState.status = "unauthenticated";

    const { result } = renderHook(() => useRoleNotificationSettings());

    expect(workspaceState.enabled).toBe(false);
    expect(result.current.settings).toBeNull();
  });

  it("문서가 기본값 스냅샷인 동안은 설정을 적용하지 않는다", () => {
    workspaceState.snapshot = snapshotWith(
      documentWith({ activeRole: "color", notificationPreset: "muted" }),
      "default",
    );

    const { result } = renderHook(() => useRoleNotificationSettings());

    expect(result.current.settings).toBeNull();
    expect(result.current.state).toBe("loading");
  });

  it("로컬 스냅샷 없이 로드가 실패하면 loading이 아니라 error로 구분한다", () => {
    workspaceState.snapshot = snapshotWith(documentWith({}), "default");
    workspaceState.status = "error";

    const { result } = renderHook(() => useRoleNotificationSettings());

    expect(result.current.settings).toBeNull();
    expect(result.current.state).toBe("error");
  });

  it("직군이 선택되지 않았으면 설정을 적용하지 않는다", () => {
    workspaceState.snapshot = snapshotWith(
      documentWith({ activeRole: null, notificationPreset: "muted" }),
      "server",
    );

    const { result } = renderHook(() => useRoleNotificationSettings());

    expect(result.current.settings).toBeNull();
  });

  it("로드된 문서와 활성 직군으로 도출한 설정을 돌려준다", () => {
    const document = documentWith({
      activeRole: "color",
      notificationPreset: "focused",
      notificationOverrides: { question: true },
    });
    workspaceState.snapshot = snapshotWith(document, "server");

    const { result } = renderHook(() => useRoleNotificationSettings());

    expect(result.current.settings).toEqual(
      creatorRoleNotificationSettings("color", document),
    );
    expect(result.current.settings?.["handoff-ready"]).toBe(true);
    expect(result.current.settings?.["review-request"]).toBe(false);
  });
});
