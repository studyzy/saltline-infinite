// Server-owned city supplies. Small readable pickups; the meshes are
// deliberately simple so the art pass can replace them later.

import * as THREE from "../../shared/three.js";

const MAG = 0xffb347;
const MED = 0xff5a4a;

export class Drops {
  constructor(game) {
    this.game = game;
    this.items = new Map();
    this.mats = {
      dark: new THREE.MeshStandardMaterial({
        color: 0x1a2024,
        roughness: 0.6,
        metalness: 0.45,
      }),
      white: new THREE.MeshStandardMaterial({
        color: 0xd8e2dc,
        roughness: 0.7,
        metalness: 0.1,
      }),
      mag: new THREE.MeshStandardMaterial({
        color: MAG,
        emissive: new THREE.Color(MAG),
        emissiveIntensity: 1.1,
        roughness: 0.4,
      }),
      med: new THREE.MeshStandardMaterial({
        color: MED,
        emissive: new THREE.Color(MED),
        emissiveIntensity: 1.3,
        roughness: 0.4,
      }),
    };
  }

  reset() {
    for (const id of [...this.items.keys()]) this.remove(id);
  }

  apply(list) {
    if (!Array.isArray(list)) return;
    const seen = new Set();
    for (const d of list) {
      seen.add(d.id);
      let item = this.items.get(d.id);
      if (!item) item = this.create(d.id, d.kind);
      item.group.position.set(d.pos[0], d.pos[1], d.pos[2]);
      item.group.rotation.y += 0.01;
    }
    for (const id of [...this.items.keys()])
      if (!seen.has(id)) this.remove(id);
  }

  create(id, kind) {
    const group = new THREE.Group();
    if (kind === "med") {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.28, 0.26),
        this.mats.white,
      );
      const v = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.22, 0.28),
        this.mats.med,
      );
      const h = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.07, 0.28),
        this.mats.med,
      );
      group.add(body, v, h);
    } else {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.2, 0.16),
        this.mats.dark,
      );
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.045, 0.17),
        this.mats.mag,
      );
      group.add(body, band);
    }
    group.name = "mp-drop";
    this.game.scene.add(group);
    const item = { id, group };
    this.items.set(id, item);
    return item;
  }

  remove(id) {
    const item = this.items.get(id);
    if (!item) return;
    this.game.scene.remove(item.group);
    for (const m of item.group.children) m.geometry.dispose();
    this.items.delete(id);
  }
}