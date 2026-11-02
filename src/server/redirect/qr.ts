import { create } from "qrcode/lib/core/qrcode.js";

/*
 * QR codes for "<slug>.qr" (PNG) and "<slug>.qrv" (SVG), as YOURLS's QR plugin did.
 * Drawn here, with no outside service and no native code, so it runs on Workers and Node alike.
 */

const MARGIN = 2;
/** Smallest edge of the PNG, in pixels (the SVG is drawn at this size too). */
const MIN_PX = 512;

function matrix(text: string) {
  const { size, data } = create(text, { errorCorrectionLevel: "M" }).modules;
  return { size, dark: (x: number, y: number) => data[y * size + x] === 1 };
}

export function qrSvg(text: string): string {
  const { size, dark } = matrix(text);
  const full = size + MARGIN * 2;
  let d = "";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (dark(x, y)) d += `M${x + MARGIN} ${y + MARGIN}h1v1h-1z`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" width="${MIN_PX}" height="${MIN_PX}" shape-rendering="crispEdges">` +
    `<rect width="${full}" height="${full}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`
  );
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function zlib(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  // "deflate" is the zlib format PNG expects.
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 8-bit greyscale PNG, black on white. */
export async function qrPng(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const { size, dark } = matrix(text);
  const full = size + MARGIN * 2;
  const scale = Math.ceil(MIN_PX / full); // whole pixels per module keep the edges sharp
  const px = full * scale;
  const raw = new Uint8Array(px * (px + 1)).fill(255);
  for (let y = 0; y < px; y++) {
    raw[y * (px + 1)] = 0; // no filter on this row
    const my = Math.floor(y / scale) - MARGIN;
    for (let x = 0; x < px; x++) {
      const mx = Math.floor(x / scale) - MARGIN;
      if (mx >= 0 && my >= 0 && mx < size && my < size && dark(mx, my)) raw[y * (px + 1) + 1 + x] = 0;
    }
  }
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, px);
  hv.setUint32(4, px);
  header.set([8, 0, 0, 0, 0], 8); // 8-bit, greyscale, deflate, adaptive filtering, no interlace
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", await zlib(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
