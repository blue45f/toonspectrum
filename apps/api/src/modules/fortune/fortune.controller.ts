// apps/api/src/modules/fortune/fortune.controller.ts

import { Controller, Get, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";

import {
  CompatibilityDto,
  PrescriptionDto,
  SajuDto,
  TarotDto,
  TodayDto,
  ZodiacDto,
} from "./fortune.dto";
import { FortuneService } from "./fortune.service";

@Controller("fortune")
export class FortuneController {
  constructor(private readonly fortuneService: FortuneService) {}

  // 페르소나 캐릭터 목록 조회
  @Get("characters")
  getCharacters() {
    return this.fortuneService.getCharacters();
  }

  // 타로 운세 뽑기
  @Post("tarot")
  @HttpCode(HttpStatus.OK)
  async drawTarot(@Body() body: TarotDto) {
    return this.fortuneService.drawTarot(body.characterId, body.cardIdx ?? 0);
  }

  // 사주팔자 분석
  @Post("saju")
  @HttpCode(HttpStatus.OK)
  async drawSaju(@Body() body: SajuDto) {
    return this.fortuneService.drawSaju(body.birthDate, body.birthTime, body.gender, body.characterId);
  }

  // 오늘의 운세
  @Post("today")
  @HttpCode(HttpStatus.OK)
  async drawTodayFortune(@Body() body: TodayDto) {
    return this.fortuneService.drawTodayFortune(body.characterId, body.birthDate, body.birthTime, body.gender);
  }

  // 궁합 분석
  @Post("compatibility")
  @HttpCode(HttpStatus.OK)
  async drawCompatibility(@Body() body: CompatibilityDto) {
    return this.fortuneService.drawCompatibility(
      body.myBirthDate,
      body.myBirthTime,
      body.partnerBirthDate,
      body.partnerBirthTime,
      body.characterId
    );
  }

  // 독서 처방전
  @Post("prescription")
  @HttpCode(HttpStatus.OK)
  async drawPrescription(@Body() body: PrescriptionDto) {
    return this.fortuneService.drawPrescription(body.query, body.characterId);
  }

  // 별자리(서양 점성) 운세
  @Post("zodiac")
  @HttpCode(HttpStatus.OK)
  async drawZodiac(@Body() body: ZodiacDto) {
    return this.fortuneService.drawZodiac(body.characterId, body.month, body.day);
  }
}
