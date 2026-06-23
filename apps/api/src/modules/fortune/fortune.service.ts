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
    id: "ara",
    name: "사서 아라",
    origin: "ToonSpectrum",
    greeting: "어서 오세요. 당신의 운명이 적힌 기록을 찾고 계셨나요? 차분하게 한 장씩 읽어드릴게요.",
    avatarUrl: "/images/characters/ara.jpg"
  },
  {
    id: "danwoo",
    name: "도깨비 단우",
    origin: "ToonSpectrum",
    greeting: "오호라, 인간이 내 소문을 듣고 찾아왔나? 오늘 네 운이 대박인지 쪽박인지 내가 한번 봐주지!",
    avatarUrl: "/images/characters/danwoo.jpg"
  },
  {
    id: "leona",
    name: "점술가 레오나",
    origin: "ToonSpectrum",
    greeting: "별들이 오늘 밤 유난히 반짝이네요. 당신의 별자리가 가리키는 미래를 엿볼 준비가 되셨나요?",
    avatarUrl: "/images/characters/leona.jpg"
  },
  {
    id: "gaon",
    name: "검객 가온",
    origin: "ToonSpectrum",
    greeting: "운명 따위, 칼 한 자루로 베어버릴 뿐. 하지만 굳이 길을 묻겠다면 검끝이 가리키는 곳을 말해주지.",
    avatarUrl: "/images/characters/gaon.jpg"
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
  async drawSaju(birthDate: string, birthTime?: string, gender = "none", characterId = "ara") {
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
      당신은 ToonSpectrum의 오리지널 캐릭터 '${character.name}' 입니다.
      사용자에게 '${type}' 결과를 해설해주는 상황입니다.
      
      반드시 다음 규칙을 준수하세요:
      1. 완전히 캐릭터 '${character.name}'의 페르소나, 성격, 어조, 핵심 대사의 뉘앙스를 반영하여 말하세요.
         - 사서 아라: 차분하고 상냥한 경어체. 지혜롭고 사려 깊은 카운셀러 톤. "책", "도서관", "기록", "페이지" 등의 단어를 활용해 운세를 기록을 읽어주듯이 설명.
         - 도깨비 단우: 친근하고 장난꾸러기 같은 활기찬 반말투. 가끔 심술을 부리는 척하지만 속은 다정한 오빠/형 같은 조언. "도깨비 방망이", "금은보화", "장난", "메밀묵" 언급.
         - 점술가 레오나: 매혹적이고 신비로운 반말/존댓말 혼용 톤. 우주와 별의 흐름을 읽는 점술가의 기품. "운명의 별빛", "은하수", "우주의 신호", "점괘" 언급.
         - 검객 가온: 묵직하고 냉철하며 과묵한 무사 어조(반말투). 불필요한 사설은 배제하고 본질을 꿰뚫는 뼈 때리는 격려와 일침. "검(劍)", "바람", "수련", "흔들리지 않는 마음" 언급.
      2. 사용자에게 친근한 대화체로 풀어나가세요. 기계적인 명리학/타로 사전적 풀이를 줄줄 늘어놓지 마세요.
      3. 카피는 짧고 단정하며, 느낌표(!)를 남발하지 마세요. (단우 캐릭터의 호탕한 대사 일부 예외 제외)
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
      case "ara":
        return `이곳 책장의 먼지 쌓인 페이지 속에서 당신의 미래를 찾아냈어요. 뽑으신 카드는 ${card.name}(${directionStr})이네요. \n\n` +
          `기록된 키워드는 [${card.keywords.join(", ")}]입니다. \n` +
          `인생이라는 한 권의 책에서 이 구절은 잠시 숨을 고르라는 조언을 해주고 있어요. \n` +
          `너무 급하게 페이지를 넘기지 않아도, 다음 이야기는 충분히 멋지게 펼쳐질 테니 마음을 편히 가지세요.`;
      case "danwoo":
        return `오호라! 네가 뽑은 카드가 ${card.name}(${directionStr})이네? \n\n` +
          `이 카드의 기운은 [${card.keywords.join(", ")}] 이란다. \n` +
          `금은보화가 가득 찬 보물 상자를 열기 전 같은 설렘과 장난기가 어른거리네. \n` +
          `너무 머리 굴리며 걱정하지 말고, 내 도깨비 방망이를 믿고 신나게 한 판 놀아보는 건 어때? 뚝딱!`;
      case "leona":
        return `별빛이 가리키는 방향을 따라가 보니, 당신을 기다리던 카드는 ${card.name}(${directionStr})이었군요. \n\n` +
          `우주가 보낸 신호는 [${card.keywords.join(", ")}]입니다. \n` +
          `은하수의 흐름은 때로 우리를 혼란스럽게 만들지만, 결국 당신만의 고유한 궤도를 찾게 해줄 거예요. \n` +
          `스스로의 직관과 별의 계시를 조금 더 신뢰해 보세요.`;
      case "gaon":
        return `${card.name}(${directionStr})...\n\n` +
          `검끝을 스쳐 지나가는 바람 같은 키워드들이군. 바로 [${card.keywords.join(", ")}]. \n` +
          `검을 쥘 때 불필요한 망설임이 있으면 상대를 벨 수 없는 법. \n` +
          `당신의 칼날이 흔들리지 않도록 오늘만큼은 마음의 중심을 굳건히 잡고 눈앞의 수련에만 집중하게.`;
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
      case "ara":
        return `당신의 태어난 날은 ${dayPillarName} 일주이고, 기운의 성질은 ${elementStrengths}로 구성되어 있네요. \n\n` +
          `도서관의 서가 깊은 곳에 있는 오래된 고서의 구성처럼 조화롭고 차분한 결을 지니고 계세요. \n` +
          `스스로의 생각을 한 자 한 자 올바르게 적어 나가는 지혜가 돋보이는 사주입니다. \n` +
          `때로 기운이 한쪽으로 치우쳐 답답함이 느껴질 땐, 잠시 책장을 덮고 신선한 공기를 마시며 흐름을 환기해 보세요.`;
      case "danwoo":
        return `야아! 네 일주는 ${dayPillarName}고, 오행 비율은 ${elementStrengths}로 나왔어! \n\n` +
          `어쩐지 사주에서부터 도깨비 소굴에 놀러 온 것 같은 왁자지껄하고 재미있는 활기가 느껴지더라니! \n` +
          `너같이 에너지가 넘치고 흥겨운 사주는 가만히 있으면 오히려 병이 생겨. \n` +
          `오늘 하루는 신나게 움직이고, 좋아하는 사람들과 맛있는 메밀묵이라도 나눠 먹으며 복을 불러와 보라고!`;
      case "leona":
        return `당신의 사주 운판을 펼쳐 보니 ${dayPillarName} 일주가 빛나고 있군요. 오행의 은하수는 ${elementStrengths}의 비율을 이룹니다. \n\n` +
          `밤하늘에 수놓아진 별자리들처럼 신비로운 기운이 골고루 조화를 이루고 있어요. \n` +
          `직관력이 무척 뛰어나며 타인의 감정을 읽는 탁월한 영감을 가진 별자리입니다. \n` +
          `자신의 감정 스펙트럼이 너무 휘청이지 않도록, 깊은 밤 우주의 점괘가 전하는 평온함을 마음속에 품어 보세요.`;
      case "gaon":
        return `태어난 기운은 ${dayPillarName} 일주, 오행은 ${elementStrengths}이다. \n\n` +
          `마치 차갑게 벼려진 강철 검 같은 예리함과 묵직함이 고스란히 묻어나는 사주군. \n` +
          `칼날이 강할수록 꺾이기 쉬우니, 강함을 유지하려면 역설적이게도 유연함을 함께 훈련해야 한다. \n` +
          `오늘 하루, 검끝에 날을 세우기보다 부드러운 바람처럼 유연한 마음가짐을 먼저 가다듬는 검객이 되길 바란다.`;
      default:
        return `사주 일주는 ${dayPillarName}이며, 오행 분포는 ${elementStrengths}입니다. \n` +
          `조화와 균형이 중요한 명리적 흐름 속에서, 오늘 당신에게 딱 알맞은 장르의 웹툰을 추천해 드립니다.`;
    }
  }
}
