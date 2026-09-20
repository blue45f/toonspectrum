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

@Module({ controllers: [CollaborationController, HiringController, HiringSlotController, HiringMatchingController, HiringCampaignController, HiringPositionController, CreatorTeamController, CreatorMeetingController, CreatorCareerController] })
export class CollaborationModule {}
