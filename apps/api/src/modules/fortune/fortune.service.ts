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

export interface TodayFortuneResult {
  score: number;
  color: string;
  direction: string;
  time: string;
  luckyNumber: number;
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
         - 단, '두 사람의 찰떡 궁합 분석' 결과일 경우에는 일반 줄글 설명 대신 반드시 [웹툰/만화 시나리오 대본 연출] 형식으로 출력하세요.
           * 포맷 예시:
             [1컷 - (장면 및 동작 묘사)]
             캐릭터이름: "대사"
             [2컷 - (장면 및 동작 묘사)]
             다른캐릭터이름: "대사"
           * 사서 아라, 도깨비 단우, 점술가 레오나, 검객 가온 중 최소 1~2명의 ToonSpectrum 오리지널 캐릭터들을 서로 대화하게(티키타카) 하여 두 사람의 궁합을 재치 있게 만화 콘티처럼 해석해 주세요.
         - 단, '독서 처방전' 결과일 경우에는 고민에 귀 기울이고 상처를 어루만지는 듯한 [책 처방 에세이 편지] 형식으로 따뜻하고 다정하게 출력하세요.
           * 포맷 예시:
             "친애하는 당신에게,
             보내주신 고민('고민내용')을 읽으며 당신의 마음 한편에 가라앉은 잔잔한 그늘을 보았습니다.
             오늘 당신의 서가에서 꺼내드리고 싶은 책은..."
           * 고민의 유형(힐링, 우울, 액션 필요 등)에 어울리는 ToonSpectrum 추천 장르와 함께 왜 이 책이 당신에게 위로가 되는지 캐릭터의 관점에서 진심 어린 에세이처럼 적어주세요.
      2. 사용자에게 친근한 대화체로 풀어나가세요. 기계적인 명리학/타로 사전적 풀이를 줄줄 늘어놓지 마세요.
      3. 카피는 짧고 단정하며, 느낌표(!)를 남발하지 마세요. (단우 캐릭터의 호탕한 대사 일부 예외 제외)
      4. 한국어로 가독성 있게 줄바꿈을 포함하여 대화하듯이 3~4문단 정도로 답변을 반환해 주세요. (궁합 콘티의 경우 컷당 줄바꿈을 적용해 주세요)
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

  // 오늘의 운세 보기
  async drawTodayFortune(characterId: string) {
    const character = CHARACTERS.find(c => c.id === characterId) || CHARACTERS[0];
    
    // 오늘의 운세 지수 및 행운 요소 생성
    const score = Math.floor(Math.random() * 41) + 60; // 60~100 사이의 점수
    const colors = ["금색", "보라색", "청록색", "검은색", "붉은색", "은색", "주황색", "푸른색"];
    const directions = ["동쪽", "서쪽", "남쪽", "북쪽", "남동쪽", "북동쪽", "남서쪽", "북서쪽"];
    const times = ["오전 07시 ~ 09시", "오전 10시 ~ 12시", "오후 01시 ~ 03시", "오후 04시 ~ 06시", "오후 07시 ~ 09시", "오후 10시 ~ 12시"];
    const luckyNumber = Math.floor(Math.random() * 10);

    const todayData: TodayFortuneResult = {
      score,
      color: colors[Math.floor(Math.random() * colors.length)],
      direction: directions[Math.floor(Math.random() * directions.length)],
      time: times[Math.floor(Math.random() * times.length)],
      luckyNumber
    };

    // 장르 매칭 (운세 지수에 따라 매칭)
    let recommendedGenres = ["일상", "드라마", "로맨스"];
    if (score < 75) {
      recommendedGenres = ["액션", "스릴러", "느와르"];
    } else if (score < 90) {
      recommendedGenres = ["판타지", "현판", "성장"];
    }

    const recommendations = this.curateTitles(recommendedGenres);

    // AI 해석 텍스트 생성
    let interpretation: string;
    try {
      const todayText = `
        오늘의 종합 운세 지수: ${score}%
        행운의 컬러: ${todayData.color}
        행운의 방향: ${todayData.direction}
        행운의 시간: ${todayData.time}
        행운의 숫자: ${todayData.luckyNumber}
      `;
      interpretation = await this.generateAIFortune(
        `오늘의 종합 운세`,
        todayText,
        character
      );
    } catch (_e) {
      interpretation = this.getFallbackTodayInterpretation(todayData, character);
    }

    return {
      character,
      today: todayData,
      interpretation,
      recommendations
    };
  }

