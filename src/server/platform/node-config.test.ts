import { describe, expect, it } from "vitest";
import { ConfigError, parseNodeEnv } from "./node-config";

const good = { APP_HOST: "hop.example.com", AUTH_SECRET: "x".repeat(32) };

describe("parseNodeEnv", () => {
  it("applies defaults", () => {
    const s = parseNodeEnv(good);
    expect(s.config.appUrl).toBe("https://hop.example.com");
    expect(s.port).toBe(3000);
    expect(s.trustProxy).toBe(false);
    expect(s.config.testMode).toBe(false);
    expect(s.config.smtp).toBeUndefined();
  });

  it("reads every variable", () => {
    const s = parseNodeEnv({
      ...good,
      APP_URL: "http://app.localhost:8806/",
      PORT: "8806",
      DATA_DIR: "/tmp/hop",
      TRUST_PROXY: "1",
      TEST_MODE: "1",
      METRICS_TOKEN: "m",
      SAFE_BROWSING_KEY: "k",
      GEOIP_DB: "/g.mmdb",
      SMTP_HOST: "mail.example.com",
      SMTP_PORT: "465",
      SMTP_USER: "u",
      SMTP_PASS: "p",
    });
    expect(s).toMatchObject({ port: 8806, dataDir: "/tmp/hop", trustProxy: true, geoipPath: "/g.mmdb" });
    expect(s.config).toMatchObject({ appUrl: "http://app.localhost:8806", testMode: true, metricsToken: "m", safeBrowsingKey: "k" });
    expect(s.config.smtp).toEqual({ host: "mail.example.com", port: 465, user: "u", pass: "p", from: "hop@hop.example.com", tls: "ssl" });
  });

  it("lists every problem in one go", () => {
    try {
      parseNodeEnv({ PORT: "abc" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as Error).message;
      expect(msg).toContain("APP_HOST is required");
      expect(msg).toContain("AUTH_SECRET is required");
      expect(msg).toContain("PORT must be");
    }
  });

  it("rejects a short secret and a host with a scheme", () => {
    expect(() => parseNodeEnv({ ...good, AUTH_SECRET: "short" })).toThrow("too short");
    expect(() => parseNodeEnv({ ...good, APP_HOST: "https://hop.example.com" })).toThrow("bare host");
    expect(() => parseNodeEnv({ ...good, APP_URL: "hop.example.com" })).toThrow("APP_URL");
  });
});
