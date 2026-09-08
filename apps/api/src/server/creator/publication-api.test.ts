import { describe, expect, it } from "vitest";

import {
  createDefaultCreatorPublicationDirective,
  writeCreatorPublicationDirective,
} from "../../../../web/src/shared/lib/creator-publication-contract";

import { CreatorPublicationValidationError } from "./publication";
import {
  assertCreatorPublicationRelationMutationAllowed,
  isCreatorPublicationPolicyRowReadable,
} from "./publication-api";

function publicationDoc(visibility: "public" | "unlisted" | "private") {
  return writeCreatorPublicationDirective(
    {},
    {
      ...createDefaultCreatorPublicationDirective("Asia/Seoul"),
      visibility,
    },
  );
}

describe("creator publication raw access boundary", () => {
  it("allows published public and unlisted rows but never private, hidden, or draft rows", () => {
    expect(
      isCreatorPublicationPolicyRowReadable({
        status: "published",
        hidden: false,
        doc: publicationDoc("public"),
      }),
    ).toBe(true);
    expect(
      isCreatorPublicationPolicyRowReadable({
        status: "published",
        hidden: false,
        doc: publicationDoc("unlisted"),
      }),
    ).toBe(true);
    expect(
      isCreatorPublicationPolicyRowReadable({
        status: "published",
        hidden: false,
        doc: publicationDoc("private"),
      }),
    ).toBe(false);
    expect(
      isCreatorPublicationPolicyRowReadable({
        status: "published",
        hidden: true,
        doc: publicationDoc("public"),
      }),
    ).toBe(false);
    expect(
      isCreatorPublicationPolicyRowReadable({
        status: "draft",
        hidden: false,
        doc: publicationDoc("public"),
      }),
    ).toBe(false);
  });

  it("retains legacy published behavior when no publication directive exists", () => {
    expect(
      isCreatorPublicationPolicyRowReadable({
        status: "published",
        hidden: false,
        doc: { format: "upload" },
      }),
    ).toBe(true);
  });
});

describe("creator publication relation mutation guard", () => {
  it("blocks attaching an already-published unlisted work to a challenge", () => {
    expect(() =>
      assertCreatorPublicationRelationMutationAllowed(
        {
          status: "published",
          challengeId: null,
          doc: publicationDoc("unlisted"),
        },
        { challengeId: "challenge-1" },
      ),
    ).toThrow(CreatorPublicationValidationError);

    try {
      assertCreatorPublicationRelationMutationAllowed(
        {
          status: "published",
          challengeId: null,
          doc: publicationDoc("unlisted"),
        },
        { challengeId: "challenge-1" },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(CreatorPublicationValidationError);
      expect((error as CreatorPublicationValidationError).details.issues[0]?.code).toBe(
        "CHALLENGE_REQUIRES_PUBLIC",
      );
    }
  });

  it("allows a draft to prepare a challenge relation before becoming public", () => {
    expect(() =>
      assertCreatorPublicationRelationMutationAllowed(
        {
          status: "draft",
          challengeId: null,
          doc: publicationDoc("private"),
        },
        { challengeId: "challenge-1" },
      ),
    ).not.toThrow();
  });

  it("allows public and legacy published works to join a challenge", () => {
    expect(() =>
      assertCreatorPublicationRelationMutationAllowed(
        {
          status: "published",
          challengeId: null,
          doc: publicationDoc("public"),
        },
        { challengeId: "challenge-1" },
      ),
    ).not.toThrow();
    expect(() =>
      assertCreatorPublicationRelationMutationAllowed(
        {
          status: "published",
          challengeId: null,
          doc: { format: "upload" },
        },
        { challengeId: "challenge-1" },
      ),
    ).not.toThrow();
  });

  it("uses publication JSON from the same mutation when visibility becomes public", () => {
    expect(() =>
      assertCreatorPublicationRelationMutationAllowed(
        {
          status: "published",
          challengeId: null,
          doc: publicationDoc("unlisted"),
        },
        {
          challengeId: "challenge-1",
          doc: publicationDoc("public"),
        },
      ),
    ).not.toThrow();
  });
});
