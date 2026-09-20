import { Module } from "@nestjs/common";

import { CreatorCareerController } from "../recruitment/career.controller";

import { CreatorMeetingController } from "../meeting/meeting.controller";

import { CreatorTeamController } from "../recruitment/team.controller";

import { HiringCampaignController } from "./hiring-campaign.controller";

import { HiringMatchingController } from "./hiring-matching.controller";

import { HiringSlotController } from "./hiring-slot.controller";

import { HiringController } from "./hiring.controller";

import { CollaborationController } from "./collaboration.controller";
import { HiringPositionController } from "./hiring-position.controller";

import { HiringAutomationController } from "./hiring-automation.controller";
import { HIRING_AUTOMATION_CONFIG, hiringAutomationConfig } from "./hiring-automation.config";
import { HiringAutomationRepository } from "./hiring-automation.repository";
import { HiringAutomationWorker } from "./hiring-automation.worker";
import { HiringStore } from "./hiring.store";
import type { HiringAutomationConfig } from "./hiring-automation.config";

@Module({ providers: [
  { provide: HIRING_AUTOMATION_CONFIG, useFactory: () => hiringAutomationConfig() },
  { provide: HiringAutomationRepository, inject: [HIRING_AUTOMATION_CONFIG], useFactory: (config: HiringAutomationConfig) => new HiringAutomationRepository(new HiringStore(), config) },
  { provide: HiringAutomationWorker, inject: [HiringAutomationRepository, HIRING_AUTOMATION_CONFIG], useFactory: (repo: HiringAutomationRepository, config: HiringAutomationConfig) => new HiringAutomationWorker(repo, config) },
], controllers: [HiringAutomationController, CollaborationController, HiringController, HiringSlotController, HiringMatchingController, HiringCampaignController, HiringPositionController, CreatorTeamController, CreatorMeetingController, CreatorCareerController] })
export class CollaborationModule {}
