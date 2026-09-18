import { createHash } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createProductionProjectAggregate,
  episodeScope,
  type ProductionProjectAggregate,
} from "@toonspectrum/core/production";

import {
  ProductionProjectRevisionConflictError,
  type ProductionCollaborationRepository,
} from "./production-collaboration.repository";
import { ProductionCollaborationService } from "./production-collaboration.service";

const at = "2026-09-15T12:00:00.000Z";

function aggregate(): ProductionProjectAggregate {
  return createProductionProjectAggregate({
    projectId: "project-1",
    workId: "work-1",
    title: "공동 창작 테스트",
    collaborationModel: "co-creator",
    ownerPartyId: "party-owner",
    ownerUserId: "owner-1",
    ownerDisplayName: "제작자",
    at,
  });
}

const externalReviewToken = "a".repeat(64);

function aggregateWithExternalReview(): ProductionProjectAggregate {
  const base = aggregate();
  const assignmentId = base.assignments[0]!.id;
  return {
    ...base,
    deliverables: [{
      id: "deliverable-final",
      projectId: base.projectId,
      scope: episodeScope(base.projectId, "episode-1"),
      type: "integrated-webtoon",
      expectedFormat: "PNG sequence",
      completionCriteria: ["오탈자 없음", "플랫폼 규격 통과"],
      currentSubmissionId: "submission-final",
      approvedSubmissionId: "submission-final",
    }],
    submissions: [{
      id: "submission-final",
      projectId: base.projectId,
      deliverableId: "deliverable-final",
      revisionRef: {
        id: "revision-final",
        lineage: "integrated",
        revision: 1,
        digest: `sha256:${"1".repeat(64)}`,
        createdAt: at,
      },
      submittedByAssignmentId: assignmentId,
      submittedAt: at,
      status: "approved",
      inputRevisionRefs: [],
      evidenceRefs: ["https://example.test/review.png"],
    }],
    externalReviewAccesses: [{
      id: "external-review-1",
      projectId: base.projectId,
      scope: episodeScope(base.projectId, "episode-1"),
      label: "편집부 최종 검수",
      tokenDigest: `sha256:${createHash("sha256").update(externalReviewToken).digest("hex")}`,
      submissionIds: ["submission-final"],
      permissions: ["view", "comment", "approve"],
      watermark: true,
      expiresAt: "2027-09-17T00:00:00.000Z",
      status: "active",
      createdByAssignmentId: assignmentId,
      createdAt: at,
      lastAccessedAt: null,
      responses: [],
    }],
  };
}

const repository = {
  getProject: vi.fn(),
  listProjects: vi.fn(),
  getPublicProject: vi.fn(),
  getProjectByWork: vi.fn(),
  createProject: vi.fn(),
  mutatePublicReview: vi.fn(),
  mutateProject: vi.fn(),
};

function service(): ProductionCollaborationService {
  return new ProductionCollaborationService(
    repository as unknown as ProductionCollaborationRepository,
  );
}

