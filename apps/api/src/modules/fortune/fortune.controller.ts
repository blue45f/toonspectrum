// apps/api/src/modules/fortune/fortune.controller.ts

import { randomUUID } from "node:crypto";

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Post,
} from "@nestjs/common";

import {
  CompatibilityDto,
  PrescriptionDto,
  SajuDto,
  TarotDto,
  TodayDto,
  ZodiacDto,
} from "./fortune.dto";
import { FortuneService } from "./fortune.service";
import {
  MEMBERSHIP_REWARD_SERVICE,
  type MembershipRewardService,
} from "../membership-wallet/membership-wallet.tokens";

@Controller("fortune")
export class FortuneController {
  constructor(
    @Inject(FortuneService)
    private readonly fortuneService: FortuneService,
    @Optional()
    @Inject(MEMBERSHIP_REWARD_SERVICE)
    private readonly membershipWallet?: MembershipRewardService,
  ) {}

  private async rewardFortuneUse(
    userId: string | undefined,
    mode: string,
  ): Promise<void> {
    if (!userId || !this.membershipWallet) return;
    try {
      await this.membershipWallet.grantActivityPoints({
        userId,
        activity: "fortune.used",
        sourceRef: randomUUID(),
        metadata: { mode },
      });
    } catch {
      // Fortune results stay available even if reward accounting is unavailable.
    }
  }

  // 페르소나 캐릭터 목록 조회
  @Get("characters")
  getCharacters() {
    return this.fortuneService.getCharacters();
  }

  // 타로 운세 뽑기
  @Post("tarot")
  @HttpCode(HttpStatus.OK)
  async drawTarot(
    @Body() body: TarotDto,
    @Headers("x-user-id") userId?: string,
  ) {
    const result = await this.fortuneService.drawTarot(
      body.characterId,
      body.cardIdx ?? 0,
      body.spread ?? "one",
    );
    await this.rewardFortuneUse(userId, "tarot");
    return result;
  }

  // 사주팔자 분석
  @Post("saju")
  @HttpCode(HttpStatus.OK)
  async drawSaju(
    @Body() body: SajuDto,
    @Headers("x-user-id") userId?: string,
  ) {
    const result = await this.fortuneService.drawSaju(
      body.birthDate,
      body.birthTime,
      body.gender,
      body.characterId,
    );
    await this.rewardFortuneUse(userId, "saju");
    return result;
  }

  // 오늘의 운세
  @Post("today")
  @HttpCode(HttpStatus.OK)
  async drawTodayFortune(
    @Body() body: TodayDto,
    @Headers("x-user-id") userId?: string,
  ) {
    const result = await this.fortuneService.drawTodayFortune(
      body.characterId,
      body.birthDate,
      body.birthTime,
      body.gender,
    );
    await this.rewardFortuneUse(userId, "today");
    return result;
  }

  // 궁합 분석
  @Post("compatibility")
  @HttpCode(HttpStatus.OK)
  async drawCompatibility(
    @Body() body: CompatibilityDto,
    @Headers("x-user-id") userId?: string,
  ) {
    const result = await this.fortuneService.drawCompatibility(
      body.myBirthDate,
      body.myBirthTime,
      body.partnerBirthDate,
      body.partnerBirthTime,
      body.characterId,
    );
    await this.rewardFortuneUse(userId, "compatibility");
    return result;
  }

  // 독서 처방전
  @Post("prescription")
  @HttpCode(HttpStatus.OK)
  async drawPrescription(
    @Body() body: PrescriptionDto,
    @Headers("x-user-id") userId?: string,
  ) {
    const result = await this.fortuneService.drawPrescription(
      body.query,
      body.characterId,
    );
    await this.rewardFortuneUse(userId, "prescription");
    return result;
  }

  // 별자리(서양 점성) 운세
  @Post("zodiac")
  @HttpCode(HttpStatus.OK)
  async drawZodiac(
    @Body() body: ZodiacDto,
    @Headers("x-user-id") userId?: string,
  ) {
    const result = await this.fortuneService.drawZodiac(
      body.characterId,
      body.month,
      body.day,
    );
    await this.rewardFortuneUse(userId, "zodiac");
    return result;
  }
}
