import {
  Body,
  Controller,
  Inject,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
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

@Controller()
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

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
