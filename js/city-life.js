// Saltline — what lives in the endless city.
//
// The fixed port populates itself from level.enemySpawns and ships no pickups
// at all. Past the fence this module fills the generated city instead:
//
//   • Each 40 m block gets one encounter, spawned when the player first steps
//     into it. Kill the pack and the block stays clear for the rest of the run;
//     nothing respawns where you already fought. Blocks further from the
//     spawn point hold bigger packs, so the only way to find a real fight is
//     to keep walking outward.
//   • Rifle magazines and medkits lie on the streets. Magazines go straight to
//     the reserve; medkits go into a small inventory that the player can spend
//     with the heal key (or by tapping the vitals panel on touch).
//
// A pack left behind is retired once it is well out of range, and since it was
// never finished its block is not marked clear: come back and it re-arms.

import * as THREE from "./vendor/three.module.js";
import { t as tr } from "./i18n.js";
import { CITY_GRID } from "./city.js";
import { CITY_LIFE as TUNE } from "../shared/constants.js";

const { RESERVED, CELL } = CITY_GRID;

// The port is not city: never spawn inside the fixed level, and never east of
// the quay where the city stops and the harbour water begins.
function inPort(x, z) {
  return (
    x > RESERVED.x0 - 2 &&
    x < RESERVED.x1 + 2 &&
    z > RESERVED.z0 - 2 &&
    z < RESERVED.z1 + 2
  );
}

function cellAt(x, z) {
  return { x: Math.round(x / CELL), z: Math.round(z / CELL) };
}

