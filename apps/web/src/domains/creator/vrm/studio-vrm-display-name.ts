import {
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import { normalizeLocaleCode } from "@/shared/lib/i18n-intl-utils";

import type { VrmLibraryEntry } from "./vrm-library";
import {
  translateBilingualValueForActiveLocale,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("studio-vrm-display-name", ko, en);

type DisplayLocale = "en" | "ko" | "ja" | "zhHans" | "zhHant";
type LocalizedNames = Readonly<Record<DisplayLocale, string>>;

type VrmDisplayNameInput = Pick<VrmLibraryEntry, "id" | "name" | "source">;

const names = (
  en: string,
  ko: string,
  ja: string,
  zhHans: string,
  zhHant: string,
): LocalizedNames => ({ en, ko, ja, zhHans, zhHant });

/**
 * Product-owned display labels for every non-Quaternius bundled character.
 *
 * `VrmLibraryEntry.name` remains the stable canonical/persistence value. These labels are applied
 * only at presentation boundaries, so switching language never changes saved projects, matching,
 * archive metadata, or uploaded model names.
 */
const BUNDLED_VRM_DISPLAY_NAMES: Readonly<Record<string, LocalizedNames>> = {
  "sample-vrm": names("Lumi", "루미", "ルミ", "露米", "露米"),
  "avatar-a": names("Harin", "하린", "ハリン", "哈琳", "哈琳"),
  "avatar-b": names("Sera", "세라", "セラ", "塞拉", "塞拉"),
  "avatar-c": names("Yuna", "유나", "ユナ", "优娜", "優娜"),
  shion: names("Shion", "시온", "シオン", "诗音", "詩音"),
  vivi: names("Vivi", "비비", "ビビ", "薇薇", "薇薇"),
  vita: names("Vita", "비타", "ヴィータ", "维塔", "維塔"),
  rubin: names("Rubin", "루빈", "ルビン", "鲁宾", "魯賓"),
  orion: names("Orion (Robot)", "오리온 (로봇)", "オリオン（ロボット）", "奥利安（机器人）", "奧利安（機器人）"),
  cryptovoxel: names("Crypto (Voxel Bot)", "크립토 (복셀봇)", "クリプト（ボクセルロボット）", "克里普托（体素机器人）", "克里普托（體素機器人）"),
  seedsan: names("Seed-san (Mascot)", "시드상 (마스코트)", "シードさん（マスコット）", "Seed-san（吉祥物）", "Seed-san（吉祥物）"),
  shino: names("Shino", "시노", "シノ", "Shino", "Shino"),
  fumi: names("Fumi", "후미", "フミ", "Fumi", "Fumi"),
  kage: names("Kage (Dark)", "카게 (다크)", "カゲ（ダーク）", "Kage（暗黑）", "Kage（暗黑）"),
  mio: names("Mio (Human Base)", "미오 (인체 베이스)", "ミオ（人体ベース）", "Mio（人体基础）", "Mio（人體基礎）"),
  noa: names("Noa (Human Base)", "노아 (인체 베이스)", "ノア（人体ベース）", "Noa（人体基础）", "Noa（人體基礎）"),
  alicia: names("Alicia", "아리시아", "アリシア", "Alicia", "Alicia"),
  devil: names("Devil (Demon)", "데빌 (악마)", "デビル（悪魔）", "Devil（恶魔）", "Devil（惡魔）"),
  polydancer: names("Polydancer", "폴리댄서", "ポリダンサー", "Polydancer", "Polydancer"),
  rose: names("Rose", "로즈", "ローズ", "Rose", "Rose"),
  robert: names("Robert", "로버트", "ロバート", "Robert", "Robert"),
  bloody: names("Bloody (Villain)", "블러디 (빌런)", "ブラッディ（ヴィラン）", "Bloody（反派）", "Bloody（反派）"),
  rabbit: names("Rabbit", "래빗 (토끼)", "ラビット（ウサギ）", "兔子", "兔子"),
  eggplant: names("Eggplant", "에그플랜트 (가지)", "エッグプラント（ナス）", "茄子", "茄子"),
  coolbanana: names("Cool Banana", "쿨바나나", "クールバナナ", "酷香蕉", "酷香蕉"),
  skull: names("Skull", "스컬 (해골)", "スカル（骸骨）", "骷髅", "骷髏"),
  "cool-alien": names("Cool Alien", "쿨에일리언 (외계인)", "クールエイリアン（宇宙人）", "酷外星人", "酷外星人"),
  jimmy: names("Jimmy", "지미", "ジミー", "Jimmy", "Jimmy"),
  froggy: names("Froggy (Frog)", "프로기 (개구리)", "フロッギー（カエル）", "Froggy（青蛙）", "Froggy（青蛙）"),
  teddy: names("Teddy (Teddy Bear)", "테디 (곰인형)", "テディ（テディベア）", "Teddy（泰迪熊）", "Teddy（泰迪熊）"),
  nightmare: names("Nightmare", "나이트메어 (악몽)", "ナイトメア（悪夢）", "噩梦", "噩夢"),
  pumpkin: names("Pumpkin", "펌킨 (호박)", "パンプキン（カボチャ）", "南瓜", "南瓜"),
  wizzir: names("Wizzir (Wizard)", "위지르 (마법사)", "ウィジル（魔法使い）", "Wizzir（魔法师）", "Wizzir（魔法師）"),
  clown: names("Clown", "클라운 (광대)", "クラウン（ピエロ）", "小丑", "小丑"),
  wolfman: names("Wolfman (Werewolf)", "울프맨 (늑대인간)", "ウルフマン（狼男）", "Wolfman（狼人）", "Wolfman（狼人）"),
  mummy: names("Mummy", "머미 (미라)", "マミー（ミイラ）", "木乃伊", "木乃伊"),
  kate: names("Kate", "케이트", "ケイト", "Kate", "Kate"),
  witch: names("Witch", "위치 (마녀)", "ウィッチ（魔女）", "女巫", "女巫"),
  dracula: names("Dracula (Vampire)", "드라큘라 (뱀파이어)", "ドラキュラ（吸血鬼）", "Dracula（吸血鬼）", "Dracula（吸血鬼）"),
  zombie: names("Zombie", "좀비", "ゾンビ", "僵尸", "殭屍"),
  "dino-kid": names("Dino Kid (Dinosaur)", "디노키드 (공룡)", "ディノキッド（恐竜）", "Dino Kid（恐龙）", "Dino Kid（恐龍）"),
  astronaut: names("Astronaut", "애스트로넛 (우주비행사)", "アストロノート（宇宙飛行士）", "宇航员", "太空人"),
  polybot: names("Polybot (Robot)", "폴리봇 (로봇)", "ポリボット（ロボット）", "Polybot（机器人）", "Polybot（機器人）"),
  jennifer: names("Jennifer", "제니퍼", "ジェニファー", "Jennifer", "Jennifer"),
  erika: names("Erika", "에리카", "エリカ", "Erika", "Erika"),
  olivia: names("Olivia", "올리비아", "オリビア", "Olivia", "Olivia"),
  avocado: names("Avocado", "아보카도", "アボカド", "牛油果", "酪梨"),
  "ice-cream": names("Ice Cream", "아이스크림", "アイスクリーム", "冰淇淋", "冰淇淋"),
  "pyre-sorcerer": names("Pyre Sorcerer (Fire Sorcerer)", "파이어소서러 (화염술사)", "パイアソーサラー（炎の術士）", "Pyre Sorcerer（火焰术士）", "Pyre Sorcerer（火焰術士）"),
  "unicorn-person": names("Unicorn Person", "유니콘퍼슨 (유니콘)", "ユニコーンパーソン（ユニコーン）", "独角兽人", "獨角獸人"),
  "lalo-bot": names("Lalo Bot (Robot)", "랄로봇 (로봇)", "ラロボット（ロボット）", "Lalo Bot（机器人）", "Lalo Bot（機器人）"),
  "shark-person": names("Shark Person", "샤크퍼슨 (상어)", "シャークパーソン（サメ）", "鲨鱼人", "鯊魚人"),
  "chill-penguin": names("Chill Penguin", "칠펭귄 (펭귄)", "チルペンギン", "悠闲企鹅", "悠閒企鵝"),
  "cool-turtle": names("Cool Turtle", "쿨터틀 (거북이)", "クールタートル", "酷海龟", "酷海龜"),
  "moon-girl": names("Moon Girl", "문걸 (달소녀)", "ムーンガール", "月亮少女", "月亮少女"),
  "eye-wizard": names("Eye Wizard (One-eyed Wizard)", "아이위저드 (외눈 마법사)", "アイウィザード（単眼の魔法使い）", "Eye Wizard（独眼魔法师）", "Eye Wizard（獨眼魔法師）"),
  "cool-pizza": names("Cool Pizza", "쿨피자", "クールピザ", "酷披萨", "酷披薩"),
  "cool-ramen": names("Cool Ramen", "쿨라멘", "クールラーメン", "酷拉面", "酷拉麵"),
  "cool-taco": names("Cool Taco", "쿨타코", "クールタコ", "酷塔可", "酷塔可"),
  "cool-pirate": names("Cool Pirate", "쿨파이럿 (해적)", "クールパイレート（海賊）", "酷海盗", "酷海盜"),
  "cosmic-dweller": names("Cosmic Dweller", "코스믹드웰러 (우주인)", "コズミックドウェラー（宇宙人）", "宇宙居民", "宇宙居民"),
  "chill-palm": names("Chill Palm", "칠팜 (야자수)", "チルパーム（ヤシの木）", "悠闲棕榈树", "悠閒棕櫚樹"),
  "good-knight": names("Good Knight", "굿나이트 (기사)", "グッドナイト（騎士）", "正义骑士", "正義騎士"),
  "bad-bot": names("Bad Bot (Robot)", "배드봇 (로봇)", "バッドボット（ロボット）", "坏机器人", "壞機器人"),
  "pirate-bot": names("Pirate Bot", "파이럿봇 (해적 로봇)", "パイレートボット（海賊ロボット）", "海盗机器人", "海盜機器人"),
  cyberpal: names("Cyberpal (Cyborg)", "사이버팔 (사이보그)", "サイバーパル（サイボーグ）", "Cyberpal（赛博格）", "Cyberpal（賽博格）"),
  "bao-samurai": names("Bao Samurai", "바오사무라이", "バオサムライ", "Bao Samurai", "Bao Samurai"),
  kiba: names("Kiba (Wolf)", "키바 (늑대)", "キバ（オオカミ）", "Kiba（狼）", "Kiba（狼）"),
  "stitch-witch": names("Stitch Witch (Witch Doll)", "스티치위치 (마녀 인형)", "ステッチウィッチ（魔女人形）", "Stitch Witch（女巫人偶）", "Stitch Witch（女巫人偶）"),
  "mega-angel": names("Mega Angel", "메가엔젤 (천사)", "メガエンジェル（天使）", "巨型天使", "巨型天使"),
  "mushroom-fairy": names("Mushroom Fairy", "머시룸페어리 (버섯 요정)", "マッシュルームフェアリー（キノコの妖精）", "蘑菇仙子", "蘑菇仙子"),
  "weird-cat": names("Weird Cat", "위어드캣 (고양이)", "ウィアードキャット（ネコ）", "怪猫", "怪貓"),
  "cute-saurus": names("Cute Saurus (Dinosaur)", "큐트사우루스 (공룡)", "キュートサウルス（恐竜）", "可爱恐龙", "可愛恐龍"),
  crowley: names("Crowley", "크롤리", "クロウリー", "Crowley", "Crowley"),
  "lady-koi": names("Lady Koi", "레이디코이 (비단잉어)", "レディコイ（錦鯉）", "锦鲤女士", "錦鯉女士"),
  "yeti-dude": names("Yeti Dude", "예티듀드 (예티)", "イエティデュード（イエティ）", "雪人小哥", "雪人小哥"),
  anna: names("Anna", "안나", "アンナ", "Anna", "Anna"),
  "megan-the-fox": names("Megan the Fox", "메간 (여우)", "キツネのメーガン", "狐狸梅根", "狐狸梅根"),
  "cool-tiger": names("Cool Tiger", "쿨타이거 (호랑이)", "クールタイガー（トラ）", "酷老虎", "酷老虎"),
  "lil-ram": names("Lil Ram", "릴램 (양)", "リルラム（ヒツジ）", "小公羊", "小公羊"),
  "lady-fawn": names("Lady Fawn", "레이디폰 (아기사슴)", "レディフォーン（子ジカ）", "小鹿女士", "小鹿女士"),
  "strawberry-princess": names("Strawberry Princess", "스트로베리 프린세스 (공주)", "ストロベリープリンセス", "草莓公主", "草莓公主"),
  "blue-pixie": names("Blue Pixie", "블루픽시 (요정)", "ブルーピクシー（妖精）", "蓝色小仙子", "藍色小仙子"),
  "bot-bunny": names("Bot Bunny", "봇버니 (토끼 로봇)", "ボットバニー（ウサギロボット）", "兔子机器人", "兔子機器人"),
  "sport-mecha": names("Sport Mecha", "스포츠메카 (메카)", "スポーツメカ", "运动机甲", "運動機甲"),
  "cosmic-bot": names("Cosmic Bot", "코스믹봇 (로봇)", "コズミックボット（ロボット）", "宇宙机器人", "宇宙機器人"),
  "old-moustache": names("Old Moustache (Grandfather)", "올드무스타치 (할아버지)", "オールドマスタッシュ（おじいさん）", "老胡子爷爷", "老鬍子爺爺"),
  eugenia: names("Eugenia (Grandmother)", "유제니아 (할머니)", "ユージニア（おばあさん）", "Eugenia（祖母）", "Eugenia（祖母）"),
};

const QUATERNIUS_ROLE_NAMES: Readonly<Record<string, LocalizedNames>> = {
  adventurer: names("Adventurer", "모험가", "冒険者", "冒险者", "冒險者"),
  beach: names("Beach", "해변 휴양객", "ビーチ", "海滩度假客", "海灘度假客"),
  casual: names("Casual", "캐주얼", "カジュアル", "休闲", "休閒"),
  casual2: names("Casual 2", "캐주얼 2", "カジュアル 2", "休闲 2", "休閒 2"),
  farmer: names("Farmer", "농부", "農夫", "农夫", "農夫"),
  formal: names("Formal", "정장", "フォーマル", "正装", "正裝"),
  king: names("King", "왕", "王", "国王", "國王"),
  medieval: names("Medieval", "중세", "中世", "中世纪", "中世紀"),
  peasant: names("Peasant", "농민", "農民", "农民", "農民"),
  punk: names("Punk", "펑크", "パンク", "朋克", "龐克"),
  ranger: names("Ranger", "레인저", "レンジャー", "游侠", "遊俠"),
  scifi: names("Sci-Fi", "SF", "SF", "科幻", "科幻"),
  soldier: names("Soldier", "군인", "兵士", "士兵", "士兵"),
  spacesuit: names("Spacesuit", "우주복", "宇宙服", "宇航服", "太空服"),
  suit: names("Suit", "정장", "スーツ", "西装", "西裝"),
  swat: names("SWAT", "특수기동대", "SWAT", "特警", "特警"),
  witch: names("Witch", "마녀", "魔女", "女巫", "女巫"),
  worker: names("Worker", "작업복", "ワーカー", "工作服", "工作服"),
};

const QUATERNIUS_BRAND_NAMES = names(
  "Quaternius",
  "쿼터니어스",
  "クォータニアス",
  "Quaternius",
  "Quaternius",
);

const QUATERNIUS_GENDER_NAMES: Readonly<Record<"male" | "female", LocalizedNames>> = {
  male: names("Male", "남성", "男性", "男", "男"),
  female: names("Female", "여성", "女性", "女", "女"),
};

function displayLocale(locale: string): DisplayLocale {
  const normalized = normalizeLocaleCode(locale);
  const root = normalized.split("-")[0];
  if (root === "ko") return "ko";
  if (root === "ja") return "ja";
  if (root === "zh") {
    if (
      normalized.includes("hant")
      || normalized.endsWith("-tw")
      || normalized.endsWith("-hk")
      || normalized.endsWith("-mo")
    ) {
      return "zhHant";
    }
    return "zhHans";
  }
  return "en";
}

function quaterniusDisplayName(id: string, locale: DisplayLocale): string | null {
  const match = /^quaternius-(?:modular-)?(male|female)-([a-z0-9]+)$/.exec(id);
  if (!match) return null;
  const gender = match[1] as "male" | "female";
  const role = QUATERNIUS_ROLE_NAMES[match[2]];
  if (!role) return null;

  const brandName = bi((QUATERNIUS_BRAND_NAMES).ko, (QUATERNIUS_BRAND_NAMES).en);
  const roleName = bi((role).ko, (role).en);
  const genderName = bi((QUATERNIUS_GENDER_NAMES[gender]).ko, (QUATERNIUS_GENDER_NAMES[gender]).en);
  return locale === "en" || locale === "ko"
    ? `${brandName} ${roleName} (${genderName})`
    : `${brandName} ${roleName}（${genderName}）`;
}

export function hasBundledVrmDisplayName(id: string): boolean {
  return id in BUNDLED_VRM_DISPLAY_NAMES || quaterniusDisplayName(id, "en") !== null;
}

export function resolveBundledVrmDisplayName(
  id: string,
  fallbackName: string,
  locale: string,
): string {
  const targetLocale = displayLocale(locale);
  return quaterniusDisplayName(id, targetLocale)
    ?? BUNDLED_VRM_DISPLAY_NAMES[id]?.[targetLocale]
    ?? fallbackName;
}

/** User-uploaded names are never translated or rewritten. */
export function resolveVrmLibraryEntryDisplayName(
  entry: VrmDisplayNameInput,
  locale: string,
): string {
  return entry.source === "sample"
    ? resolveBundledVrmDisplayName(entry.id, entry.name, locale)
    : entry.name;
}
