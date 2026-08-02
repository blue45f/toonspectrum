import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { GOOGLE_ID_TOKEN_MAX_LENGTH } from "../../../../../lib/server/oauth";

export const AuthSessionUserSchema = z
  .object({
    id: z.string().min(1).max(512),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
    role: z.enum(["admin", "creator", "operator", "user"]),
  })
  .strict();

export const AuthSessionResponseSchema = z
  .discriminatedUnion("authenticated", [
    z
      .object({
        authenticated: z.literal(true),
        user: AuthSessionUserSchema,
      })
      .strict(),
    z
      .object({
        authenticated: z.literal(false),
        user: z.null(),
      })
      .strict(),
  ]);

export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const GoogleIdTokenSchema = z
  .object({
    idToken: z
      .string()
      .trim()
      .min(1, "Google ID 토큰이 필요해요.")
      .max(GOOGLE_ID_TOKEN_MAX_LENGTH, "Google ID 토큰이 너무 깁니다.")
      .refine(
        (value) => value.split(".").length === 3,
        "Google ID 토큰 형식이 올바르지 않아요.",
      ),
  })
  .strict();

export class GoogleIdTokenDto extends createZodDto(GoogleIdTokenSchema) {}
