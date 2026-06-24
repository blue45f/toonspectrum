// apps/api/src/modules/fortune/fortune.dto.ts
//
// 운세 엔드포인트 입력 검증 — nestjs-zod DTO. 전역 ZodValidationPipe가 자동 검증해
// 빈/잘못된 입력은 500 크래시 대신 400 + 한글 메시지로 막는다.

import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const characterId = z.string({ error: "캐릭터를 선택해 주세요." }).min(1, "캐릭터를 선택해 주세요.");
const gender = z.enum(["male", "female", "none"]).optional();
const timeStr = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시간은 HH:MM 형식이어야 해요.")
  .optional();

// YYYY-MM-DD + 실제 달력상 유효한 날짜인지 검증 (미입력 시 한글 메시지)
const dateStr = z
  .string({ error: "생년월일을 입력해 주세요." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일은 YYYY-MM-DD 형식이어야 해요.")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return (
      dt.getFullYear() === y &&
      dt.getMonth() === m - 1 &&
      dt.getDate() === d &&
      y >= 1900 &&
      y <= 2100
    );
  }, "올바른 날짜가 아니에요.");

export class TodayDto extends createZodDto(
  z.object({
    characterId,
    birthDate: dateStr.optional(),
    birthTime: timeStr,
    gender,
  })
) {}

export class SajuDto extends createZodDto(
  z.object({
    characterId,
    birthDate: dateStr, // 필수
    birthTime: timeStr,
    gender,
  })
) {}

export class CompatibilityDto extends createZodDto(
  z.object({
    characterId,
    myBirthDate: dateStr,
    myBirthTime: timeStr,
    partnerBirthDate: dateStr,
    partnerBirthTime: timeStr,
  })
) {}

export class PrescriptionDto extends createZodDto(
  z.object({
    characterId,
    query: z.string().trim().min(2, "고민을 조금만 더 적어 주세요.").max(500, "내용이 너무 길어요. 500자 이내로 적어 주세요."),
  })
) {}

export class TarotDto extends createZodDto(
  z.object({
    characterId,
    cardIdx: z.number().int().min(0).max(11).optional(),
  })
) {}

export class ZodiacDto extends createZodDto(
  z.object({
    characterId,
    month: z.number().int().min(1, "월은 1~12 사이여야 해요.").max(12, "월은 1~12 사이여야 해요."),
    day: z.number().int().min(1, "일은 1~31 사이여야 해요.").max(31, "일은 1~31 사이여야 해요."),
  })
) {}
