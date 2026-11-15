// Browser smoke test for tools/dev/avatar-preview.html.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
const errors = [];
page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push("console: " + message.text());
});

try {
  await page.goto("http://localhost:8733/tools/dev/avatar-preview.html", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(900);

  const initial = await page.evaluate(() => {
    let bodyTris = 0;
    let rifleTris = 0;
    let bodyMeshes = 0;
    window.__avatar.group.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      const tris = (node.geometry.index ? node.geometry.index.count : node.geometry.attributes.position.count) / 3;
      if (node.isSkinnedMesh) {
        bodyTris += tris;
        bodyMeshes++;
      } else if (window.__avatar.propRoot && node === window.__avatar.propRoot) {
        rifleTris += tris;
      }
    });
    return {
      camera: document.querySelector("#cams button.on")?.dataset.cam,
      stats: document.getElementById("stats").innerText,
      bodyMeshes,
      bodyTris,
      rifleTris,
    };
  });
  if (initial.camera !== "three") throw new Error(`expected 3/4 default camera, got ${initial.camera}`);
  if (!/PAC-9/.test(initial.stats)) throw new Error("stats do not include PAC-9");
  // One merged SkinnedMesh per material slot: the original ten kit materials
  // plus the balaclava, hair and eye slots the head needs.
  if (initial.bodyMeshes !== 15) throw new Error(`expected 15 body meshes, got ${initial.bodyMeshes}`);
  if (initial.bodyTris < 38000) throw new Error(`body geometry below budget: ${initial.bodyTris}`);
  if (initial.bodyTris > 50000) throw new Error(`body geometry exceeded budget: ${initial.bodyTris}`);

  const structure = await page.evaluate(() => {
    const avatar = window.__avatar;
    const body = [];
    avatar.group.traverse((node) => {
      if (node.isSkinnedMesh && node.name.startsWith("avatar-")) body.push(node);
    });
    const finite = body.every((mesh) =>
      ["position", "normal", "uv", "color", "skinIndex", "skinWeight"].every((name) => {
        const attr = mesh.geometry.attributes[name];
        return attr && [...attr.array].every(Number.isFinite);
      }),
    );
    const weights = body.every((mesh) => {
      const attr = mesh.geometry.attributes.skinWeight;
      for (let i = 0; i < attr.count; i++) {
        const sum = attr.getX(i) + attr.getY(i) + attr.getZ(i) + attr.getW(i);
        if (Math.abs(sum - 1) > 1e-3) return false;
      }
      return true;
    });
    const uvNonZero = body.every((mesh) =>
      [...mesh.geometry.attributes.uv.array].some((value) => Math.abs(value) > 1e-6),
    );
    const peer = new window.__avatar.constructor({ scene: window.__viewer.scene });
    const sharedGeometry = body[0]?.geometry === peer.group.getObjectByName(body[0].name)?.geometry;
    const separateAccent = avatar.mats.accent !== peer.mats.accent;
    const rifleAttached = !!(avatar.propRoot && avatar.propRoot.parent === avatar.bones[avatar.rig.index.weapon]);
    peer.group.visible = false;
    return { finite, weights, uvNonZero, sharedGeometry, separateAccent, rifleAttached };
  });
  if (!Object.values(structure).every(Boolean)) throw new Error(`invalid avatar structure: ${JSON.stringify(structure)}`);

  const gripError = await page.evaluate(() => {
    const avatar = window.__avatar;
    const THREE = window.__viewer.THREE;
    avatar.group.updateMatrixWorld(true);
    const palm = (name) => {
      const bone = avatar.bones[avatar.rig.index[name]];
      const m = bone.matrixWorld.elements;
      // Fist centre sits 5.2 cm down the hand bone and 4 cm along the fingers.
      return new THREE.Vector3(
        m[12] + m[4] * -0.052 + m[8] * 0.04,
        m[13] + m[5] * -0.052 + m[9] * 0.04,
        m[14] + m[6] * -0.052 + m[10] * 0.04,
      );
    };
    const root = avatar.propRoot;
    const spec = window.__pac9Spec;
    const grip = new THREE.Vector3(...spec.grip).applyMatrix4(root.matrixWorld);
    const guard = new THREE.Vector3(...spec.handguard).applyMatrix4(root.matrixWorld);
    return {
      rightMax: palm("handR").distanceTo(grip),
      leftMax: palm("handL").distanceTo(guard),
    };
  });
  if (gripError.rightMax > 0.05 || gripError.leftMax > 0.1)
    throw new Error(`hand grip drift too large: ${JSON.stringify(gripError)}`);

  const assertFinitePose = async (name) => {
    await page.click(`[data-pose="${name}"]`);
    await page.waitForTimeout(160);
    const finite = await page.evaluate(() => {
      const avatar = window.__avatar;
      const values = [];
      for (const bone of avatar.bones) {
        values.push(...bone.position.toArray(), ...bone.quaternion.toArray(), ...bone.scale.toArray());
        if (bone.matrixWorld?.elements) values.push(...bone.matrixWorld.elements);
      }
      return values.every(Number.isFinite);
    });
    if (!finite) throw new Error(`non-finite bone state in ${name}`);
    await page.screenshot({ path: `/tmp/preview-${name}.png` });
  };

  for (const pose of ["idle", "walk", "run", "crouch", "downed"]) await assertFinitePose(pose);

  for (const close of ["head", "torso", "hands", "rifle", "boots"]) {
    await page.click(`[data-close="${close}"]`);
    await page.waitForTimeout(80);
    const distance = await page.evaluate(() => window.__orbit.dist);
    if (!(distance < 1.5)) throw new Error(`${close} close-up was clamped to ${distance}`);
  }
  await page.click('[data-close="head"]');
  await page.mouse.wheel(0, 90);
  await page.waitForTimeout(80);
  const closeDistance = await page.evaluate(() => window.__orbit.dist);
  if (!(closeDistance < 1.5)) throw new Error(`close-up wheel escaped to ${closeDistance}`);

  const wireBefore = await page.evaluate(() =>
    [...window.__viewer.scene.children].flatMap((root) => {
      const out = [];
      root.traverse?.((node) => {
        if (node.isMesh && node.material && "wireframe" in node.material) out.push(node.material.wireframe);
      });
      return out;
    }),
  );
  await page.click("#wire");
  const wireAfter = await page.evaluate(() => {
    const values = [];
    window.__viewer.scene.traverse((node) => {
      if (node.isMesh && node.material && "wireframe" in node.material) values.push(node.material.wireframe);
    });
    return values;
  });
  const wireCoverage = await page.evaluate(() => {
    const body = [];
    const rifle = [];
    window.__avatar.group.traverse((node) => {
      if (node.isMesh && node.name.startsWith("avatar-")) body.push(node.material?.wireframe);
    });
    window.__avatar.propRoot?.traverse((node) => {
      if (node.isMesh && node.material && "wireframe" in node.material) rifle.push(node.material.wireframe);
    });
    return { body, rifle };
  });
  if (!wireAfter.length || !wireCoverage.body.length || !wireCoverage.body.every(Boolean) || !wireCoverage.rifle.length || !wireCoverage.rifle.every(Boolean))
    throw new Error("wireframe did not include body and rifle materials");
  await page.click("#wire");

  await page.click("#night");
  const night = await page.evaluate(() => ({
    intensity: window.__viewer.scene.environmentIntensity,
    visible: window.__viewer.night.visible,
  }));
  if (!night.visible || Math.abs(night.intensity - 0.25) > 0.01) throw new Error("night preset did not reduce environment");

  await page.click('[data-cam="three"]');
  await page.mouse.move(700, 420);
  await page.mouse.down();
  await page.mouse.move(860, 470, { steps: 10 });
  await page.mouse.up();
  await page.mouse.wheel(0, -260);
  await page.waitForTimeout(180);
  await page.screenshot({ path: "/tmp/preview-orbit.png" });

  if (errors.length) throw new Error(errors.join("\n"));
  console.log("avatar preview smoke passed", initial.stats.replace(/\n/g, " | "));
} finally {
  await browser.close();
}