describe("ProductionCollaborationService", () => {
  beforeEach(() => {
    for (const mock of Object.values(repository)) mock.mockReset();
  });

  it("creates a revisioned aggregate with its first append-only audit event", async () => {
    repository.createProject.mockImplementation(async (input) => ({ aggregate: input.aggregate }));
    const result = await service().createProject("owner-1", {
      projectId: "project-1",
      workId: "work-1",
      title: " 공동 창작 테스트 ",
      collaborationModel: "co-creator",
      ownerPartyId: "party-owner",
      ownerDisplayName: "제작자",
      clientMutationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.aggregate.revision).toBe(1);
    expect(result.aggregate.auditEvents).toHaveLength(1);
    expect(result.aggregate.auditEvents[0]).toMatchObject({
      action: "project-created",
      targetType: "project",
      targetId: "project-1",
    });
  });

  it("executes a late story change as a revisioned command with impact analysis", async () => {
    const current = aggregate();
    repository.mutateProject.mockImplementation(async (input) => input.mutate(current, {
      view: true,
      comment: true,
      edit: true,
      manage: true,
      owner: true,
      role: "owner",
    }));
    const revision = {
      id: "story-r1",
      lineage: "narrative" as const,
      revision: 1,
      digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdAt: at,
    };
    const result = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 0,
      mutationId: "22222222-2222-4222-8222-222222222222",
      command: {
        type: "upsert-change-request",
        request: {
          id: "change-1",
          projectId: "project-1",
          episodeId: "episode-12",
          stage: "in-final-art",
          sourceRevisionRef: revision,
          proposedRevisionRef: { ...revision, id: "story-r2", revision: 2, digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
          changedScopes: [episodeScope("project-1", "episode-12")],
          reason: "고객이 결말 장면을 변경함",
          requestedByAssignmentId: "assignment-story",
          status: "impact-analysis",
          createdAt: at,
        },
        impactHints: {
          touchesDialogue: true,
          touchesCanon: true,
          agreementScoped: true,
          affectedApprovalIds: ["approval-story-lock"],
        },
      },
    });
    expect(result.aggregate.revision).toBe(1);
    expect(result.aggregate.changeRequests).toHaveLength(1);
    expect(result.derived).toMatchObject({
      impact: {
        severity: "critical",
        requiresAgreementChange: true,
        requiresScheduleRebaseline: true,
      },
    });
  });

  it("rejects an inconsistent collaboration graph before persistence", async () => {
    const current = aggregate();
    repository.mutateProject.mockImplementation(async (input) => input.mutate(current, {
      view: true,
      comment: true,
      edit: true,
      manage: true,
      owner: true,
      role: "owner",
    }));
    await expect(service().executeCommand("owner-1", "project-1", {
      expectedRevision: 0,
      mutationId: "33333333-3333-4333-8333-333333333333",
      command: {
        type: "configure-collaboration",
        parties: current.parties,
        assignments: [{ ...current.assignments[0]!, partyId: "missing-party" }],
        authorityRules: [],
      },
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps optimistic revision conflicts to HTTP 409", async () => {
    repository.mutateProject.mockRejectedValue(new ProductionProjectRevisionConflictError(8));
    const episode = {
      id: "episode-collaboration-12",
      projectId: "project-1",
      episodeId: "episode-12",
      revision: 0,
      state: "episode-planning" as const,
      narrativeRevisionRef: null,
      visualRevisionRef: null,
      integratedRevisionRef: null,
      activeHandoffId: null,
      openBlockerCount: 0,
      storyLockApproved: false,
      thumbnailLockApproved: false,
      jointProofApproved: false,
      creditPreflightPassed: false,
      publicationPreflightPassed: false,
      updatedAt: at,
    };
    await expect(service().executeCommand("owner-1", "project-1", {
      expectedRevision: 0,
      mutationId: "44444444-4444-4444-8444-444444444444",
      command: { type: "upsert-episode", episode },
    })).rejects.toMatchObject({
      response: { currentRevision: 8 },
    });
    await expect(service().executeCommand("owner-1", "project-1", {
      expectedRevision: 0,
      mutationId: "55555555-5555-4555-8555-555555555555",
      command: { type: "upsert-episode", episode },
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it("persists an isolated branch and approved submission without mutating source revisions", async () => {
    const revision = {
      id: "story-r1",
      lineage: "narrative" as const,
      revision: 1,
      digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdAt: at,
    };
    const visualRevision = {
      id: "visual-r1",
      lineage: "visual" as const,
      revision: 1,
      digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      createdAt: at,
    };
    const ownerAssignmentId = "assignment:party-owner:producer";
    let current: ProductionProjectAggregate = {
      ...aggregate(),
      episodes: [{
        id: "episode-collaboration-12",
        projectId: "project-1",
        episodeId: "episode-12",
        revision: 0,
        state: "story-drafting",
        narrativeRevisionRef: revision,
        visualRevisionRef: null,
        integratedRevisionRef: null,
        activeHandoffId: null,
        openBlockerCount: 0,
        storyLockApproved: false,
        thumbnailLockApproved: false,
        jointProofApproved: false,
        creditPreflightPassed: false,
        publicationPreflightPassed: false,
        updatedAt: at,
      }],
    };
    repository.mutateProject.mockImplementation(async (input) => {
      const result = input.mutate(current, {
        view: true,
        comment: true,
        edit: true,
        manage: true,
        owner: true,
        role: "owner",
      });
      current = result.aggregate;
      return result;
    });

    const branchResult = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 0,
      mutationId: "66666666-6666-4666-8666-666666666666",
      command: {
        type: "upsert-branch",
        branch: {
          id: "branch-thumbnail-12",
          projectId: "project-1",
          episodeId: "episode-12",
          type: "thumbnail",
          lineage: "visual",
          baseRevisionRef: visualRevision,
          headRevisionRef: visualRevision,
          ownerAssignmentId,
          purpose: "12화 콘티 탐색",
          mergeTarget: "visual",
          visibility: "team",
          allowedScopes: [episodeScope("project-1", "episode-12")],
          expiresAt: null,
          status: "active",
        },
      },
    });
    expect(branchResult.aggregate.branches).toHaveLength(1);
    expect(branchResult.aggregate.episodes[0]?.narrativeRevisionRef).toEqual(revision);

    const deliverableResult = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 1,
      mutationId: "77777777-7777-4777-8777-777777777777",
      command: {
        type: "upsert-deliverable",
        deliverable: {
          id: "deliverable-thumbnail-12",
          projectId: "project-1",
          scope: episodeScope("project-1", "episode-12"),
          type: "thumbnail",
          expectedFormat: "studio-document",
          completionCriteria: ["전체 컷 배치", "대사 안전영역"],
          currentSubmissionId: null,
          approvedSubmissionId: null,
        },
      },
    });
    expect(deliverableResult.aggregate.deliverables).toHaveLength(1);

    const submissionResult = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 2,
      mutationId: "88888888-8888-4888-8888-888888888888",
      command: {
        type: "upsert-submission",
        submission: {
          id: "submission-thumbnail-12-r1",
          projectId: "project-1",
          deliverableId: "deliverable-thumbnail-12",
          revisionRef: visualRevision,
          submittedByAssignmentId: ownerAssignmentId,
          submittedAt: at,
          status: "approved",
          inputRevisionRefs: [revision],
          evidenceRefs: ["approval-thumbnail-12-r1"],
        },
      },
    });
    expect(submissionResult.aggregate.submissions).toHaveLength(1);
    expect(submissionResult.aggregate.deliverables[0]).toMatchObject({
      currentSubmissionId: "submission-thumbnail-12-r1",
      approvedSubmissionId: "submission-thumbnail-12-r1",
    });
    expect(submissionResult.aggregate.auditEvents.at(-1)?.action).toBe("upsert-submission");
  });

  it("binds an approved Studio revision to the production deliverable and episode", async () => {
    const visualRevision = {
      id: "studio-thumbnail-r2",
      lineage: "visual" as const,
      revision: 2,
      digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      createdAt: at,
    };
    const ownerAssignmentId = "assignment:party-owner:producer";
    const current: ProductionProjectAggregate = {
      ...aggregate(),
      episodes: [{
        id: "episode-collaboration-12",
        projectId: "project-1",
        episodeId: "episode-12",
        revision: 0,
        state: "thumbnail-joint-review",
        narrativeRevisionRef: null,
        visualRevisionRef: null,
        integratedRevisionRef: null,
        activeHandoffId: null,
        openBlockerCount: 0,
        storyLockApproved: true,
        thumbnailLockApproved: false,
        jointProofApproved: false,
        creditPreflightPassed: false,
        publicationPreflightPassed: false,
        updatedAt: at,
      }],
      deliverables: [{
        id: "deliverable-thumbnail-12",
        projectId: "project-1",
        scope: episodeScope("project-1", "episode-12"),
        type: "thumbnail",
        expectedFormat: "studio-document",
        completionCriteria: ["전체 컷 배치"],
        currentSubmissionId: "submission-thumbnail-12-r2",
        approvedSubmissionId: "submission-thumbnail-12-r2",
      }],
      submissions: [{
        id: "submission-thumbnail-12-r2",
        projectId: "project-1",
        deliverableId: "deliverable-thumbnail-12",
        revisionRef: visualRevision,
        submittedByAssignmentId: ownerAssignmentId,
        submittedAt: at,
        status: "approved",
        inputRevisionRefs: [],
        evidenceRefs: ["approval-thumbnail-12-r2"],
      }],
      studioRevisionLinks: [],
    };
    repository.mutateProject.mockImplementation(async (input) => input.mutate(current, {
      view: true,
      comment: true,
      edit: true,
      manage: true,
      owner: true,
      role: "owner",
    }));

    const result = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 0,
      mutationId: "99999999-9999-4999-8999-999999999999",
      command: {
        type: "upsert-studio-revision-link",
        link: {
          id: "studio-link-thumbnail-12-r2",
          projectId: "project-1",
          workId: "work-1",
          episodeId: "episode-12",
          studioDocumentRef: "document-thumbnail-12",
          documentRole: "thumbnail",
          studioRevisionRef: visualRevision,
          deliverableId: "deliverable-thumbnail-12",
          submissionId: "submission-thumbnail-12-r2",
          linkedByAssignmentId: ownerAssignmentId,
          status: "approved",
          linkedAt: at,
          approvedAt: at,
        },
      },
    });

    expect(result.aggregate.studioRevisionLinks).toHaveLength(1);
    expect(result.aggregate.episodes[0]?.visualRevisionRef).toEqual(visualRevision);
    expect(result.derived).toMatchObject({
      coverage: {
        approvedRoles: ["thumbnail"],
        pendingRoles: [],
        missingRoles: [],
      },
    });
    expect(result.aggregate.auditEvents.at(-1)).toMatchObject({
      action: "upsert-studio-revision-link",
      targetType: "studio-revision-link",
      targetId: "studio-link-thumbnail-12-r2",
    });
  });

  it("archives immutable procurement scope revisions behind an Addendum", async () => {
    const revision = {
      id: "story-r1",
      lineage: "narrative" as const,
      revision: 1,
      digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdAt: at,
    };
    let current = aggregate();
    repository.mutateProject.mockImplementation(async (input) => {
      const result = input.mutate(current, {
        view: true,
        comment: true,
        edit: true,
        manage: true,
        owner: true,
        role: "owner",
      });
      current = result.aggregate;
      return result;
    });
    const basePackage = {
      id: "scope-background-12",
      projectId: "project-1",
      revision: 1,
      status: "published" as const,
      scopes: [episodeScope("project-1", "episode-12")],
      inputRevisionRefs: [revision],
      deliverableSpecifications: ["배경 12컷"],
      acceptanceCriteria: ["레이어 분리"],
      includedRevisionRounds: 2,
      schedule: {
        proposalDueAt: null,
        startsAt: at,
        deliveryDueAt: "2026-09-30T00:00:00.000Z",
        reviewResponseHours: 24,
      },
      rightsPolicyRef: "rights-r1",
      aiPolicyRef: "ai-r1",
      creditPolicyRef: "credit-r1",
      compensationTermsRef: "pay-r1",
      informationDisclosureLevel: "nda" as const,
      createdAt: at,
    };
    await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 0,
      mutationId: "99999999-9999-4999-8999-999999999999",
      command: { type: "publish-scope-package", scopePackage: basePackage },
    });
    const result = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 1,
      mutationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      command: {
        type: "amend-scope-package",
        previousPackageId: basePackage.id,
        replacement: {
          ...basePackage,
          revision: 2,
          deliverableSpecifications: ["배경 14컷"],
          includedRevisionRounds: 3,
          createdAt: "2026-09-16T00:00:00.000Z",
        },
        addendumId: "scope-background-12-addendum-1",
        reason: "승인된 콘티에서 배경 컷이 2개 증가함",
        createdAt: "2026-09-16T00:00:00.000Z",
      },
    });
    expect(result.aggregate.scopePackages[0]?.revision).toBe(2);
    expect(result.aggregate.scopePackageRevisionArchive[0]?.revision).toBe(1);
    expect(result.aggregate.scopePackageAddenda[0]).toMatchObject({
      sequence: 1,
      replacementScopePackageRevision: 2,
    });
  });


  it("persists planning documents and turns approved review evidence into StoryLock", async () => {
    const ownerAssignmentId = "assignment:party-owner:producer";
    const narrativeRevision = {
      id: "story-episode-12-r1",
      lineage: "narrative" as const,
      revision: 1,
      digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdAt: at,
    };
    let current: ProductionProjectAggregate = {
      ...aggregate(),
      episodes: [{
        id: "episode-collaboration-12",
        projectId: "project-1",
        episodeId: "episode-12",
        revision: 0,
        state: "story-review",
        narrativeRevisionRef: narrativeRevision,
        visualRevisionRef: null,
        integratedRevisionRef: null,
        activeHandoffId: null,
        openBlockerCount: 0,
        storyLockApproved: false,
        thumbnailLockApproved: false,
        jointProofApproved: false,
        creditPreflightPassed: false,
        publicationPreflightPassed: false,
        updatedAt: at,
      }],
      reviewDecisions: [{
        id: "decision-story-lock-12",
        reviewRoundId: "snapshot-story-lock-12",
        lane: "narrative",
        assignmentId: ownerAssignmentId,
        value: "approve",
        reasonCode: null,
        evidenceScopeRefs: [episodeScope("project-1", "episode-12")],
        conditions: [],
        createdAt: at,
      }],
    };
    repository.mutateProject.mockImplementation(async (input) => {
      const result = input.mutate(current, {
        view: true,
        comment: true,
        edit: true,
        manage: true,
        owner: true,
        role: "owner",
      });
      current = result.aggregate;
      return result;
    });
    await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 0,
      mutationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      command: {
        type: "upsert-planning-record",
        record: {
          kind: "project-brief",
          value: {
            id: "brief-1",
            projectId: "project-1",
            revision: 1,
            status: "draft",
            title: "밤의 우편배달부",
            logline: "죽은 사람의 편지를 배달하는 청년이 자신의 이름이 적힌 봉투를 발견한다.",
            synopsis: "",
            themes: ["선택"],
            genreKeys: ["mystery"],
            audience: [],
            platformProfileRefs: [],
            businessGoals: ["주간 연재"],
            constraints: ["15세 이용가"],
            rightsBaselineRef: null,
            approvedByAssignmentIds: [],
            createdAt: at,
          },
        },
      },
    });
    await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 1,
      mutationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      command: {
        type: "upsert-planning-record",
        record: {
          kind: "episode-plan",
          value: {
            id: "episode-plan-12-r1",
            projectId: "project-1",
            seasonId: "season-1",
            episodeId: "episode-12",
            episodeNumber: 12,
            revision: 1,
            status: "draft",
            title: "돌아온 봉투",
            logline: "주인공이 자신에게 온 편지를 숨긴다.",
            openingHook: "빈 우편함에서 물이 떨어진다.",
            coreConflict: "편지를 열지 않으려는 욕망과 의무의 충돌",
            turningPoints: ["문양 발견"],
            cliffhanger: "발신인이 자신임을 확인한다.",
            characterRefs: ["character-haeon-r5"],
            locationRefs: ["location-alley-r4"],
            targetCutCount: 68,
            targetScrollHeightPx: 18420,
            dialogueDensity: "medium",
            difficulty: 4,
            riskIds: [],
            narrativeRevisionRef: narrativeRevision,
            approvedByAssignmentIds: [],
            createdAt: at,
          },
        },
      },
    });
    const result = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 2,
      mutationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      command: {
        type: "create-planning-snapshot",
        snapshot: {
          id: "snapshot-story-lock-12",
          projectId: "project-1",
          scope: episodeScope("project-1", "episode-12"),
          type: "story-lock",
          sourceRevisionRefs: [narrativeRevision],
          documentRefs: ["brief-1", "episode-plan-12-r1"],
          approvedByAssignmentIds: [ownerAssignmentId],
          createdAt: at,
        },
      },
    });
    expect(result.aggregate.planningSnapshots).toHaveLength(1);
    expect(result.aggregate.episodes[0]).toMatchObject({
      storyLockApproved: true,
      narrativeRevisionRef: narrativeRevision,
    });
  });

  it("persists selected proposals and active agreements against the exact scope revision", async () => {
    const narrativeRevision = {
      id: "story-episode-12-r1",
      lineage: "narrative" as const,
      revision: 1,
      digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdAt: at,
    };
    const scopePackage = {
      id: "scope-background-12",
      projectId: "project-1",
      revision: 1,
      status: "published" as const,
      scopes: [episodeScope("project-1", "episode-12")],
      inputRevisionRefs: [narrativeRevision],
      deliverableSpecifications: ["배경 12컷"],
      acceptanceCriteria: ["레이어 분리"],
      includedRevisionRounds: 2,
      schedule: {
        proposalDueAt: null,
        startsAt: at,
        deliveryDueAt: "2026-09-30T00:00:00.000Z",
        reviewResponseHours: 24,
      },
      rightsPolicyRef: "rights-r1",
      aiPolicyRef: "ai-r1",
      creditPolicyRef: "credit-r1",
      compensationTermsRef: "pay-r1",
      informationDisclosureLevel: "nda" as const,
      createdAt: at,
      digest: "fnv1a64:0000000000000000",
    };
    const base = aggregate();
    let current: ProductionProjectAggregate = {
      ...base,
      scopePackages: [scopePackage],
      parties: [
        ...base.parties,
        {
          id: "party-counterparty",
          accountUserId: null,
          legalIdentityRef: "vendor-legal-1",
          publicDisplayName: "배경 협력사",
          internalDisplayName: "배경 협력사",
          contactPartyId: null,
          agencyPartyId: null,
          status: "active",
        },
      ],
    };
    repository.mutateProject.mockImplementation(async (input) => {
      const result = input.mutate(current, {
        view: true,
        comment: true,
        edit: true,
        manage: true,
        owner: true,
        role: "owner",
      });
      current = result.aggregate;
      return result;
    });
    const proposal = {
      id: "proposal-owner",
      projectId: "project-1",
      scopePackageId: scopePackage.id,
      scopePackageRevision: 1,
      proposerPartyId: "party-owner",
      status: "selected" as const,
      understanding: "야간 배경 12컷을 승인된 콘티에 맞춰 제작합니다.",
      approach: "3D 블로킹 후 페인트오버",
      experienceRefs: ["portfolio-1"],
      scheduleSummary: "5일",
      milestoneDrafts: [{ title: "최종", dueAt: "2026-09-30T00:00:00.000Z", amountMinor: 800000 }],
      totalAmountMinor: 800000,
      currency: "KRW",
      includedRevisionRounds: 2,
      assumptions: ["콘티 잠금"],
      exclusions: ["캐릭터 작화"],
      risks: ["콘티 변경 시 ChangeOrder"],
      submittedAt: at,
    };
    await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 0,
      mutationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      command: { type: "upsert-commercial-record", record: { kind: "proposal", value: proposal } },
    });
    const result = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 1,
      mutationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      command: {
        type: "upsert-commercial-record",
        record: {
          kind: "agreement",
          value: {
            id: "agreement-owner",
            projectId: "project-1",
            revision: 1,
            status: "active",
            scopePackageId: scopePackage.id,
            scopePackageRevision: 1,
            selectedProposalId: proposal.id,
            partyIds: ["party-owner", "party-counterparty"],
            totalAmountMinor: 800000,
            currency: "KRW",
            rightsPolicyRef: "rights-r1",
            creditPolicyRef: "credit-r1",
            compensationPlanRef: "pay-r1",
            confidentialityPolicyRef: "nda-r1",
            signedEvidenceRefs: ["signed-contract-r1"],
            effectiveAt: at,
            endsAt: null,
            createdAt: at,
          },
        },
      },
    });
    expect(result.aggregate.proposals[0]?.status).toBe("selected");
    expect(result.aggregate.agreements[0]).toMatchObject({
      status: "active",
      scopePackageRevision: 1,
      totalAmountMinor: 800000,
    });
  });

  it("creates a new episode, plan and dependency-safe deadline pipeline atomically", async () => {
    const current = aggregate();
    repository.mutateProject.mockImplementation(async (input) => input.mutate(current, {
      view: true,
      comment: true,
      edit: true,
      manage: true,
      owner: true,
      role: "owner",
    }));
    const episode = {
      id: "episode-collaboration-14",
      projectId: "project-1",
      episodeId: "episode-14",
      revision: 0,
      state: "episode-planning" as const,
      narrativeRevisionRef: null,
      visualRevisionRef: null,
      integratedRevisionRef: null,
      activeHandoffId: null,
      openBlockerCount: 0,
      storyLockApproved: false,
      thumbnailLockApproved: false,
      jointProofApproved: false,
      creditPreflightPassed: false,
      publicationPreflightPassed: false,
      updatedAt: at,
    };
    const episodePlan = {
      id: "episode-plan-14",
      projectId: "project-1",
      seasonId: null,
      episodeId: "episode-14",
      episodeNumber: 14,
      revision: 1,
      status: "draft" as const,
      title: "14화 새 출발",
      logline: "새로운 사건이 시작된다.",
      openingHook: "",
      coreConflict: "",
      turningPoints: [],
      cliffhanger: "",
      characterRefs: [],
      locationRefs: [],
      targetCutCount: 60,
      targetScrollHeightPx: 80000,
      dialogueDensity: "medium" as const,
      difficulty: 3,
      riskIds: [],
      narrativeRevisionRef: null,
      approvedByAssignmentIds: [],
      createdAt: at,
    };
    const storyTask = {
      id: "task-episode-14-story",
      projectId: "project-1",
      scope: episodeScope("project-1", "episode-14"),
      processKey: "story",
      title: "14화 대본 확정",
      status: "draft" as const,
      assignmentIds: [],
      reviewerAssignmentIds: [],
      inputRevisionRefs: [],
      outputDeliverableIds: [],
      dependencyTaskIds: [],
      dueAt: "2026-10-01T09:00:00.000Z",
      estimateHours: { optimistic: 6, likely: 10, pessimistic: 14 },
      completionCriteria: ["대사 정본 고정"],
      sourceAgreementMilestoneId: null,
    };
    const publicationTask = {
      ...storyTask,
      id: "task-episode-14-publication",
      processKey: "publication",
      title: "14화 게시 예약",
      dependencyTaskIds: [storyTask.id],
      dueAt: "2026-10-15T09:00:00.000Z",
      estimateHours: { optimistic: 2, likely: 3, pessimistic: 5 },
      completionCriteria: ["업로드 규격 검증"],
    };
    const result = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 0,
      mutationId: "12121212-1212-4212-8212-121212121212",
      command: {
        type: "upsert-episode-operations",
        episodeId: episode.episodeId,
        episode,
        episodePlan,
        tasks: [storyTask, publicationTask],
      },
    });
    expect(result.aggregate).toMatchObject({ revision: 1 });
    expect(result.aggregate.episodes).toHaveLength(1);
    expect(result.aggregate.episodePlans).toHaveLength(1);
    expect(result.aggregate.tasks).toHaveLength(2);
    expect(result.derived).toEqual({
      episodeId: "episode-14",
      taskCount: 2,
      releaseAt: "2026-10-15T09:00:00.000Z",
    });
    expect(result.aggregate.auditEvents.at(-1)).toMatchObject({
      action: "upsert-episode-operations",
      targetType: "episode-operations",
      targetId: "episode-14",
    });
  });

  it("returns a compact risk-sorted portfolio without exposing project aggregates", async () => {
    const base = aggregate();
    const current: ProductionProjectAggregate = {
      ...base,
      episodes: [{
        id: "episode-1",
        projectId: base.projectId,
        episodeId: "episode-1",
        revision: 1,
        state: "publish-ready",
        narrativeRevisionRef: null,
        visualRevisionRef: null,
        integratedRevisionRef: null,
        activeHandoffId: null,
        openBlockerCount: 0,
        storyLockApproved: true,
        thumbnailLockApproved: true,
        jointProofApproved: true,
        creditPreflightPassed: true,
        publicationPreflightPassed: true,
        updatedAt: at,
      }],
      tasks: [{
        id: "publication-1",
        projectId: base.projectId,
        scope: episodeScope(base.projectId, "episode-1"),
        processKey: "publication",
        title: "1화 게시",
        status: "blocked",
        assignmentIds: [],
        reviewerAssignmentIds: [],
        inputRevisionRefs: [],
        outputDeliverableIds: [],
        dependencyTaskIds: [],
        dueAt: "2026-09-16T00:00:00.000Z",
        estimateHours: { optimistic: 1, likely: 2, pessimistic: 3 },
        completionCriteria: ["게시"],
        sourceAgreementMilestoneId: null,
      }],
    };
    repository.listProjects.mockResolvedValue([{
      aggregate: current,
      access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
    }]);

    const result = await service().listProjects("owner-1");

    expect(result.projects).toEqual([
      expect.objectContaining({
        projectId: "project-1",
        title: "공동 창작 테스트",
        activeEpisodeCount: 1,
        readyBufferCount: 1,
        blockedTaskCount: 1,
        overdueTaskCount: 1,
        unassignedTaskCount: 1,
      }),
    ]);
    expect(result.projects[0]).not.toHaveProperty("tasks");
    expect(result.projects[0]).not.toHaveProperty("aggregate");
  });

  it("combines the current user's work across projects into one personal inbox", async () => {
    const base = aggregate();
    const assignmentId = base.assignments[0]!.id;
    const current: ProductionProjectAggregate = {
      ...base,
      tasks: [{
        id: "task-my-work",
        projectId: base.projectId,
        scope: episodeScope(base.projectId, "episode-1"),
        processKey: "line-art",
        title: "내 선화 작업",
        status: "in-progress",
        assignmentIds: [assignmentId],
        reviewerAssignmentIds: [],
        inputRevisionRefs: [],
        outputDeliverableIds: [],
        dependencyTaskIds: [],
        dueAt: "2026-09-17T09:00:00.000Z",
        estimateHours: { optimistic: 4, likely: 6, pessimistic: 8 },
        completionCriteria: ["완료"],
        sourceAgreementMilestoneId: null,
      }],
    };
    repository.listProjects.mockResolvedValue([{
      aggregate: current,
      access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
    }]);

    const result = await service().getPersonalInbox("owner-1");

    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        bucket: "inProgress",
        projectId: "project-1",
        taskId: "task-my-work",
        taskTitle: "내 선화 작업",
      }),
    ]));
    expect(result.counts.inProgress).toBe(1);
  });

  it("rejects a guarded task batch when a task changed after the recovery preview", async () => {
    const base = aggregate();
    const task = {
      id: "task-guarded",
      projectId: base.projectId,
      scope: { kind: "project" as const, id: base.projectId, ancestors: [] },
      processKey: "line-art",
      title: "선화",
      status: "in-progress" as const,
      assignmentIds: [],
      reviewerAssignmentIds: [],
      inputRevisionRefs: [],
      outputDeliverableIds: [],
      dependencyTaskIds: [],
      dueAt: "2026-09-20T00:00:00.000Z",
      estimateHours: { optimistic: 4, likely: 6, pessimistic: 8 },
      completionCriteria: ["완료"],
      sourceAgreementMilestoneId: null,
    };
    const current: ProductionProjectAggregate = { ...base, tasks: [task] };
    repository.mutateProject.mockImplementation(async (input) => input.mutate(current, {
      view: true,
      comment: true,
      edit: true,
      manage: true,
      owner: true,
      role: "owner",
    }));

    await expect(service().executeCommand("owner-1", base.projectId, {
      expectedRevision: 0,
      mutationId: "13131313-1313-4313-8313-131313131313",
      command: {
        type: "upsert-task-batch",
        tasks: [{ ...task, dueAt: "2026-09-22T00:00:00.000Z" }],
        expectedTasks: [{ ...task, status: "ready" }],
      },
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it("persists automation tasks, notifications and rule state in one aggregate revision", async () => {
    const current = aggregate();
    const assignmentId = current.assignments[0]!.id;
    repository.mutateProject.mockImplementation(async (input) => input.mutate(current, {
      view: true,
      comment: true,
      edit: true,
      manage: true,
      owner: true,
      role: "owner",
    }));
    const task = {
      id: "automation-task:atomic",
      projectId: current.projectId,
      scope: { kind: "project" as const, id: current.projectId, ancestors: [] },
      processKey: "producer-follow-up",
      title: "지연 원인 확인",
      status: "ready" as const,
      assignmentIds: [assignmentId],
      reviewerAssignmentIds: [],
      inputRevisionRefs: [],
      outputDeliverableIds: [],
      dependencyTaskIds: [],
      dueAt: "2026-09-17T13:00:00.000Z",
      estimateHours: { optimistic: 1, likely: 2, pessimistic: 4 },
      completionCriteria: ["원인 확인"],
      sourceAgreementMilestoneId: null,
    };
    const notification = {
      id: "automation-notification:atomic",
      projectId: current.projectId,
      assignmentId,
      type: "automation" as const,
      title: "지연 조치",
      body: "마감이 지났습니다.",
      href: `/production/projects/${current.projectId}/control`,
      urgency: "critical" as const,
      sourceType: "automation:rule:task",
      sourceId: task.id,
      status: "unread" as const,
      createdAt: at,
      readAt: null,
    };
    const rule = {
      id: "automation-rule-atomic",
      projectId: current.projectId,
      name: "지연 조치",
      trigger: "due-passed" as const,
      conditions: [],
      actions: [{
        type: "notify" as const,
        assignmentIds: [assignmentId],
        urgency: "critical" as const,
        message: "마감이 지났습니다.",
      }],
      failurePolicy: "require-review" as const,
      enabled: true,
      revision: 2,
      lastEvaluatedAt: at,
      createdByAssignmentId: assignmentId,
      updatedAt: at,
    };

    const result = await service().executeCommand("owner-1", current.projectId, {
      expectedRevision: 0,
      mutationId: "14141414-1414-4414-8414-141414141414",
      command: {
        type: "apply-automation-execution",
        tasks: [task],
        notifications: [notification],
        evaluatedRules: [rule],
      },
    });

    expect(result.aggregate).toMatchObject({ revision: 1 });
    expect(result.aggregate.tasks).toMatchObject([task]);
    expect(result.aggregate.notifications).toEqual([notification]);
    expect(result.aggregate.automationRules).toEqual([rule]);
    expect(result.derived).toEqual({
      taskCount: 1,
      notificationCount: 1,
      evaluatedRuleCount: 1,
    });
  });

  it("projects only token-scoped immutable submissions to an external reviewer", async () => {
    const current = aggregateWithExternalReview();
    repository.getPublicProject.mockResolvedValue(current);

    const result = await service().getExternalReview(
      current.projectId,
      "external-review-1",
      externalReviewToken,
    );

    expect(result).toMatchObject({
      projectTitle: "공동 창작 테스트",
      review: {
        id: "external-review-1",
        label: "편집부 최종 검수",
        watermark: true,
      },
      submissions: [{
        id: "submission-final",
        deliverable: { type: "integrated-webtoon" },
      }],
    });
    expect(result.submissions[0]).toMatchObject({
      evidenceRefs: [],
      protectedEvidenceCount: 1,
    });
    expect(result).not.toHaveProperty("assignments");
    expect(result).not.toHaveProperty("externalReviewAccesses");
  });

  it("records an idempotent public review response without exposing the aggregate", async () => {
    const current = aggregateWithExternalReview();
    repository.mutatePublicReview.mockImplementation(async (input) => input.mutate(current));

    const result = await service().submitExternalReview(
      current.projectId,
      "external-review-1",
      {
        responseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        token: externalReviewToken,
        reviewerName: "외부 편집자",
        decision: "request-changes",
        note: "마지막 컷 식자를 수정해 주세요.",
      },
    );

    expect(result).toMatchObject({
      review: {
        responses: [{
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          reviewerName: "외부 편집자",
          decision: "request-changes",
        }],
      },
    });
    expect(result).not.toHaveProperty("aggregate");
  });

  it("accepts an exact retry of the same public review response idempotently", async () => {
    const base = aggregateWithExternalReview();
    const existing = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reviewerName: "외부 편집자",
      decision: "approve" as const,
      note: "최종 확인했습니다.",
      createdAt: "2026-09-17T01:00:00.000Z",
    };
    const current: ProductionProjectAggregate = {
      ...base,
      externalReviewAccesses: base.externalReviewAccesses.map((access) => ({
        ...access,
        responses: [existing],
      })),
    };
    repository.mutatePublicReview.mockImplementation(async (input) => input.mutate(current));

    const result = await service().submitExternalReview(
      current.projectId,
      "external-review-1",
      {
        responseId: existing.id,
        token: externalReviewToken,
        reviewerName: existing.reviewerName,
        decision: existing.decision,
        note: existing.note,
      },
    );

    expect(result.review.responses).toEqual([existing]);
  });

  it("rejects an active token that does not include view permission", async () => {
    const base = aggregateWithExternalReview();
    const current: ProductionProjectAggregate = {
      ...base,
      externalReviewAccesses: base.externalReviewAccesses.map((access) => ({
        ...access,
        permissions: ["comment"],
      })),
    };
    repository.getPublicProject.mockResolvedValue(current);

    await expect(service().getExternalReview(
      current.projectId,
      "external-review-1",
      externalReviewToken,
    )).rejects.toMatchObject({ status: 404 });
  });

  it("rate limits response floods while preserving append-only review history", async () => {
    const base = aggregateWithExternalReview();
    const now = Date.now();
    const current: ProductionProjectAggregate = {
      ...base,
      externalReviewAccesses: base.externalReviewAccesses.map((access) => ({
        ...access,
        responses: Array.from({ length: 60 }, (_, index) => ({
          id: `response-flood-${index}`,
          reviewerName: "외부 검수자",
          decision: "comment" as const,
          note: `응답 ${index}`,
          createdAt: new Date(now - index * 1_000).toISOString(),
        })),
      })),
    };
    repository.mutatePublicReview.mockImplementation(async (input) => input.mutate(current));

    await expect(service().submitExternalReview(
      current.projectId,
      "external-review-1",
      {
        token: externalReviewToken,
        responseId: "15151515-1515-4515-8515-151515151515",
        reviewerName: "외부 검수자",
        decision: "comment",
        note: "추가 응답",
      },
    )).rejects.toMatchObject({ status: 429 });
  });

  it("rejects invalid or expired public review tokens without revealing link existence", async () => {
    const current = aggregateWithExternalReview();
    repository.getPublicProject.mockResolvedValue(current);

    await expect(service().getExternalReview(
      current.projectId,
      "external-review-1",
      "b".repeat(64),
    )).rejects.toMatchObject({ status: 404 });
  });

});
