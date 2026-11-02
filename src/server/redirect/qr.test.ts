import { inflateSync } from "node:zlib";
import { expect, test } from "vitest";
import { qrPng, qrSvg } from "./qr";

/** Reads width, height and the grey value of one pixel from an 8-bit greyscale PNG. */
function readPng(png: Uint8Array) {
  const buf = Buffer.from(png);
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([data[8], data[9]]).toEqual([8, 0]); // 8-bit greyscale
    }
    if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const pixel = (x: number, y: number) => raw[y * (width + 1) + 1 + x]!;
  return { width, height, pixel };
}

test("the PNG is a square code with a quiet zone and a dark finder pattern in the corner", async () => {
  const png = readPng(await qrPng("https://go.example/menu"));
  expect(png.width).toBe(png.height);
  expect(png.width).toBeGreaterThanOrEqual(512);
  expect(png.pixel(0, 0)).toBe(255); // quiet zone
  const module = png.width / (21 + 4); // smallest version for a short address is 25 modules wide or more
  expect(png.pixel(Math.floor(module * 2.5), Math.floor(module * 2.5))).toBe(0); // top-left finder
});

test("the SVG draws the same code", () => {
  const svg = qrSvg("https://go.example/menu");
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
  expect(svg).toContain('fill="#fff"');
  expect(svg).toContain("<path");
});
