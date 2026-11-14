// Debug the browser weapon viewmodel and fire path with one browser and one Node client.
import { chromium } from "playwright";
import WebSocket from "ws";
import { createRoomWorld } from "../../server/world.js";

const PORT = process.env.PORT || 8731;
const room = "FIRE1";
const world = createRoomWorld();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text());
});
await page.goto(`http://localhost:${PORT}/?room=${room}&q=low`, {
  waitUntil: "domcontentloaded",
});
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });

const b = new WebSocket(`ws://localhost:${PORT}/ws`);
b.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.t === "welcome")
    b.send(
      JSON.stringify({
        t: "ready",
        portHash: world.portHash,
        cityHash: world.cityHash,
      }),
    );
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
await page.waitForFunction(() => window.__G.net.lastSnap, null, { timeout: 10000 });
await page.waitForTimeout(500);

console.log("state", await page.evaluate(() => ({
  active: window.__G.net.active,
  game: window.__G.game.state,
  weaponVisible: window.__G.weapon.root.visible,
  weaponAmmo: window.__G.weapon.ammo,
  serverAmmo: window.__G.net.lastSnap.self.ammo,
  playerAlive: window.__G.player.alive,
  playerEnabled: window.__G.player.enabled,
  playerState: window.__G.net.lastSnap.self.state,
})));

// Simulate the actual mouse path rather than calling sendFire directly.
await page.evaluate(() => {
  window.__G.input.locked = true;
  window.__G.input.touch = false;
  const view = document.getElementById("view");
  view.dispatchEvent(
    new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true }),
  );
});
const samples = [];
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(200);
  samples.push(
    await page.evaluate(() => ({
      fire: window.__G.input.fire,
      weaponAmmo: window.__G.weapon.ammo,
      serverAmmo: window.__G.net.lastSnap.self.ammo,
      shots: window.__G.combat.stats.shots,
    })),
  );
}
await page.evaluate(() => {
  window.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true }));
});
await page.waitForTimeout(400);

console.log("holding fire", samples);
console.log("after mouse fire", await page.evaluate(() => ({
  weaponAmmo: window.__G.weapon.ammo,
  serverAmmo: window.__G.net.lastSnap.self.ammo,
  shots: window.__G.combat.stats.shots,
  fireHeld: window.__G.input.fire,
  lock: window.__G.input.locked,
})));
console.log("errors", errors.slice(0, 8));
await page.screenshot({ path: "/tmp/saltline-gun.png" });
b.close();
await browser.close();