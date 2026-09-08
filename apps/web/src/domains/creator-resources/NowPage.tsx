import {
  ArrowRight,
  Building2,
  CloudSun,
  PackageSearch,
  PanelsTopLeft,
  ShieldCheck,
  Sparkles,
  Volume2,
} from "lucide-react";
import { Link } from "react-router-dom";

import { RESOURCE_BUTTON } from "./navigation";
import { ResourceLayout } from "./ResourceLayout";

interface DailyTheme {
  id: string;
  title: string;
  tagline: string;
  object: string;
  place: string;
  light: string;
  sound: readonly string[];
  mission: string;
  assetQuery: string;
  bookQuery: string;
  moods: readonly string[];
}

const DAILY_THEMES = [
  {
    id: "rainy-theater",
    title: "비 오는 오래된 극장",
    tagline: "빈 객석에는 떠난 사람의 흔적만 남아 있습니다.",
    object: "낡은 극장 입장권",
    place: "목재 좌석과 좁은 통로가 있는 소극장",
    light: "흐린 저녁의 푸른 외광과 따뜻한 실내등",
    sound: ["빗물이 처마를 치는 소리", "젖은 발걸음", "나무 좌석이 접히는 소리"],
    mission: "대사를 쓰지 않고 다섯 컷만으로 누군가 이미 떠났다는 사실을 표현하세요.",
    assetQuery: "theater ticket interior rain",
    bookQuery: "theater graphic novel",
    moods: ["기다림", "그리움", "저녁"],
  },
  {
    id: "midnight-laundromat",
    title: "자정의 무인 세탁소",
    tagline: "돌아가는 드럼 안에서 낯선 물건이 발견됩니다.",
    object: "주인 없는 빨간 장갑",
    place: "형광등이 깜빡이는 작은 세탁소",
    light: "차가운 형광등과 유리창의 네온 반사",
    sound: ["세탁기 회전음", "동전이 떨어지는 소리", "멀리 지나가는 버스"],
    mission: "한 인물이 장갑의 주인을 추리하는 과정을 세 개의 시선 컷으로 구성하세요.",
    assetQuery: "laundry glove neon",
    bookQuery: "laundromat mystery comic",
    moods: ["호기심", "고독", "긴장"],
  },
  {
    id: "winter-station",
    title: "눈이 멈춘 작은 역",
    tagline: "막차가 떠난 뒤에도 한 사람은 승강장에 남아 있습니다.",
    object: "시간이 멈춘 손목시계",
    place: "눈 쌓인 시골 간이역",
    light: "가로등 아래 퍼지는 눈의 난반사",
    sound: ["전선이 바람에 흔들리는 소리", "멀어지는 열차", "눈을 밟는 발소리"],
    mission: "같은 구도를 세 번 반복하되 매 컷에서 시간의 이상을 하나씩 추가하세요.",
    assetQuery: "winter train station watch",
    bookQuery: "train station time comic",
    moods: ["정적", "이별", "초현실"],
  },
  {
    id: "greenhouse-letter",
    title: "폐온실의 마지막 편지",
    tagline: "식물은 시들었지만 편지의 잉크는 아직 마르지 않았습니다.",
    object: "식물 표본 사이의 봉투",
    place: "깨진 유리와 덩굴이 뒤엉킨 온실",
    light: "구름 사이로 잠깐 들어오는 확산광",
    sound: ["유리 조각이 흔들리는 소리", "잎에 떨어지는 물방울", "멀리서 우는 새"],
    mission: "편지의 내용을 보여주지 않고 인물의 반응과 주변 사물만으로 내용을 짐작하게 하세요.",
    assetQuery: "abandoned greenhouse letter botanical",
    bookQuery: "greenhouse graphic novel",
    moods: ["비밀", "상실", "새로운 시작"],
  },
  {
    id: "old-market",
    title: "해 질 무렵의 오래된 시장",
    tagline: "모든 가게가 문을 닫는데 한 상점만 불이 켜집니다.",
    object: "나무 저울추와 손때 묻은 장부",
    place: "좁은 골목형 전통시장",
    light: "낮은 태양과 점포 안 백열등의 대비",
    sound: ["철제 셔터가 내려오는 소리", "상인이 상자를 옮기는 소리", "시장 끝의 라디오"],
    mission: "독자가 들어가고 싶지만 동시에 불안해지는 상점 입구를 한 컷에 설계하세요.",
    assetQuery: "old market scale ledger",
    bookQuery: "market historical comic",
    moods: ["생활감", "수상함", "황혼"],
  },
  {
    id: "school-rooftop",
    title: "방학 마지막 날의 옥상",
    tagline: "아무도 없는 학교에 두 개의 의자만 마주 보고 있습니다.",
    object: "이름이 지워진 학생증",
    place: "낡은 학교 옥상과 급수탑",
    light: "여름 오후의 강한 역광",
    sound: ["매미 소리", "운동장 깃대 줄이 부딪히는 소리", "멀리서 들리는 방송"],
    mission: "두 인물을 직접 보여주지 않고 그들의 관계를 암시하는 소품 다섯 개를 배치하세요.",
    assetQuery: "school rooftop student card summer",
    bookQuery: "school rooftop manga",
    moods: ["청춘", "부재", "약속"],
  },
  {
    id: "night-library",
    title: "불이 꺼지지 않는 도서관",
    tagline: "반납된 적 없는 책이 매일 다른 책상에 놓입니다.",
    object: "대출 도장이 없는 낡은 책",
    place: "높은 서가와 나선형 계단이 있는 도서관",
    light: "초록색 스탠드 조명과 어두운 서가",
    sound: ["책장이 넘어가는 소리", "시계 초침", "카트 바퀴의 마찰음"],
    mission: "책이 스스로 이동했다는 사실을 정지된 사물의 차이만으로 보여주세요.",
    assetQuery: "old library book spiral staircase",
    bookQuery: "library mystery graphic novel",
    moods: ["지식", "수수께끼", "밤"],
  },
  {
    id: "harbor-dawn",
    title: "안개 낀 항구의 새벽",
    tagline: "도착한 배의 명부에는 존재하지 않는 승객이 적혀 있습니다.",
    object: "젖은 승선 명부",
    place: "창고와 크레인이 보이는 작은 항구",
    light: "안개에 퍼지는 주황색 작업등",
    sound: ["부표 종소리", "밧줄이 당겨지는 소리", "갈매기와 낮은 엔진음"],
    mission: "안개를 단순한 흰색 면이 아니라 거리와 정보를 숨기는 연출 장치로 사용하세요.",
    assetQuery: "fog harbor manifest rope",
    bookQuery: "harbor mystery comic",
    moods: ["안개", "도착", "불길함"],
  },
  {
    id: "attic-clock",
    title: "다락방의 두 번째 시계",
    tagline: "집 안의 모든 시계와 정확히 열세 분 차이가 납니다.",
    object: "열세 분 느린 탁상시계",
    place: "상자와 천으로 가득한 다락방",
    light: "작은 환기창을 통과하는 먼지 낀 빛",
    sound: ["나무가 수축하는 소리", "서로 다른 두 초침", "지붕 위의 빗방울"],
    mission: "독자가 두 시계의 차이를 스스로 발견하도록 정보의 노출 순서를 설계하세요.",
    assetQuery: "attic clock dust boxes",
    bookQuery: "clock time graphic novel",
    moods: ["기억", "시간", "발견"],
  },
  {
    id: "desert-observatory",
    title: "사막의 버려진 관측소",
    tagline: "밤하늘에는 지도에 없는 별이 하나 더 있습니다.",
    object: "금이 간 황동 망원경",
    place: "모래에 반쯤 묻힌 천문 관측소",
    light: "푸른 달빛과 붉은 비상등",
    sound: ["모래바람", "금속 구조물이 우는 소리", "낡은 모터의 짧은 작동음"],
    mission: "인물보다 하늘의 비중을 크게 잡아 경외감과 위험을 동시에 표현하세요.",
    assetQuery: "desert observatory telescope night",
    bookQuery: "observatory science fiction comic",
    moods: ["우주", "고립", "경외"],
  },
  {
    id: "museum-after-hours",
    title: "폐관 후의 작은 박물관",
    tagline: "전시된 물건 하나가 어제와 다른 방향을 보고 있습니다.",
    object: "방향이 바뀐 작은 조각상",
    place: "목재 진열장과 좁은 전시실",
    light: "비상구 표시등과 손전등의 국부광",
    sound: ["공조기 저음", "유리 진열장의 미세한 진동", "경비원의 열쇠"],
    mission: "첫 컷과 마지막 컷의 구도는 같게 두고 단 하나의 차이로 사건을 만드세요.",
    assetQuery: "museum cabinet statue night",
    bookQuery: "museum mystery comic",
    moods: ["관찰", "이상", "정적"],
  },
  {
    id: "river-cafe",
    title: "홍수 뒤 다시 연 강변 카페",
    tagline: "물에 젖은 벽에는 지워지지 않은 키 표시가 남아 있습니다.",
    object: "물에 번진 메뉴판",
    place: "창문이 큰 작은 강변 카페",
    light: "비가 갠 뒤 흐린 자연광",
    sound: ["강물 소리", "젖은 의자를 닦는 소리", "에스프레소 머신의 첫 작동"],
    mission: "공간의 피해와 다시 시작하려는 의지를 같은 장면 안에 균형 있게 배치하세요.",
    assetQuery: "river cafe flood menu",
    bookQuery: "cafe recovery graphic novel",
    moods: ["회복", "흔적", "희망"],
  },
  {
    id: "mountain-clinic",
    title: "산속 진료소의 마지막 환자",
    tagline: "진료 기록에는 오늘보다 하루 뒤의 날짜가 적혀 있습니다.",
    object: "미래 날짜가 찍힌 진료 카드",
    place: "눈 덮인 산길 끝의 작은 진료소",
    light: "흰 눈의 반사광과 따뜻한 진료실 조명",
    sound: ["난로 소리", "유리창을 긁는 나뭇가지", "멀리서 들리는 무전기"],
    mission: "의료 장면의 긴장을 과장된 표정 대신 손과 도구의 움직임으로 표현하세요.",
    assetQuery: "mountain clinic medical card snow",
    bookQuery: "rural clinic mystery manga",
    moods: ["고립", "돌봄", "예고"],
  },
  {
    id: "city-archive",
    title: "지하 기록보관소의 지도",
    tagline: "현재 도시에는 없는 골목이 지도 위에서 계속 길어집니다.",
    object: "잉크가 번지는 오래된 도시 지도",
    place: "금속 서가가 늘어선 지하 기록실",
    light: "천장 형광등과 휴대용 스캐너 빛",
    sound: ["환풍기", "종이가 펼쳐지는 소리", "멀리서 닫히는 방화문"],
    mission: "평면 지도와 실제 공간을 교차 편집해 두 세계가 연결되는 순간을 만드세요.",
    assetQuery: "archive old city map",
    bookQuery: "city map fantasy comic",
    moods: ["기록", "도시", "미지"],
  },
] satisfies readonly DailyTheme[];

