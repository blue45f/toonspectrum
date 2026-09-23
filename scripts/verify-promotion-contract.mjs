import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertPromotionPage, isPromotionPost, promotionCursor, promotionKey, promotionVideo, PROMOTION_KINDS, safePromotionUrl, validPromotionCover, validatePromotion } from "../packages/core/src/promotion.ts";

const input = { kind: "series", stage: "amateur", genre: "판타지", title: "첫 번째 웹툰을 소개합니다", seriesTitle: "별빛의 기록", description: "첫 연재를 준비하는 아마추어 작가입니다. 새로운 이야기에 대한 피드백을 부탁드립니다.", readingUrl: "https://www.webtoons.com/", videoUrl: "", cover: "", tags: ["첫연재"], contentWarning: "", rightsConfirmed: true };
const post = { ...input, id: "11111111-1111-4111-8111-111111111111", author: { id: "creator", name: "작가" }, version: 1, hidden: false, archived: false, saved: false, createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:00.000Z" };
const page = { items: [post], nextCursor: null, hasMore: false, canModerate: false };

test("valid creator post is normalized without accepting ownership fields", () => {
  const result = validatePromotion({ ...input, title: ` ${input.title} `, tags: ["#첫연재", "첫연재"], userId: "another", hidden: false, version: 88 });
  assert.equal(result.error, undefined); assert.equal(result.value.title, input.title); assert.deepEqual(result.value.tags, ["첫연재"]);
  assert.equal(Object.hasOwn(result.value, "userId"), false); assert.equal(Object.hasOwn(result.value, "version"), false);
});
for (const kind of Object.keys(PROMOTION_KINDS)) test(`valid promotion kind: ${kind}`, () => {
  assert.ok(validatePromotion({ ...input, kind, videoUrl: kind === "trailer" ? "https://youtu.be/dQw4w9WgXcQ" : "" }).value);
});
for (const patch of [
  { kind: "__proto__" }, { stage: "constructor" }, { genre: "invalid" }, { title: "ab" }, { title: "a".repeat(101) },
  { seriesTitle: "x" }, { seriesTitle: "x".repeat(101) }, { description: "too short" }, { description: "x".repeat(4001) },
  { rightsConfirmed: false }, { rightsConfirmed: "true" }, { tags: "tag" }, { tags: Array(9).fill("tag") }, { tags: [1] }, { tags: [""] }, { tags: ["x".repeat(25)] },
  { contentWarning: "x".repeat(151) }, { kind: "trailer", videoUrl: "" }, { cover: "https://example.com/cover.jpg" },
]) test(`reject invalid field: ${JSON.stringify(patch).slice(0, 65)}`, () => assert.ok(validatePromotion({ ...input, ...patch }).error));
for (const value of [null, [], true, 42, "text"]) test(`reject non-object payload: ${JSON.stringify(value)}`, () => assert.ok(validatePromotion(value).error));
// secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic unsafe-URL rejection fixture
for (const value of ["javascript:alert(1)", "data:text/html,hi", "http://example.com", "https://user:pass@example.com", "https://127.0.0.1/a", "https://10.0.0.1/a", "https://192.168.1.1/a", "https://172.16.0.1/a", "https://localhost/a", "https://test.local/a", "https://[::1]/", "https://example.com:8443", "https://example.com/a\nb", "https://example.com/" + "x".repeat(1001)]) test(`reject unsafe URL: ${value.slice(0, 70)}`, () => assert.equal(safePromotionUrl(value), null));
for (const url of ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ"]) test(`normalize YouTube: ${url}`, () => {
  const media = promotionVideo(url); assert.equal(media.provider, "YouTube"); assert.equal(media.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
});
test("normalize public Vimeo", () => assert.equal(promotionVideo("https://vimeo.com/123456789").embedUrl, "https://player.vimeo.com/video/123456789?dnt=1"));
for (const url of ["https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://youtube.com@evil.example/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ/extra", "https://youtube.com/watch?v=short", "https://youtube.com/playlist?list=123", "https://vimeo.com/abc", "https://vimeo.com/123456789/private", "https://example.com/video.mp4", "<iframe src='https://youtube.com'></iframe>"]) test(`reject unsupported video: ${url}`, () => assert.equal(promotionVideo(url), null));
test("empty optional links remain empty", () => { assert.equal(safePromotionUrl(""), ""); assert.equal(promotionVideo(""), null); });
test("only own enumeration keys are accepted", () => { assert.equal(promotionKey(PROMOTION_KINDS, "__proto__"), false); assert.equal(promotionKey(PROMOTION_KINDS, "constructor"), false); });
test("cover rejects non-JPEG and malformed base64", () => {
  for (const cover of ["data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,iVBORw==", "data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,/9j/ A=="]) assert.equal(validPromotionCover(cover), false);
  assert.equal(validPromotionCover(""), true);
});
test("cover enforces decoded byte quota at its boundary", () => {
  const bytes = Buffer.alloc(128 * 1024); bytes[0] = 255; bytes[1] = 216; bytes[2] = 255;
  assert.equal(validPromotionCover(`data:image/jpeg;base64,${bytes.toString("base64")}`), true);
  assert.equal(validPromotionCover(`data:image/jpeg;base64,${Buffer.concat([bytes, Buffer.from([0])]).toString("base64")}`), false);
});
test("valid keyset cursor preserves exact date and id", () => { const cursor = promotionCursor(`${post.createdAt}|${post.id}`); assert.equal(cursor.id, post.id); assert.equal(cursor.date.toISOString(), post.createdAt); assert.equal(promotionCursor(undefined), null); });
for (const cursor of ["not-a-cursor", `bad|${post.id}`, `${post.createdAt}|${"-".repeat(36)}`, `${post.createdAt}|${post.id}|extra`, `2026-02-30T00:00:00.000Z|${post.id}`, [], null]) test(`reject malformed cursor: ${String(cursor).slice(0, 70)}`, () => assert.throws(() => promotionCursor(cursor)));
test("valid response contract", () => { assert.equal(isPromotionPost(post), true); assert.doesNotThrow(() => assertPromotionPage(page)); });
for (const patch of [{ id: "not-id" }, { author: { id: 42, name: "x" } }, { version: 0 }, { saved: "false" }, { hidden: undefined }, { createdAt: "invalid" }]) test(`reject malformed post response: ${JSON.stringify(patch)}`, () => assert.throws(() => assertPromotionPage({ ...page, items: [{ ...post, ...patch }] })));
for (const broken of [{ items: [] }, { ...page, hasMore: true }, { ...page, canModerate: undefined }, { ...page, items: null }]) test(`reject incomplete page: ${JSON.stringify(broken).slice(0, 60)}`, () => assert.throws(() => assertPromotionPage(broken)));
test("routes retain original community paths and include promotion paths", () => {
  const routes = readFileSync(new URL("../apps/web/src/app/routes/groups/community.routes.tsx", import.meta.url), "utf8");
  for (const route of ["/reviews", "/community", "/community/cafes", "/community/cafes/:slug", "/community/post/:id", "/community/:scope", "/pencafe/:name", "/community/promote", "/community/promote/new", "/community/promote/:id", "/community/promote/:id/edit", "/community/promote/moderation"]) assert.ok(routes.includes(`path: "${route}"`), route);
});
test("production CSP permits only fixed video and payment frame hosts while preserving frame restrictions", () => {
  const policy = JSON.parse(readFileSync(
    new URL("../config/http-response-headers.json", import.meta.url),
    "utf8",
  ));
  const csp = policy.headers
    .find((entry) => entry.source === "/(.*)").headers
    .find((header) => header.key === "Content-Security-Policy").value;
  const frameSource = csp.split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("frame-src "));
  assert.equal(
    frameSource,
    "frame-src https://accounts.google.com https://www.youtube-nocookie.com https://player.vimeo.com https://*.tosspayments.com",
  );
  assert.ok(csp.includes("frame-ancestors 'none'")); assert.ok(csp.includes("object-src 'none'"));
});
test("migration is additive and present in deployment manifest", () => {
  const migration = "apps/api/src/db/migrations/0046_creator_promotion_community.sql";
  const sql = readFileSync(new URL(`../${migration}`, import.meta.url), "utf8");
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/iu);
  assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/gu) ?? []).length, 4);
  assert.ok(readFileSync(new URL("./production-database-migrations.manifest", import.meta.url), "utf8").split("\n").includes(migration));
});
