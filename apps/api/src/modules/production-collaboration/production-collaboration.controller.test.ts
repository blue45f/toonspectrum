import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ProductionCollaborationController } from "./production-collaboration.controller";

import type { ProductionCollaborationService } from "./production-collaboration.service";

const token = "A".repeat(32);
const params = { projectId: "project-1", reviewId: "review-1" };

function setup() {
  const getExternalReview = vi.fn();
  const service = { getExternalReview } as unknown as ProductionCollaborationService;
  return {
    controller: new ProductionCollaborationController(service),
    getExternalReview,
  };
}

describe("ProductionCollaborationController external review authorization", () => {
  it("extracts a case-insensitive Bearer token across HTTP horizontal whitespace", () => {
    const { controller, getExternalReview } = setup();

    controller.getExternalReview(params, {}, `bEaReR\t \t${token}  `);

    expect(getExternalReview).toHaveBeenCalledWith("project-1", "review-1", token);
  });

  it("uses the validated fallback token for non-Bearer authorization schemes", () => {
    const { controller, getExternalReview } = setup();

    controller.getExternalReview(params, { token }, "Basic ignored");

    expect(getExternalReview).toHaveBeenCalledWith("project-1", "review-1", token);
  });

  it("rejects a long ambiguous-looking Bearer header without falling back", () => {
    const { controller, getExternalReview } = setup();
    const authorization = `Bearer${"\t".repeat(20_000)}!`;

    expect(() => controller.getExternalReview(params, { token }, authorization)).toThrow(
      NotFoundException,
    );
    expect(getExternalReview).not.toHaveBeenCalled();
  });
});