  private getFallbackTodayInterpretation(data: TodayFortuneResult, character: FortuneCharacter): string {
    switch (character.id) {
      case "ara":
        return `오늘 당신의 하루는 ${data.score}%의 맑은 기운으로 가득 차 있네요. \n\n` +
          `행운을 보존해 줄 색상은 '${data.color}'이고, 추천하는 행운의 방향은 '${data.direction}'입니다. \n` +
          `특히 '${data.time}' 즈음에 소소하게 기쁜 소식이 찾아올 수 있어요. 숫자는 '${data.luckyNumber}'이 도움을 주네요. \n` +
          `차분히 차 한 잔 마시며 오늘 하루의 책장을 우아하게 넘겨 나가 보길 바랍니다.`;
      case "danwoo":
        return `야아! 대박이네! 오늘 네 하루 운세 점수는 무려 ${data.score}점이야! \n\n` +
          `오늘의 행운 컬러인 '${data.color}' 계열 옷을 입거나 소품을 챙겨봐! 행운의 방향은 '${data.direction}'이란다! \n` +
          `특히 '${data.time}'에 도깨비 요술 같은 행운이 뚝딱 솟아날지 몰라. 행운의 숫자 '${data.luckyNumber}'도 잘 기억해둬! \n` +
          `신나고 장난 가득한 하루를 마음껏 즐겨봐!`;
      case "leona":
        return `오늘 우주의 별자리가 가리키는 당신의 운세 지수는 ${data.score}%입니다. \n\n` +
          `밤하늘에서 당신을 지켜주는 행운의 빛은 '${data.color}'이며, 에너지가 솟아나는 방향은 '${data.direction}'입니다. \n` +
          `특히 '${data.time}' 사이에 우주의 긍정적인 파동이 가장 크게 울리겠네요. 행운의 기호는 숫자 '${data.luckyNumber}'입니다. \n` +
          `별의 신호가 당신의 앞길을 밝혀주기를.`;
      case "gaon":
        return `오늘 하루, 당신의 마음가짐 지수는 ${data.score}%다. 꽤 훌륭하군. \n\n` +
          `마음을 가라앉히는 행운의 기운은 '${data.color}', 검끝이 향해야 할 운명의 방향은 '${data.direction}'이다. \n` +
          `특히 '${data.time}'에 당신의 수련이나 노력이 빛을 발할 시간이 될 것이니 주의 깊게 관찰하게. 행운의 숫자는 '${data.luckyNumber}'이다. \n` +
          `흔들리지 말고 단단하게 나아가라.`;
      default:
        return `오늘 당신의 하루 운세 지수는 ${data.score}%입니다. \n` +
          `행운의 컬러는 '${data.color}', 행운의 방향은 '${data.direction}', 시간대는 '${data.time}'입니다. 편안한 하루 보내세요.`;
    }
  }

  // 궁합 계산 및 해석
  async drawCompatibility(myBirthDate: string, myBirthTime: string | undefined, partnerBirthDate: string, partnerBirthTime: string | undefined, characterId = "ara") {
    const character = CHARACTERS.find(c => c.id === characterId) || CHARACTERS[0];
    
    const mySaju: SajuResult = calculateSaju(myBirthDate, myBirthTime);
    const partnerSaju: SajuResult = calculateSaju(partnerBirthDate, partnerBirthTime);

    // 상성 적합도 계산 (기본 70점에서 시작하여 오행 밸런스에 따라 가감)
    const myRatio = mySaju.elementsRatio;
    const partnerRatio = partnerSaju.elementsRatio;
    let compatibilityScore = 70;
    
    const woodFireShare = Math.min(myRatio.wood, partnerRatio.fire) + 
                         Math.min(myRatio.fire, partnerRatio.earth) + 
                         Math.min(myRatio.earth, partnerRatio.metal) + 
                         Math.min(myRatio.metal, partnerRatio.water) + 
                         Math.min(myRatio.water, partnerRatio.wood);
    
    compatibilityScore += Math.floor(woodFireShare / 5);
    if (compatibilityScore > 100) compatibilityScore = 100;
    if (compatibilityScore < 50) compatibilityScore = 50;

    const targetGenres = ["로맨스", "로판", "드라마"];
    const recommendations = this.curateTitles(targetGenres);

    // AI 해석 텍스트 생성
    let interpretation: string;
    try {
      const compatText = `
        나의 사주 일주: ${mySaju.dayPillar.kanKorean}${mySaju.dayPillar.jiKorean} (${mySaju.elementsRatio.wood}% 목, ${mySaju.elementsRatio.fire}% 화, ${mySaju.elementsRatio.earth}% 토, ${mySaju.elementsRatio.metal}% 금, ${mySaju.elementsRatio.water}% 수)
        상대방의 사주 일주: ${partnerSaju.dayPillar.kanKorean}${partnerSaju.dayPillar.jiKorean} (${partnerSaju.elementsRatio.wood}% 목, ${partnerSaju.elementsRatio.fire}% 화, ${partnerSaju.elementsRatio.earth}% 토, ${partnerSaju.elementsRatio.metal}% 금, ${partnerSaju.elementsRatio.water}% 수)
        두 사람의 궁합 조화 지수: ${compatibilityScore}%
      `;
      interpretation = await this.generateAIFortune(
        `두 사람의 찰떡 궁합 분석`,
        compatText,
        character
      );
    } catch (_e) {
      interpretation = this.getFallbackCompatibilityInterpretation(compatibilityScore, character);
    }

    return {
      character,
      mySaju,
      partnerSaju,
      score: compatibilityScore,
      interpretation,
      recommendations
    };
  }

