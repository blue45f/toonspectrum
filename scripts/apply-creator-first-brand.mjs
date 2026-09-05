import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const replace = (path, before, after) => {
  const source = readFileSync(path, "utf8");
  assert(source.includes(before), `Integration anchor missing in ${path}: ${before.slice(0, 80)}`);
  writeFileSync(path, source.replace(before, after));
};
replace("src/app/routes/groups/catalog.routes.tsx", 'import("@/src/domains/catalog/HomePage").then((module) => ({ default: module.HomePage }))', 'import("@/src/domains/marketing/CreatorHomePage").then((module) => ({ default: module.CreatorHomePage }))');
replace("src/app/AppShell.tsx", '{shouldRenderAppSplash(pathname, search) ?', '{pathname !== "/" && shouldRenderAppSplash(pathname, search) ?');
replace("src/app/routes/route-titles.ts", 'if (!shouldAppRouterOwnDocumentTitle({ pathname, search })) return;', 'if (!shouldAppRouterOwnDocumentTitle({ pathname, search })) return;\n    if (pathname === "/") {\n      document.title = `${t("app.name")} · ${t("home.creatorTitle")}`;\n      return;\n    }');
const headerPath = "components/site-header.tsx";
let header = readFileSync(headerPath, "utf8");
assert(header.includes('const NAV = ['));
header = header.replace(/const NAV = \[[\s\S]*?\n\];/, `const NAV = [
  { i18n: "nav.home", href: "/", exact: true },
  { i18n: "nav.studio", href: "/studio" },
  { i18n: "nav.assets", href: "/market" },
  { i18n: "nav.creators", href: "/create" },
  { i18n: "nav.discover", href: "/explore" },
  { i18n: "nav.allMenu", href: "/sitemap" },
];`);
header = header.replace('  Library,', '  Palette,').replace('<Library ', '<Palette ');
header = header.replaceAll('"/library"', '"/studio"').replaceAll('"nav.library"', '"nav.studio"');
writeFileSync(headerPath, header);
const mobilePath = "components/site-header-mobile-nav.tsx";
let mobile = readFileSync(mobilePath, "utf8");
assert(mobile.includes('const MOBILE_NAV = ['));
mobile = mobile.replace(/const MOBILE_NAV = \[[\s\S]*?\n\];/, `const MOBILE_NAV = [
  { i18n: "nav.home", href: "/", icon: Home, exact: true },
  { i18n: "nav.studio", href: "/studio", icon: Palette },
  { i18n: "nav.assets", href: "/market", icon: Store },
  { i18n: "nav.creators", href: "/create", icon: Palette },
  { i18n: "nav.discover", href: "/explore", icon: Compass },
  { i18n: "nav.ranking", href: "/ranking", icon: TrendingUp },
  { i18n: "nav.calendar", href: "/calendar", icon: CalendarDays },
  { i18n: "nav.recommend", href: "/recommend", icon: Sparkles },
  { i18n: "nav.fortune", href: "/fortune", icon: Moon },
  { i18n: "nav.play", href: "/play", icon: Gamepad2 },
  { i18n: "nav.reviews", href: "/reviews", icon: MessageSquareQuote },
  { i18n: "nav.community", href: "/community", icon: MessageCircle },
  { i18n: "nav.shaper", href: "/shaper", icon: UserRoundPen },
  { i18n: "nav.insights", href: "/insights", icon: BarChart3 },
];`);
mobile = mobile.replace('["/", "/ranking", "/recommend", "/explore", "/community"]', '["/", "/studio", "/market", "/create", "/explore"]');
writeFileSync(mobilePath, mobile);
for (const filename of readdirSync("public/i18n/app")) {
  if (!filename.endsWith(".json")) continue;
  const path = `public/i18n/app/${filename}`;
  const dictionary = JSON.parse(readFileSync(path, "utf8"));
  const ko = filename === "ko.json";
  dictionary["app.name"] = ko ? "툰스튜디오" : "ToonStudio";
  dictionary["nav.studio"] = ko ? "스튜디오" : "Studio";
  dictionary["nav.assets"] = ko ? "에셋" : "Assets";
  dictionary["nav.creators"] = ko ? "창작 갤러리" : "Creators";
  dictionary["nav.discover"] = ko ? "작품 탐색" : "Discover";
  dictionary["home.creatorTitle"] = ko ? "아이디어를 첫 장면으로" : "From an idea to your first scene";
  if (Object.hasOwn(dictionary, "footer.tagline")) dictionary["footer.tagline"] = ko ? "아이디어를 첫 장면으로. 당신의 이야기가 시작되는 창작 공간." : "From an idea to your first scene. A creative space for your story.";
  writeFileSync(path, JSON.stringify(dictionary, null, 2) + "\n");
}
let html = readFileSync("index.html", "utf8");
html = html.replaceAll("툰스펙트럼", "툰스튜디오").replaceAll("툰스튜디오 · 웹툰·웹소설 통합 인덱스", "툰스튜디오 · 아이디어를 첫 장면으로").replaceAll("툰스튜디오 — 웹툰·웹소설 통합 인덱스", "툰스튜디오 — 드로잉·컷툰·3D 창작 공간").replaceAll("웹툰·웹소설 통합 인덱스. 플랫폼을 가로질러 무엇을, 어디서, 왜 봐야 하는지 찾습니다.", "아이디어를 첫 장면으로. 드로잉, 컷과 말풍선, 3D 장면과 에셋을 만나는 브라우저 창작 공간, 툰스튜디오.").replaceAll("네이버·카카오·리디·레진 등 국내 웹툰·웹소설을 가로질러 — 무엇을, 어디서, 왜 봐야 하는지 한 곳에서. 통합 랭킹·연재 캘린더·가격비교·작가별 보기.", "그리는 순간부터 이야기가 되는 순간까지. 툰스튜디오에서 드로잉·컷툰·3D 창작을 시작하세요.").replaceAll("네이버·카카오·리디·레진 등 국내 웹툰·웹소설을 가로질러 한 곳에서. 통합 랭킹·연재 캘린더·가격비교·작가별 보기.", "당신의 다음 이야기는 툰스튜디오에서. 브라우저에서 드로잉·컷툰·3D 창작을 시작하세요.").replaceAll('"alternateName": "ToonSpectrum"', '"alternateName": ["ToonStudio", "ToonSpectrum"]').replaceAll("https://www.toonstudio.cloud/og-web.png", "https://www.toonstudio.cloud/brand/toonstudio-og.png");
writeFileSync("index.html", html);
const manifestPath = "public/manifest.webmanifest";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.name = "툰스튜디오 · ToonStudio";
manifest.short_name = "툰스튜디오";
manifest.description = "아이디어를 첫 장면으로. 드로잉·컷툰·3D 창작 공간.";
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("Integrated creator-first routes, desktop/mobile navigation, locale brand, metadata and PWA name without modifying studio internals.");
