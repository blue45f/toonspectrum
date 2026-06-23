// apps/api/src/modules/fortune/fortune.service.ts

import { Injectable } from "@nestjs/common";

import { TITLES } from "../../../../../lib/server/catalog-store";

import { calculateSaju, SajuResult } from "./saju-utils";

import type { Title } from "../../../../../lib/types";

// 타로 카드 구조
export interface TarotCard {
  id: number;
  name: string;
  nameEn: string;
  type: "upright" | "reversed";
  keywords: string[];
  description: string;
}

// 에이전트 캐릭터 정보
export interface FortuneCharacter {
  id: string;
  name: string;
  origin: string; // 등장 웹툰
  greeting: string;
  avatarUrl: string;
}

const CHARACTERS: FortuneCharacter[] = [
  {
    id: "sung-jinwoo",
    name: "성진우",
    origin: "나 혼자만 레벨업",
    greeting: "이 정도 운세라면 네 스스로 개척할 수 있어. 굳이 운명에 기대지 마라.",
    avatarUrl: "/images/characters/sung-jinwoo.webp"
  },
  {
    id: "park-moondae",
    name: "박문대",
    origin: "데뷔 못 하면 죽는 병 걸림",
    greeting: "오늘 하루도 일단 생존해봅시다. 너무 크게 의미 부여는 하지 말고, 차분하게 가요.",
    avatarUrl: "/images/characters/park-moondae.webp"
  },
  {
    id: "cheong-myeong",
    name: "청명",
    origin: "화산귀환",
    greeting: "운명? 사주팔자? 핫하! 그까짓 거 칼 한번 휘둘러서 다 베어버리면 그만이지! 그래도 궁금해?",
    avatarUrl: "/images/characters/cheong-myeong.webp"
  },
  {
    id: "yoo-joonghyuk",
    name: "유중혁",
    origin: "전지적 독자 시점",
    greeting: "이번 회차의 운세인가... 듣고 싶다면 말해주마. 결말을 바꿀 수 있다면 말이지.",
    avatarUrl: "/images/characters/yoo-joonghyuk.webp"
  }
];

const TAROT_CARDS = [
  { id: 0, name: "광대", nameEn: "The Fool", keywords: ["시작", "자유", "모험", "무모함"] },
  { id: 1, name: "마법사", nameEn: "The Magician", keywords: ["창조", "재능", "기술", "자신감"] },
  { id: 2, name: "여사제", nameEn: "The High Priestess", keywords: ["직관", "지혜", "비밀", "침묵"] },
  { id: 3, name: "여황제", nameEn: "The Empress", keywords: ["풍요", "모성", "자연", "결실"] },
  { id: 4, name: "황제", nameEn: "The Emperor", keywords: ["권력", "질서", "지배", "책임"] },
  { id: 5, name: "교황", nameEn: "The Hierophant", keywords: ["전통", "교육", "동맹", "자비"] },
  { id: 6, name: "연인", nameEn: "The Lovers", keywords: ["사랑", "선택", "조화", "관계"] },
  { id: 7, name: "전차", nameEn: "The Chariot", keywords: ["돌진", "승리", "통제", "극복"] },
  { id: 8, name: "힘", nameEn: "Strength", keywords: ["인내", "용기", "부드러운 통제", "내면의 힘"] },
  { id: 9, name: "은둔자", nameEn: "The Hermit", keywords: ["성찰", "고독", "탐구", "길잡이"] },
  { id: 10, name: "운명의 수레바퀴", nameEn: "Wheel of Fortune", keywords: ["운명", "변화", "전환점", "순환"] },
  { id: 11, name: "정의", nameEn: "Justice", keywords: ["균형", "공정", "결정", "원인과 결과"] },
  { id: 12, name: "매달린 사람", nameEn: "The Hanged Man", keywords: ["희생", "관점의 전환", "정지", "인내"] },
  { id: 13, name: "죽음", nameEn: "Death", keywords: ["종결", "새로운 시작", "이별", "재생"] },
  { id: 14, name: "절제", nameEn: "Temperance", keywords: ["조화", "균형", "중용", "정화"] },
  { id: 15, name: "악마", nameEn: "The Devil", keywords: ["집착", "유혹", "속박", "물욕"] },
  { id: 16, name: "탑", nameEn: "The Tower", keywords: ["급격한 붕괴", "갑작스러운 변화", "해방", "충격"] },
  { id: 17, name: "별", nameEn: "The Star", keywords: ["희망", "영감", "치유", "미래"] },
  { id: 18, name: "달", nameEn: "The Moon", keywords: ["불안", "의혹", "무의식", "변덕"] },
  { id: 19, name: "태양", nameEn: "The Sun", keywords: ["성공", "기쁨", "활력", "명확함"] },
  { id: 20, name: "심판", nameEn: "Judgement", keywords: ["부활", "깨달음", "결단", "평가"] },
  { id: 21, name: "세계", nameEn: "The World", keywords: ["완성", "통합", "조화", "여행의 끝"] }
];