  private getFallbackCompatibilityInterpretation(score: number, character: FortuneCharacter): string {
    switch (character.id) {
      case "ara":
        return `[1컷 - 도서관 구석에서 책을 얹어두고 미소 짓는 사서 아라]\n` +
          `아라: "두 분의 생년월일이 적힌 기록지를 함께 포개어 보았어요. 서로 포근하게 겹치는 부분이 무척 아름답네요."\n\n` +
          `[2컷 - 장난스레 아라 머리맡으로 뛰어내리는 도깨비 단우]\n` +
          `단우: "어디 어디? 우와, 궁합 지수가 ${score}%나 되네! 이 정도면 방망이 뚝딱 안 해도 알아서 달달하게 잘 놀겠구먼!"\n\n` +
          `[3컷 - 차분히 찻잔을 내려놓는 아라]\n` +
          `아라: "맞아요, 단우 씨. 서로 부족한 기운을 채워주며 한 편의 예쁜 성장 웹툰 같은 관계를 이어갈 수 있는 좋은 궁합이랍니다."`;
      case "danwoo":
        return `[1컷 - 도깨비 방망이를 어깨에 얹고 흐뭇하게 웃는 단우]\n` +
          `단우: "으하하! 너희 둘의 오행 기운을 냄비에 넣고 끓여봤는데 상성이 아주 펄펄 끓는다! 궁합 지수는 ${score}%!"\n\n` +
          `[2컷 - 옆에서 팔짱을 끼고 한숨을 푹 쉬는 검객 가온]\n` +
          `가온: "조용히 해라, 도깨비. 시끄럽다. 하지만... 두 사람의 기운이 서로 검과 방패처럼 든든해 보이는 건 사실이군."\n\n` +
          `[3컷 - 가온의 어깨를 툭 치며 웃는 단우]\n` +
          `단우: "그렇지? 가끔 사소한 장난으로 투덕거려도 결국 찰떡같이 붙어 다닐 녀석들이니까 걱정 붙들어 매라고!"`;
      case "leona":
        return `[1컷 - 신비로운 보랏빛 점술 테이블 위에 타로 카드를 부채꼴로 펼치는 레오나]\n` +
          `레오나: "두 분의 사주 은하수가 서로를 향해 부드러운 궤도를 그리며 수렴하고 있어요. 조화율은 ${score}%..."\n\n` +
          `[2컷 - 책장을 넘기며 안경을 고쳐 쓰는 사서 아라]\n` +
          `아라: "도서관 고서에 적힌 조화의 흐름과도 정확히 일치하네요. 상생의 기운이 아주 맑게 흐르고 있습니다."\n\n` +
          `[3컷 - 별자리를 가리키며 매혹적으로 웃는 레오나]\n` +
          `레오나: "맞아요. 가끔 은하수의 폭풍이 불더라도 두 분은 별빛처럼 서로를 구원해 줄 운명적인 소울메이트가 될 거예요."`;
      case "gaon":
        return `[1컷 - 검을 천천히 칼집에 꽂으며 눈을 감는 검객 가온]\n` +
          `가온: "두 사람의 운명의 궤적을 베어 내어 나란히 놓아 보았다. 부딪힘 없이 물 흐르듯 어우러지는군. 궁합 지수 ${score}%."\n\n` +
          `[2컷 - 수정구를 들여다보며 유쾌하게 윙크하는 점술가 레오나]\n` +
          `레오나: "어머, 가온이 웬일로 칭찬을 다 하네? 맞아, 두 사람의 합은 아주 화려하고 뜨거운 로맨스 웹툰의 정석 같은 상성이야."\n\n` +
          `[3컷 - 눈을 살며시 뜨고 앞을 응시하는 가온]\n` +
          `가온: "흥, 시끄러운 점술가 같으니. 하지만... 서로의 검끝이 흔들릴 때 든든한 바람이 되어줄 귀한 인연임은 분명하다. 소중히 다스려라."`;
      default:
        return `[1컷 - 운세를 풀이하는 캐릭터 에이전트]\n` +
          `에이전트: "두 분의 궁합 지수는 ${score}%입니다. 서로 양보하고 존중한다면 아주 훌륭한 관계를 유지할 수 있습니다."`;
    }
  }

