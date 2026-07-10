import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const StudioAiTaskSchema = z.enum([
  "composition",
  "scenario",
  "translation",
  "dialogue",
  "palette",
]);

export const StudioAiProviderPreferenceSchema = z.enum(["auto", "zai", "deepseek"]);

export const StudioAiChatSchema = z
  .object({
    task: StudioAiTaskSchema,
    provider: StudioAiProviderPreferenceSchema.optional(),
    promptVersion: z.literal(1),
    system: z.string().trim().min(1, "AI 작업 지시가 비어 있습니다.").max(6_000),
    user: z.string().trim().min(1, "AI에 전달할 내용이 비어 있습니다.").max(12_000),
  })
  .strict()
  .superRefine((value, context) => {
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
