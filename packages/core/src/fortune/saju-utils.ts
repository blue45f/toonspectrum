// apps/api/src/modules/fortune/saju-utils.ts

export interface SajuPillar {
  kan: string; // 천간 (e.g. "甲")
  ji: string;  // 지지 (e.g. "寅")
  kanKorean: string; // 한글 천간 (e.g. "갑")
  jiKorean: string;  // 한글 지지 (e.g. "인")
  elementKan: string; // 천간 오행 (e.g. "목")
  elementJi: string;  // 지지 오행 (e.g. "목")
}

export interface SajuResult {
  yearPillar: SajuPillar;
  monthPillar: SajuPillar;
  dayPillar: SajuPillar;
  hourPillar: SajuPillar;
  elementsRatio: {
    wood: number;  // 목 (%)
    fire: number;  // 화 (%)
    earth: number; // 토 (%)
    metal: number; // 금 (%)
    water: number; // 수 (%)
  };
}

const KANS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const KANS_KO = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const JIS = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const JIS_KO = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];

// 천간 오행 매핑
const KAN_ELEMENTS: Record<string, string> = {
  "甲": "wood", "乙": "wood",
  "丙": "fire", "丁": "fire",
  "戊": "earth", "己": "earth",
  "庚": "metal", "辛": "metal",
  "壬": "water", "癸": "water"
};

// 지지 오행 매핑
const JI_ELEMENTS: Record<string, string> = {
  "寅": "wood", "卯": "wood",
  "巳": "fire", "午": "fire",
  "辰": "earth", "戌": "earth", "丑": "earth", "未": "earth",
  "申": "metal", "酉": "metal",
  "亥": "water", "子": "water"
};

const ELEMENT_NAMES_KO: Record<string, string> = {
  wood: "목",
  fire: "화",
  earth: "토",
  metal: "금",
  water: "수"
};

// 2000년 1월 1일 (양력) -> 무오(戊午)일
// 천간 index: 4 (戊), 지지 index: 6 (午)
const EPOCH_DATE = new Date(2000, 0, 1);
const EPOCH_KAN_IDX = 4;
const EPOCH_JI_IDX = 6;

function getPillar(kanIdx: number, jiIdx: number): SajuPillar {
  const kan = KANS[kanIdx % 10];
  const ji = JIS[jiIdx % 12];
  return {
    kan,
    ji,
    kanKorean: KANS_KO[kanIdx % 10],
    jiKorean: JIS_KO[jiIdx % 12],
    elementKan: ELEMENT_NAMES_KO[KAN_ELEMENTS[kan]],
    elementJi: ELEMENT_NAMES_KO[JI_ELEMENTS[ji]]
  };
}