@Injectable()
export class FortuneService {
  getCharacters(): FortuneCharacter[] {
    return CHARACTERS;
  }

  // 타로 카드 뽑기 및 해석
  async drawTarot(characterId: string) {
    const character = CHARACTERS.find(c => c.id === characterId) || CHARACTERS[0];
    
    // 무작위 카드 1장 선택
    const randomCardBase = TAROT_CARDS[Math.floor(Math.random() * TAROT_CARDS.length)];
    const isReversed = Math.random() > 0.5;
    
    const card: TarotCard = {
      id: randomCardBase.id,
      name: randomCardBase.name,
      nameEn: randomCardBase.nameEn,
      type: isReversed ? "reversed" : "upright",
      keywords: isReversed 
        ? [...randomCardBase.keywords].reverse().map(kw => kw + "(장해/과잉)") 
        : randomCardBase.keywords,
      description: `${randomCardBase.name} 카드 (${isReversed ? "역방향" : "정방향"})`
    };

    // 장르 매칭
    const recommendedGenres = this.getGenresByTarot(card);
    const recommendations = this.curateTitles(recommendedGenres);

    // AI 해석 텍스트 생성
    let interpretation: string;
    try {
      interpretation = await this.generateAIFortune(
        `오늘의 타로 운세`,
        `뽑힌 카드: ${card.name} (${card.type === "upright" ? "정방향" : "역방향"})
        키워드: ${card.keywords.join(", ")}`,
        character
      );
    } catch (_e) {
      interpretation = this.getFallbackTarotInterpretation(card, character);
    }

    return {
      character,
      card,
      interpretation,
      recommendations
    };
  }

  // 사주 계산 및 해석
  async drawSaju(birthDate: string, birthTime?: string, gender = "none", characterId = "sung-jinwoo") {
    const character = CHARACTERS.find(c => c.id === characterId) || CHARACTERS[0];
    const sajuResult: SajuResult = calculateSaju(birthDate, birthTime);

    // 오행 강약 분석에 기반하여 추천 장르 도출
    // 예: 수(water)가 부족하면 판타지나 드라마, 목(wood)이 많으면 역동적인 액션 등
    const recommendedGenres = this.getGenresBySaju(sajuResult);
    const recommendations = this.curateTitles(recommendedGenres);

    // AI 해석 텍스트 생성
    let interpretation: string;
    try {
      const sajuText = `
        생년월일시: ${birthDate} ${birthTime || "시간 모름"} (${gender === "male" ? "남성" : "여성"})
        년주: ${sajuResult.yearPillar.kanKorean}${sajuResult.yearPillar.jiKorean} (${sajuResult.yearPillar.kan}${sajuResult.yearPillar.ji})
        월주: ${sajuResult.monthPillar.kanKorean}${sajuResult.monthPillar.jiKorean} (${sajuResult.monthPillar.kan}${sajuResult.monthPillar.ji})
        일주: ${sajuResult.dayPillar.kanKorean}${sajuResult.dayPillar.jiKorean} (${sajuResult.dayPillar.kan}${sajuResult.dayPillar.ji})
        시주: ${sajuResult.hourPillar.kanKorean}${sajuResult.hourPillar.jiKorean} (${sajuResult.hourPillar.kan}${sajuResult.hourPillar.ji})
        오행 비율: 목(${sajuResult.elementsRatio.wood}%), 화(${sajuResult.elementsRatio.fire}%), 토(${sajuResult.elementsRatio.earth}%), 금(${sajuResult.elementsRatio.metal}%), 수(${sajuResult.elementsRatio.water}%)
      `;
      interpretation = await this.generateAIFortune(
        `평생 사주 및 성향 분석`,
        sajuText,
        character
      );
    } catch (_e) {
      interpretation = this.getFallbackSajuInterpretation(sajuResult, character);
    }

    return {
      character,
      saju: sajuResult,
      interpretation,
      recommendations
    };
  }

