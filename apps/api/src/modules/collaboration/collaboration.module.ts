import { Module } from "@nestjs/common";

import { CollaborationController } from "./collaboration.controller";

@Module({ controllers: [CollaborationController] })
export class CollaborationModule {}
