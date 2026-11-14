// Debug helper for world-hash mismatches. Requires Playwright locally.
// Run: node tools/dev/hash-debug.mjs

import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto("http://localhost:8732/?room=ABCDE&q=low", {
  waitUntil: "domcontentloaded",
});
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
console.log(
  await page.evaluate(async () => {
    const m = await import("/client/net/world-hash.js");
    const h = m.computeWorldHashes(window.__G);
    const d = window.__G.city.debugCells();
    return {
      hashes: h,
      player: window.__G.player.pos.toArray(),
      start: window.__G.level.playerStart.pos.toArray(),
      focus: d.focus,
      want: d.want.length,
      built: d.built.length,
      missing: d.want.filter((k) => !d.built.includes(k)),
      cityBoxes: window.__G.physics.boxes.filter((b) => b.tag === "city").length,
    };
  }),
);
await browser.close();