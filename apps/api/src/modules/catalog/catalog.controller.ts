import {
  Body,
  Controller,
  Headers,
  Inject,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { CatalogService } from "./catalog.service";

type QueryMap = Record<string, string | string[] | undefined>;

interface TitleQuery {
  ids?: string;
  q?: string;
  limit?: string | number;
  sort?: string;
}

interface ReviewLikePostPayload {
  picked?: unknown;
  seedId?: unknown;
  ratings?: unknown;
  reads?: unknown;
}

interface SearchQuery {
  sort?: string;
  q?: string;
  types?: string;
  genres?: string;
  tags?: string;
  status?: string;
  platforms?: string;
  ages?: string;
  minRating?: string;
  yearMin?: string;
  yearMax?: string;
  freeOnly?: string;
  adaptedOnly?: string;
}

interface CatalogIngestPayload {
  token?: unknown;
  requestedBy?: unknown;
  force?: unknown;
}

@Controller()
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

  @Get("/cover")
  async proxyCover(@Query("u") rawUrl: string | undefined, @Res() res: Response) {
    if (!rawUrl) return res.status(400).send("missing u");

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return res.status(400).send("bad url");
    }

    if (!allowedCoverUrl(url)) return res.status(403).send("forbidden host");

    try {
      let upstream: globalThis.Response | null = null;
      for (let hop = 0; hop < 4; hop++) {
        const response = await fetch(url.toString(), {
          headers: {
            Referer: coverRefererFor(url.hostname),
            "User-Agent": COVER_USER_AGENT,
            Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
          },
          redirect: "manual",
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) return res.status(502).send("bad redirect");
          let nextUrl: URL;
          try {
            nextUrl = new URL(location, url);
          } catch {
            return res.status(502).send("bad redirect");
          }
          if (!allowedCoverUrl(nextUrl)) return res.status(403).send("forbidden redirect");
          url = nextUrl;
          continue;
        }
        upstream = response;
        break;
      }

      if (!upstream) return res.status(502).send("too many redirects");
      if (!upstream.ok) return res.status(502).send("upstream error");

      const headerType = upstream.headers.get("content-type") ?? "";
      const body = Buffer.from(await upstream.arrayBuffer());
      // 헤더가 이미지 타입이거나 매직바이트가 이미지면 통과. 일부 CDN(예: 네이버 확장자 없는 썸네일)은
      // 실제 이미지를 application/octet-stream 으로 응답하므로 헤더만 신뢰하지 않고 바이트로 판별한다.
      const sniffed = sniffImageType(body);
      if (!COVER_OK_TYPE.test(headerType) && !sniffed) {
        return res.status(415).send("not an image");
      }
      res.setHeader("Content-Type", sniffed ?? headerType);
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
      return res.status(200).send(body);
    } catch {
      return res.status(502).send("fetch failed");
    }
  }

  @Get("/home")
  @Header("Cache-Control", "no-store, max-age=0")
  async getHome() {
    return this.catalogService.getHomeData();
  }

  @Get("/calendar")
  @Header("Cache-Control", "no-store, max-age=0")
  async getCalendar() {
    return this.catalogService.getCalendarData();
  }

  @Get("/insights")
  @Header("Cache-Control", "no-store")
  async getInsights() {
    return this.catalogService.getInsightsData();
  }

  @Get("/ranking")
  @Header("Cache-Control", "no-store, max-age=0")
  async getRanking(@Query() query: QueryMap) {
    return this.catalogService.getRankingData(normalizeQueryMap(query));
  }

  @Get("/ranking/health")
  @Header("Cache-Control", "no-store, max-age=0")
  async getRankingHealth() {
    return this.catalogService.getRankingHealth();
  }

  @Get("/catalog/ingest/status")
  @Header("Cache-Control", "no-store, max-age=0")
  async getCatalogIngestStatus() {
    return this.catalogService.getCatalogIngestStatus();
  }

  @Post("/catalog/ingest/run")
  @Header("Cache-Control", "no-store, max-age=0")
  async runCatalogIngest(
    @Body() body: CatalogIngestPayload,
    @Headers("x-catalog-ingest-token") token?: string
  ) {
    return this.catalogService.runCatalogIngest(body ?? {}, token);
  }

  @Post("/catalog/refresh")
  @Header("Cache-Control", "no-store, max-age=0")
  async refreshCatalog(@Headers("x-catalog-ingest-token") token?: string) {
    return this.catalogService.refreshCatalog(token);
  }

  @Get("/explore")
  @Header("Cache-Control", "no-store")
  async getExplore(@Query() query: QueryMap) {
    return this.catalogService.getExploreData(normalizeQueryMap(query));
  }

  @Get("/search")
  @Header("Cache-Control", "no-store, max-age=0")
  async getSearch(@Query() query: SearchQuery) {
    return this.catalogService.getSearchData(query);
  }

  @Post("/recommend")
  @Header("Cache-Control", "no-store, max-age=0")
  async postRecommend(@Body() body: ReviewLikePostPayload) {
    return this.catalogService.getRecommendData(body);
  }

  @Get("/titles")
  @Header("Cache-Control", "no-store, max-age=0")
  async listTitles(@Query() query: TitleQuery) {
    return this.catalogService.getTitles(query);
  }

  @Get("/titles/:id")
  @Header("Cache-Control", "no-store")
  async getTitleDetail(@Param("id") id: string) {
    const data = await this.catalogService.getTitleDetail(id);
    if (!data) throw new NotFoundException("not_found");
    return data;
  }

  @Get("/titles/:id/reviews")
  @Header("Cache-Control", "no-store, max-age=0")
  async getTitleReviews(@Param("id") id: string) {
    return this.catalogService.getTitleReviews(id);
  }

  @Get("/authors/:name")
  @Header("Cache-Control", "no-store")
  async getAuthor(@Param("name") name: string) {
    const data = await this.catalogService.getAuthorData(name);
    if (!data) throw new NotFoundException("not_found");
    return data;
  }
}

