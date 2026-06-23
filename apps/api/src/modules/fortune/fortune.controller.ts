// apps/api/src/modules/fortune/fortune.controller.ts

import { Controller, Get, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";

import { FortuneService } from "./fortune.service";

export interface TarotRequest {
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
}
