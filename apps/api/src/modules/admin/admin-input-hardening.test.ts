import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { parseIpAddress } from "./admin-types";

describe("strict security rule inputs", () => {
  it.each(["192.0.2.1/0", "192.0.2.1/32", "2001:db8::/0", "2001:db8::1/128"])(
    "preserves valid boundary %s", (address) => expect(parseIpAddress(address)).toBe(address),
  );
  it.each([
    "192.0.2.1/24junk", "192.0.2.1/24.5", "192.0.2.1/1e2", "192.0.2.1/+24",
    "192.0.2.1/-0", "192.0.2.1/ 24", "192.0.2.1/33", "2001:db8::/129",
    "192.0.2.1/", "192.0.2.1/24/1",
  ])("rejects malformed prefix %s", (address) => {
    expect(() => parseIpAddress(address)).toThrow(BadRequestException);
  });
  it("rejects coercible non-string values", () => {
    expect(() => parseIpAddress(["192.0.2.1"])).toThrow(BadRequestException);
  });
});
