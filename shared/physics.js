// Shared AABB world and nav grid.
//
// This is the simulation half of the original d3() in js/game.js: collision,
// hit rays, capsule movement and the port nav grid. It deliberately keeps the
// original algorithms and quirks; the client imports this module instead of
// keeping a second copy, so prediction and the server always agree.

import { Vector3 } from "./three.js";
import { PHYSICS } from "./constants.js";

const {
  groundY,
  seaY,
  quayX,
  stepHeight,
  port,
  nav: navCfg,
} = PHYSICS;

const qt = navCfg.width;
const Qs = navCfg.height;
const Ya = navCfg.minX;
const ol = navCfg.minZ;
const Ls = navCfg.cell;
const yf = navCfg.pad;

function toVec(v) {
  return v && v.isVector3 ? v.clone() : new Vector3(v[0], v[1], v[2]);
}

export function createPhysics(game = {}, rng = Math.random) {
  const boxes = [];
  let navDirty = true;
  let blocked = new Uint8Array(qt * Qs);
  const losTmp = new Vector3();

  const api = {
    boxes,
    bounds: {
      min: new Vector3(PHYSICS.bounds.min[0], PHYSICS.bounds.min[1], PHYSICS.bounds.min[2]),
      max: new Vector3(PHYSICS.bounds.max[0], PHYSICS.bounds.max[1], PHYSICS.bounds.max[2]),
    },

    addBox(a, b, opts = {}) {
      const lo = toVec(a);
      const hi = toVec(b);
      const box = {
        min: new Vector3(
          Math.min(lo.x, hi.x),
          Math.min(lo.y, hi.y),
          Math.min(lo.z, hi.z),
        ),
        max: new Vector3(
          Math.max(lo.x, hi.x),
          Math.max(lo.y, hi.y),
          Math.max(lo.z, hi.z),
        ),
        surface: opts.surface || "concrete",
        tag: opts.tag || "",
        noNav: !!opts.noNav,
        bulletOnly: !!opts.bulletOnly,
        playerOnly: !!opts.playerOnly,
      };
      boxes.push(box);
      navDirty = true;
      return box;
    },

    removeBox(box) {
      const i = boxes.indexOf(box);
      if (i >= 0) {
        boxes.splice(i, 1);
        navDirty = true;
      }
    },

    build() {
      buildNav();
    },

    // True where a city building or yard fence stands. Only the city's own
    // boxes are consulted.
    cityBlocked(x, z) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.tag !== "city" || b.noNav || b.bulletOnly) continue;
        if (
          x > b.min.x - 0.3 &&
          x < b.max.x + 0.3 &&
          z > b.min.z - 0.3 &&
          z < b.max.z + 0.3 &&
          b.max.y > stepHeight + 0.05
        )
          return true;
      }
      return false;
    },

    raycast(origin, dir, maxDist = 500) {
      let dist = maxDist;
      let hitBox = null;
      let axis = -1;
      let normalSign = 0;
      let groundHit = 0;
      const ox = origin.x;
      const oy = origin.y;
      const oz = origin.z;
      const dx = dir.x;
      const dy = dir.y;
      const dz = dir.z;

      if (dy < -1e-6) {
        const t = (groundY - oy) / dy;
        if (t > 0 && t < dist) {
          const hx = ox + dx * t;
          if (hx <= quayX || hx < port.x0) {
            dist = t;
            groundHit = 1;
          } else {
            const tw = (seaY - oy) / dy;
            if (tw > 0 && tw < dist) {
              dist = tw;
              groundHit = 2;
            }
          }
        }
      }

      const invX = dx === 0 ? Infinity : 1 / dx;
      const invY = dy === 0 ? Infinity : 1 / dy;
      const invZ = dz === 0 ? Infinity : 1 / dz;

      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.playerOnly) continue;
        let tmin = 0;
        let tmax = dist;
        let axisHit = -1;
        let sign = 0;
        let near;
        let far;

        if (dx !== 0) {
          near = (b.min.x - ox) * invX;
          far = (b.max.x - ox) * invX;
          let s = -1;
          if (near > far) {
            const tmp = near;
            near = far;
            far = tmp;
            s = 1;
          }
          if (near > tmin) {
            tmin = near;
            axisHit = 0;
            sign = s;
          }
          if (far < tmax) tmax = far;
          if (tmin > tmax) continue;
        } else if (ox < b.min.x || ox > b.max.x) continue;

        if (dy !== 0) {
          near = (b.min.y - oy) * invY;
          far = (b.max.y - oy) * invY;
          let s = -1;
          if (near > far) {
            const tmp = near;
            near = far;
            far = tmp;
            s = 1;
          }
          if (near > tmin) {
            tmin = near;
            axisHit = 1;
            sign = s;
          }
          if (far < tmax) tmax = far;
          if (tmin > tmax) continue;
        } else if (oy < b.min.y || oy > b.max.y) continue;

        if (dz !== 0) {
          near = (b.min.z - oz) * invZ;
          far = (b.max.z - oz) * invZ;
          let s = -1;
          if (near > far) {
            const tmp = near;
            near = far;
            far = tmp;
            s = 1;
          }
          if (near > tmin) {
            tmin = near;
            axisHit = 2;
            sign = s;
          }
          if (far < tmax) tmax = far;
          if (tmin > tmax) continue;
        } else if (oz < b.min.z || oz > b.max.z) continue;

        if (axisHit < 0) continue;
        dist = tmin;
        hitBox = b;
        axis = axisHit;
        normalSign = sign;
        groundHit = 0;
      }

      if (!hitBox && !groundHit) return null;
      const point = new Vector3(
        ox + dx * dist,
        oy + dy * dist,
        oz + dz * dist,
      );

      if (groundHit) {
        return {
          dist,
          point,
          normal: new Vector3(0, 1, 0),
          surface:
            groundHit === 2
              ? "water"
              : game.level && game.level.groundSurfaceAt
                ? game.level.groundSurfaceAt(point.x, point.z)
                : "concrete",
          box: null,
        };
      }

      const normal = new Vector3();
      normal.setComponent(axis, normalSign);
      return {
        dist,
        point,
        normal,
        surface: hitBox.surface,
        box: hitBox,
      };
    },

    lineOfSight(a, b) {
      losTmp.subVectors(b, a);
      const len = losTmp.length();
      if (len < 1e-4) return true;
      losTmp.multiplyScalar(1 / len);
      return !api.raycast(a, losTmp, len - 0.05);
    },

    groundHeight(x, z, maxY = 50) {
      let h = x <= quayX || x < port.x0 ? groundY : seaY;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.bulletOnly) continue;
        if (
          x >= b.min.x &&
          x <= b.max.x &&
          z >= b.min.z &&
          z <= b.max.z &&
          b.max.y <= maxY &&
          b.max.y > h
        )
          h = b.max.y;
      }
      return h;
    },

    moveCapsule(pos, vel, dt, radius = 0.32, height = 1.8, useStep = true) {
      const out = {
        onGround: false,
        hitWall: false,
        hitCeil: false,
        surface: "concrete",
      };
      const dx = vel.x * dt;
      const dz = vel.z * dt;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.6)));
      const startY = pos.y;

      for (let s = 0; s < steps; s++) {
        pos.x += dx / steps;
        pos.z += dz / steps;
        for (let iter = 0; iter < 3; iter++) {
          let collided = false;
          for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            if (
              b.bulletOnly ||
              b.max.y <= pos.y + (useStep ? stepHeight : 0.08) ||
              b.min.y >= pos.y + height
            )
              continue;
            const cx = Math.max(b.min.x, Math.min(b.max.x, pos.x));
            const cz = Math.max(b.min.z, Math.min(b.max.z, pos.z));
            let ox = pos.x - cx;
            let oz = pos.z - cz;
            const d2 = ox * ox + oz * oz;
            if (d2 >= radius * radius) continue;

            if (d2 > 1e-10) {
              const d = Math.sqrt(d2);
              const push = radius - d;
              ox /= d;
              oz /= d;
              pos.x += ox * push;
              pos.z += oz * push;
              const vn = vel.x * ox + vel.z * oz;
              if (vn < 0) {
                vel.x -= ox * vn;
                vel.z -= oz * vn;
              }
            } else {
              const left = pos.x - b.min.x;
              const right = b.max.x - pos.x;
              const back = pos.z - b.min.z;
              const front = b.max.z - pos.z;
              const min = Math.min(left, right, back, front);
              if (min === left) {
                pos.x = b.min.x - radius;
                if (vel.x > 0) vel.x = 0;
              } else if (min === right) {
                pos.x = b.max.x + radius;
                if (vel.x < 0) vel.x = 0;
              } else if (min === back) {
                pos.z = b.min.z - radius;
                if (vel.z > 0) vel.z = 0;
              } else {
                pos.z = b.max.z + radius;
                if (vel.z < 0) vel.z = 0;
              }
            }
            collided = true;
            out.hitWall = true;
          }
          if (!collided) break;
        }
      }

      const nextY = pos.y + vel.y * dt;
      const footR = radius * 0.7;
      let floorY =
        pos.x <= quayX + footR || pos.x < port.x0 ? groundY : -50;
      let floorSurface = null;
      let ceilY = Infinity;
      const stepTop = startY + (useStep ? stepHeight : 0.08) + 1e-4;

      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.bulletOnly) continue;
        if (
          pos.x + footR < b.min.x ||
          pos.x - footR > b.max.x ||
          pos.z + footR < b.min.z ||
          pos.z - footR > b.max.z
        )
          continue;
        if (b.max.y <= stepTop && b.max.y > floorY) {
          floorY = b.max.y;
          floorSurface = b.surface;
        }
        if (b.min.y >= startY + height - 0.05 && b.min.y < ceilY) {
          ceilY = b.min.y;
        }
      }

      if (vel.y > 0 && nextY + height > ceilY) {
        pos.y = ceilY - height;
        vel.y = 0;
        out.hitCeil = true;
      } else if (nextY <= floorY) {
        pos.y = floorY;
        if (vel.y < 0) vel.y = 0;
        out.onGround = true;
      } else if (useStep && vel.y <= 0 && nextY - floorY < stepHeight) {
        pos.y = floorY;
        vel.y = 0;
        out.onGround = true;
      } else {
        pos.y = nextY;
      }

      if (out.onGround) {
        out.surface =
          floorSurface ||
          (game.level && game.level.groundSurfaceAt
            ? game.level.groundSurfaceAt(pos.x, pos.z)
            : "concrete");
      }
      return out;
    },

    nav: {
      cell: Ls,
      isWalkable(x, z) {
        ensureNav();
        const idx = navIndex(x, z);
        if (idx < 0) return !api.cityBlocked(x, z);
        return !blocked[idx];
      },
      findPath(from, to) {
        ensureNav();
        const inA = navIndex(from.x, from.z) >= 0;
        const inB = navIndex(to.x, to.z) >= 0;
        if (!inA || !inB) {
          if (!api.cityBlocked(to.x, to.z))
            return [new Vector3(to.x, 0, to.z)];
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const r = 6 + i;
            const x = to.x + Math.cos(a) * r;
            const z = to.z + Math.sin(a) * r;
            if (!api.cityBlocked(x, z)) return [new Vector3(x, 0, z)];
          }
          return null;
        }
        const start = nearestOpen(from.x, from.z);
        const goal = nearestOpen(to.x, to.z);
        if (start < 0 || goal < 0) return null;
        if (start === goal) return [new Vector3(to.x, 0, to.z)];
        const path = astar(start, goal);
        if (!path) return null;
        const out = [];
        let i = 0;
        while (i < path.length - 1) {
          let next = i + 1;
          for (let j = path.length - 1; j > i + 1; j--) {
            if (gridClear(path[i], path[j])) {
              next = j;
              break;
            }
          }
          out.push(nodeCenter(path[next]));
          i = next;
        }
        if (navIndex(to.x, to.z) === goal && out.length)
          out[out.length - 1].set(to.x, 0, to.z);
        return out;
      },
      randomPoint(center, radius) {
        ensureNav();
        for (let i = 0; i < 24; i++) {
          const a = rng() * 6.2832;
          const r = Math.sqrt(rng()) * radius;
          const x = center.x + Math.cos(a) * r;
          const z = center.z + Math.sin(a) * r;
          const idx = navIndex(x, z);
          if (idx < 0) {
            if (!api.cityBlocked(x, z)) return new Vector3(x, 0, z);
            continue;
          }
          if (!blocked[idx]) return new Vector3(x, 0, z);
        }
        const idx = nearestOpen(center.x, center.z);
        if (idx >= 0) return nodeCenter(idx);
        return api.cityBlocked(center.x, center.z)
          ? null
          : new Vector3(center.x, 0, center.z);
      },
      clearLine(a, b) {
        ensureNav();
        const ia = navIndex(a.x, a.z);
        const ib = navIndex(b.x, b.z);
        return ia >= 0 && ib >= 0 && gridClear(ia, ib);
      },
      _grid: () => {
        ensureNav();
        return {
          blocked,
          w: qt,
          h: Qs,
          minX: Ya,
          minZ: ol,
          cell: Ls,
        };
      },
    },
  };

  function ensureNav() {
    if (navDirty) buildNav();
  }

  function buildNav() {
    blocked = new Uint8Array(qt * Qs);
    navDirty = false;
    for (const b of boxes) {
      if (b.noNav || b.bulletOnly || b.max.y < stepHeight + 0.05 || b.min.y > 1.5)
        continue;
      const x0 = Math.max(0, Math.floor((b.min.x - yf - Ya) / Ls));
      const x1 = Math.min(qt - 1, Math.floor((b.max.x + yf - Ya) / Ls));
      const z0 = Math.max(0, Math.floor((b.min.z - yf - ol) / Ls));
      const z1 = Math.min(Qs - 1, Math.floor((b.max.z + yf - ol) / Ls));
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) blocked[z * qt + x] = 1;
    }
    for (let z = 0; z < Qs; z++)
      for (let x = 0; x < qt; x++)
        if (
          Ya + (x + 0.5) * Ls > quayX - yf ||
          z === 0 ||
          z === Qs - 1
        )
          blocked[z * qt + x] = 1;
  }

  function navIndex(x, z) {
    const cx = Math.floor((x - Ya) / Ls);
    const cz = Math.floor((z - ol) / Ls);
    if (cx < 0 || cz < 0 || cx >= qt || cz >= Qs) return -1;
    return cz * qt + cx;
  }

  function nodeCenter(idx) {
    return new Vector3(
      Ya + ((idx % qt) + 0.5) * Ls,
      0,
      ol + (Math.floor(idx / qt) + 0.5) * Ls,
    );
  }

  function nearestOpen(x, z) {
    let cx = Math.floor((x - Ya) / Ls);
    let cz = Math.floor((z - ol) / Ls);
    cx = Math.max(0, Math.min(qt - 1, cx));
    cz = Math.max(0, Math.min(Qs - 1, cz));
    if (!blocked[cz * qt + cx]) return cz * qt + cx;
    for (let ring = 1; ring <= 12; ring++) {
      let best = -1;
      let bestD = Infinity;
      for (let oz = -ring; oz <= ring; oz++)
        for (let ox = -ring; ox <= ring; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== ring) continue;
          const nx = cx + ox;
          const nz = cz + oz;
          if (nx < 0 || nz < 0 || nx >= qt || nz >= Qs) continue;
          if (blocked[nz * qt + nx]) continue;
          const d = ox * ox + oz * oz;
          if (d < bestD) {
            bestD = d;
            best = nz * qt + nx;
          }
        }
      if (best >= 0) return best;
    }
    return -1;
  }

  function gridClear(a, b) {
    let ax = a % qt;
    let az = Math.floor(a / qt);
    const bx = b % qt;
    const bz = Math.floor(b / qt);
    const dx = Math.abs(bx - ax);
    const dz = Math.abs(bz - az);
    const sx = ax < bx ? 1 : -1;
    const sz = az < bz ? 1 : -1;
    let err = dx - dz;
    for (let i = 0; i < 600; i++) {
      if (blocked[az * qt + ax]) return false;
      if (ax === bx && az === bz) return true;
      const e2 = 2 * err;
      if (e2 > -dz && e2 < dx) {
        if (
          blocked[az * qt + ax + sx] ||
          blocked[(az + sz) * qt + ax]
        )
          return false;
        err += dx - dz;
        ax += sx;
        az += sz;
      } else if (e2 > -dz) {
        err -= dz;
        ax += sx;
      } else {
        err += dx;
        az += sz;
      }
    }
    return false;
  }

  // A* over the 8-neighbour nav grid. Same structure as the original.
  const openIdx = [];
  const openCost = [];
  const gScore = new Float32Array(qt * Qs);
  const cameFrom = new Int32Array(qt * Qs);
  const seen = new Uint32Array(qt * Qs);
  const closed = new Uint32Array(qt * Qs);
  let stamp = 0;

  function heapPush(idx, cost) {
    let i = openIdx.length;
    openIdx.push(idx);
    openCost.push(cost);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (openCost[parent] <= cost) break;
      openIdx[i] = openIdx[parent];
      openCost[i] = openCost[parent];
      i = parent;
    }
    openIdx[i] = idx;
    openCost[i] = cost;
  }

  function heapPop() {
    const top = openIdx[0];
    const idx = openIdx.pop();
    const cost = openCost.pop();
    const n = openIdx.length;
    if (n) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && openCost[child + 1] < openCost[child]) child++;
        if (openCost[child] >= cost) break;
        openIdx[i] = openIdx[child];
        openCost[i] = openCost[child];
        i = child;
      }
      openIdx[i] = idx;
      openCost[i] = cost;
    }
    return top;
  }

  function astar(start, goal) {
    stamp++;
    openIdx.length = 0;
    openCost.length = 0;
    const gx = goal % qt;
    const gz = Math.floor(goal / qt);
    const h = (idx) => {
      const x = Math.abs((idx % qt) - gx);
      const z = Math.abs(Math.floor(idx / qt) - gz);
      return x + z + (1.4142 - 2) * Math.min(x, z);
    };
    gScore[start] = 0;
    cameFrom[start] = -1;
    seen[start] = stamp;
    heapPush(start, h(start));
    let expanded = 0;
    while (openIdx.length) {
      const cur = heapPop();
      if (cur === goal) break;
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp;
      if (++expanded > 9000) return null;
      const cx = cur % qt;
      const cz = Math.floor(cur / qt);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= qt || nz >= Qs) continue;
          const next = nz * qt + nx;
          if (
            blocked[next] ||
            closed[next] === stamp ||
            (dx && dz && (blocked[cz * qt + nx] || blocked[nz * qt + cx]))
          )
            continue;
          const cost = gScore[cur] + (dx && dz ? 1.4142 : 1);
          if (seen[next] !== stamp || cost < gScore[next]) {
            gScore[next] = cost;
            cameFrom[next] = cur;
            seen[next] = stamp;
            heapPush(next, cost + h(next));
          }
        }
    }
    if (seen[goal] !== stamp) return null;
    const out = [];
    for (let i = goal; i !== -1; i = cameFrom[i]) out.push(i);
    out.reverse();
    return out;
  }

  return api;
}