import { describe, expect, it } from "vitest";
import { iconCandidates, rasterType } from "./site-icon";

const base = new URL("https://example.com");

describe("iconCandidates", () => {
  it("puts declared icons first, touch icons after, and /favicon.ico last", () => {
    const html = `<head>
      <link rel="apple-touch-icon" href="/touch.png">
      <link rel="stylesheet" href="/a.css">
      <link href="/fav.png" rel="shortcut icon">
      <link rel="mask-icon" href="/mask.svg">
    </head>`;
    expect(iconCandidates(html, base)).toEqual(["https://example.com/fav.png", "https://example.com/touch.png", "https://example.com/favicon.ico"]);
  });

  it("resolves relative and protocol-relative addresses and decodes entities", () => {
    const html = `<link rel=icon href="img/i.png?a=1&amp;b=2"><link rel="ICON" href="//cdn.example.net/i.ico">`;
    expect(iconCandidates(html, base)).toEqual([
      "https://example.com/img/i.png?a=1&b=2",
      "https://cdn.example.net/i.ico",
      "https://example.com/favicon.ico",
    ]);
  });

  it("skips duplicates, non-web addresses and empty hrefs", () => {
    const html = `<link rel="icon" href="/favicon.ico"><link rel="icon" href="data:image/png;base64,AA"><link rel="icon" href="">`;
    expect(iconCandidates(html, base)).toEqual(["https://example.com/favicon.ico"]);
  });

  it("tries at most two declared icons and one touch icon, whatever the page declares", () => {
    const html = Array.from({ length: 50 }, (_, i) => `<link rel="icon" href="/i${i}.png"><link rel="apple-touch-icon" href="/t${i}.png">`).join("");
    expect(iconCandidates(html, base)).toEqual([
      "https://example.com/i0.png",
      "https://example.com/i1.png",
      "https://example.com/t0.png",
      "https://example.com/favicon.ico",
    ]);
  });

  it("falls back to /favicon.ico when the page declares nothing", () => {
    expect(iconCandidates("", base)).toEqual(["https://example.com/favicon.ico"]);
  });
});

describe("rasterType", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const text = (s: string) => new TextEncoder().encode(s);

  it("recognises PNG, JPEG, GIF, WebP and ICO by their first bytes", () => {
    expect(rasterType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(rasterType(bytes(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    expect(rasterType(text("GIF89a......"))).toBe("image/gif");
    expect(rasterType(text("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(rasterType(bytes(0, 0, 1, 0))).toBe("image/x-icon");
  });

  it("refuses SVG, HTML and anything else, whatever the server called it", () => {
    expect(rasterType(text(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`))).toBeNull();
    expect(rasterType(text("<!doctype html><html></html>"))).toBeNull();
    expect(rasterType(new Uint8Array())).toBeNull();
  });
});
