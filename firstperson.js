/* ============================================================
   crazyhouse: first person. Walk round the house and yard, open and
   shut doors, and look closely at things.

   - WASD walks, the mouse looks (click the view to grab the mouse),
     Shift runs.
   - E on a door (or anything else that opens) swings it open or shut.
   - E on a light switch (or a lamp you switch at the lamp, or the
     laundry bulb's pull string) turns its lights on or off.
   - E on something with something to say (userData.inspect) brings up
     a text box; you're frozen until you've read it (E, Space, Enter or
     a click to close it).

   Walls and furniture block you. When first person starts, everything
   between your knees and the top of your head is traced into a flat map
   of the floor (doorways stay open, walls don't), and the doors are
   traced again whenever they move.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';
import { walkHeight } from './world.js?v=44';

const EYE = 5.3;               // eye height, feet
const RADIUS = 0.6;            // how close you can get to things (doorways are under 3 feet)
const WALK = 5, RUN = 9;       // feet per second
const STEP = 0.8;              // the tallest step you can climb (or drop)
const REACH = 6;               // how far away you can open or inspect things
const MAP = { x0: -145, z0: -115, w: 210, d: 230, res: 4 };      // the floor map: area (feet) and cells per foot

export function createFirstPerson({ scene, camera, frame }) {
  const W = MAP.w * MAP.res, D = MAP.d * MAP.res;
  const fixed = new Uint8Array(W * D), moving = new Uint8Array(W * D);
  const openers = [];
  scene.traverse(o => { if (o.userData.setOpen) openers.push(o); });
  let openState = '', settle = 0;

  /* ---- the floor map ---- */
  // the floor height under each foot of the map, worked out once (the land is slow to ask)
  const heights = new Float32Array(MAP.w * MAP.d).fill(NaN);
  const floorAt = (x, z) => {
    const i = Math.floor(x - MAP.x0), k = Math.floor(z - MAP.z0);
    if (i < 0 || k < 0 || i >= MAP.w || k >= MAP.d) return walkHeight(x, z);
    const n = k * MAP.w + i;
    if (Number.isNaN(heights[n])) heights[n] = walkHeight(MAP.x0 + i + 0.5, MAP.z0 + k + 0.5);
    return heights[n];
  };
  const mark = (grid, x, z) => {
    const i = Math.floor((x - MAP.x0) * MAP.res), k = Math.floor((z - MAP.z0) * MAP.res);
    if (i >= 0 && k >= 0 && i < W && k < D) grid[k * W + i] = 1;
  };
  /* Each surface is sliced into flat layers a few inches apart; a slice
     blocks a cell of the map only where it's between your knees and the
     top of your head *for the floor right there*. So a porch's edge
     blocks along the lawn but not at the top of its steps, a step's riser
     never blocks (you can climb it), and walls always do. */
  const LO = STEP + 0.05, HI = EYE - 0.1, SLICE = 0.4;
  const v = new THREE.Vector3();
  const sliceLine = (grid, a, b, h) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) * MAP.res * 1.5));
    for (let t = 0; t <= n; t++) {
      const x = a[0] + (b[0] - a[0]) * t / n, z = a[2] + (b[2] - a[2]) * t / n, g = floorAt(x, z);
      if (h >= g + LO && h <= g + HI) mark(grid, x, z);
    }
  };
  const tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const trace = (grid, root, skipOpeners) => {
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || o.userData.passable || !o.geometry.attributes.position) return;
      for (let p = o; p; p = p.parent) {
        if (p.userData.passable || p.name === 'ground' || p.name === 'heavens') return;
        if (skipOpeners && p !== root && p.userData.setOpen) return;
      }
      const pos = o.geometry.attributes.position, idx = o.geometry.index, m = o.matrixWorld;
      const count = idx ? idx.count : pos.count;
      for (let t = 0; t < count; t += 3) {
        for (let j = 0; j < 3; j++) {
          v.fromBufferAttribute(pos, idx ? idx.getX(t + j) : t + j).applyMatrix4(m);
          tri[j][0] = v.x; tri[j][1] = v.y; tri[j][2] = v.z;
        }
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cz = (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
        if (cx < MAP.x0 - 20 || cz < MAP.z0 - 20 || cx > MAP.x0 + MAP.w + 20 || cz > MAP.z0 + MAP.d + 20) continue;
        const minY = Math.min(tri[0][1], tri[1][1], tri[2][1]), maxY = Math.max(tri[0][1], tri[1][1], tri[2][1]);
        if (maxY - minY < 0.02) {                                     // flat: a tabletop, a seat; its outline blocks
          for (let e = 0; e < 3; e++) sliceLine(grid, tri[e], tri[(e + 1) % 3], minY);
          continue;
        }
        for (let h = Math.ceil(minY / SLICE) * SLICE; h <= maxY; h += SLICE) {
          const cut = [];
          for (let e = 0; e < 3; e++) {
            const a = tri[e], b = tri[(e + 1) % 3];
            if ((a[1] - h) * (b[1] - h) <= 0 && a[1] !== b[1]) {
              const k = (h - a[1]) / (b[1] - a[1]);
              cut.push([a[0] + (b[0] - a[0]) * k, h, a[2] + (b[2] - a[2]) * k]);
            }
          }
          if (cut.length >= 2) sliceLine(grid, cut[0], cut[1], h);
        }
      }
    });
  };
  const traceMoving = () => {
    moving.fill(0);
    for (const o of openers) trace(moving, o, false);           // (the bead curtain's beads are passable, so you walk through)
    openState = openers.map(o => o.userData.open.toFixed(2)).join();
  };
  let built = false;
  const build = () => {
    const t = performance.now();
    trace(fixed, scene, true);
    traceMoving();
    built = true;
    return Math.round(performance.now() - t);
  };
  const blockedAt = (x, z) => {
    const i = Math.floor((x - MAP.x0) * MAP.res), k = Math.floor((z - MAP.z0) * MAP.res);
    if (i < 0 || k < 0 || i >= W || k >= D) return true;
    return fixed[k * W + i] || moving[k * W + i];
  };
  const free = (x, z) => {
    if (blockedAt(x, z)) return false;
    for (let a = 0; a < 12; a++) if (blockedAt(x + Math.cos(a * Math.PI / 6) * RADIUS, z + Math.sin(a * Math.PI / 6) * RADIUS)) return false;
    return true;
  };

  /* ---- the screen: a dot in the middle, a hint, the text box ---- */
  const ui = document.createElement('div');
  ui.className = 'fp-ui';
  ui.innerHTML = `<div class="fp-dot"></div><div class="fp-hint"></div>
    <div class="fp-text"><p></p><span class="fp-more">&#9660;</span></div>`;
  frame.appendChild(ui);
  const hint = ui.querySelector('.fp-hint'), box = ui.querySelector('.fp-text'), para = box.querySelector('p');
  let reading = null, shown = 0;
  const say = text => { reading = text; shown = 0; para.textContent = ''; box.classList.add('on'); box.classList.remove('done'); };
  const advance = () => {
    if (!reading) return;
    if (shown < reading.length) { shown = reading.length; para.textContent = reading; box.classList.add('done'); return; }
    reading = null; box.classList.remove('on', 'done');
  };

  /* ---- you ---- */
  const me = { x: 0, z: 0, y: 0, yaw: 0, pitch: 0, bob: 0 };
  const keys = new Set();
  let on = false;
  const ray = new THREE.Raycaster();
  ray.layers.set(0);
  ray.layers.enable(2);                    // glass counts (you look at a window or the door's lite, not through it); not ghoul1
  ray.params.Line.threshold = 0.01;
  ray.far = REACH;
  ray.camera = camera;
  let target = null, sinceLook = 0;
  // only the house and what's in it, near you (the land and the forest are big and slow to test)
  const skip = new Set(['ground', 'forest', 'heavens', 'sky', 'road', 'driveway', 'path', 'path-lamps']);
  const groups = scene.children.filter(o => !skip.has(o.name) && !o.isLight);
  const near = new THREE.Box3(), size = new THREE.Vector3(REACH * 2, REACH * 2, REACH * 2);
  const candidates = () => {
    near.setFromCenterAndSize(camera.position, size);
    const out = [];
    for (const g of groups) g.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const s = o.geometry.boundingSphere, c = s.center.clone().applyMatrix4(o.matrixWorld);
      if (near.distanceToPoint(c) <= s.radius * o.matrixWorld.getMaxScaleOnAxis()) out.push(o);
    });
    return out;
  };
  const look = () => {
    camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hit = ray.intersectObjects(candidates(), false)[0];
    if (!hit) return null;
    for (let o = hit.object; o; o = o.parent) {
      if (o.userData.switch) return { o, kind: 'switch' };
      // a group of little things: only the one you're actually looking at, if it has anything to say
      if (o.userData.areas) {
        const area = o.userData.areas.find(a => a.box.containsPoint(hit.point));
        return area ? { o, kind: 'inspect', text: area.text } : null;
      }
      if (o.userData.inspect) return { o, kind: 'inspect' };
      if (o.userData.openTo) return { o, kind: 'open' };
    }
    return null;
  };
  const act = () => {
    if (reading) { advance(); return; }
    const t = look();
    if (!t) return;
    if (t.kind === 'switch') scene.userData.switches.toggle(t.o.userData.switch);
    else if (t.kind === 'inspect') say(t.text || t.o.userData.inspect);
    else t.o.userData.openTo(t.o.userData.open > 0.5 ? 0 : 1, 0.9);
  };

  addEventListener('keydown', e => {
    if (!on || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'e' || ((k === ' ' || k === 'enter') && reading)) { e.preventDefault(); act(); return; }
    if (['w', 'a', 's', 'd', 'shift'].includes(k)) { keys.add(k); e.preventDefault(); }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  frame.addEventListener('click', e => {
    if (!on || e.target.closest('button')) return;
    if (reading) { advance(); return; }
    if (document.pointerLockElement !== frame) frame.requestPointerLock();
  });
  addEventListener('mousemove', e => {
    if (!on || reading || document.pointerLockElement !== frame) return;
    me.yaw -= e.movementX * 0.0022;
    me.pitch = THREE.MathUtils.clamp(me.pitch - e.movementY * 0.0022, -1.4, 1.4);
  });

  // try to move to (x, z): slide along walls, don't climb or drop more than a step
  const tryMove = (dx, dz) => {
    const h = floorAt(me.x, me.z);
    const ok = (x, z) => free(x, z) && Math.abs(floorAt(x, z) - h) <= STEP;
    if (ok(me.x + dx, me.z + dz)) { me.x += dx; me.z += dz; return true; }
    if (ok(me.x + dx, me.z)) { me.x += dx; return true; }
    if (ok(me.x, me.z + dz)) { me.z += dz; return true; }
    // glance off corners: try the same step turned a little either way
    for (const a of [0.5, -0.5, 1.0, -1.0]) {
      const c = Math.cos(a), s = Math.sin(a), rx = (dx * c - dz * s) * 0.8, rz = (dx * s + dz * c) * 0.8;
      if (ok(me.x + rx, me.z + rz)) { me.x += rx; me.z += rz; return true; }
    }
    return false;
  };

  return {
    get on() { return on; },
    get reading() { return !!reading; },
    // start in the foyer, just inside the front door, facing into the house
    enter() {
      let ms = 0;
      if (!built) ms = build();
      on = true;
      me.x = (200 - 680.5) / 27.42; me.z = (640 - 620.5) / 27.42; me.yaw = -Math.PI / 2; me.pitch = 0;
      me.y = floorAt(me.x, me.z) + EYE;
      camera.fov = 70;
      camera.updateProjectionMatrix();
      ui.classList.add('on');
      frame.classList.add('first-person');
      return ms;
    },
    exit() {
      on = false;
      keys.clear();
      reading = null;
      box.classList.remove('on', 'done');
      ui.classList.remove('on');
      frame.classList.remove('first-person');
      if (document.pointerLockElement) document.exitPointerLock();
    },
    update(dt) {
      if (!on) return;
      // a door moved? trace the doors again once they've stopped (not every frame of the swing)
      const state = openers.map(o => o.userData.open.toFixed(2)).join();
      if (state !== openState) { openState = state; settle = 0.15; }
      else if (settle > 0 && (settle -= dt) <= 0) traceMoving();
      if (reading) {
        shown = Math.min(reading.length, shown + dt * 45);         // the text types itself out
        para.textContent = reading.slice(0, Math.floor(shown));
        if (shown >= reading.length) box.classList.add('done');
      } else {
        const fwd = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0), side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
        if (fwd || side) {
          const speed = (keys.has('shift') ? RUN : WALK) * dt / Math.hypot(fwd, side);
          let dx = (-Math.sin(me.yaw) * fwd + Math.cos(me.yaw) * side) * speed;
          let dz = (-Math.cos(me.yaw) * fwd - Math.sin(me.yaw) * side) * speed;
          const n = Math.ceil(Math.hypot(dx, dz) / 0.15);                // small steps, so nothing slips through
          for (let i = 0; i < n; i++) tryMove(dx / n, dz / n);
          me.bob += speed * 2.2;
        }
      }
      const ground = floorAt(me.x, me.z) + EYE;
      me.y += (ground - me.y) * Math.min(1, dt * 10);                   // ease up and down steps
      camera.position.set(me.x, me.y + Math.sin(me.bob) * 0.05, me.z);
      camera.rotation.set(me.pitch, me.yaw, 0, 'YXZ');
      // what's in front of you (a few times a second is plenty)
      sinceLook += dt;
      if (sinceLook > 0.15 && !reading) {
        sinceLook = 0;
        target = look();
        hint.textContent = !target ? '' : target.kind === 'inspect' ? 'E  look' : target.kind === 'switch' ? 'E  light'
          : target.o.userData.open > 0.5 ? 'E  close' : 'E  open';
      }
      ui.classList.toggle('target', !!target && !reading);
    },
    build,
    me,                                     // where you are (handy from the debug console)
    keys,
    free,                                   // can you stand at (x, z)?
    look,                                   // what you're looking at, if anything
    floorAt
  };
}
