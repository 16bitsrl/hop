import { describe, expect, it } from "vitest";
import { formatMetrics, metricsAuthorized, type Stats } from "./metrics";

const stats: Stats = {
  version: "1.2.3",
  links: { total: 10, enabled: 8, broken: 2 },
  clicks: { total: 500, last24h: 7 },
  users: { admin: 1, member: 3, viewer: 0 },
  domains: 2,
};

describe("formatMetrics", () => {
  const text = formatMetrics(stats);
  it("writes HELP, TYPE and samples", () => {
    expect(text).toContain("# HELP hop_links_broken Number of links whose destination is broken.\n# TYPE hop_links_broken gauge\nhop_links_broken 2\n");
    expect(text).toContain("# TYPE hop_clicks_total counter\nhop_clicks_total 500\n");
    expect(text).toContain("hop_clicks_last_24h 7\n");
    expect(text).toContain("hop_domains 2\n");
  });
  it("labels users by role and the build by version", () => {
    expect(text).toContain('hop_users{role="member"} 3\n');
    expect(text).toContain('hop_users{role="viewer"} 0\n');
    expect(text).toContain('hop_build_info{version="1.2.3"} 1\n');
  });
  it("escapes label values", () => {
    expect(formatMetrics({ ...stats, version: 'a"b\\c' })).toContain('hop_build_info{version="a\\"b\\\\c"} 1');
  });
  it("ends with a newline", () => {
    expect(text.endsWith("\n")).toBe(true);
  });
});

describe("metricsAuthorized", () => {
  it("needs a configured token", () => {
    expect(metricsAuthorized("Bearer x", undefined)).toBe(false);
    expect(metricsAuthorized("Bearer x", "")).toBe(false);
  });
  it("accepts only the exact bearer token", () => {
    expect(metricsAuthorized("Bearer secret", "secret")).toBe(true);
    expect(metricsAuthorized("bearer secret", "secret")).toBe(true);
    expect(metricsAuthorized("Bearer secre", "secret")).toBe(false);
    expect(metricsAuthorized("Bearer secrets", "secret")).toBe(false);
    expect(metricsAuthorized("secret", "secret")).toBe(false);
    expect(metricsAuthorized(null, "secret")).toBe(false);
  });
});
