// apps/api/src/modules/fortune/fortune.controller.ts

import { Controller, Get, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";

import { FortuneService } from "./fortune.service";

export interface TarotRequest {
  characterId: string;
}

export interface TodayFortuneRequest {
  characterId: string;
  birthDate?: string; // YYYY-MM-DD (선택: 입력 시 사주 기반 개인화)
  birthTime?: string; // HH:MM
  gender?: string; // "male" | "female" | "none"
}

export interface CompatibilityRequest {
  myBirthDate: string;
  myBirthTime?: string;
  partnerBirthDate: string;
  partnerBirthTime?: string;
  characterId: string;
}

export interface PrescriptionRequest {
  query: string;
  characterId: string;
}

export interface SajuRequest {
  birthDate: string; // YYYY-MM-DD
  birthTime?: string; // HH:MM
  gender?: string; // "male" | "female" | "none"
  characterId: string;
}

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
  async drawTarot(@Body() body: TarotRequest) {
    return this.fortuneService.drawTarot(body.characterId);
  }

  // 사주팔자 분석
  @Post("saju")
  @HttpCode(HttpStatus.OK)
  async drawSaju(@Body() body: SajuRequest) {
    return this.fortuneService.drawSaju(
      body.birthDate,
      body.birthTime,
      body.gender,
      body.characterId
    );
  }

  // 오늘의 운세
  @Post("today")
  @HttpCode(HttpStatus.OK)
  async drawTodayFortune(@Body() body: TodayFortuneRequest) {
    return this.fortuneService.drawTodayFortune(
      body.characterId,
      body.birthDate,
      body.birthTime,
      body.gender
    );
  }

  // 궁합 분석
  @Post("compatibility")
  @HttpCode(HttpStatus.OK)
  async drawCompatibility(@Body() body: CompatibilityRequest) {
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
  async drawPrescription(@Body() body: PrescriptionRequest) {
    return this.fortuneService.drawPrescription(body.query, body.characterId);
  }
}
