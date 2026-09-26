import { Injectable } from "@nestjs/common";

import {
  drawCompatibility,
  drawPrescription,
  drawSaju,
  drawTarot,
  drawTodayFortune,
  drawZodiac,
  getCharacters,
  type FortuneCharacter,
} from "../../../../../packages/core/src/fortune";
import { TITLES } from "../../../../../packages/core/src/catalog";

/**
 * Fortune calculations and character comic scripts are deterministic local content.
 * Optional AI restyling belongs to the browser BYOK layer; this service never reads or spends an
 * operator Gemini/OpenAI key. The core engine's authored fallback panels remain the authority.
 */
@Injectable()
export class FortuneService {
  getCharacters(): FortuneCharacter[] {
    return getCharacters();
  }

  drawTarot(
    characterId: string,
    cardIdx = 0,
    spread: "one" | "three" = "one",
  ) {
    return drawTarot(TITLES, characterId, cardIdx, spread);
  }

  drawSaju(
    birthDate: string,
    birthTime?: string,
    gender = "none",
    characterId = "ara",
  ) {
    return drawSaju(TITLES, birthDate, birthTime, gender, characterId);
  }

  drawTodayFortune(
    characterId: string,
    birthDate?: string,
    birthTime?: string,
    gender = "none",
  ) {
    return drawTodayFortune(
      TITLES,
      characterId,
      birthDate,
      birthTime,
      gender,
    );
  }

  drawCompatibility(
    myBirthDate: string,
    myBirthTime: string | undefined,
    partnerBirthDate: string,
    partnerBirthTime: string | undefined,
    characterId = "ara",
  ) {
    return drawCompatibility(
      TITLES,
      myBirthDate,
      myBirthTime,
      partnerBirthDate,
      partnerBirthTime,
      characterId,
    );
  }

  drawPrescription(query: string, characterId: string) {
    return drawPrescription(TITLES, query, characterId);
  }

  drawZodiac(characterId: string, month: number, day: number) {
    return drawZodiac(TITLES, characterId, month, day);
  }
}
