import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Headers, Inject, Post } from "@nestjs/common";
import { ApplyOperationPolicySchema, PreviewOperationPolicySchema } from "./operation-policy.dto";
import { OperationPolicyRepository } from "./operation-policy.repository";

function actor(value?: string): string {
  if (!value) throw new ForbiddenException("로그인이 필요합니다.");
  return value;
}
@Controller()
export class OperationPolicyController {
  constructor(@Inject(OperationPolicyRepository) private readonly repository: OperationPolicyRepository) {}
  @Get("/production/operation-policy")
  @Header("Cache-Control", "private, no-store")
  publicPolicy(@Headers("x-user-id") userId?: string) { return this.repository.publicPolicy(actor(userId)); }
  @Get("/admin/production/operation-policy")
  @Header("Cache-Control", "private, no-store")
  read(@Headers("x-user-id") userId?: string) { return this.repository.read(actor(userId)); }
  @Post("/admin/production/operation-policy/preview")
  @Header("Cache-Control", "private, no-store")
  preview(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const parsed = PreviewOperationPolicySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("운영 정책의 형식과 한도를 확인해주세요.");
    return this.repository.preview(actor(userId), parsed.data);
  }
  @Post("/admin/production/operation-policy/apply")
  @Header("Cache-Control", "private, no-store")
  apply(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const parsed = ApplyOperationPolicySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("미리보기와 변경 사유를 확인해주세요.");
    return this.repository.apply(actor(userId), parsed.data);
  }
}
