import { Module } from "@nestjs/common";
import { PromotionController } from "./promotion.controller";
@Module({ controllers: [PromotionController] })
export class PromotionModule {}