export function createCityLife(game) {
  const root = new THREE.Group();
  root.name = "city-life";
  game.scene.add(root);

  const matBody = game.mats.get("gunmetal", { triplanar: true });
  const matBand = game.mats.emissive(0xffa63a, 3.4);
  const matRing = game.mats.emissive(0xffc96a, 1.5);
  const matMed = game.mats.get("paint_white", { triplanar: true });
  const matCross = game.mats.emissive(0xff4232, 3.2);
  const matMedRing = game.mats.emissive(0xff6a55, 1.5);

  const geoBody = new THREE.BoxGeometry(0.28, 0.36, 0.11);
  const geoBand = new THREE.BoxGeometry(0.3, 0.05, 0.12);
  const geoRing = new THREE.TorusGeometry(0.38, 0.012, 6, 24).rotateX(
    Math.PI / 2,
  );
  const geoMed = new THREE.BoxGeometry(0.4, 0.3, 0.26);
  const geoCrossV = new THREE.BoxGeometry(0.08, 0.24, 0.3);
  const geoCrossH = new THREE.BoxGeometry(0.42, 0.08, 0.3);
  const geoCrate = new THREE.BoxGeometry(0.5, 0.3, 0.34);
  const geoCrateBand = new THREE.BoxGeometry(0.52, 0.06, 0.36);

  const drops = [];
  const encounters = new Map(); // cell key -> { cell, total, killed, escaped, members }
  const cleared = new Set(); // cell keys whose pack was wiped out
  const probe = new THREE.Vector3();

  let clock = 0;
  let magT = 0.6;
  let medT = 1.6;
  let triggerT = 0;
  let lastPack = TUNE.packBase;
  let wasOutside = false;

  function walkable(x, z) {
    if (x > 22.5) return false;
    if (inPort(x, z)) return false;
    try {
      if (game.city.streetAt && !game.city.streetAt(x, z)) return false;
      return !game.physics.cityBlocked(x, z);
    } catch {
      return false;
    }
  }

  // A random open point in an annulus around the player, for the supplies.
  // Points in the player's line of sight are skipped when possible so nothing
  // pops into existence in front of them; the first valid point is the
  // fallback when the street is wide open.
  function spot(player, near, far, hidden) {
    const pos = player.pos || player;
    let fallback = null;
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = near + Math.random() * Math.max(0.1, far - near);
      const x = pos.x + Math.cos(a) * r;
      const z = pos.z + Math.sin(a) * r;
      if (!walkable(x, z)) continue;
      const v = new THREE.Vector3(x, 0, z);
      if (!hidden) return v;
      if (!fallback) fallback = v;
      let seen = false;
      if (player.eye) {
        probe.set(x, 1, z);
        try {
          seen = game.physics.lineOfSight(player.eye, probe);
        } catch {}
      }
      if (!seen) return v;
    }
    return fallback;
  }

  // A point on the street ring of one specific block. The pack belongs to the
  // block the player just entered, so it must not spill into a neighbour and
  // leave one block clear and the other permanently armed.
  function spotInCell(cell, player, near, far, hidden) {
    const x0 = cell.x * CELL;
    const z0 = cell.z * CELL;
    let fallback = null;
    for (let i = 0; i < 40; i++) {
      const x = x0 + 1.5 + Math.random() * (CELL - 3);
      const z = z0 + 1.5 + Math.random() * (CELL - 3);
      if (!walkable(x, z)) continue;
      const d = Math.hypot(x - player.pos.x, z - player.pos.z);
      if (d < 6) continue;
      const v = new THREE.Vector3(x, 0, z);
      if (!fallback) fallback = v;
      if (d < near || d > far) continue;
      if (!hidden) return v;
      let seen = false;
      if (player.eye) {
        probe.set(x, 1, z);
        try {
          seen = game.physics.lineOfSight(player.eye, probe);
        } catch {}
      }
      if (!seen) return v;
    }
    return fallback;
  }

  // Pack size grows with distance from the campaign's spawn point, not from
  // the city edge: every block further out is a little more dangerous.
  function pressure(player) {
    const o = game.level && game.level.playerStart && game.level.playerStart.pos;
    const d = o ? Math.hypot(player.pos.x - o.x, player.pos.z - o.z) : 0;
    return {
      dist: d,
      pack: Math.min(
        TUNE.packMax,
        TUNE.packBase + Math.floor(Math.max(0, d - 30) / TUNE.packRamp),
      ),
    };
  }

  function makeDrop(kind) {
    const g = new THREE.Group();
    if (kind === "med") {
      const body = new THREE.Mesh(geoMed, matMed);
      body.castShadow = true;
      body.receiveShadow = true;
      const v = new THREE.Mesh(geoCrossV, matCross);
      const h = new THREE.Mesh(geoCrossH, matCross);
      g.add(body, v, h, new THREE.Mesh(geoRing, matMedRing));
    } else if (kind === "cache") {
      const body = new THREE.Mesh(geoCrate, matBody);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(
        body,
        new THREE.Mesh(geoCrateBand, matBand),
        new THREE.Mesh(geoRing, matRing),
      );
    } else {
      const body = new THREE.Mesh(geoBody, matBody);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body, new THREE.Mesh(geoBand, matBand), new THREE.Mesh(geoRing, matRing));
    }
    return g;
  }

  // street: true for the ambient supply drops that obey the magazine/medkit
  // caps; false for wreck loot, which is free to pile up until it despawns.
  function pushDrop(kind, x, z, base, amount, street) {
    const g = makeDrop(kind);
    g.position.set(x, base, z);
    g.scale.setScalar(0.55);
    root.add(g);
    drops.push({
      kind,
      g,
      x,
      z,
      base,
      amount,
      street,
      phase: Math.random() * 6.283,
      age: 0,
      take: street
        ? kind === "med"
          ? TUNE.medTake
          : TUNE.magTake
        : TUNE.lootTake,
      keep: street
        ? kind === "med"
          ? TUNE.medKeep
          : TUNE.magKeep
        : TUNE.lootKeep,
    });
  }

  function countKind(kind) {
    let n = 0;
    for (const p of drops) if (p.kind === kind && p.street) n++;
    return n;
  }

  function spawnDrop(kind, player) {
    const med = kind === "med";
    const s = spot(
      player,
      med ? TUNE.medNear : TUNE.magNear,
      med ? TUNE.medFar : TUNE.magFar,
      true,
    );
    if (!s) return;
    const gap = med ? TUNE.medGap : TUNE.magGap;
    for (const p of drops)
      if (Math.hypot(p.x - s.x, p.z - s.z) < gap) return;
    pushDrop(
      kind,
      s.x,
      s.z,
      med ? 0.62 : 0.58,
      med ? 1 : TUNE.magRounds,
      true,
    );
  }

  function takeDrop(p, index) {
    if (p.kind === "med") {
      game.player.addMedkit && game.player.addMedkit(1);
      game.events.emit("ui:click", {});
      game.hud &&
        game.hud.message &&
        game.hud.message(tr("city_medkit"), 1.8);
    } else {
      const n = p.amount || TUNE.magRounds;
      try {
        game.weapon && game.weapon.addAmmo && game.weapon.addAmmo(n);
      } catch {}
      game.events.emit("weapon:reload", { phase: "magin" });
      game.hud &&
        game.hud.message &&
        game.hud.message(
          tr(p.kind === "cache" ? "city_loot_ammo" : "city_ammo", { n }),
          p.kind === "cache" ? 2.0 : 1.7,
        );
    }
    root.remove(p.g);
    drops.splice(index, 1);
  }

  // Where a wreck's gear lands. In the city it has to be a street the player
  // can actually walk to; in the port, use the surface under the crash.
  function lootPoint(pos) {
    const x = +pos.x;
    const z = +pos.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    if (game.city && game.city.streetAt && !inPort(x, z)) {
      if (walkable(x, z)) return { x, z, y: 0 };
      for (let r = 1; r <= 14; r++)
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const qx = x + Math.cos(a) * r;
          const qz = z + Math.sin(a) * r;
          if (walkable(qx, qz)) return { x: qx, z: qz, y: 0 };
        }
      return null;
    }
    let y = 0;
    try {
      y = game.physics.groundHeight(x, z, (+pos.y || 0) + 1);
    } catch {
      return null;
    }
    if (!Number.isFinite(y) || y < -0.5) return null;
    return { x, z, y };
  }

  function spawnKillLoot(pos) {
    const at = lootPoint(pos);
    if (!at) return;
    const a = Math.random() * Math.PI * 2;
    const d = TUNE.lootScatter;
    // Throw the two boxes clear of the wreck so its body does not hide them.
    const cache =
      lootPoint({
        x: at.x + Math.cos(a) * d,
        z: at.z + Math.sin(a) * d,
        y: at.y + 1,
      }) || at;
    const med =
      lootPoint({
        x: at.x - Math.cos(a) * d,
        z: at.z - Math.sin(a) * d,
        y: at.y + 1,
      }) || at;
    pushDrop("cache", cache.x, cache.z, cache.y + 0.6, TUNE.lootAmmo, false);
    pushDrop("med", med.x, med.z, med.y + 0.62, 1, false);
  }

  function aliveCount() {
    let n = 0;
    for (const enc of encounters.values()) n += enc.members.length;
    return n;
  }

  function startEncounter(player, cell, key) {
    if (cleared.has(key) || encounters.has(key)) return;
    if (aliveCount() >= TUNE.aliveMax) return;

    const want = pressure(player).pack;
    const members = [];
    const chosen = [];
    for (let i = 0; i < want && aliveCount() + members.length < TUNE.aliveMax; i++) {
      let s = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const q = spotInCell(cell, player, TUNE.packNear, TUNE.packFar, true);
        if (!q) break;
        let apart = true;
        for (const o of chosen)
          if (o.distanceToSquared(q) < TUNE.packGap * TUNE.packGap) {
            apart = false;
            break;
          }
        if (apart) {
          s = q;
          break;
        }
      }
      if (!s) continue;
      chosen.push(s);
      const type = Math.random() < 0.55 ? "hound" : "gull";
      if (type === "gull") s.y = 6 + Math.random() * 4;
      let e = null;
      try {
        e = game.enemies.spawn(type, s, { state: "alert", target: player.pos });
      } catch (err) {
        console.error("[city] enemies.spawn threw", err);
      }
      if (e) members.push(e);
    }

    if (!members.length) return;
    encounters.set(key, {
      cell,
      total: members.length,
      killed: 0,
      escaped: 0,
      members,
    });

    if (members.length > lastPack) {
      lastPack = members.length;
      game.hud &&
        game.hud.message &&
        game.hud.message(tr("city_threat", { n: members.length }), 2.8);
    }
  }

  // Keep every live pack honest: drop the dead, retire stragglers left far
  // behind, and mark a block clear only when every machine in its pack died.
  function updateEncounters(player) {
    for (const [key, enc] of [...encounters]) {
      for (let i = enc.members.length - 1; i >= 0; i--) {
        const e = enc.members[i];
        if (!e.active || !e.alive) {
          if (!e.alive) enc.killed++;
          else enc.escaped++;
          enc.members.splice(i, 1);
          continue;
        }
        if (
          e.pos.distanceToSquared(player.pos) >
          TUNE.enemyKeep * TUNE.enemyKeep
        ) {
          try {
            e._deactivate();
          } catch {}
          const list = game.enemies && game.enemies.list;
          const j = list ? list.indexOf(e) : -1;
          if (j >= 0) list.splice(j, 1);
          enc.escaped++;
          enc.members.splice(i, 1);
        }
      }
      if (enc.members.length) continue;
      encounters.delete(key);
      if (enc.killed >= enc.total && enc.escaped === 0) {
        cleared.add(key);
        game.hud &&
          game.hud.message &&
          game.hud.message(tr("city_clear"), 1.5);
      }
    }
  }

  function update(dt) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    clock += dt;

    const player = game.player;
    if (!player || !player.alive || !player.pos) return;

    updateEncounters(player);

    const outside = !inPort(player.pos.x, player.pos.z);
    if (!outside) {
      wasOutside = false;
    } else {
      if (!wasOutside) {
        wasOutside = true;
        magT = Math.min(magT, 0.5);
        medT = Math.min(medT, 1.4);
      }

      // One encounter per block. A cleared block never arms again, so the
      // only place to find a new fight is a block you have not visited yet.
      triggerT -= dt;
      const cell = cellAt(player.pos.x, player.pos.z);
      const key = cell.x + "," + cell.z;
      if (triggerT <= 0 && !cleared.has(key) && !encounters.has(key)) {
        triggerT = 0.8;
        startEncounter(player, cell, key);
      }

      magT -= dt;
      if (magT <= 0) {
        magT = TUNE.magEvery;
        if (countKind("ammo") < TUNE.magMax) spawnDrop("ammo", player);
      }

      medT -= dt;
      if (medT <= 0) {
        medT = TUNE.medEvery;
        if (countKind("med") < TUNE.medMax) spawnDrop("med", player);
      }
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const p = drops[i];
      const dx = p.x - player.pos.x;
      const dz = p.z - player.pos.z;
      const d2 = dx * dx + dz * dz;
      const take = p.take || TUNE.lootTake;
      const keep = p.keep || TUNE.lootKeep;
      const full = p.kind === "med" && player.medkits >= player.medkitMax;
      if (d2 < take * take && !full) {
        takeDrop(p, i);
        continue;
      }
      if (d2 > keep * keep) {
        root.remove(p.g);
        drops.splice(i, 1);
        continue;
      }
      p.age += dt;
      const k = Math.min(1, p.age / 0.22);
      p.g.scale.setScalar(0.55 + 0.45 * k * k * (3 - 2 * k));
      p.g.rotation.y += dt * 1.3;
      p.g.position.y = p.base + Math.sin(clock * 2.1 + p.phase) * 0.06;
    }
  }

  function clear() {
    for (const p of drops) root.remove(p.g);
    drops.length = 0;
    for (const enc of encounters.values()) {
      for (const e of enc.members) {
        if (!e.active) continue;
        try {
          e._deactivate();
        } catch {}
        const list = game.enemies && game.enemies.list;
        const j = list ? list.indexOf(e) : -1;
        if (j >= 0) list.splice(j, 1);
      }
    }
    encounters.clear();
    cleared.clear();
    magT = 0.6;
    medT = 1.6;
    triggerT = 0;
    lastPack = TUNE.packBase;
    wasOutside = false;
  }

  game.events.on("enemy:crashed", (ev) => {
    if (ev && ev.pos) spawnKillLoot(ev.pos);
  });

  return {
    update,
    clear,
    debug: {
      drops,
      encounters,
      cleared,
      pressure: () => (game.player ? pressure(game.player) : null),
    },
  };
}