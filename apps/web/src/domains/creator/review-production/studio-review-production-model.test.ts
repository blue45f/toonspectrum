import { canonicalJson } from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";
import { studioProductionServerClientTestHelpers } from "../studio-production/studio-production-server-client";

import { prepareStudioReviewProductionPatch, studioReviewProductionPatchIsPresent } from "./studio-review-production-model";
import { reviewProductionFixture } from "./studio-review-production-test-fixture";

describe("saved comment production patch", () => {
  it("admits both the saved records and the resulting patch through the actual server workspace parser", () => {
    const f = reviewProductionFixture(), saved = studioProductionServerClientTestHelpers.parseServerWorkspace(f.authority.workspace, "work");
    const patch = prepareStudioReviewProductionPatch({ ...f.authority, workspace: saved }, f.choice);
    expect(studioProductionServerClientTestHelpers.parseServerWorkspace({ ...saved, document: patch.document }, "work").document.tasks[0]?.reviewRef)
      .toEqual({ ...f.request, handoffId: "handoff" });
  });
  it("changes exactly one task in fresh JSON and preserves criteria, other work and history", () => {
    const f = reviewProductionFixture(), before = canonicalJson(f.authority.workspace);
    const patch = prepareStudioReviewProductionPatch(f.authority, f.choice), original = f.authority.workspace.document;
    expect(patch.document.tasks[0]).toEqual({ ...original.tasks[0], assigneeIds: ["role-editor"], reviewRef: { ...f.request, handoffId: "handoff" } });
    expect(patch.document.tasks[1]).toBe(original.tasks[1]);
    expect({ ...patch.document, tasks: [] }).toEqual({ ...original, tasks: [] });
    expect(canonicalJson(f.authority.workspace)).toBe(before);
    expect(patch.reference).not.toHaveProperty("acceptanceCriteria");
  });
  it("requires exact reviewed handoff contents and matching hierarchy", () => {
    const f = reviewProductionFixture();
    expect(() => prepareStudioReviewProductionPatch(f.authority, { ...f.choice, expectedHandoff: "old" })).toThrow("conflict");
    expect(() => prepareStudioReviewProductionPatch(f.authority, { ...f.choice, handoffId: "missing" })).toThrow("missing-handoff");
    expect(() => prepareStudioReviewProductionPatch(f.authority, { ...f.choice, taskId: "other-task" })).toThrow("missing-handoff");
    expect(() => prepareStudioReviewProductionPatch(f.authority, { ...f.choice, taskId: "missing" })).toThrow("missing-task");
  });
  it("never guesses a role from a comment user ID or converts legacy task assignees", () => {
    const f = reviewProductionFixture();
    expect(() => prepareStudioReviewProductionPatch(f.authority, { ...f.choice, roleSelections: { editor: "editor" } })).toThrow("assignment-required");
    const document = f.authority.workspace.document;
    const legacy = { ...f.authority, workspace: { ...f.authority.workspace, document: { ...document, tasks: [{ ...document.tasks[0]!, assigneeIds: ["editor"] }] } } };
    expect(() => prepareStudioReviewProductionPatch(legacy, f.choice)).toThrow("assignment-required");
    const revoked = { ...f.authority, team: { ...f.authority.team, members: [] } };
    expect(() => prepareStudioReviewProductionPatch(revoked, f.choice)).toThrow("assignment-required");
  });
  it("requires explicit replacement of the exact previous link", () => {
    const f = reviewProductionFixture(), previous = { ...f.request, commentId: "old-comment", handoffId: null };
    const document = f.authority.workspace.document;
    const linked = { ...f.authority, workspace: { ...f.authority.workspace, document: { ...document, tasks: [{ ...document.tasks[0]!, reviewRef: previous }] } } };
    expect(() => prepareStudioReviewProductionPatch(linked, f.choice)).toThrow("existing-link");
    expect(() => prepareStudioReviewProductionPatch(linked, { ...f.choice, replaceExisting: true })).toThrow("existing-link");
    expect(prepareStudioReviewProductionPatch(linked, { ...f.choice, replaceExisting: true, expectedPreviousRef: previous }).reference.commentId).toBe("comment");
  });
  it("reconciles only the exact saved reference and explicit role assignments", () => {
    const f = reviewProductionFixture(), patch = prepareStudioReviewProductionPatch(f.authority, f.choice);
    expect(studioReviewProductionPatchIsPresent(f.authority.workspace, "task", patch)).toBe(false);
    expect(studioReviewProductionPatchIsPresent({ ...f.authority.workspace, document: patch.document }, "task", patch)).toBe(true);
    expect(studioReviewProductionPatchIsPresent({ ...f.authority.workspace, capabilities: { ...f.authority.workspace.capabilities, edit: false }, document: patch.document }, "task", patch)).toBe(false);
    expect(prepareStudioReviewProductionPatch({ ...f.authority, workspace: { ...f.authority.workspace, document: patch.document } }, f.choice).changed).toBe(false);
  });
});
