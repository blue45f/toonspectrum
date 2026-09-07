import { ForbiddenException } from "@nestjs/common";

/**
 * Coarse safety boundary used while the capability model is introduced.
 * Operators retain read and moderation access; global, financial and security
 * mutations require the administrator role.
 */
export function requireAdminMutationActor(actor: { role: string }): void {
  if (actor.role !== "admin") {
    throw new ForbiddenException({
      error: "이 고위험 변경은 관리자만 실행할 수 있어요.",
    });
  }
}
