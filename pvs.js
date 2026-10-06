/* ============================================================
   crazyhouse: per-cam culling ("PVS", potentially visible set).

   The cams never move, so we can work out once, at the start, what
   each one can actually see, and skip drawing everything else. For
   every cam we draw the house once in "ID colours" (every named thing
   in its own flat colour, every door open so nothing hides behind one)
   into a small hidden picture, read back which colours showed up, and
   remember them. It looks three times, every door shut, every door open
   and every door as it starts, and keeps anything any of them sees (a
   door swung open can hide behind its own frame, so with only the open
   look the front door went missing from the yard when it was shut).
   From then on, things a cam can't see move to
   CULL_LAYER: that cam skips them, but lights still see them, so their
   shadows stay put.

   Old indoor games (Quake, Half-Life) did the same with their maps.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';

/* roots: the house and yard (not ghoul1 or the EMP, which come and go).
   cams: the CAMS list. Returns { apply(i), always(obj) }:
   apply(camIndex) culls for that cam, apply(null) shows everything;
   always(obj) never culls obj's group again (for anomaly code that
   moves something somewhere new). */
export function buildPVS(renderer, scene, roots, cams, cullLayer) {
  // a unit is the nearest named group above each drawable thing
  const units = [], index = new Map();
  for (const root of roots) root.traverse(o => {
    if (!(o.isMesh || o.isLine) || o.layers.mask !== 1) return;     // plain layer 0 only (not glass, not ghoul1)
    let u = o;
    while (u.parent && !u.name && u !== root) u = u.parent;
    if (!index.has(u)) { index.set(u, units.length); units.push({ items: [], shown: true, always: false }); }
    units[index.get(u)].items.push(o);
  });

  // ---- the ID pass: swap in flat colours, open every door, hide the rest
  const undo = [], mats = new Map();
  const idMat = (i, side) => {
    const key = i + '/' + side;
    if (!mats.has(key)) {
      const c = new THREE.Color().setRGB(((i + 1) & 255) / 255, ((i + 1) >> 8) / 255, 0, THREE.LinearSRGBColorSpace);
      mats.set(key, new THREE.MeshBasicMaterial({ color: c, side, fog: false, toneMapped: false }));
    }
    return mats.get(key);
  };
  const inUnit = new Set();
  units.forEach((u, i) => u.items.forEach(o => {
    inUnit.add(o);
    if (o.isLine) { undo.push(() => { o.visible = true; }); o.visible = false; return; }
    const was = o.material, side = (Array.isArray(was) ? was[0] : was).side;
    undo.push(() => { o.material = was; });
    o.material = idMat(i, side);
  }));
  scene.traverse(o => {                                                     // sprites, stars, anything else: out of the way
    if ((o.isSprite || o.isPoints || o.isMesh || o.isLine) && !inUnit.has(o) && o.visible) {
      undo.push(() => { o.visible = true; }); o.visible = false;
    }
  });
  const doors = [];
  scene.traverse(o => { if (o.userData.setOpen) doors.push([o, o.userData.open]); });
  const fog = scene.fog, auto = renderer.shadowMap.autoUpdate, need = renderer.shadowMap.needsUpdate;
  scene.fog = null;
  renderer.shadowMap.autoUpdate = renderer.shadowMap.needsUpdate = false;

  const W = 480, H = 270, target = new THREE.WebGLRenderTarget(W, H), pixels = new Uint8Array(W * H * 4);
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 600);
  const seen = cams.map(() => new Set());
  for (const pose of [0, 1, null]) {                                       // doors shut, open, as they start
    doors.forEach(([o, open]) => o.userData.setOpen(pose ?? open));
    cams.forEach((c, i) => {
      cam.position.set(...c.pos);
      cam.fov = c.fov;
      cam.updateProjectionMatrix();
      cam.lookAt(...c.look);
      cam.updateMatrixWorld();
      renderer.setRenderTarget(target);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
      for (let p = 0; p < pixels.length; p += 4) {
        const id = pixels[p] + (pixels[p + 1] << 8);
        if (id) seen[i].add(id - 1);
      }
    });
  }
  renderer.setRenderTarget(null);
  target.dispose();
  mats.forEach(m => m.dispose());

  // ---- put everything back
  undo.forEach(f => f());
  doors.forEach(([o, open]) => o.userData.setOpen(open));
  scene.fog = fog;
  renderer.shadowMap.autoUpdate = auto;
  renderer.shadowMap.needsUpdate = need;

  const show = (u, on) => {
    if (u.shown === on) return;
    u.shown = on;
    for (const o of u.items) {
      if (on) { o.layers.enable(0); o.layers.disable(cullLayer); }
      else { o.layers.disable(0); o.layers.enable(cullLayer); }
    }
  };
  return {
    apply(i) {
      const set = i === null || i === undefined ? null : seen[i];
      units.forEach((u, k) => show(u, !set || u.always || set.has(k)));
    },
    always(obj) {
      let u = obj;
      while (u && !index.has(u)) u = u.parent;
      if (u) { units[index.get(u)].always = true; show(units[index.get(u)], true); }
    },
    stats: () => seen.map(s => `${s.size}/${units.length}`)
  };
}
