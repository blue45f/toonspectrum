import { ForbiddenException } from "@nestjs/common";

/** Operators may inspect members, but only administrators may change access. */
export function requireMemberMutationAdmin(actor: { role: string }): void {
  if (actor.role !== "admin") {
    throw new ForbiddenException({
      error: "회원 권한과 계정 상태는 관리자만 변경할 수 있어요.",
    });
  }
}