function normalizeQueryMap(query: QueryMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query ?? {})) {
    if (Array.isArray(value)) {
      const first = value[0];
      if (typeof first === "string") out[key] = first;
    } else if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

const COVER_ALLOWED_HOST =
  /(^|\.)(pstatic\.net|kakaopagecdn\.com|kakaocdn\.net|ccdn\.lezhin\.com|ridicdn\.net|dn-img-page\.kakao\.com|cdn1\.munpia\.com|cf-image\.joara\.com|d3mcojo3jv0dbr\.cloudfront\.net|img\.mrblue\.com|bookimg\.bookcube\.com|img-books\.onestore\.co\.kr|image\.yes24\.com|novelpia\.com|balcony\.studio|toptoon\.com|toomics\.com|kyobobook\.co\.kr)$/;
const COVER_OK_TYPE = /^image\/(jpeg|jpg|png|webp|avif|gif)\b/i;
const COVER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function allowedCoverUrl(url: URL) {
  return url.protocol === "https:" && COVER_ALLOWED_HOST.test(url.hostname);
}

// 응답 바이트의 매직넘버로 이미지 포맷 판별 (헤더가 octet-stream/누락이어도 실제 이미지면 인식).
// HTML 에러페이지 등 비이미지는 null → 415 유지.
function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

function coverRefererFor(hostname: string) {
  if (/ridicdn/.test(hostname)) return "https://ridibooks.com/";
  if (/munpia/.test(hostname)) return "https://www.munpia.com/";
  if (/joara/.test(hostname)) return "https://www.joara.com/";
  if (/cloudfront/.test(hostname)) return "https://www.postype.com/";
  if (/mrblue/.test(hostname)) return "https://www.mrblue.com/";
  if (/bookcube/.test(hostname)) return "https://www.bookcube.com/";
  if (/onestore|onestory/.test(hostname)) return "https://onestory.co.kr/";
  if (/yes24/.test(hostname)) return "https://www.yes24.com/";
  if (/novelpia/.test(hostname)) return "https://novelpia.com/";
  if (/balcony\.studio/.test(hostname)) return "https://www.bomtoon.com/";
  if (/toptoon/.test(hostname)) return "https://toptoon.com/";
  if (/toomics/.test(hostname)) return "https://www.toomics.com/";
  if (/kyobobook/.test(hostname)) return "https://www.kyobobook.co.kr/";
  if (/lezhin/.test(hostname)) return "https://www.lezhin.com/";
  if (/dn-img-page\.kakao/.test(hostname)) return "https://page.kakao.com/";
  return /kakao/.test(hostname) ? "https://webtoon.kakao.com/" : "https://comic.naver.com/";
}
