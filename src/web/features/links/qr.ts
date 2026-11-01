import QRCode from "qrcode";

export type QrOptions = {
  text: string;
  foreground: string;
  background: string;
  /** Edge length in pixels. */
  size: number;
  /** Data URL of an image drawn in the middle. */
  logo?: string | null;
};

/** Share of the code's width taken by the logo. With the highest error correction a code survives about 30% covered. */
const LOGO_RATIO = 0.22;

function qrOptions(o: QrOptions) {
  return {
    errorCorrectionLevel: "H" as const,
    margin: 2,
    width: o.size,
    color: { dark: o.foreground, light: o.background },
  };
}

/** SVG markup. The logo, when given, is embedded as an image on a background-colored square. */
export async function qrSvg(o: QrOptions): Promise<string> {
  const svg = await QRCode.toString(o.text, { ...qrOptions(o), type: "svg" });
  if (!o.logo) return svg;
  const m = /viewBox="0 0 (\d+(?:\.\d+)?) /.exec(svg);
  const modules = m ? Number(m[1]) : 0;
  if (!modules) return svg;
  const box = modules * LOGO_RATIO;
  const pad = box * 0.12;
  const x = (modules - box) / 2;
  const logo =
    `<rect x="${x - pad}" y="${x - pad}" width="${box + pad * 2}" height="${box + pad * 2}" rx="${pad}" fill="${o.background}"/>` +
    `<image href="${o.logo}" x="${x}" y="${x}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet"/>`;
  return svg.replace("</svg>", `${logo}</svg>`);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** PNG file with the same look as the SVG. */
export async function qrPng(o: QrOptions): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, o.text, qrOptions(o));
  if (o.logo) {
    const ctx = canvas.getContext("2d")!;
    const box = canvas.width * LOGO_RATIO;
    const pad = box * 0.12;
    const x = (canvas.width - box) / 2;
    ctx.fillStyle = o.background;
    ctx.fillRect(x - pad, x - pad, box + pad * 2, box + pad * 2);
    const img = await loadImage(o.logo);
    const scale = Math.min(box / img.width, box / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, x + (box - w) / 2, x + (box - h) / 2, w, h);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
}
