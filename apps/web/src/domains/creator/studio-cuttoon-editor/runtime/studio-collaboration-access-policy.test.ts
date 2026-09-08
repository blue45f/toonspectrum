import { describe, expect, it } from "vitest";

import { projectStudioCollaborationAccessPolicy } from "./studio-collaboration-access-policy";

const localDocument = {
  expectsSharedDocument: false,
  liveJam: false,
  realtimeSession: false,
  participantCanEdit: false,
  documentReady: false,
  editsDurablyProtected: false,
  documentAccessLocked: false,
} as const;

const unsavedLiveJam = {
  ...localDocument,
  liveJam: true,
  realtimeSession: true,
  participantCanEdit: true,
} as const;

const savedTeamDocument = {
  ...localDocument,
  expectsSharedDocument: true,
  realtimeSession: true,
  participantCanEdit: true,
} as const;

describe("projectStudioCollaborationAccessPolicy", () => {
  it("커서만 준비된 저장 전 작업실은 CRDT 문서와 최초 frontier가 준비될 때까지 잠근다", () => {
    expect(projectStudioCollaborationAccessPolicy(unsavedLiveJam)).toEqual({
      operationSyncRequired: true,
      operationDurabilityRequired: false,
      operationSyncReady: false,
      operationSyncPending: true,
      documentLocked: true,
    });
  });

  it("저장 전 작업실은 문서가 수렴하면 autosave follower 탭도 공동 편집을 허용한다", () => {
    expect(projectStudioCollaborationAccessPolicy({
      ...unsavedLiveJam,
      documentReady: true,
      editsDurablyProtected: false,
    })).toEqual({
      operationSyncRequired: true,
      operationDurabilityRequired: false,
      operationSyncReady: true,
      operationSyncPending: false,
      documentLocked: false,
    });
  });

  it("저장된 팀 원고는 문서 수렴뿐 아니라 내구성 보호까지 확인한 뒤 편집을 연다", () => {
    expect(projectStudioCollaborationAccessPolicy({
      ...savedTeamDocument,
      documentReady: true,
      editsDurablyProtected: false,
    })).toEqual({
      operationSyncRequired: true,
      operationDurabilityRequired: true,
      operationSyncReady: false,
      operationSyncPending: true,
      documentLocked: true,
    });
    expect(projectStudioCollaborationAccessPolicy({
      ...savedTeamDocument,
      documentReady: true,
      editsDurablyProtected: true,
    })).toEqual({
      operationSyncRequired: true,
      operationDurabilityRequired: true,
      operationSyncReady: true,
      operationSyncPending: false,
      documentLocked: false,
    });
  });

  it("열람 역할과 ACL·hydration 잠금은 문서 lane 준비 여부와 무관하게 fail-closed다", () => {
    expect(projectStudioCollaborationAccessPolicy({
      ...savedTeamDocument,
      participantCanEdit: false,
      documentReady: true,
      editsDurablyProtected: true,
      documentAccessLocked: true,
    })).toEqual({
      operationSyncRequired: false,
      operationDurabilityRequired: false,
      operationSyncReady: true,
      operationSyncPending: false,
      documentLocked: true,
    });
  });

  it("협업에 참여하지 않는 로컬 문서는 CRDT 지연 로딩으로 잠기지 않는다", () => {
    expect(projectStudioCollaborationAccessPolicy(localDocument)).toEqual({
      operationSyncRequired: false,
      operationDurabilityRequired: false,
      operationSyncReady: false,
      operationSyncPending: false,
      documentLocked: false,
    });
  });
});
