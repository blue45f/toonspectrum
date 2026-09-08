import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { requireAdminMutationActor } from "./admin-mutation-policy";
import { requireAdminUser } from "./admin-types";

interface AdminMutationRequest {
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class AdminMutationGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AdminMutationRequest>();
    const rawUserId = request.headers["x-user-id"];
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    if (!userId) throw new ForbiddenException("로그인이 필요해요.");

    const actor = await requireAdminUser(userId);
    requireAdminMutationActor(actor);
    return true;
  }
}
