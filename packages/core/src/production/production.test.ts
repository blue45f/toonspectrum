import { describe, expect, it } from "vitest";

import {
  analyzeProductionChangeImpact,
  commitProductionAggregate,
  createImmutableScopePackage,
  createProductionProjectAggregate,
  episodeScope,
  evaluateHandoffReadiness,
  evaluateProcurementRequirementsGate,
  evaluateReviewApproval,
  preflightCreditManifest,
  projectScope,
  resolveDecisionAuthority,
  stableProductionFingerprint,
  transitionEpisodeCollaboration,
  transitionHandoff,
  verifyScopePackageIntegrity,
  applySubmissionToDeliverable,
  validateCreativeBranch,
  validateCreativeMergeRequest,
  validateDeliverable,
  validateSubmission,
  createPlanningSnapshot,
  verifyPlanningSnapshot,
  validateProjectBrief,
  validateEpisodePlan,
  validateProcurementProposal,
  validateProductionAgreement,
  validateContractMilestones,
  validatePaymentRecord,
  type ChangeRequest,
  type CreditManifest,
  type DecisionAuthorityRule,
  type EpisodeCollaboration,
  type ReviewPolicy,
  type RoleAssignment,
  type StoryToArtHandoffPackage,
} from "./index";

const at = "2026-09-15T12:00:00.000Z";
const project = projectScope("project-1");
const episode = episodeScope("project-1", "episode-12");
const revision = {
  id: "revision-1",
  lineage: "narrative" as const,
  revision: 1,
  digest: "sha256:story",
  createdAt: at,
};

function assignment(id: string, roleType: RoleAssignment["roleType"]): RoleAssignment {
  return {
    id,
    projectId: "project-1",
    partyId: `party-${id}`,
    roleType,
    scope: project,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: null,
    capabilities: [],
    agreementRevisionRef: null,
    publicCreditRole: null,
    status: "active",
    lead: true,
  };
}

function handoff(): StoryToArtHandoffPackage {
  return {
    id: "handoff-1",
    projectId: "project-1",
    episodeId: "episode-12",
    handoffRevision: 1,
    status: "offered-to-art",
    storySnapshotRef: revision,
    storyLockRef: revision,
    storyBibleRevisionRef: "series-bible-r2",
    characterBibleRevisionRefs: ["character-main-r3"],
    episodeIntentRef: "intent-12-r1",
    beatRefs: ["beat-1"],
    sceneRefs: ["scene-1"],
    lockedDialogueRefs: ["dialogue-1"],
    continuityReferenceRefs: ["continuity-1"],
    visualRequirementRefs: ["visual-1"],
    forbiddenInterpretationRefs: [],
    assetRequirementRefs: ["asset-1"],
    locationReferenceRefs: ["location-1"],
    costumeReferenceRefs: ["costume-1"],
    instructions: [{
      id: "instruction-1",
      scope: episode,
      priority: "INTENT",
      latitude: "bounded",
      text: "독자가 주인공의 망설임을 먼저 느끼게 한다.",
      rationale: "후반 반전을 위한 감정 기준",
      sourceRevisionRef: revision.id,
    }],
    platformProfileRef: "platform-webtoon-r1",
    technicalDeliveryRuleRef: "delivery-r1",
    rightsAndAiPolicyRef: "rights-ai-r1",
    creditPolicyRef: "credit-r1",
    expectedDeliverables: ["thumbnail"],
    reviewPolicyRef: "review-r1",
    decisionOwnerAssignmentIds: ["story", "art"],
    dueAt: "2026-09-20T00:00:00.000Z",
    openRiskAcceptances: [],
    createdByAssignmentId: "story",
    acceptedByAssignmentId: null,
    acceptedAt: null,
    digest: "sha256:handoff",
    createdAt: at,
  };
}

