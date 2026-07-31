import { describe, expect, it } from "vitest";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { GoogleIdTokenDto } from "./auth.dto";

const bodyMetadata = {
  type: "body" as const,
  metatype: GoogleIdTokenDto,
  data: undefined,
};

describe("Google ID 토큰 DTO", () => {
  const pipe = new ZodValidationPipe(GoogleIdTokenDto);

  it("정상 JWT 형태를 trim한 뒤 허용한다", () => {
    expect(
      pipe.transform({ idToken: "  header.payload.signature  " }, bodyMetadata),
    ).toEqual({ idToken: "header.payload.signature" });
  });

  it("빈 값, JWT가 아닌 값, 알 수 없는 필드를 거부한다", () => {
    expect(() => pipe.transform({ idToken: "" }, bodyMetadata)).toThrow();
    expect(() => pipe.transform({ idToken: "not-a-token" }, bodyMetadata)).toThrow();
    expect(() =>
      pipe.transform(
        { idToken: "header.payload.signature", credential: "legacy-field" },
        bodyMetadata,
      ),
    ).toThrow();
  });
});
