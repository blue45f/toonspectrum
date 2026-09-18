import { describe, expect, it } from "vitest";

import { createProductionProjectAggregate } from "./aggregate";
import { episodeScope } from "./scope";
import {
  applyProductionStudioRevisionLink,
  evaluateProductionStudioRevisionCoverage,
  inferProductionStudioDocumentRole,
  validateProductionStudioRevisionLink,
} from "./studio-revision";

import type {
  EpisodeCollaboration,
  ProductionProjectAggregate,
  ProductionStudioRevisionLink,
  RevisionRef,
} from "./types";

const STORY_REVISION: RevisionRef = {
  id: "studio-story-r2",
  lineage: "narrative",
  revision: 2,
  digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  createdAt: "2026-09-17T00:00:00.000Z",
};

const FINAL_REVISION: RevisionRef = {
  id: "studio-final-r4",
  lineage: "integrated",
  revision: 4,
  digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  createdAt: "2026-09-17T01:00:00.000Z",
};
function fixture(): ProductionProjectAggregate {
  const base = createProductionProjectAggregate({
    projectId: "project-1",
    workId: "work-1",
    title: "Revision bridge",
    collaborationModel: "studio-production",
    ownerPartyId: "party-owner",
    ownerUserId: "user-owner",
    ownerDisplayName: "Owner",
    at: "2026-09-17T00:00:00.000Z",
  });
  const scope = episodeScope(base.projectId, "episode-1");
  const episode: EpisodeCollaboration = {
    id: "episode-collaboration-1",
    projectId: base.projectId,
    episodeId: "episode-1",
    revision: 0,
    state: "story-review",
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
    updatedAt: "2026-09-17T00:00:00.000Z",
  };
  return {
    ...base,
    episodes: [episode],
    deliverables: [
      {
        id: "deliverable-story",
        projectId: base.projectId,
        scope,
        type: "story-script",
        expectedFormat: "studio-document",
        completionCriteria: ["approved story"],
        currentSubmissionId: "submission-story",
        approvedSubmissionId: "submission-story",
      },
      {
        id: "deliverable-final",
        projectId: base.projectId,
        scope,
        type: "publication-package",
        expectedFormat: "platform-upload-package",
        completionCriteria: ["approved final"],
        currentSubmissionId: "submission-final",
        approvedSubmissionId: "submission-final",
      },
    ],
    submissions: [
      {
        id: "submission-story",
        projectId: base.projectId,
        deliverableId: "deliverable-story",
        revisionRef: STORY_REVISION,
        submittedByAssignmentId: "assignment:party-owner:producer",
        submittedAt: "2026-09-17T00:05:00.000Z",
        status: "approved",
        inputRevisionRefs: [],
        evidenceRefs: ["review-story-r2"],
      },
      {
        id: "submission-final",
        projectId: base.projectId,
        deliverableId: "deliverable-final",
        revisionRef: FINAL_REVISION,
        submittedByAssignmentId: "assignment:party-owner:producer",
        submittedAt: "2026-09-17T01:05:00.000Z",
        status: "approved",
        inputRevisionRefs: [STORY_REVISION],
        evidenceRefs: ["review-final-r4"],
      },
    ],
    studioRevisionLinks: [],
  };
}

function link(
  role: ProductionStudioRevisionLink["documentRole"],
  revision: RevisionRef,
  deliverableId: string,
  submissionId: string,
): ProductionStudioRevisionLink {
  return {
    id: `studio-link-${role}`,
    projectId: "project-1",
    workId: "work-1",
    episodeId: "episode-1",
    studioDocumentRef: `document-${role}`,
    documentRole: role,
    studioRevisionRef: revision,
    deliverableId,
    submissionId,
    linkedByAssignmentId: "assignment:party-owner:producer",
    status: "approved",
    linkedAt: "2026-09-17T02:00:00.000Z",
    approvedAt: "2026-09-17T02:00:00.000Z",
  };
}
describe("production Studio revision bridge", () => {
  it("maps production deliverables to Studio document roles", () => {
    expect(inferProductionStudioDocumentRole("story-script")).toBe("story");
    expect(inferProductionStudioDocumentRole("line-art")).toBe("lineart");
    expect(inferProductionStudioDocumentRole("background-final")).toBe("background");
    expect(inferProductionStudioDocumentRole("color-and-effects")).toBe("color");
    expect(inferProductionStudioDocumentRole("lettering")).toBe("lettering");
    expect(inferProductionStudioDocumentRole("publication-package")).toBe("final");
    expect(inferProductionStudioDocumentRole("rights-preflight")).toBeNull();
  });

  it("requires an approved submission before an approved revision can be linked", () => {
    const aggregate = fixture();
    const invalid = {
      ...link("story", STORY_REVISION, "deliverable-story", "submission-story"),
      studioRevisionRef: FINAL_REVISION,
    };

    expect(validateProductionStudioRevisionLink({ aggregate, link: invalid }))
      .toContain("studio-link-lineage-mismatch");
    expect(validateProductionStudioRevisionLink({ aggregate, link: invalid }))
      .toContain("studio-link-submission-revision-mismatch");
  });

  it("projects approved Studio revisions onto the episode authority", () => {
    const aggregate = fixture();
    const withStory = applyProductionStudioRevisionLink(
      aggregate,
      link("story", STORY_REVISION, "deliverable-story", "submission-story"),
    );
    const withFinal = applyProductionStudioRevisionLink(
      withStory,
      link("final", FINAL_REVISION, "deliverable-final", "submission-final"),
    );

    expect(withFinal.episodes[0]?.narrativeRevisionRef).toEqual(STORY_REVISION);
    expect(withFinal.episodes[0]?.integratedRevisionRef).toEqual(FINAL_REVISION);
    expect(withFinal.episodes[0]?.revision).toBe(2);
  });
  it("reports pending and missing production roles before integrated review", () => {
    const aggregate = fixture();
    const submittedStory: ProductionStudioRevisionLink = {
      ...link("story", STORY_REVISION, "deliverable-story", "submission-story"),
      status: "submitted",
      approvedAt: null,
    };
    const withStory = applyProductionStudioRevisionLink(aggregate, submittedStory);
    const coverage = evaluateProductionStudioRevisionCoverage(withStory, "episode-1");

    expect(coverage.expectedRoles).toEqual(["story", "final"]);
    expect(coverage.pendingRoles).toEqual(["story"]);
    expect(coverage.missingRoles).toEqual(["final"]);
    expect(coverage.readyForIntegratedReview).toBe(false);
  });

  it("becomes review-ready only after every expected revision is approved", () => {
    const aggregate = fixture();
    const withStory = applyProductionStudioRevisionLink(
      aggregate,
      link("story", STORY_REVISION, "deliverable-story", "submission-story"),
    );
    const withFinal = applyProductionStudioRevisionLink(
      withStory,
      link("final", FINAL_REVISION, "deliverable-final", "submission-final"),
    );
    const coverage = evaluateProductionStudioRevisionCoverage(withFinal, "episode-1");

    expect(coverage.approvedRoles).toEqual(["story", "final"]);
    expect(coverage.pendingRoles).toEqual([]);
    expect(coverage.missingRoles).toEqual([]);
    expect(coverage.readyForIntegratedReview).toBe(true);
  });
});
