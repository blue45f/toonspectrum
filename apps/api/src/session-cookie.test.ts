import { describe, expect, it } from "vitest";

import {
  AUTH_SESSION_COOKIE_NAME,
  resolveSessionCookieValue,
} from "./session-cookie";

describe("auth session cookie parser", () => {
  it("extracts the configured cookie value from a raw Cookie header", () => {
    expect(
      resolveSessionCookieValue(
        `other=1; ${AUTH_SESSION_COOKIE_NAME}=abc.123; path=/;`,
      ),
    ).toBe("abc.123");
  });

  it("supports repeated header arrays by concatenating entries", () => {
    expect(
      resolveSessionCookieValue(
        [
          `other=1; ${AUTH_SESSION_COOKIE_NAME}=from-first`,
          `${AUTH_SESSION_COOKIE_NAME}=from-second`,
        ],
      ),
    ).toBe("from-first");
  });

  it("returns null when cookie is absent", () => {
    expect(resolveSessionCookieValue(`other=1; demo=x`)).toBeNull();
    expect(resolveSessionCookieValue(undefined)).toBeNull();
  });
});
