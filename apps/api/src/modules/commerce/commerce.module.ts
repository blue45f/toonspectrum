import { Module } from "@nestjs/common";

import { AdminMutationGuard } from "../admin/admin-mutation.guard";
import { CommerceController } from "./commerce.controller";
import { CommerceService } from "./commerce.service";

@Module({
  controllers: [CommerceController],
  providers: [CommerceService, AdminMutationGuard],
  exports: [CommerceService],
})
export class CommerceModule {}
