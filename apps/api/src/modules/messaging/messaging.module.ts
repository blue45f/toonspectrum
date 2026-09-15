import { Module } from "@nestjs/common";

import { MessagingController } from "./messaging.controller";
import { messagingRepositoryProvider } from "./messaging.repository";
import { MessagingService } from "./messaging.service";

@Module({
  controllers: [MessagingController],
  providers: [messagingRepositoryProvider, MessagingService],
})
export class MessagingModule {}
