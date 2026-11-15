// Shared scaffolding for the tools/dev model preview pages.
//
// Each preview page is responsible for building its model and wiring its own
// controls; this module only provides the common stage: renderer, studio and
// night lighting, ground/grid, orbit camera, material helpers and a label
// decal factory that stands in for the game's procedural label materials.

import * as THREE from "../../shared/three.js";

const STUDIO_BG = 0x141b21;
const NIGHT_BG = 0x0b1115;
const GROUND_STUDIO = 0x394049;
const GROUND_NIGHT = 0x1a2127;

// A small procedural overcast sky, prefiltered so metal and rubber have
// something to reflect. Mirrors the sky used by avatar-preview.html.
function makeStudioEnvironment(renderer) {
  const W = 256;
  const H = 128;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const sky = 0.55 + 0.45 * Math.pow(v, 1.6);
    const ground = 0.045 + 0.06 * Math.pow(1 - v, 2);
    const t = Math.min(1, Math.max(0, (v - 0.5) * 8));
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const sun =
        Math.pow(Math.max(0, 1 - Math.hypot((u - 0.22) * 2.4, (v - 0.3) * 3.2)), 26) * 1.5;
      const i = (y * W + x) * 4;
      const r = (sky * 0.72 + sun) * 255 * (1 - t) + ground * 255 * t;
      const g = (sky * 0.82 + sun * 0.94) * 255 * (1 - t) + ground * 255 * t;
      const b = (sky * 0.98 + sun * 0.88) * 255 * (1 - t) + ground * 255 * t;
      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
      data[i + 3] = 255;
    }
  }
  const sky = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  sky.colorSpace = THREE.SRGBColorSpace;
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(sky).texture;
  pmrem.dispose();
  sky.dispose();
  return env;
}

