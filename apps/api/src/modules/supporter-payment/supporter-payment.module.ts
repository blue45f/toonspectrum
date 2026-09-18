import { Module } from "@nestjs/common";

import { SupporterPaymentController } from "./supporter-payment.controller";
import { SupporterPaymentService } from "./supporter-payment.service";

@Module({
  controllers: [SupporterPaymentController],
  providers: [SupporterPaymentService],
})
export class SupporterPaymentModule {}
