import { Controller, Get, Header, Inject, Query } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { FORTUNE_ZODIAC_IDS, resolveFortuneBirth } from "../../../../../packages/core/src/fortune";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { FortuneEnrichmentService } from "./fortune-enrichment.service";

const validDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((date) => {
  try { return resolveFortuneBirth({ date }).solarDate === date; } catch { return false; }
}, "1900~2050년의 올바른 날짜를 입력해 주세요.");
export class FortuneCalendarQuery extends createZodDto(z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/u).refine((month) => validDate.safeParse(`${month}-01`).success, "올바른 연월을 입력해 주세요."),
}).strict()) {}
export class FortuneHoroscopeQuery extends createZodDto(z.object({
  sign: z.enum(FORTUNE_ZODIAC_IDS), period: z.enum(["daily", "weekly", "monthly"]), date: validDate,
}).strict()) {}
@Controller("fortune")
export class FortuneEnrichmentController {
  constructor(@Inject(FortuneEnrichmentService) private readonly service: FortuneEnrichmentService) {}
  @Get("capabilities")
  @Header("Cache-Control", "no-store")
  capabilities() { return this.service.capabilities(); }
  @Get("calendar")
  @Header("Cache-Control", "no-store")
  calendar(@Query(new ZodValidationPipe(FortuneCalendarQuery)) query: FortuneCalendarQuery) { return this.service.calendar(query.month); }
  @Get("horoscope")
  @Header("Cache-Control", "no-store")
  horoscope(@Query(new ZodValidationPipe(FortuneHoroscopeQuery)) query: FortuneHoroscopeQuery) { return this.service.horoscope(query.sign, query.period, query.date); }
}