// Grid built from short segments. Very long GL lines lose their near portion
// on some drivers (the 80 m+ GridHelper disappeared in the preview camera),
// so each grid line is split into 8 m pieces; visually identical.
function makeGrid(size, divisions, colorA, colorB) {
  const half = size / 2;
  const step = size / divisions;
  const center = divisions / 2;
  const chunks = Math.max(1, Math.ceil(size / 8));
  const segLen = size / chunks;
  const positions = [];
  const colors = [];
  const a = new THREE.Color(colorA);
  const b = new THREE.Color(colorB);
  const push = (x1, y1, z1, x2, y2, z2, c) => {
    positions.push(x1, y1, z1, x2, y2, z2);
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
  };
  for (let i = 0; i <= divisions; i++) {
    const p = -half + i * step;
    const c = i === center ? a : b;
    for (let j = 0; j < chunks; j++) {
      const s = -half + j * segLen;
      const e = s + segLen;
      push(s, 0, p, e, 0, p, c);
      push(p, 0, s, p, 0, e, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false });
  const grid = new THREE.LineSegments(geometry, material);
  grid.type = "Grid";
  return grid;
}

// Build the camera, lights and floor shared by all preview pages.
export function createViewer(canvas, options = {}) {
  const {
    fov = 40,
    near = 0.05,
    far = 200,
    target = [0, 1, 0],
    az = Math.PI,
    el = 0.12,
    dist = 3.2,
    minDist = 0.35,
    maxDist = 60,
    groundSize = 200,
    gridSize = groundSize,
    gridDivisions = 100,
    gridFollow = false,
    groundY = 0,
    fog = null,
    enableLayers = [],
  } = options;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STUDIO_BG);
  scene.environment = makeStudioEnvironment(renderer);
  scene.environmentIntensity = 0.75;
  if (fog) {
    scene.fog = new THREE.Fog(STUDIO_BG, fog[0], fog[1]);
    scene.background = scene.fog.color.clone();
  }

  const camera = new THREE.PerspectiveCamera(fov, 1, near, far);
  for (const layer of enableLayers) camera.layers.enable(layer);

  // ---- studio lighting ----------------------------------------------------
  const studio = new THREE.Group();
  studio.add(new THREE.HemisphereLight(0xc8d8e8, 0x2a2620, 1.15));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.7);
  key.position.set(3.5, 7, -4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0006;
  studio.add(key);
  const fill = new THREE.DirectionalLight(0x9fc4e8, 0.75);
  fill.position.set(-4, 3, 4);
  studio.add(fill);
  const rim = new THREE.DirectionalLight(0xbfe6ff, 0.9);
  rim.position.set(0, 4, 6);
  studio.add(rim);
  scene.add(studio);

  // ---- night / port lighting ---------------------------------------------
  const night = new THREE.Group();
  night.visible = false;
  night.add(new THREE.HemisphereLight(0x33465c, 0x0a0d10, 0.55));
  const lamp = new THREE.DirectionalLight(0xffb070, 1.9);
  lamp.position.set(2.5, 4, -3);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.camera.left = -5;
  lamp.shadow.camera.right = 5;
  lamp.shadow.camera.top = 6;
  lamp.shadow.camera.bottom = -3;
  lamp.shadow.camera.near = 0.5;
  lamp.shadow.camera.far = 30;
  night.add(lamp);
  const moon = new THREE.DirectionalLight(0x5c8fd6, 0.7);
  moon.position.set(-5, 3, 3);
  night.add(moon);
  scene.add(night);

  // ---- ground -------------------------------------------------------------
  const groundMat = new THREE.MeshStandardMaterial({
    color: GROUND_STUDIO,
    roughness: 0.94,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = makeGrid(gridSize, gridDivisions, 0x51606e, 0x2b333c);
  grid.position.y = groundY + 0.004;
  scene.add(grid);
  const cellSize = gridSize / gridDivisions;

  // ---- orbit camera -------------------------------------------------------
  const orbit = {
    az,
    el,
    dist,
    target: new THREE.Vector3(target[0], target[1], target[2]),
  };
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    orbit.az -= (e.clientX - lastX) * 0.006;
    orbit.el = Math.max(-0.12, Math.min(1.25, orbit.el + (e.clientY - lastY) * 0.005));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const endDrag = (e) => {
    dragging = false;
    canvas.style.cursor = "grab";
    if (e && e.pointerId != null && canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      orbit.dist = Math.max(minDist, Math.min(maxDist, orbit.dist * Math.exp(e.deltaY * 0.0011)));
    },
    { passive: false },
  );
  canvas.style.cursor = "grab";

  function placeCamera() {
    const cosEl = Math.cos(orbit.el);
    camera.position.set(
      orbit.target.x + Math.sin(orbit.az) * cosEl * orbit.dist,
      orbit.target.y + Math.sin(orbit.el) * orbit.dist,
      orbit.target.z + Math.cos(orbit.az) * cosEl * orbit.dist,
    );
    camera.lookAt(orbit.target);
    if (gridFollow) {
      // Snap to the cell lattice so the lines never drift under the model.
      grid.position.x = Math.round(orbit.target.x / cellSize) * cellSize;
      grid.position.z = Math.round(orbit.target.z / cellSize) * cellSize;
    }
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();
  placeCamera();

  const api = {
    THREE,
    renderer,
    scene,
    camera,
    orbit,
    studio,
    night,
    ground,
    groundMat,
    grid,
    key,
    dragging: () => dragging,
    turntable: false,
    setNight(on) {
      night.visible = on;
      studio.visible = !on;
      scene.background.setHex(on ? NIGHT_BG : STUDIO_BG);
      if (scene.fog) scene.fog.color.setHex(on ? NIGHT_BG : STUDIO_BG);
      groundMat.color.setHex(on ? GROUND_NIGHT : GROUND_STUDIO);
      scene.environmentIntensity = on ? 0.25 : 0.75;
    },
    setGrid(on) {
      grid.visible = on;
    },
    placeCamera,
    start(update) {
      let last = performance.now();
      function tick(now) {
        const dt = Math.min(0.05, Math.max(0.0002, (now - last) / 1000));
        last = now;
        if (update) update(dt, now / 1000);
        if (api.turntable && !dragging) orbit.az += dt * 0.45;
        placeCamera();
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    },
  };
  return api;
}

const LABEL_COLORS = {
  black: "#0a0c0d",
  white: "#e9edef",
  yellow: "#e7c04a",
  red: "#c2452b",
};

// Canvas-based stand-in for the game's procedural stencil labels. Returns the
// same { material, aspect } shape that mats.label() hands to the rig builders.
export function makeLabel(text, opts = {}) {
  const value = String(text == null ? "" : text).toUpperCase() || " ";
  const color = LABEL_COLORS[opts.color] || LABEL_COLORS.white;
  const distress = opts.distress != null ? +opts.distress : 0.35;
  const font = opts.font === "sans" ? "600 42px Helvetica, Arial, sans-serif" : "700 42px ui-monospace, Menlo, monospace";

  const measure = document.createElement("canvas").getContext("2d");
  measure.font = font;
  const textWidth = Math.ceil(measure.measureText(value).width);
  const width = Math.max(32, textWidth + 32);
  const height = 64;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, 16, height * 0.54);

  // Erode the paint a little so the decal does not read as pristine print.
  const specks = Math.round(width * height * 0.006 * distress);
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < specks; i++) {
    ctx.globalAlpha = 0.35 + Math.random() * 0.65;
    ctx.fillRect(Math.random() * width, Math.random() * height, 1 + Math.random() * 2, 1 + Math.random() * 1.5);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  material.name = "label";
  return { material, aspect: width / height };
}

// Slot materials for the drone and hound rigs. Flat approximations of the
// game's procedural armour/gunmetal surfaces, with the baked vertex colours
// kept, which is what carries most of the panel detail.
export function makeRigMaterials(lensColor = 0xffa400) {
  return {
    shell: new THREE.MeshStandardMaterial({
      color: 0xaeb4b8,
      roughness: 0.55,
      metalness: 0.12,
      vertexColors: true,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x767c80,
      roughness: 0.42,
      metalness: 0.85,
      vertexColors: true,
    }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    lensBase: new THREE.MeshBasicMaterial({
      color: new THREE.Color(lensColor).multiplyScalar(6),
    }),
    disc: new THREE.MeshBasicMaterial({
      color: 0x0c0d0f,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    // Volumetric searchlight cone, same shader as the game's gull.
    cone: new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(1, 0.9, 0.74) },
        uGain: { value: 0.085 },
      },
      vertexShader: `
        #include <common>
        #include <skinning_pars_vertex>
        varying float vT; varying vec3 vN; varying vec3 vV;
        void main() {
          #include <beginnormal_vertex>
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>
          vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
          vN = normalMatrix * objectNormal; vV = -mv.xyz; vT = 1.0 - uv.y;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uGain;
        varying float vT; varying vec3 vN; varying vec3 vV;
        void main() {
          float f = abs(dot(normalize(vN), normalize(vV)));
          f = f * f * (3.0 - 2.0 * f);
          float t = clamp(vT, 0.0, 1.0);
          float k = pow(1.0 - t, 1.7) * (0.35 + 0.65 * smoothstep(0.0, 0.06, t));
          gl_FragColor = vec4(uColor * (uGain * f * k), 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  };
}

const noop = () => {};

// Minimal game-context stand-in for createGull() / createHound(). Only the
// fields those factories touch are provided; effects and audio are inert.
export function createHost({ scene, camera, player = null, raycast = () => null, groundHeight = () => 0, nav } = {}) {
  return {
    scene,
    camera,
    player,
    mats: { label: makeLabel, get: () => new THREE.MeshStandardMaterial() },
    events: { emit: noop },
    fx: {
      sparks: noop,
      debris: noop,
      smoke: noop,
      dust: noop,
      tracer: noop,
      muzzleFlash: noop,
      explosion: noop,
      shell: noop,
    },
    physics: {
      raycast,
      groundHeight,
      lineOfSight: () => true,
      nav: nav || {
        findPath: () => null,
        randomPoint: (center) => center.clone(),
        isWalkable: () => true,
      },
    },
    combat: { explode: noop, enemyShot: () => false, playerShot: () => null },
    audio: null,
    render: null,
    level: null,
  };
}

// Minimal merge for the label planes createHound() combines (position,
// normal, uv + index). The full utility lives in the game modules.
export function mergeSimple(geometries) {
  const out = new THREE.BufferGeometry();
  const names = ["position", "normal", "uv"];
  const data = {};
  for (const name of names) data[name] = [];
  const indices = [];
  let offset = 0;
  for (const geometry of geometries) {
    for (const name of names) {
      const attr = geometry.attributes[name];
      if (!attr) continue;
      const size = attr.itemSize;
      for (let i = 0; i < attr.count; i++) {
        for (let c = 0; c < size; c++) data[name].push(attr.array[i * size + c]);
      }
    }
    const index = geometry.index;
    if (index) {
      for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + offset);
    } else {
      const count = geometry.attributes.position.count;
      for (let i = 0; i < count; i++) indices.push(i + offset);
    }
    offset += geometry.attributes.position.count;
  }
  for (const name of names) {
    if (!data[name].length) continue;
    const size = name === "uv" ? 2 : 3;
    out.setAttribute(name, new THREE.Float32BufferAttribute(data[name], size));
  }
  out.setIndex(indices);
  return out;
}

// Flat ray/ground intersection used by the drone's feelers and crash.
export function groundRaycast(origin, dir, maxDist, groundY = 0) {
  if (dir.y >= -1e-4) return null;
  const dist = (origin.y - groundY) / -dir.y;
  if (dist <= 0 || dist > maxDist) return null;
  return {
    dist,
    point: origin.clone().addScaledVector(dir, dist),
    normal: new THREE.Vector3(0, 1, 0),
  };
}

export function triangleCount(root) {
  let tris = 0;
  root.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    const geometry = node.geometry;
    tris += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });
  return Math.round(tris);
}

export function collectMaterials(root) {
  const out = new Map();
  root.traverse((node) => {
    if (!node.isMesh) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) if (material) out.set(material.uuid, material);
  });
  return [...out.values()];
}

export function setWireframe(materials, on) {
  for (const material of materials) {
    if ("wireframe" in material) material.wireframe = on;
  }
}

export function bindKeys(map) {
  window.addEventListener("keydown", (e) => {
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  });
}
