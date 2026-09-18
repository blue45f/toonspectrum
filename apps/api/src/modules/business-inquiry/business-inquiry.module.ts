import { Module } from "@nestjs/common";

import { BusinessInquiryController } from "./business-inquiry.controller";
import { BusinessInquiryService } from "./business-inquiry.service";

@Module({
  controllers: [BusinessInquiryController],
  providers: [BusinessInquiryService],
})
export class BusinessInquiryModule {}