export function calculateSaju(birthDateStr: string, birthTimeStr?: string): SajuResult {
  // birthDateStr format: YYYY-MM-DD
  const [bYear, bMonth, bDay] = birthDateStr.split("-").map(Number);
  
  // 1. 년주 계산
  // 명리학에서는 입춘(양력 2월 4일 경)을 기준으로 새해를 판정한다.
  let sajuYear = bYear;
  // 임시 입춘 기준일: 2월 4일
  if (bMonth < 2 || (bMonth === 2 && bDay < 4)) {
    sajuYear = bYear - 1;
  }
  
  const yearKanIdx = (sajuYear - 4) % 10;
  const yearJiIdx = (sajuYear - 4) % 12;
  const yearPillar = getPillar(
    yearKanIdx < 0 ? yearKanIdx + 10 : yearKanIdx,
    yearJiIdx < 0 ? yearJiIdx + 12 : yearJiIdx
  );

  // 2. 월주 계산
  // 절기별 지지 매핑: 2월 입춘부터 寅(인)월로 시작
  // 소한(1.5), 입춘(2.4), 경칩(3.6), 청명(4.5), 입하(5.6), 망종(6.6), 소서(7.7), 입추(8.8), 백로(9.8), 한로(10.8), 입동(11.7), 대설(12.7)
  const solarTerms = [
    { month: 1, day: 5, jiIdx: 1 },  // 소한 -> 축월(1)이지만 절기상 축월은 1월 초부터 시작
    { month: 2, day: 4, jiIdx: 2 },  // 입춘 -> 인월(2)
    { month: 3, day: 6, jiIdx: 3 },  // 경칩 -> 묘월(3)
    { month: 4, day: 5, jiIdx: 4 },  // 청명 -> 진월(4)
    { month: 5, day: 6, jiIdx: 5 },  // 입하 -> 사월(5)
    { month: 6, day: 6, jiIdx: 6 },  // 망종 -> 오월(6)
    { month: 7, day: 7, jiIdx: 7 },  // 소서 -> 미월(7)
    { month: 8, day: 8, jiIdx: 8 },  // 입추 -> 신월(8)
    { month: 9, day: 8, jiIdx: 9 },  // 백로 -> 유월(9)
    { month: 10, day: 8, jiIdx: 10 }, // 한로 -> 술월(10)
    { month: 11, day: 7, jiIdx: 11 }, // 입동 -> 해월(11)
    { month: 12, day: 7, jiIdx: 0 }   // 대설 -> 자월(12)
  ];

  let jiIdx = 11; // 기본 해월
  for (let i = 0; i < solarTerms.length; i++) {
    const term = solarTerms[i];
    if (bMonth > term.month || (bMonth === term.month && bDay >= term.day)) {
      jiIdx = term.jiIdx;
    }
  }

  // 두간법으로 월간 구하기
  // 년간에 따른 인월(寅, index 2)의 천간 매핑
  const yearKan = yearPillar.kan;
  let startKanIdx = 0; // 甲/己 -> 丙(2)
  if (yearKan === "甲" || yearKan === "己") startKanIdx = 2; // 丙
  else if (yearKan === "乙" || yearKan === "庚") startKanIdx = 4; // 戊
  else if (yearKan === "丙" || yearKan === "辛") startKanIdx = 6; // 庚
  else if (yearKan === "丁" || yearKan === "壬") startKanIdx = 8; // 壬
  else if (yearKan === "戊" || yearKan === "癸") startKanIdx = 0; // 甲

  // 월지는 jiIdx. 인월(2)에서 월지까지의 오프셋 계산
  // 인(2), 묘(3), 진(4)... 순서
  const offset = (jiIdx - 2 + 12) % 12;
  const monthKanIdx = (startKanIdx + offset) % 10;
  const monthPillar = getPillar(monthKanIdx, jiIdx);

  // 3. 일주 계산
  const targetDate = new Date(bYear, bMonth - 1, bDay);
  const diffTime = targetDate.getTime() - EPOCH_DATE.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  let dayKanIdx = (EPOCH_KAN_IDX + diffDays) % 10;
  if (dayKanIdx < 0) dayKanIdx += 10;
  let dayJiIdx = (EPOCH_JI_IDX + diffDays) % 12;
  if (dayJiIdx < 0) dayJiIdx += 12;
  
  const dayPillar = getPillar(dayKanIdx, dayJiIdx);

  // 4. 시주 계산
  let hourJiIdx: number;
  if (birthTimeStr) {
    const [hours, minutes] = birthTimeStr.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes;
    
    if (totalMinutes >= 1410 || totalMinutes < 90) hourJiIdx = 0; // 자시
    else if (totalMinutes >= 90 && totalMinutes < 210) hourJiIdx = 1; // 축시
    else if (totalMinutes >= 210 && totalMinutes < 330) hourJiIdx = 2; // 인시
    else if (totalMinutes >= 330 && totalMinutes < 450) hourJiIdx = 3; // 묘시
    else if (totalMinutes >= 450 && totalMinutes < 570) hourJiIdx = 4; // 진시
    else if (totalMinutes >= 570 && totalMinutes < 690) hourJiIdx = 5; // 사시
    else if (totalMinutes >= 690 && totalMinutes < 810) hourJiIdx = 6; // 오시
    else if (totalMinutes >= 810 && totalMinutes < 930) hourJiIdx = 7; // 미시
    else if (totalMinutes >= 930 && totalMinutes < 1050) hourJiIdx = 8; // 신시
    else if (totalMinutes >= 1050 && totalMinutes < 1170) hourJiIdx = 9; // 유시
    else if (totalMinutes >= 1170 && totalMinutes < 1290) hourJiIdx = 10; // 술시
    else hourJiIdx = 11; // 해시
  } else {
    hourJiIdx = 6; // 오시
  }

  // 두시법으로 시간 구하기
  const dayKan = dayPillar.kan;
  let startHourKanIdx = 0; // 甲/己 -> 甲(0)子
  if (dayKan === "甲" || dayKan === "己") startHourKanIdx = 0; // 甲
  else if (dayKan === "乙" || dayKan === "庚") startHourKanIdx = 2; // 丙
  else if (dayKan === "丙" || dayKan === "辛") startHourKanIdx = 4; // 戊
  else if (dayKan === "丁" || dayKan === "壬") startHourKanIdx = 6; // 庚
  else if (dayKan === "戊" || dayKan === "癸") startHourKanIdx = 8; // 壬

  const hourKanIdx = (startHourKanIdx + hourJiIdx) % 10;
  const hourPillar = getPillar(hourKanIdx, hourJiIdx);

  // 5. 오행 비율 계산
  const elementCounts: Record<string, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  const pillars = [yearPillar, monthPillar, dayPillar, hourPillar];
  
  pillars.forEach(pillar => {
    const elKan = KAN_ELEMENTS[pillar.kan];
    const elJi = JI_ELEMENTS[pillar.ji];
    elementCounts[elKan] = (elementCounts[elKan] || 0) + 1;
    elementCounts[elJi] = (elementCounts[elJi] || 0) + 1;
  });

  const total = 8;
  const elementsRatio = {
    wood: Math.round((elementCounts.wood / total) * 100),
    fire: Math.round((elementCounts.fire / total) * 100),
    earth: Math.round((elementCounts.earth / total) * 100),
    metal: Math.round((elementCounts.metal / total) * 100),
    water: Math.round((elementCounts.water / total) * 100)
  };

  const sum = elementsRatio.wood + elementsRatio.fire + elementsRatio.earth + elementsRatio.metal + elementsRatio.water;
  if (sum !== 100) {
    const diff = 100 - sum;
    const keys = ["wood", "fire", "earth", "metal", "water"] as const;
    let maxKey: typeof keys[number] = keys[0];
    keys.forEach(k => {
      if (elementsRatio[k] > elementsRatio[maxKey]) maxKey = k;
    });
    elementsRatio[maxKey] += diff;
  }

  return {
    yearPillar,
    monthPillar,
    dayPillar,
    hourPillar,
    elementsRatio
  };
}