function kstDate(now = new Date()): { iso: string; label: string; index: number } {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const iso = shifted.toISOString().slice(0, 10);
  const index = Math.abs(Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000)) % DAILY_THEMES.length;
  return {
    iso,
    label: new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      timeZone: "Asia/Seoul",
    }).format(now),
    index,
  };
}

export function NowPage() {
  const date = kstDate();
  const theme = DAILY_THEMES[date.index] ?? DAILY_THEMES[0];
  const assetHref = `/research/assets?q=${encodeURIComponent(theme.assetQuery)}&page=1`;
  const bookHref = `/research/books?q=${encodeURIComponent(theme.bookQuery)}&page=1`;

  return (
    <ResourceLayout
      title="오늘의 영감"
      intro="매일 하나의 사물·공간·빛·소리와 짧은 연출 미션을 제공합니다. 미션 문구는 ToonStudio가 직접 작성하며, 연결된 외부 검색 결과의 권리와 출처는 각 자료 카드에서 별도로 확인합니다."
    >
      <section className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 sm:p-10">
        <span className="absolute -right-10 -top-10 size-40 rounded-full bg-accent/15 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-accent">
            <Sparkles size={15} aria-hidden="true" /> TODAY’S SPARK · {date.label}
          </div>
          <h2 className="mt-5 text-balance font-display text-3xl font-bold leading-tight text-fg sm:text-5xl">{theme.title}</h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-fg-2 sm:text-lg">{theme.tagline}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {theme.moods.map((mood) => (
              <span key={mood} className="rounded-full border border-line bg-canvas/70 px-3 py-1 text-xs font-semibold text-fg-2">#{mood}</span>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent" to="/studio" reloadDocument>
              Studio에서 시작 <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link className={RESOURCE_BUTTON} to="/research">연구 보드 열기</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label="오늘의 장면 자료">
        {[
          { icon: PackageSearch, eyebrow: "OBJECT", title: "오늘의 사물", body: theme.object },
          { icon: Building2, eyebrow: "PLACE", title: "오늘의 공간", body: theme.place },
          { icon: CloudSun, eyebrow: "LIGHT", title: "오늘의 빛", body: theme.light },
          { icon: Volume2, eyebrow: "SOUND", title: "오늘의 소리", body: theme.sound.join(" · ") },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.eyebrow} className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold tracking-[0.16em] text-accent">{item.eyebrow}</span>
                <Icon size={20} className="text-fg-3" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-lg font-bold text-fg">{item.title}</h2>
              <p className="mt-2 text-sm leading-7 text-fg-2">{item.body}</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-accent/30 bg-accent-soft p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-accent">
            <PanelsTopLeft size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">FIVE-PANEL MISSION</p>
            <h2 className="mt-2 text-xl font-bold text-fg">오늘의 5컷 미션</h2>
            <p className="mt-3 text-base leading-8 text-fg-2">{theme.mission}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-line bg-panel p-5">
          <p className="text-xs font-bold text-accent">REFERENCE SEARCH</p>
          <h2 className="mt-2 text-lg font-bold text-fg">사물·공간 자료 찾아보기</h2>
          <p className="mt-2 text-sm leading-7 text-fg-2">오늘의 영감과 관련된 공개 미술 자료를 검색합니다. 검색 결과의 이용조건은 자료별로 확인하세요.</p>
          <Link className={`${RESOURCE_BUTTON} mt-4`} to={assetHref}>창작 자료 검색 <ArrowRight size={14} aria-hidden="true" /></Link>
        </article>
        <article className="rounded-2xl border border-line bg-panel p-5">
          <p className="text-xs font-bold text-accent">STORY RESEARCH</p>
          <h2 className="mt-2 text-lg font-bold text-fg">관련 작품·도서 조사하기</h2>
          <p className="mt-2 text-sm leading-7 text-fg-2">Open Library에서 관련 키워드의 작품과 판본 메타데이터를 확인해 비교 연구를 시작합니다.</p>
          <Link className={`${RESOURCE_BUTTON} mt-4`} to={bookHref}>글로벌 판본 검색 <ArrowRight size={14} aria-hidden="true" /></Link>
        </article>
      </section>

      <aside className="flex items-start gap-3 rounded-2xl border border-line bg-card/40 p-5 text-sm leading-7 text-fg-2">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />
        <p>오늘의 주제와 미션은 ToonStudio의 오리지널 에디토리얼 콘텐츠입니다. 외부 자료는 자동으로 Studio에 삽입하지 않으며, 원문·출처·현재 이용조건을 확인한 뒤 사용해야 합니다. 기준일: {date.iso}</p>
      </aside>
    </ResourceLayout>
  );
}
