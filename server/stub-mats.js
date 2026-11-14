// Materials for headless level/enemy construction. Nothing is uploaded to a
// GPU; the objects only need to satisfy the builder's material API.

import { MeshBasicMaterial, Color } from "../shared/three.js";

const base = new MeshBasicMaterial({ color: new Color(0.5, 0.5, 0.5) });

export function stubMats() {
  const make = () => base.clone();
  return {
    get: () => make(),
    emissive: () => make(),
    decal: () => ({ material: make(), aspect: 3 }),
    label: () => ({ material: make(), aspect: 3 }),
    names: () => [],
  };
}

export const fxStub = new Proxy({}, { get: () => () => {} });