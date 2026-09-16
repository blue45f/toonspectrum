import { Controller, Get, Header, HttpException, HttpStatus, Param } from "@nestjs/common";

import { isPolicySlug } from "../../../../../packages/core/src/legal-policy";

import { createPolicyResolver } from "./legal-policy-resolver";

const resolvePolicy = createPolicyResolver();

@Controller()
export class LegalController {
  @Get("/legal/policies/:slug")
  @Header("Cache-Control", "public, max-age=300, s-maxage=86400")
  async getPolicy(@Param("slug") slug: string) {
    if (!isPolicySlug(slug)) {
      throw new HttpException({ error: "policy_not_found" }, HttpStatus.NOT_FOUND);
    }
    return resolvePolicy(slug);
  }
}
