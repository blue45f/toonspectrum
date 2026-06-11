import { Controller, Get, Header, HttpException, HttpStatus, Param } from "@nestjs/common";

const TERMSDESK_BASE = "https://termsdesk.vercel.app";
const TERMSDESK_ORG_SLUG = "webtoon-index";
const ALLOWED_POLICY_SLUGS = new Set(["terms-of-service", "privacy-policy"]);

function termsdeskPolicyUrl(slug: string): string {
  return `${TERMSDESK_BASE}/api/public/${TERMSDESK_ORG_SLUG}/policies/${encodeURIComponent(slug)}`;
}

@Controller()
export class LegalController {
  @Get("/legal/policies/:slug")
  @Header("Cache-Control", "no-store, max-age=0")
  async getPolicy(@Param("slug") slug: string) {
    if (!ALLOWED_POLICY_SLUGS.has(slug)) {
      throw new HttpException({ error: "policy_not_found" }, HttpStatus.NOT_FOUND);
    }

    try {
      const response = await fetch(termsdeskPolicyUrl(slug), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new HttpException(
          { error: `policy_fetch_failed:${response.status}` },
          HttpStatus.BAD_GATEWAY
        );
      }
      return response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "policy_fetch_failed" }, HttpStatus.BAD_GATEWAY);
    }
  }
}