  // LLM API를 사용하여 캐릭터 말투로 가공
  private async generateAIFortune(type: string, dataText: string, character: FortuneCharacter): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("No Gemini API key configured.");
    }

    const systemInstructions = `
      당신은 웹툰/웹소설의 캐릭터 '${character.name}' (출처: 《${character.origin}》) 입니다.
      사용자에게 '${type}' 결과를 해설해주는 상황입니다.
      
      반드시 다음 규칙을 준수하세요:
      1. 완전히 캐릭터 '${character.name}'의 페르소나, 성격, 어조, 핵심 대사의 뉘앙스를 반영하여 말하세요.
         - 성진우: 반말투, 시크하고 냉정하지만 든든한 조언, 혼잣말이나 그림자 군대 언급 가능.
         - 박문대: 기본 존댓말(하지만 딱딱한 비즈니스 톤), 현실적이고 드라이한 격려, "아이돌"이나 "상태창", "생존" 키워드 활용.
         - 청명: 반말투, 괄괄하고 성질내는 듯하지만 속 깊은 조언, "대가리를 깨버린다"거나 "화산", "도(道)", "당과" 언급 가능.
         - 유중혁: 극도의 저음 반말투, 비장하고 냉혹함, 회차나 성좌, 결말, 동료 언급 가능.
      2. 사용자에게 친근한 대화체로 풀어나가세요. 기계적인 명리학/타로 사전적 풀이를 줄줄 늘어놓지 마세요.
      3. 카피는 짧고 단정하며, 느낌표(!)를 남발하지 마세요. (청명 캐릭터의 호탕한 대사 일부 예외 제외)
      4. 한국어로 가독성 있게 줄바꿈을 포함하여 대화하듯이 3~4문단 정도로 답변을 반환해 주세요.
    `;

    const prompt = `
      ${dataText}
      
      위 결과를 바탕으로, 너의 캐릭터 스타일로 운세를 재미있고 통찰력 있게 설명해줘.
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
              parts: [{ text: prompt }]
            }
          ],
          systemInstruction: {
            parts: [{ text: systemInstructions }]
          },
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0.7
          }
        })
      }
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
  }

  // 타로 테마별 매칭 장르 도출
  private getGenresByTarot(card: TarotCard): string[] {
    const darkCards = [13, 15, 16, 18]; // 죽음, 악마, 탑, 달
    const brightCards = [3, 6, 17, 19, 21]; // 여황제, 연인, 별, 태양, 세계
    
    if (darkCards.includes(card.id)) {
      return ["스릴러", "액션", "미스터리", "아포칼립스"];
    } else if (brightCards.includes(card.id)) {
      return ["로맨스", "로판", "드라마", "일상"];
    } else {
      return ["판타지", "무협", "퓨전판타지", "현판"];
    }
  }

  // 사주 오행별 매칭 장르 도출
  private getGenresBySaju(saju: SajuResult): string[] {
    // 가장 강한 오행 혹은 부족한 오행 보완 장르 매치
    const ratios = saju.elementsRatio;
    const maxVal = Math.max(ratios.wood, ratios.fire, ratios.earth, ratios.metal, ratios.water);
    
    if (maxVal === ratios.fire) {
      return ["액션", "현판", "무협"]; // 열정적 에너지
    } else if (maxVal === ratios.water) {
      return ["스릴러", "미스터리", "SF"]; // 냉정하고 차분함
    } else if (maxVal === ratios.wood) {
      return ["일상", "성장", "스포츠", "드라마"]; // 성장과 자라남
    } else if (maxVal === ratios.metal) {
      return ["군상극", "느와르", "전쟁"]; // 단단하고 예리함
    } else {
      return ["판타지", "로판", "학원"]; // 포용하고 수렴함
    }
  }

  // 카탈로그 데이터 큐레이션 (추천 작품 3종 뽑기)
  private curateTitles(targetGenres: string[]): Title[] {
    if (!TITLES || TITLES.length === 0) return [];
    
    // 타겟 장르 중 하나 이상 포함하면서 평점이 높은 순으로 정렬하여 3개 선정
    const matched = TITLES.filter(t => t.genres.some(g => targetGenres.includes(g)))
      .sort((a, b) => {
        const ratingA = a.stats?.ratingAvg ?? 0;
        const ratingB = b.stats?.ratingAvg ?? 0;
        return ratingB - ratingA;
      });

    return matched.slice(0, 3);
  }

  // 로컬 폴백 해석: 타로
  private getFallbackTarotInterpretation(card: TarotCard, character: FortuneCharacter): string {
    const directionStr = card.type === "upright" ? "정방향" : "역방향";
    
    switch (character.id) {
      case "sung-jinwoo":
        return `흠, 네가 뽑은 카드는 ${card.name}(${directionStr})이군. \n\n` +
          `키워드는 [${card.keywords.join(", ")}]이다. 이 카드는 흐름을 바꾸라는 신호야. \n` +
          `너무 앞만 보고 달리다가는 그림자들도 널 지킬 수 없다. 조금 힘을 빼고 주위를 살펴봐라. \n` +
          `진짜 싸움은 다음 단계부터니까, 오늘 하루는 체력을 보존하도록 해.`;
      case "park-moondae":
        return `뽑으신 카드는 ${card.name}(${directionStr})이네요. \n\n` +
          `주요 키워드는 [${card.keywords.join(", ")}]입니다. \n` +
          `지금 상태창에 경고가 뜬 건 아니지만, 너무 과로하지 말라는 데이터입니다. \n` +
          `오늘 하루는 예정된 스케줄만 조용히 끝마치고 숙소에서 쉬는 걸 권합니다. 생존이 우선이니까요.`;
      case "cheong-myeong":
        return `이 녀석 봐라? ${card.name}(${directionStr}) 카드를 뽑았네! \n\n` +
          `이게 무슨 뜻이냐고? [${card.keywords.join(", ")}] 이란다. \n` +
          `녀석아, 대가리를 굴린다고 운명이 바뀌는 줄 알아? 그냥 네가 가진 도(道)를 믿고 앞만 보고 나아가면 되는 거야! \n` +
          `정 불안하면 화산에 시주나 넉넉히 하고 가거라! 핫하하!`;
      case "yoo-joonghyuk":
        return `${card.name}(${directionStr})...\n\n` +
          `키워드는 [${card.keywords.join(", ")}]. 쓸데없는 번민이 느껴지는군. \n` +
          `이 정도 시련에 흔들릴 생각이라면 당장 물러서라. \n` +
          `살고 싶다면 스스로의 칼끝을 믿어야 한다. 네가 무너지면, 이번 회차 역시 끝이니까.`;
      default:
        return `당신이 뽑은 카드는 ${card.name}(${directionStr})입니다.\n` +
          `이 카드는 오늘 당신에게 '${card.keywords[0]}'의 에너지가 강하게 흐르고 있음을 알려줍니다. 차분하고 지혜로운 선택을 하세요.`;
    }
  }

  // 로컬 폴백 해석: 사주
  private getFallbackSajuInterpretation(saju: SajuResult, character: FortuneCharacter): string {
    const dayPillarName = `${saju.dayPillar.kanKorean}${saju.dayPillar.jiKorean}`;
    const elementStrengths = `목(${saju.elementsRatio.wood}%), 화(${saju.elementsRatio.fire}%), 토(${saju.elementsRatio.earth}%), 금(${saju.elementsRatio.metal}%), 수(${saju.elementsRatio.water}%)`;

    switch (character.id) {
      case "sung-jinwoo":
        return `네 일주는 ${dayPillarName}이군. 오행 강도는 ${elementStrengths}다. \n\n` +
          `타고난 오행의 분포를 보니 성정이 단단하고 곧은 구석이 있어. \n` +
          `이런 사주는 한번 목표를 세우면 게이트가 열려도 포기하지 않는 강점이 있지만, 그만큼 스스로를 소모시키기도 쉽지. \n` +
          `때로는 유연하게 흐름에 몸을 맡기는 것도 강자가 취할 수 있는 선택지 중 하나다. 명심해라.`;
      case "park-moondae":
        return `사주상 일주가 ${dayPillarName}로 나오네요. 오행의 세부 밸런스는 ${elementStrengths}입니다. \n\n` +
          `사주 구성상 꽤 끈질기게 버티는 생명력이 높은 편이네요. 데뷔나 오디션 같은 큰 승부처에서 버텨낼 체력은 충분해 보입니다. \n` +
          `다만 오행 중 한쪽으로 에너지가 쏠리는 날엔 예민함이 배가 될 수 있으니 주의하세요. \n` +
          `주변 사람들과의 소통 스탯을 조금만 올려놓으면 불필요한 위기는 피할 수 있을 겁니다.`;
      case "cheong-myeong":
        return `네 일주가 ${dayPillarName}이라고? 오행은 ${elementStrengths}이고? \n\n` +
          `쯧쯧, 사주가 아주 고집불통이 따로 없구나! 마치 화산의 늙은이들 고집만큼이나 단단해! \n` +
          `하지만 말이다, 그 단단한 고집이 있어야 험난한 강호에서 살아남을 수 있는 법이지. \n` +
          `네 고집을 칼날처럼 갈고닦아서 세상에 들이대 보거라! 아주 시원하게 뚫릴 테니까!`;
      case "yoo-joonghyuk":
        return `사주 일주는 ${dayPillarName}, 오행은 ${elementStrengths}. \n\n` +
          `강인한 기운이 지배하고 있는 사주군. 나와 어딘가 닮아 있기도 하군. \n` +
          `그러나 너무 팽팽한 활시위는 부러지기 마련이다. \n` +
          `끝까지 살아남아 진짜 결말을 보고 싶다면, 네 안의 날선 기운을 다스릴 방법을 먼저 찾도록 해라.`;
      default:
        return `사주 일주는 ${dayPillarName}이며, 오행 분포는 ${elementStrengths}입니다. \n` +
          `조화와 균형이 중요한 명리적 흐름 속에서, 오늘 당신에게 딱 알맞은 장르의 웹툰을 추천해 드립니다.`;
    }
  }
}
