import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const StudioAiTaskSchema = z.enum([
  "assistant",
  "composition",
  "scenario",
  "translation",
  "dialogue",
  "palette",
]);

export const StudioAiFreeProviderSchema = z.enum([
  "gemini",
  "qwen",
  "groq",
  "sambanova",
  "zai",
  "mistral",
  "cloudflare",
  "openrouter",
  "siliconflow",
]);

export const StudioAiProviderPreferenceSchema = z.enum([
  "auto",
  "gemini",
  "qwen",
  "groq",
  "sambanova",
  "zai",
  "mistral",
  "cloudflare",
  "openrouter",
  "siliconflow",
  "deepseek",
]);

export const StudioAiChatSchema = z
  .object({
    task: StudioAiTaskSchema,
    provider: StudioAiProviderPreferenceSchema.optional(),
    providerOrder: z.array(StudioAiFreeProviderSchema).max(9).optional(),
    promptVersion: z.literal(1),
    system: z.string().trim().min(1, "AI 작업 지시가 비어 있습니다.").max(6_000),
    user: z.string().trim().min(1, "AI에 전달할 내용이 비어 있습니다.").max(12_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.providerOrder && new Set(value.providerOrder).size !== value.providerOrder.length) {
      context.addIssue({
        code: "custom",
        path: ["providerOrder"],
        message: "AI 제공자 우선순위에 중복 항목이 있습니다.",
      });
    }
    if (value.system.length + value.user.length > 18_000) {
      context.addIssue({
        code: "custom",
        path: ["user"],
        message: "AI 요청 내용은 총 18,000자 이하여야 해요.",
      });
    }
  });

export class StudioAiChatDto extends createZodDto(StudioAiChatSchema) {}

export type StudioAiTask = z.infer<typeof StudioAiTaskSchema>;
export type StudioAiProviderPreference = z.infer<typeof StudioAiProviderPreferenceSchema>;