  // 독서 처방전 분석 및 추천
  async drawPrescription(query: string, characterId: string) {
    const character = CHARACTERS.find(c => c.id === characterId) || CHARACTERS[0];

    // 고민 텍스트 분류를 통한 추천 장르 간이 매칭
    let recommendedGenres = ["일상", "드라마", "치유"];
    if (query.includes("우울") || query.includes("슬픈") || query.includes("울고") || query.includes("외롭")) {
      recommendedGenres = ["로맨스", "성장", "드라마"];
    } else if (query.includes("가벼운") || query.includes("시원한") || query.includes("웃고") || query.includes("킬링")) {
      recommendedGenres = ["개그", "일상", "판타지"];
    } else if (query.includes("스트레스") || query.includes("화나") || query.includes("답답") || query.includes("액션")) {
      recommendedGenres = ["액션", "무협", "학원"];
    }

    const recommendations = this.curateTitles(recommendedGenres);

    // AI 처방전 생성
    let interpretation: string;
    try {
      const dataText = `
        사용자의 마음고민: "${query}"
        분류된 처방 장르: ${recommendedGenres.join(", ")}
      `;
      interpretation = await this.generateAIFortune(
        `독서 처방전`,
        dataText,
        character
      );
    } catch (_e) {
      interpretation = this.getFallbackPrescription(query, character);
    }

    return {
      character,
      query,
      interpretation,
      recommendations
    };
  }

  private getFallbackPrescription(query: string, character: FortuneCharacter): string {
    switch (character.id) {
      case "ara":
        return `친애하는 당신에게,\n\n` +
          `보내주신 마음의 결, "${query}"을 조심스레 읽어 보았어요. \n` +
          `유난히 지친 오늘 같은 날에는 자극적인 바람보다는 따뜻한 차 한 잔과 함께 스며드는 이야기가 필요하기 마련이죠. \n` +
          `제가 지키고 있는 서가에서 가장 다정한 책들을 몇 권 골라 책상에 얹어두었습니다. \n` +
          `이 이야기들의 온기가 당신의 오늘 밤을 포근하게 안아줄 수 있기를 진심으로 바랄게요.`;
      case "danwoo":
        return `오늘 힘든 일 있었어? \n\n` +
          `너가 적어준 사연 "${query}"을 보니까 내가 다 속상하네! \n` +
          `이럴 때는 복잡하게 머리 쓸 필요 없이 유쾌하고 씩씩한 친구들과 노는 게 정답이야. \n` +
          `내 도깨비 방망이 대신, 너에게 신나는 활력을 불어넣어 줄 꿀잼 작품들을 골라왔으니 바로 읽어봐! 기분이 확 좋아질 거야!`;
      case "leona":
        return `보내주신 별빛의 방황, "${query}"을 가만히 응시해 봅니다. \n\n` +
          `마음의 궤도가 조금 흔들리는 것은 당신이 성장의 은하수를 지나고 있기 때문일 거예요. \n` +
          `당신의 혼란스러운 파동을 평온하고 긍정적인 에너지로 정화해 줄 작품들의 주파수를 우주에서 엿들었답니다. \n` +
          `별의 신호가 당신의 앞길을 밝혀주기를.`;
      case "gaon":
        return `적어준 번민 "${query}"에 담긴 고단함이 나에게까지 전해지는군. \n\n` +
          `수련이 막힐 때일수록 검을 내려놓고 바람 소리에 귀를 기울여야 하는 법이다. \n` +
          `당신의 날선 날을 부드럽게 다듬고, 다시 나아갈 내면의 굳건한 힘을 길러줄 작품들을 내 검끝으로 엄선해 두었다. \n` +
          `잡념을 비우고 마음의 힘을 길러라.`;
      default:
        return `당신의 고민 "${query}"에 깊이 공감합니다. \n` +
          `지친 마음을 위로해 줄 가독성 높은 추천 도서들과 함께 기분 전환의 시간을 가져보시길 권합니다.`;
    }
  }
}