describe("production collaboration model", () => {
  it("resolves the most specific authority rule without conflating role and rights", () => {
    const assignments = [assignment("story", "story-lead"), assignment("art", "art-lead")];
    const rules: DecisionAuthorityRule[] = [{
      id: "rule-project",
      projectId: "project-1",
      domain: "layout",
      scope: project,
      proposerAssignmentIds: ["story", "art"],
      requiredConsultAssignmentIds: ["story"],
      requiredApproverAssignmentIds: ["art"],
      decisionAssignmentId: "art",
      vetoAssignmentIds: [],
      mediatorAssignmentId: null,
      quorum: { approvals: 1, eligible: 1 },
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      expiresAt: null,
      agreementRevisionRef: null,
    }];
    expect(resolveDecisionAuthority({
      assignmentId: "art",
      domain: "layout",
      scope: episode,
      at,
      assignments,
      rules,
    }).levels).toEqual(expect.arrayContaining(["approve", "decide", "comment"]));
    expect(resolveDecisionAuthority({
      assignmentId: "story",
      domain: "layout",
      scope: episode,
      at,
      assignments,
      rules,
    }).levels).toEqual(expect.arrayContaining(["propose", "consult"]));
  });

  it("blocks handoff acceptance until StoryLock, rights policy, references and questions are ready", () => {
    const incomplete = { ...handoff(), storyLockRef: null, rightsAndAiPolicyRef: null, locationReferenceRefs: [] };
    const readiness = evaluateHandoffReadiness({
      package: incomplete,
      clarifications: [{
        id: "question-1",
        handoffId: incomplete.id,
        scope: episode,
        category: "narrative-ambiguity",
        blocking: true,
        question: "소품을 독자에게 보여도 되나요?",
        askedByAssignmentId: "art",
        answerOwnerAssignmentId: "story",
        dueAt: null,
        status: "open",
        answer: null,
        decisionRecordId: null,
        createdAt: at,
        updatedAt: at,
      }],
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.hardBlocks.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "story-lock-missing",
      "rights-ai-policy-missing",
      "location-reference-missing",
      "blocking-clarification-open",
    ]));
    expect(() => transitionHandoff(incomplete, "accepted-by-art", { readiness, assignmentId: "art", at })).toThrow();

    const ready = evaluateHandoffReadiness({ package: handoff(), clarifications: [] });
    expect(ready.ready).toBe(true);
    expect(transitionHandoff(handoff(), "accepted-by-art", { readiness: ready, assignmentId: "art", at }).acceptedByAssignmentId).toBe("art");
  });

  it("enforces StoryLock, ThumbnailLock, JointProof and credit gates in the episode lifecycle", () => {
    const collaboration: EpisodeCollaboration = {
      id: "episode-collaboration-12",
      projectId: "project-1",
      episodeId: "episode-12",
      revision: 0,
      state: "story-review",
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
    };
    expect(() => transitionEpisodeCollaboration(collaboration, "story-ready-for-art", { at })).toThrow(/StoryLock/u);
    const ready = transitionEpisodeCollaboration(collaboration, "story-ready-for-art", {
      at,
      storyLockApproved: true,
      activeHandoffId: "handoff-1",
    });
    expect(ready.state).toBe("story-ready-for-art");
  });

  it("evaluates review lanes with quorum, required approvers and veto", () => {
    const policy: ReviewPolicy = {
      id: "review-1",
      projectId: "project-1",
      scope: episode,
      responseDueHours: 24,
      expiredReviewAction: "escalate",
      lanes: [{
        lane: "narrative",
        eligibleAssignmentIds: ["story", "editor"],
        requiredAssignmentIds: ["story"],
        quorum: 1,
        vetoAssignmentIds: ["story"],
        blocksPublication: true,
      }, {
        lane: "visual-direction",
        eligibleAssignmentIds: ["art"],
        requiredAssignmentIds: ["art"],
        quorum: 1,
        vetoAssignmentIds: ["art"],
        blocksPublication: true,
      }],
    };
    const approved = evaluateReviewApproval(policy, [
      { id: "d1", reviewRoundId: "round-1", lane: "narrative", assignmentId: "story", value: "approve", reasonCode: null, evidenceScopeRefs: [], conditions: [], createdAt: at },
      { id: "d2", reviewRoundId: "round-1", lane: "visual-direction", assignmentId: "art", value: "approve", reasonCode: null, evidenceScopeRefs: [], conditions: [], createdAt: at },
    ]);
    expect(approved.approved).toBe(true);
    const vetoed = evaluateReviewApproval(policy, [
      { id: "d3", reviewRoundId: "round-1", lane: "narrative", assignmentId: "story", value: "veto", reasonCode: "canon", evidenceScopeRefs: [episode], conditions: [], createdAt: at },
      { id: "d4", reviewRoundId: "round-1", lane: "visual-direction", assignmentId: "art", value: "approve", reasonCode: null, evidenceScopeRefs: [], conditions: [], createdAt: at },
    ]);
    expect(vetoed.approved).toBe(false);
    expect(vetoed.blockingLanes).toContain("narrative");
  });

  it("turns late story changes into rework, rebaseline and ChangeOrder signals", () => {
    const request: ChangeRequest = {
      id: "change-1",
      projectId: "project-1",
      episodeId: "episode-12",
      stage: "in-final-art",
      sourceRevisionRef: revision,
      proposedRevisionRef: { ...revision, id: "revision-2", revision: 2, digest: "sha256:story2" },
      changedScopes: [episode],
      reason: "클라이언트가 결말 장면 변경을 요청함",
      requestedByAssignmentId: "story",
      status: "impact-analysis",
      createdAt: at,
    };
    const impact = analyzeProductionChangeImpact({
      request,
      touchesDialogue: true,
      touchesCanon: true,
      agreementScoped: true,
      affectedApprovalIds: ["approval-story-lock"],
    });
    expect(impact.severity).toBe("critical");
    expect(impact.actions).toEqual(expect.arrayContaining(["rebase", "revise", "re-review", "change-order"]));
    expect(impact.requiresScheduleRebaseline).toBe(true);
    expect(impact.requiresCompensationReview).toBe(true);
  });

  it("freezes a procurement scope package and detects any silent mutation", () => {
    const scopePackage = createImmutableScopePackage({
      id: "scope-package-1",
      projectId: "project-1",
      revision: 1,
      status: "published",
      scopes: [episode],
      inputRevisionRefs: [revision],
      deliverableSpecifications: ["배경 레이어 12컷"],
      acceptanceCriteria: ["캐릭터와 분리된 레이어", "플랫폼 안전영역 준수"],
      includedRevisionRounds: 2,
      schedule: { proposalDueAt: null, startsAt: at, deliveryDueAt: "2026-09-30T00:00:00.000Z", reviewResponseHours: 24 },
      rightsPolicyRef: "rights-r1",
      aiPolicyRef: "ai-r1",
      creditPolicyRef: "credit-r1",
      compensationTermsRef: "pay-r1",
      informationDisclosureLevel: "nda",
      createdAt: at,
    });
    expect(verifyScopePackageIntegrity(scopePackage)).toBe(true);
    expect(verifyScopePackageIntegrity({ ...scopePackage, includedRevisionRounds: 5 })).toBe(false);
    expect(stableProductionFingerprint({ b: 2, a: 1 })).toBe(stableProductionFingerprint({ a: 1, b: 2 }));
    expect(evaluateProcurementRequirementsGate({
      scopePackageId: scopePackage.id,
      approvedScope: true,
      sourceMaterialsAvailable: true,
      styleReferencesAvailable: true,
      accessProvisioned: false,
      fileSpecificationConfirmed: true,
      ndaConfirmed: true,
      paymentConditionConfirmed: true,
    }).blockingReasons).toEqual(["제한된 작업 접근권이 발급되지 않았습니다."]);
  });

  it("prevents publication when the credit manifest is stale or rights are disputed", () => {
    const manifest: CreditManifest = {
      id: "credit-1",
      projectId: "project-1",
      episodeId: "episode-12",
      revision: 1,
      status: "approved",
      contentRevisionRefs: [revision],
      entries: [{ id: "credit-entry-1", partyId: "party-story", publicName: "글 작가", roleLabel: "글", scopes: [episode], order: 1, media: ["episode", "metadata"], anonymous: false }],
      approvedByAssignmentIds: ["story", "art"],
      agreementRevisionRefs: ["agreement-r1"],
      createdAt: at,
    };
    const result = preflightCreditManifest({
      manifest,
      contentRevisionRefs: [revision],
      contributions: [],
      rightsInterests: [{
        id: "rights-1",
        projectId: "project-1",
        partyId: "party-story",
        type: "authorship-claim",
        scope: episode,
        status: "disputed",
        agreementRevisionRef: null,
        evidenceRefs: [],
        startsAt: null,
        endsAt: null,
      }],
      requiredApproverAssignmentIds: ["story", "art"],
    });
    expect(result.passed).toBe(false);
    expect(result.blockers[0]).toMatch(/분쟁/u);
  });

  it("commits an append-only audit event behind optimistic aggregate revision", () => {
    const aggregate = createProductionProjectAggregate({
      projectId: "project-1",
      workId: "work-1",
      title: "공동 창작 프로젝트",
      collaborationModel: "co-creator",
      ownerPartyId: "party-owner",
      ownerUserId: "user-owner",
      ownerDisplayName: "제작자",
      at,
    });
    const committed = commitProductionAggregate(aggregate, {
      expectedRevision: 0,
      actorPartyId: "party-owner",
      action: "project-created",
      targetType: "project",
      targetId: aggregate.projectId,
      at,
      eventId: "event-1",
      mutate: (current) => current,
    });
    expect(committed.revision).toBe(1);
    expect(committed.auditEvents).toHaveLength(1);
    expect(() => commitProductionAggregate(committed, {
      expectedRevision: 0,
      actorPartyId: "party-owner",
      action: "invalid-stale-write",
      targetType: "project",
      targetId: aggregate.projectId,
      at,
      eventId: "event-2",
      mutate: (current) => current,
    })).toThrow(/revision conflict/u);
  });

  it("keeps creative branches isolated until a scoped merge request is reviewed", () => {
    const aggregate = createProductionProjectAggregate({
      projectId: "project-1",
      workId: "work-1",
      title: "공동 창작 프로젝트",
      collaborationModel: "co-creator",
      ownerPartyId: "party-owner",
      ownerUserId: "user-owner",
      ownerDisplayName: "제작자",
      at,
    });
    const withEpisode = {
      ...aggregate,
      episodes: [{
        id: "episode-collaboration-12",
        projectId: "project-1",
        episodeId: "episode-12",
        revision: 0,
        state: "story-drafting" as const,
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
    const ownerAssignmentId = aggregate.assignments[0]!.id;
    const branch = {
      id: "branch-story-amendment-12",
      projectId: "project-1",
      episodeId: "episode-12",
      type: "story-amendment" as const,
      lineage: "narrative" as const,
      baseRevisionRef: revision,
      headRevisionRef: { ...revision, id: "story-r2", revision: 2, digest: "sha256:story-r2" },
      ownerAssignmentId,
      purpose: "12화 엔딩 대사 조정",
      mergeTarget: "narrative" as const,
      visibility: "team" as const,
      allowedScopes: [episode],
      expiresAt: null,
      status: "review" as const,
    };
    expect(validateCreativeBranch({ branch, aggregate: withEpisode })).toEqual([]);
    const request = {
      id: "merge-story-amendment-12",
      projectId: "project-1",
      episodeId: "episode-12",
      sourceBranchId: branch.id,
      targetLineage: "narrative" as const,
      baseRevisionRef: revision,
      proposedRevisionRef: branch.headRevisionRef,
      mergedRevisionRef: null,
      summary: "엔딩 대사의 정보 공개 순서를 명확히 함",
      changedScopes: [episode],
      affectedDecisionIds: [],
      affectedApprovalIds: ["approval-story-lock"],
      requiredReviewLanes: ["narrative" as const, "canon-continuity" as const],
      mergePolicyId: "merge-policy-story-r1",
      status: "ready-for-review" as const,
      createdByAssignmentId: ownerAssignmentId,
      createdAt: at,
    };
    expect(validateCreativeMergeRequest({ request, branch })).toEqual([]);
    expect(validateCreativeMergeRequest({
      request: { ...request, changedScopes: [project] },
      branch,
    })).toContain("merge-scope-outside-branch:project:project-1");
  });

  it("separates deliverable completion from immutable submission approval", () => {
    const deliverable = {
      id: "deliverable-thumbnail-12",
      projectId: "project-1",
      scope: episode,
      type: "thumbnail",
      expectedFormat: "studio-document",
      completionCriteria: ["전체 컷 배치", "대사 안전영역"],
      currentSubmissionId: null,
      approvedSubmissionId: null,
    };
    expect(validateDeliverable(deliverable, "project-1")).toEqual([]);
    const submission = {
      id: "submission-thumbnail-12-r1",
      projectId: "project-1",
      deliverableId: deliverable.id,
      revisionRef: { ...revision, id: "visual-r1", lineage: "visual" as const, digest: "sha256:visual-r1" },
      submittedByAssignmentId: "art",
      submittedAt: at,
      status: "approved" as const,
      inputRevisionRefs: [revision],
      evidenceRefs: ["approval-visual-r1"],
    };
    expect(validateSubmission({
      submission,
      deliverable,
      activeAssignmentIds: ["art"],
    })).toEqual([]);
    expect(applySubmissionToDeliverable(deliverable, submission)).toMatchObject({
      currentSubmissionId: submission.id,
      approvedSubmissionId: submission.id,
    });
    expect(validateSubmission({
      submission: { ...submission, evidenceRefs: [] },
      deliverable,
      activeAssignmentIds: ["art"],
    })).toContain("submission-approval-evidence-missing");
  });


  it("locks approved planning documents to explicit revisions and deterministic snapshots", () => {
    const brief = {
      id: "brief-r1",
      projectId: "project-1",
      revision: 1,
      status: "approved" as const,
      title: "밤의 우편배달부",
      logline: "죽은 사람의 편지를 배달하는 청년이 자신의 이름이 적힌 봉투를 발견한다.",
      synopsis: "도시의 밤을 돌며 타인의 미완성 선택을 마주한다.",
      themes: ["선택", "기억"],
      genreKeys: ["mystery", "drama"],
      audience: ["15-34"],
      platformProfileRefs: ["vertical-webtoon-r1"],
      businessGoals: ["주간 연재"],
      constraints: ["15세 이용가"],
      rightsBaselineRef: "rights-baseline-r1",
      approvedByAssignmentIds: ["story", "art"],
      createdAt: at,
    };
    expect(validateProjectBrief(brief)).toEqual([]);
    const episodePlan = {
      id: "episode-plan-12-r1",
      projectId: "project-1",
      seasonId: "season-1",
      episodeId: "episode-12",
      episodeNumber: 12,
      revision: 1,
      status: "locked" as const,
      title: "돌아온 봉투",
      logline: "주인공이 자신에게 온 편지를 숨긴다.",
      openingHook: "빈 우편함에서 물이 떨어진다.",
      coreConflict: "편지를 열지 않으려는 욕망과 진실을 알아야 하는 의무가 충돌한다.",
      turningPoints: ["발신인 문양 발견", "옥상에서 도망침"],
      cliffhanger: "발신인 이름이 주인공 자신임이 드러난다.",
      characterRefs: ["character-haeon-r5"],
      locationRefs: ["location-alley-r4"],
      targetCutCount: 68,
      targetScrollHeightPx: 18420,
      dialogueDensity: "medium" as const,
      difficulty: 4 as const,
      riskIds: ["risk-background-capacity"],
      narrativeRevisionRef: revision,
      approvedByAssignmentIds: ["story", "art"],
      createdAt: at,
    };
    expect(validateEpisodePlan(episodePlan)).toEqual([]);
    const snapshot = createPlanningSnapshot({
      id: "snapshot-story-lock-12",
      projectId: "project-1",
      scope: episode,
      type: "story-lock",
      sourceRevisionRefs: [revision],
      documentRefs: [brief.id, episodePlan.id],
      approvedByAssignmentIds: ["story", "art"],
      createdAt: at,
    });
    expect(verifyPlanningSnapshot(snapshot)).toBe(true);
    expect(verifyPlanningSnapshot({ ...snapshot, documentRefs: [...snapshot.documentRefs, "silent-mutation"] })).toBe(false);
  });

  it("validates proposal, agreement and milestone money against an immutable scope revision", () => {
    const scopePackage = createImmutableScopePackage({
      id: "scope-background-12",
      projectId: "project-1",
      revision: 1,
      status: "published",
      scopes: [episode],
      inputRevisionRefs: [revision],
      deliverableSpecifications: ["배경 12컷"],
      acceptanceCriteria: ["레이어 분리"],
      includedRevisionRounds: 2,
      schedule: { proposalDueAt: null, startsAt: at, deliveryDueAt: "2026-09-30T00:00:00.000Z", reviewResponseHours: 24 },
      rightsPolicyRef: "rights-r1",
      aiPolicyRef: "ai-r1",
      creditPolicyRef: "credit-r1",
      compensationTermsRef: "pay-r1",
      informationDisclosureLevel: "nda",
      createdAt: at,
    });
    const proposal = {
      id: "proposal-vendor-a",
      projectId: "project-1",
      scopePackageId: scopePackage.id,
      scopePackageRevision: 1,
      proposerPartyId: "vendor-a",
      status: "selected" as const,
      understanding: "야간 골목 배경과 옥상 장면을 continuity에 맞게 제작합니다.",
      approach: "3D 블로킹 후 2D 페인트오버",
      experienceRefs: ["portfolio-a"],
      scheduleSummary: "4일 제작, 1일 수정",
      milestoneDrafts: [
        { title: "샘플", dueAt: "2026-09-18T00:00:00.000Z", amountMinor: 200000 },
        { title: "최종", dueAt: "2026-09-22T00:00:00.000Z", amountMinor: 600000 },
      ],
      totalAmountMinor: 800000,
      currency: "KRW",
      includedRevisionRounds: 2,
      assumptions: ["콘티 확정"],
      exclusions: ["캐릭터 작화"],
      risks: ["콘티 변경 시 일정 재협의"],
      submittedAt: at,
    };
    expect(validateProcurementProposal(proposal, scopePackage)).toEqual([]);
    const agreement = {
      id: "agreement-vendor-a",
      projectId: "project-1",
      revision: 1,
      status: "active" as const,
      scopePackageId: scopePackage.id,
      scopePackageRevision: 1,
      selectedProposalId: proposal.id,
      partyIds: ["producer", "vendor-a"],
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
    };
    expect(validateProductionAgreement({ agreement, scopePackage, proposal })).toEqual([]);
    const milestones = [
      {
        id: "milestone-sample",
        projectId: "project-1",
        agreementId: agreement.id,
        title: "샘플 2컷",
        sequence: 1,
        scopeRefs: [episode],
        deliverableIds: ["deliverable-sample"],
        acceptanceCriteria: ["광원 기준 확인"],
        amountMinor: 200000,
        currency: "KRW",
        dueAt: "2026-09-18T00:00:00.000Z",
        status: "ready" as const,
        acceptedSubmissionIds: [],
      },
      {
        id: "milestone-final",
        projectId: "project-1",
        agreementId: agreement.id,
        title: "최종 12컷",
        sequence: 2,
        scopeRefs: [episode],
        deliverableIds: ["deliverable-final"],
        acceptanceCriteria: ["원본과 라이선스 인계"],
        amountMinor: 600000,
        currency: "KRW",
        dueAt: "2026-09-22T00:00:00.000Z",
        status: "pending-input" as const,
        acceptedSubmissionIds: [],
      },
    ];
    expect(validateContractMilestones(agreement, milestones)).toEqual([]);
  });

  it("does not allow a payment record to claim completion without external evidence", () => {
    const invoice = {
      id: "invoice-1",
      projectId: "project-1",
      agreementId: "agreement-1",
      milestoneId: "milestone-1",
      issuerPartyId: "vendor-a",
      recipientPartyId: "producer",
      amountMinor: 200000,
      currency: "KRW",
      status: "verified" as const,
      externalInvoiceRef: "tax-invoice-1",
      issuedAt: at,
      dueAt: "2026-09-30T00:00:00.000Z",
    };
    const payment = {
      id: "payment-1",
      projectId: "project-1",
      agreementId: "agreement-1",
      invoiceId: invoice.id,
      payerPartyId: "producer",
      payeePartyId: "vendor-a",
      amountMinor: 200000,
      currency: "KRW",
      status: "verified-paid" as const,
      provider: null,
      externalPaymentRef: null,
      evidenceRefs: [],
      verifiedByAssignmentId: null,
      paidAt: null,
      createdAt: at,
    };
    expect(validatePaymentRecord(payment, invoice, ["producer-assignment"]))
      .toEqual(expect.arrayContaining(["verified-payment-evidence-incomplete", "payment-verifier-invalid"]));
  });

});
