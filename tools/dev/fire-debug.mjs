// Debug the browser fire path with one browser and one Node client.
import { chromium } from "playwright";
import WebSocket from "ws";
import { createRoomWorld } from "../../server/world.js";

const room = "FIRE1";
const world = createRoomWorld();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:8732/?room=${room}&q=low`, {
  waitUntil: "domcontentloaded",
});
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });

const b = new WebSocket("ws://localhost:8732/ws");
const bEvents = [];
b.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.t === "welcome") { console.log("B welcome", msg.playerId);
    b.send(JSON.stringify({ t: "ready", portHash: world.portHash, cityHash: world.cityHash })); }
  if (msg.t === "ev") bEvents.push(msg);
});
b.on("open", () =>
  b.send(JSON.stringify({ t: "hello", v: 1, build: "test", room })),
);

await page.click('[data-act="coop"]');
await page.waitForTimeout(200);
await page.fill(".mp-code", room);
await page.click(".mp-connect");
await page.waitForFunction(() => window.__G.net && window.__G.net.started, null, {
  timeout: 30000,
});
console.log("started", await page.evaluate(() => ({
  active: window.__G.net.active,
  playerId: window.__G.net.playerId,
  seq: window.__G.net.seq,
  tick: window.__G.net.lastSnap.tick,
  ammo: window.__G.net.lastSnap.self.ammo,
  enemies: window.__G.net.lastSnap.enemies.length,
})));
console.log(
  "sendFire",
  await page.evaluate(() => {
    const o = window.__G.camera.position.clone();
    const d = new window.__G.THREE.Vector3(0, 0, -1);
    const ok = window.__G.net.sendFire(o, d);
    return {
      ok,
      seq: window.__G.net.seq,
      active: window.__G.net.active,
      ws: window.__G.net.ws && window.__G.net.ws.readyState,
      sent: window.__G.net.lastSent,
    };
  }),
);
await page.waitForTimeout(800);
console.log("after", await page.evaluate(() => ({
  ammo: window.__G.net.lastSnap.self.ammo,
  playerId: window.__G.net.playerId,
  tick: window.__G.net.lastSnap.tick,
  shots: window.__G.combat.stats.shots,
  hp: window.__G.net.lastSnap.self.hp,
})));
console.log("node events", bEvents.filter((e) => e.k === "shot").slice(-3));
console.log("errors", errors);
b.close();
await browser.close();