import { Controller, Get, Header, HttpException, HttpStatus, Logger, Param } from "@nestjs/common";

import { isPolicySlug } from "../../../../../packages/core/src/legal-policies.js";
import { createLegalPolicyResolver } from "./legal-policy-resolver.js";

@Controller()
export class LegalController {
  private readonly logger = new Logger(LegalController.name);
  private readonly resolvePolicy = createLegalPolicyResolver({
    onFallback: (slug, failure) => {
      this.logger.warn({ event: "legal_policy_upstream_unavailable", slug, ...failure });
    },
  });

  @Get("/legal/policies/:slug")
  @Header("Cache-Control", "no-store, max-age=0")
  async getPolicy(@Param("slug") slug: string) {
    if (!isPolicySlug(slug)) {
      throw new HttpException({ error: "policy_not_found" }, HttpStatus.NOT_FOUND);
    }
    return this.resolvePolicy(slug);
  }
}
