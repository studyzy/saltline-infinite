// Authoritative hit resolution. Static world is current; players and enemies
// are supplied from the historical tick that matches the shot's input seq.

import { Vector3 } from "../shared/three.js";

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpD = new Vector3();

function sphereHit(origin, dir, maxDist, center, radius) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxDist) return null;
  return t;
}

function capsuleHit(origin, dir, maxDist, a, b, radius) {
  // Closest point on the ray to the capsule segment, then a sphere test at
  // that point. Good enough for the small hitboxes here and much simpler than
  // an exact capsule intersection.
  const d = tmpA.subVectors(b, a);
  const len2 = d.lengthSq();
  const oa = tmpB.subVectors(origin, a);
  const oad = oa.dot(dir);
  const abd = d.dot(dir);
  const abo = d.dot(oa);
  let tRay = 0;
  let tSeg = 0;
  if (len2 > 1e-9) {
    const denom = len2 - abd * abd;
    if (Math.abs(denom) > 1e-9) {
      tRay = (abo - len2 * oad) / denom;
      tSeg = (abo + abd * tRay) / len2;
    }
  }
  tRay = Math.max(0, tRay);
  tSeg = Math.max(0, Math.min(1, tSeg));
  const center = tmpC.copy(a).addScaledVector(d, tSeg);
  return sphereHit(origin, dir, maxDist, center, radius);
}

function makeHit(kind, id, part, origin, dir, dist, center, surface) {
  const point = new Vector3(
    origin.x + dir.x * dist,
    origin.y + dir.y * dist,
    origin.z + dir.z * dist,
  );
  let normal;
  if (center) normal = new Vector3().subVectors(point, center).normalize();
  else normal = new Vector3(-dir.x, -dir.y, -dir.z);
  return { kind, id, part, point, normal, dist, surface };
}

export function resolveShot(world, origin, dir, maxDist, state) {
  let best = null;

  const wall = world.raycast(origin, dir, maxDist);
  if (wall)
    best = {
      kind: "world",
      id: 0,
      part: "body",
      point: wall.point,
      normal: wall.normal,
      dist: wall.dist,
      surface: wall.surface,
    };

  for (const p of state.players || []) {
    if (!p.alive) continue;
    const a = tmpA.set(p.pos[0], p.pos[1] + 0.35, p.pos[2]).clone();
    const b = tmpB
      .set(p.pos[0], p.pos[1] + (p.crouch ? 1 : 1.5), p.pos[2])
      .clone();
    const t = capsuleHit(origin, dir, best ? best.dist : maxDist, a, b, 0.32);
    if (t != null && (!best || t < best.dist)) {
      const center = new Vector3(
        a.x,
        Math.max(a.y, Math.min(b.y, origin.y + dir.y * t)),
        a.z,
      );
      best = makeHit("player", p.id, "body", origin, dir, t, center, "flesh");
    }
  }

  for (const e of state.enemies || []) {
    if (!e.alive) continue;
    const px = e.pos[0];
    const py = e.pos[1];
    const pz = e.pos[2];
    if (e.type === "gull") {
      const center = new Vector3(px, py + 0.03, pz);
      const t = sphereHit(origin, dir, best ? best.dist : maxDist, center, 0.55);
      if (t != null && (!best || t < best.dist))
        best = makeHit("enemy", e.id, "body", origin, dir, t, center, "enemy");
    } else {
      const head = new Vector3(px, py + 1.15, pz);
      const ht = sphereHit(origin, dir, best ? best.dist : maxDist, head, 0.18);
      if (ht != null && (!best || ht < best.dist)) {
        best = makeHit("enemy", e.id, "weak", origin, dir, ht, head, "enemy");
        continue;
      }
      const a = new Vector3(px, py + 0.35, pz);
      const b = new Vector3(px, py + 1.05, pz);
      const t = capsuleHit(origin, dir, best ? best.dist : maxDist, a, b, 0.33);
      if (t != null && (!best || t < best.dist)) {
        const center = new Vector3(px, py + 0.7, pz);
        best = makeHit("enemy", e.id, "body", origin, dir, t, center, "enemy");
      }
    }
  }

  if (!best) {
    const end = new Vector3(
      origin.x + dir.x * maxDist,
      origin.y + dir.y * maxDist,
      origin.z + dir.z * maxDist,
    );
    return {
      kind: "none",
      id: 0,
      part: "body",
      point: end,
      normal: new Vector3(-dir.x, -dir.y, -dir.z),
      dist: maxDist,
      surface: "none",
    };
  }
  return best;
}