import { describe, expect, it } from "vitest";

import {
  AuthClientIpConfigurationError,
  resolveAuthClientIp,
  resolveAuthClientIpPolicy,
} from "./auth-client-ip";

describe("AUTH_TRUSTED_PROXY_* 정합성", () => {
  it("직접 모드에서 프록시 설정이 비활성화되면 설정만 유지한다", () => {
    expect(resolveAuthClientIpPolicy({})).toEqual({ mode: "direct" });
    expect(resolveAuthClientIpPolicy({ AUTH_TRUSTED_PROXY_ENABLED: "" })).toEqual({
      mode: "direct",
    });
    expect(resolveAuthClientIpPolicy({ AUTH_TRUSTED_PROXY_ENABLED: "false" })).toEqual({
      mode: "direct",
    });
  });

  it("신뢰 프록시를 명시하면 trusted-proxy 모드를 반환한다", () => {
    expect(
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "10.0.0.1,10.0.0.2",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      }),
    ).toEqual({
      mode: "trusted-proxy",
      trustedProxyIps: new Set(["10.0.0.1", "10.0.0.2"]),
      clientIpHeader: "x-forwarded-for",
      maximumForwardedHops: 8,
    });
  });

  it("신뢰 프록시 환경값이 잘못되면 예외를 던진다", () => {
    expect(() => resolveAuthClientIpPolicy({ AUTH_TRUSTED_PROXY_ENABLED: "TRUE" })).toThrow(
      AuthClientIpConfigurationError,
    );
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
      }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "not-an-ip",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "203.0.113.0/24",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      }),
    ).toThrow(AuthClientIpConfigurationError);
  });

  it("잘못된 헤더/홉 제한 값이 있으면 예외를 던진다", () => {
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "203.0.113.1",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-bad-proxy-header",
      }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "203.0.113.1",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
        AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS: "0",
      }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "203.0.113.1",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
        AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS: "33",
      }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "  ",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      }),
    ).toThrow(AuthClientIpConfigurationError);
  });
});

describe("클라이언트 IP 신뢰 경계", () => {
  const trustedProxyPolicy = resolveAuthClientIpPolicy({
    AUTH_TRUSTED_PROXY_ENABLED: "true",
    AUTH_TRUSTED_PROXY_IPS: "203.0.113.10,2001:db8::10",
    AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
    AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS: "4",
  });
  const directPolicy = resolveAuthClientIpPolicy({});

  it("직접 모드에서 소켓 주소를 그대로 사용한다", () => {
    expect(
      resolveAuthClientIp({
        socket: { remoteAddress: "203.0.113.10" },
        headers: { "x-forwarded-for": "198.51.100.1" },
      },
      directPolicy,
      ),
    ).toBe("203.0.113.10");
  });

  it("직접 모드에서 소켓 주소가 없으면 unknown을 반환한다", () => {
    expect(resolveAuthClientIp({}, directPolicy)).toBe("unknown");
  });

  it("신뢰할 수 있는 프록시가 아니면 헤더를 무시한다", () => {
    const policy = trustedProxyPolicy;
    expect(
      resolveAuthClientIp({
        socket: { remoteAddress: "198.51.100.1" },
        headers: { "x-forwarded-for": "198.51.100.7, 192.0.2.1" },
      },
      policy,
    ),
    ).toBe("198.51.100.1");
  });

  it("신뢰 프록시에서 실제 클라이언트를 역방향 체인에서 찾는다", () => {
    expect(
      resolveAuthClientIp(
        {
          socket: { remoteAddress: "203.0.113.10" },
          headers: { "x-forwarded-for": "198.51.100.11, 198.51.100.12, 203.0.113.10" },
        },
        trustedProxyPolicy,
      ),
    ).toBe("198.51.100.12");
  });

  it("x-forwarded-for가 전부 신뢰 프록시면 결정적 첫 값을 사용한다", () => {
    expect(
      resolveAuthClientIp(
        {
          socket: { remoteAddress: "203.0.113.10" },
          headers: { "x-forwarded-for": "203.0.113.10, 2001:db8::10" },
        },
        trustedProxyPolicy,
      ),
    ).toBe("203.0.113.10");
  });

  it("헤더 홉 수를 초과하면 소켓 주소를 사용한다", () => {
    expect(
      resolveAuthClientIp(
        {
          socket: { remoteAddress: "203.0.113.10" },
          headers: {
            "x-forwarded-for":
              "198.51.100.1,198.51.100.2,198.51.100.3,198.51.100.4,198.51.100.5",
          },
        },
        trustedProxyPolicy,
      ),
    ).toBe("203.0.113.10");
  });

  it("비표준 헤더 모드에서는 단일 값만 신뢰한다", () => {
    const policy = resolveAuthClientIpPolicy({
      AUTH_TRUSTED_PROXY_ENABLED: "true",
      AUTH_TRUSTED_PROXY_IPS: "203.0.113.10",
      AUTH_TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
    });

    expect(
      resolveAuthClientIp(
        {
          socket: { remoteAddress: "203.0.113.10" },
          headers: { "x-real-ip": "198.51.100.7" },
        },
        policy,
      ),
    ).toBe("198.51.100.7");
  });

  it("IPv6-mapped IPv4 텍스트도 정규화한다", () => {
    expect(
      resolveAuthClientIp(
        {
          socket: { remoteAddress: "[::ffff:192.0.2.5]" },
          headers: {},
        },
        directPolicy,
      ),
    ).toBe("192.0.2.5");
  });
});
