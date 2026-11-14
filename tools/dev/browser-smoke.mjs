// Manual two-browser co-op smoke test. Requires `PORT=8732 node server/index.js`
// and a local Playwright install (`npm i --no-save playwright`).
// Run: node tools/dev/browser-smoke.mjs

import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 900, height: 560 } });
const errors = [];

async function bootPage(name) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(name + " pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("404"))
      errors.push(name + " console: " + m.text());
  });
  await page.goto("http://localhost:8732/?room=ABCDE&q=low", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => window.__ready === true, null, {
    timeout: 180000,
  });
  console.log(name, "ready");
  return page;
}

const a = await bootPage("A");
const b = await bootPage("B");

for (const [name, page] of [["A", a], ["B", b]]) {
  console.log(
    name,
    "hashes",
    await page.evaluate(async () => {
      const m = await import("/client/net/world-hash.js");
      const h = m.computeWorldHashes(window.__G);
      return {
        ...h,
        cityBoxes: window.__G.physics.boxes.filter((b) => b.tag === "city").length,
        cells: window.__G.city && window.__G.city.stats,
      };
    }),
  );
  await page.click('[data-act="coop"]');
  await page.waitForTimeout(200);
  await page.fill(".mp-code", "ABCDE");
  await page.click(".mp-connect");
  await page.waitForTimeout(300);
  console.log(name, "status", await page.textContent(".mp-status"));
}

for (const [name, page] of [["A", a], ["B", b]]) {
  try {
    await page.waitForFunction(
      () => window.__G.net && window.__G.net.started,
      null,
      { timeout: 30000 },
    );
    console.log(
      name,
      "started",
      await page.evaluate(() => ({
        state: window.__G.game.state,
        active: window.__G.net.active,
        playerId: window.__G.net.playerId,
        tick: window.__G.net.lastSnap && window.__G.net.lastSnap.tick,
        players: window.__G.net.lastSnap && window.__G.net.lastSnap.players.length,
      })),
    );
  } catch {
    console.log(
      name,
      "did not start",
      await page.evaluate(() => ({
        panel: document.querySelector(".mp")?.hidden,
        status: document.querySelector(".mp-status")?.textContent,
      })),
    );
  }
}

await a.waitForTimeout(1500);
console.log(
  "world",
  await a.evaluate(() => ({
    enemies: window.__G.net.lastSnap.enemies.length,
    remote: window.__G.enemies.list.filter((e) => e.remote).length,
    hp: window.__G.player.health,
    ammo: window.__G.net.lastSnap.self.ammo,
  })),
);

await a.evaluate(() => {
  const e = window.__G.net.lastSnap.enemies[0];
  if (!e) return;
  const o = window.__G.camera.position.clone();
  const d = new window.__G.THREE.Vector3(
    e.pos[0] - o.x,
    e.pos[1] + 0.8 - o.y,
    e.pos[2] - o.z,
  ).normalize();
  window.__G.combat.playerShot(o, d, {});
});
await a.waitForTimeout(600);
console.log(
  "after fire",
  await a.evaluate(() => ({
    ammo: window.__G.net.lastSnap.self.ammo,
    weapon: window.__G.weapon.ammo,
  })),
);

for (const [name, page] of [["A", a], ["B", b]]) {
  await page.evaluate(() => {
    window.__G.input.locked = true;
  });
  console.log(name, "input unlocked for test", await page.evaluate(() => window.__G.input.locked));
}

await a.keyboard.down("a");
await a.waitForTimeout(300);
console.log(
  "input sample",
  await a.evaluate(() => ({
    move: { ...window.__G.input.move },
    forward: window.__G.input.down("left"),
    pos: window.__G.player.pos.toArray(),
    locked: window.__G.input.locked,
    touch: window.__G.input.touch,
    gameplay: window.__G.input.down("fire"),
  })),
);
await a.waitForTimeout(1100);
await a.keyboard.up("a");
await a.waitForTimeout(600);

const posA = await a.evaluate(() => window.__G.player.pos.toArray());
const seenByB = await b.evaluate(
  () => window.__G.net.lastSnap && window.__G.net.lastSnap.players[0].pos,
);
console.log("A pos", posA, "B sees A", seenByB);

console.log("errors", errors.slice(0, 10));
await a.screenshot({ path: "/tmp/saltline-a.png" });
await b.screenshot({ path: "/tmp/saltline-b.png" });
await browser.close();