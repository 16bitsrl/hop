import { describe, expect, it } from "vitest";
import { decodeEntities, isPrivateHost, parseHtmlMeta } from "./meta";

describe("parseHtmlMeta", () => {
  it("reads title, description and image", () => {
    const html = `<html><head>
      <title> My &amp; page
        title </title>
      <meta property="og:title" content="OG title">
      <meta property="og:description" content="An &quot;OG&quot; description">
      <meta name="description" content="plain description">
      <meta property="og:image" content="https://example.com/i.png">
    </head></html>`;
    expect(parseHtmlMeta(html)).toEqual({
      title: "My & page title",
      description: 'An "OG" description',
      image: "https://example.com/i.png",
    });
  });

  it("falls back to og:title and the plain description; handles attribute order and quotes", () => {
    const html = `<meta content='Only OG' property='og:title'><meta content=plain name=description>`;
    expect(parseHtmlMeta(html)).toEqual({ title: "Only OG", description: "plain", image: null });
  });

  it("returns nulls for pages without metadata", () => {
    expect(parseHtmlMeta("<html><body>hi</body></html>")).toEqual({ title: null, description: null, image: null });
  });

  it("decodes numeric entities", () => {
    expect(decodeEntities("caff&#232; &#x41;")).toBe("caffè A");
  });
});

describe("isPrivateHost", () => {
  it("flags local and private addresses", () => {
    for (const h of ["localhost", "a.localhost", "127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.1.1", "169.254.169.254", "[::1]", "printer.local"]) {
      expect(isPrivateHost(h)).toBe(true);
    }
    for (const h of ["example.com", "8.8.8.8", "172.32.0.1", "fcm.example.com"]) expect(isPrivateHost(h)).toBe(false);
  });
});
