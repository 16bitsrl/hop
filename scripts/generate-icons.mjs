// Renders the app icons (PNG) from the SVG sources. Run after changing the artwork:
//   node scripts/generate-icons.mjs
// Needs the Playwright Chromium that the E2E tests already use.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const rounded = await readFile("public/icon.svg", "utf8");
const fullBleed = await readFile("icons-src/icon-full-bleed.svg", "utf8");

const targets = [
  { file: "public/icon-192.png", size: 192, svg: rounded },
  { file: "public/icon-512.png", size: 512, svg: rounded },
  // Maskable and Apple icons are full-bleed: the OS applies its own mask or rounding.
  { file: "public/icon-maskable-512.png", size: 512, svg: fullBleed },
  { file: "public/apple-touch-icon.png", size: 180, svg: fullBleed },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, svg } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await writeFile(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  console.log("wrote", file);
}
await browser.close();
