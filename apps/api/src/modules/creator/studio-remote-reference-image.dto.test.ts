import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { StudioRemoteReferenceImageRequestDto } from "./studio-remote-reference-image.dto";

function parseBody(value: unknown) {
  return new ZodValidationPipe(StudioRemoteReferenceImageRequestDto).transform(
    value,
    { type: "body", metatype: undefined, data: undefined }
  );
}

describe("StudioRemoteReferenceImageRequestDto", () => {
  it.each([
    "https://images.example.org/reference.png?token=signed",
    "http://cdn.example.org:80/reference.jpg",
    "https://cdn.example.org:443/reference.webp",
    "https://xn--9d0b4b.example.org/%ED%8F%AC%EC%A6%88.gif",
  ])("accepts an exact standard-port HTTP(S) URL: %s", (url) => {
    expect(parseBody({ url })).toEqual({ url });
  });

  it.each([
    "ftp://images.example.org/reference.png",
    "file:///etc/passwd",
    "https://user:password@images.example.org/reference.png",
    "https://images.example.org/reference.png#private-fragment",
    "https://images.example.org:8443/reference.png",
    "http://images.example.org:8080/reference.png",
    "https://images.example.org/path with space.png",
    "https:\\images.example.org\\reference.png",
  ])("rejects ambiguous or over-privileged URL syntax: %s", (url) => {
    expect(() => parseBody({ url })).toThrow(BadRequestException);
  });

  it("rejects foreign body fields", () => {
    expect(() => parseBody({
      url: "https://images.example.org/reference.png",
      authorization: "Bearer secret",
    })).toThrow(BadRequestException);
  });
});
