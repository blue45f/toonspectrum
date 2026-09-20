import { BadRequestException, Body, Controller, Header, Post } from "@nestjs/common";

import { FortuneProvenanceProvider, selectedSignSchema } from "./fortune-provenance.provider";

@Controller("/fortune/source")
export class FortuneProvenanceController {
  private readonly provider = new FortuneProvenanceProvider();
  @Post("/zodiac") @Header("Cache-Control", "private, no-store, max-age=0")
  zodiac(@Body() body: unknown) { const parsed = selectedSignSchema.safeParse(body); if (!parsed.success) throw new BadRequestException("별자리만 선택해 주세요. 이름·생년월일은 받지 않습니다."); return this.provider.read(parsed.data.sign); }
}
