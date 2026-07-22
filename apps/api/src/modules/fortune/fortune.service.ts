// apps/api/src/modules/fortune/fortune.service.ts
//
// 운세 계산·명리·타로·별자리·콘티 파싱의 순수 엔진은 @toonspectrum/core/fortune 로
// 이전됐다(웹 앱·NestJS 백엔드 공유). 이 서비스는 NestJS @Injectable 래퍼로서,
//  1) 카탈로그(TITLES, core/server)와
//  2) Gemini LLM 가공기(process.env·fetch — 플랫폼 종속)
// 를 코어 엔진에 주입하기만 한다.

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
import { TITLES } from "../../../../../packages/core/src/server";

@Injectable()
export class FortuneService {
  getCharacters(): FortuneCharacter[] {
    return getCharacters();
  }

  drawTarot(characterId: string, cardIdx = 0, spread: "one" | "three" = "one") {
    return drawTarot(TITLES, characterId, cardIdx, spread, this.generateAIFortune);
  }

  drawSaju(birthDate: string, birthTime?: string, gender = "none", characterId = "ara") {
    return drawSaju(TITLES, birthDate, birthTime, gender, characterId, this.generateAIFortune);
  }

  drawTodayFortune(characterId: string, birthDate?: string, birthTime?: string, gender = "none") {
    return drawTodayFortune(TITLES, characterId, birthDate, birthTime, gender, this.generateAIFortune);
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
      this.generateAIFortune,
    );
  }

  drawPrescription(query: string, characterId: string) {
    return drawPrescription(TITLES, query, characterId, this.generateAIFortune);
  }

  drawZodiac(characterId: string, month: number, day: number) {
    return drawZodiac(TITLES, characterId, month, day, this.generateAIFortune);
  }

  // LLM API를 사용하여 캐릭터 말투로 가공(플랫폼 종속 — process.env·fetch). 코어 엔진에
  // 콜백으로 주입한다. 키가 없거나 실패하면 엔진이 결정적 폴백 콘티로 대체한다.
  // (화살표 프로퍼티 — this 바인딩 없이 콜백으로 넘기기 위함)
  private readonly generateAIFortune = async (
    type: string,
    dataText: string,
    character: FortuneCharacter,
  ): Promise<string> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("No Gemini API key configured.");
    }

    const systemInstructions = `
      당신은 ToonSpectrum의 오리지널 캐릭터 '${character.name}' 입니다.
      사용자에게 '${type}' 결과를 해설해주는 상황입니다.
      출력물은 화면에서 **세로 스크롤 웹툰(만화 콘티)** 으로 렌더링됩니다.

      ★ 가장 중요한 출력 형식 규칙 (반드시 준수):
      모든 답변을 예외 없이 아래 [웹툰 콘티 대본] 형식으로만 출력하세요. 일반 줄글 단락으로 쓰지 마세요.

        [1컷 - (장면·표정·동작을 짧고 생생하게 묘사)]
        ${character.name.split(" ").pop()}: "대사 (따옴표로 감쌀 것)"
        효과음: 두근두근   ← (선택) 컷 분위기를 살릴 의성어/의태어
        [2컷 - (다음 장면 묘사)]
        ${character.name.split(" ").pop()}: "대사"

      - 컷은 총 3~5개. 각 컷은 '[N컷 - 묘사]' 헤더로 시작하고, 그 아래 '이름: "대사"' 줄을 1~2개 둡니다.
      - 화면 가독성을 위해 한 대사는 1~2문장으로 짧게. 명리학/타로 사전식 나열 금지.
      - '효과음:' 줄은 컷마다 0~1개만, 짧게(예: 반짝, 휘익, 쿵, 두근두근).

      1. 캐릭터 '${character.name}'의 페르소나·말투를 100% 반영하세요.
         - 사서 아라: 차분하고 상냥한 경어체, 사려 깊은 카운셀러 톤. "책", "도서관", "기록", "페이지" 모티프.
         - 도깨비 단우: 활기찬 반말 장난꾸러기, 속은 다정한 형/오빠. "도깨비 방망이", "금은보화", "메밀묵" 모티프.
         - 점술가 레오나: 매혹적·신비로운 톤. "운명의 별빛", "은하수", "우주의 신호", "점괘" 모티프.
         - 검객 가온: 묵직·냉철·과묵한 무사 반말. 본질을 꿰뚫는 일침. "검(劍)", "바람", "수련" 모티프.
      2. 결과 데이터(운세 지수·오행·카드 등)를 대사 속에 자연스럽게 녹여 풀이하세요.
      3. '두 사람의 찰떡 궁합 분석'이면, 위 4명 중 1~2명을 더 등장시켜 서로 티키타카(대화)하게 만들어 재치 있는 궁합 콘티로 연출하세요.
      4. '독서 처방전'이면, 컷 안 대사를 고민을 어루만지는 따뜻하고 다정한 어조로(편지를 읽어주듯) 채우세요.
      5. 한국어로, 느낌표(!) 남발 금지(단우의 호탕한 일부 예외 제외).
    `;

    const prompt = `
      ${dataText}

      위 결과를 바탕으로, 너의 캐릭터 스타일로 운세를 재미있고 통찰력 있게 설명해줘.
      반드시 위에서 지정한 [웹툰 콘티 대본] 형식(컷 헤더 + 이름: "대사")으로만 출력해.
    `;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          systemInstruction: {
            parts: [{ text: systemInstructions }],
          },
          generationConfig: {
            maxOutputTokens: 1100,
            temperature: 0.8,
          },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
    }

    const json = await response.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Empty response from Gemini API.");
    }

    return text.trim();
  };
}
