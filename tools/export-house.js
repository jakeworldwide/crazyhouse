/* ============================================================
   crazyhouse: export the house to model files.

   world.js is the *source* the house's models were first made from
   (code, the way a modeller's .blend file is a source). This turns it
   into the game's real assets:

     models/<room>/<item>.glb   one model per item, in its own space
                                (origin at the bottom of it, or at its
                                hinge for things that open), with its
                                "open" animation if it opens and its
                                behaviour named in its extras
     house.json                 the level: where each model goes, the
                                rooms they're grouped in, and the lights

   The game (house.js) builds the house from those, and so could any
   other engine. Once you've edited a model in Blender it's yours: only
   re-export the ones you name (?only=sofa,fridge), or you'll lose the
   edits.
   ============================================================ */

import * as THREE from '../vendor/three-r186/three.module.js';
import { GLTFExporter } from '../vendor/three-r186/addons/exporters/GLTFExporter.js';
import { buildWorld } from '../world.js?v=export';

const SAVE = 'http://127.0.0.1:8126/save?path=';
const logEl = document.getElementById('log');
const log = text => { logEl.textContent += text + '\n'; };
const only = new URLSearchParams(location.search).get('only')?.split(',');

// groups that are rooms/kinds of thing (folders), not things; clutter's rooms are folders too
const FOLDERS = new Set(['shell', 'walls', 'doors', 'porches', 'living-room', 'kitchen', 'master', 'bathroom', 'laundry',
  'foyer', 'front-porch', 'lamps', 'clutter', 'paintings', 'switch-plates']);
const NOT_MODELS = new Set(['sky']);                                       // the sky is code, like an engine's skybox
const DIR = { master: 'master-bedroom', 'living-clutter': 'clutter/living-room', 'kitchen-clutter': 'clutter/kitchen',
  'bath-clutter': 'clutter/bathroom', 'bed-clutter': 'clutter/master-bedroom', 'foyer-clutter': 'clutter/foyer',
  'laundry-clutter': 'clutter/laundry' };
const TOP_DIR = { van: 'van', 'van-step': 'van', stereo: 'living-room', 'fiddle-fig': 'living-room' };   // (the rest: yard)
const PART = { walls: 'wall', porches: 'porch', shell: 'shell' };

const r5 = v => Math.round(v * 1e5) / 1e5;
const slug = text => text.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => !['a', 'an', 'the', 'its', 'of'].includes(w)).slice(0, 4).join('-');

/* ─── 1. the house, as made ─── */

const scene = buildWorld({ raw: true });
await scene.getObjectByName('paintings')?.userData.ready;
scene.updateMatrixWorld(true);
const sheet = scene.getObjectByName('paintings')?.userData.sheet;

const containers = [], items = [];
const used = new Set();
const fileFor = (dir, base) => {
  let name = base, n = 2;
  while (used.has(dir + '/' + name)) name = base + '-' + n++;
  used.add(dir + '/' + name);
  return name;
};
function collect(group, parent) {
  containers.push({ name: group.name, parent });
  const dir = DIR[group.name] || group.name, misc = [];
  group.children.forEach((child, i) => {
    if (group.name === 'clutter') { collect(child, group.name); return; }
    if (!child.name && !child.userData.say && group.parent?.name === 'clutter') { misc.push(child); return; }
    const base = child.name || (child.userData.say ? slug(child.userData.say) : `${PART[group.name] || group.name}-${String(i + 1).padStart(2, '0')}`);
    items.push({ node: child, dir, file: fileFor(dir, base), parent: group.name });
  });
  if (misc.length) {                                                         // a room's loose little bits, as one model
    const g = new THREE.Group();
    group.add(g);
    for (const m of misc) g.add(m);
    items.push({ node: g, dir, file: fileFor(dir, group.name.replace('-clutter', '') + '-bits'), parent: group.name });
  }
}
for (const top of [...scene.children]) {
  if (NOT_MODELS.has(top.name)) continue;
  if (FOLDERS.has(top.name)) collect(top, null);
  else { const dir = TOP_DIR[top.name] || 'yard'; items.push({ node: top, dir, file: fileFor(dir, top.name), parent: null }); }
}
scene.updateMatrixWorld(true);
log(`${items.length} models in ${containers.length} groups`);

/* ─── 2. each one into a model file ─── */

const exporter = new GLTFExporter();
const lights = [];
const BAD = ['lever', 'glows', 'setOpen', 'openTo', 'step', 'tick', 'clips', 'ready', 'sheet', 'repaint', 'restore', 'frustum', 'moved', 'lamps', 'sheetSlot'];
const plain = v => v === null || ['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every(plain))
  || (typeof v === 'object' && !v.isObject3D && !v.isMaterial && !v.isTexture && Object.values(v).every(plain));
const clean = ud => { for (const k of Object.keys(ud)) if (BAD.includes(k) || !plain(ud[k])) delete ud[k]; };

const m4 = new THREE.Matrix4(), inv = new THREE.Matrix4(), tmp = new THREE.Matrix4();
const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
const isIdentity = m => m.elements.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-6);

for (const it of items) {
  const R = it.node;
  // things that open: shut them all, then sample the opening into keyframes
  const opens = [];
  R.traverse(o => { if (o.userData.setOpen) opens.push(o); });
  const rest = new Map(opens.map(o => [o, o.userData.open]));
  for (const o of opens) o.userData.setOpen(0);
  R.updateMatrix();

  // where it goes in the level (Q), and its own space: the bottom middle of it, or its own origin (or hinge)
  let Q, recentre = null;
  if (isIdentity(R.matrix) && !R.userData.setOpen) {
    const box = new THREE.Box3().setFromObject(R);
    const c = box.isEmpty() ? new THREE.Vector3() : new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
    Q = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z);
    recentre = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
  } else Q = R.matrix.clone();
  inv.copy(Q).invert();
  R.updateMatrixWorld(true);
  // lights come out of the model and into the level, hung off the nearest named thing
  R.traverse(o => {
    if (!o.isLight) return;
    let anchor = o.parent;
    while (anchor !== R && !anchor.name) anchor = anchor.parent;
    if (!anchor.name) anchor.name = it.file;
    if (!o.name) o.name = `${it.file}-light-${lights.length}`;
    if (anchor === R) tmp.copy(inv); else tmp.copy(anchor.matrixWorld).invert();   // (R's own frame is where it's placed)
    const at = o.getWorldPosition(new THREE.Vector3()).applyMatrix4(tmp);
    const L = { name: o.name, type: o.type, parent: anchor.name, position: at.toArray().map(r5),
      color: '#' + o.color.getHexString(), intensity: r5(o.intensity), visible: o.visible };
    if ('distance' in o) L.distance = r5(o.distance);
    if ('decay' in o) L.decay = o.decay;
    if (o.isSpotLight) { L.angle = r5(o.angle); L.penumbra = r5(o.penumbra); }
    if (o.target) L.target = o.target.getWorldPosition(new THREE.Vector3()).applyMatrix4(tmp).toArray().map(r5);
    if (o.castShadow) {
      const s = o.shadow;
      L.shadow = { size: s.mapSize.x, near: s.camera.near, far: s.camera.far, bias: s.bias, normalBias: s.normalBias, radius: s.radius, intensity: s.intensity };
    }
    lights.push(L);
  });
  const gone = [];
  R.traverse(o => { if (o.isLight) gone.push(o); });
  for (const o of gone) { o.parent.remove(o); if (o.target?.parent) o.target.parent.remove(o.target); }


  const T = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1], clips = [];
  let partN = 0;
  for (const o of opens) {
    const nodes = [];
    o.traverse(n => nodes.push(n));
    const samples = new Map(nodes.map(n => [n, []]));
    for (const t of T) {
      o.userData.setOpen(t);
      for (const n of nodes) {
        n.updateMatrix();
        if (n === R) m4.multiplyMatrices(inv, n.matrix);                        // the root: relative to where it's placed
        else if (n.parent === R && recentre) m4.multiplyMatrices(recentre, n.matrix);
        else m4.copy(n.matrix);
        m4.decompose(pos, quat, scl);
        samples.get(n).push([pos.toArray(), quat.toArray(), scl.toArray()]);
      }
    }
    o.userData.setOpen(0);
    const tracks = [];
    for (const n of nodes) {
      const s = samples.get(n), differs = k => s.some(v => v[k].some((x, j) => Math.abs(x - s[0][k][j]) > 1e-5));
      if (!differs(0) && !differs(1) && !differs(2)) continue;
      if (!n.name) n.name = `${o.name}-part-${++partN}`;
      if (differs(0)) tracks.push(new THREE.VectorKeyframeTrack(`${n.name}.position`, T, s.flatMap(v => v[0])));
      if (differs(1)) tracks.push(new THREE.QuaternionKeyframeTrack(`${n.name}.quaternion`, T, s.flatMap(v => v[1])));
      if (differs(2)) tracks.push(new THREE.VectorKeyframeTrack(`${n.name}.scale`, T, s.flatMap(v => v[2])));
    }
    if (tracks.length) clips.push(new THREE.AnimationClip(o.name, 1, tracks));
    o.userData.openable = true;
    o.userData.open = rest.get(o);                                           // how open it starts
  }

  // into its own space
  if (recentre) {
    if (R.isMesh || R.isLine) { R.geometry = R.geometry.clone().applyMatrix4(recentre); }
    for (const c of R.children) c.applyMatrix4(recentre);
  }
  R.position.set(0, 0, 0); R.quaternion.identity(); R.scale.set(1, 1, 1);

  // what the file format can't hold, said in the extras; and each painting gets its own picture
  R.traverse(o => {
    if (!o.visible) o.userData.hidden = true;
    if (o.layers.mask !== 1) o.userData.layer = o.layers.mask;
    if (o.userData.sheetSlot && sheet && o.material?.map) {
      const { sx, sy, sw, sh } = o.userData.sheetSlot, S = sheet.width;
      const c = document.createElement('canvas');
      c.width = Math.round(sw * S); c.height = Math.round(sh * S);
      c.getContext('2d').drawImage(sheet, sx * S, sy * S, c.width, c.height, 0, 0, c.width, c.height);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      o.material = o.material.clone();
      o.material.map = tex;
      o.material.emissiveMap = tex;
      const uv = o.geometry.attributes.uv.clone();
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) - sx) / sw, (uv.getY(k) - (1 - sy - sh)) / sh);
      o.geometry = o.geometry.clone();
      o.geometry.setAttribute('uv', uv);
    }
    const mats = o.material ? [].concat(o.material) : [];
    for (const m of mats) {
      if (m.blending === THREE.AdditiveBlending) m.userData.blend = 'add';
      clean(m.userData);
    }
    if (o.isLine && o.material?.isLineBasicMaterial) o.material = new THREE.MeshBasicMaterial({ color: o.material.color });
    clean(o.userData);
  });

  // the file
  if (!only || only.includes(it.file) || only.includes(R.name)) {
    const glb = await exporter.parseAsync(R, { binary: true, animations: clips, onlyVisible: false });
    const res = await fetch(SAVE + `models/${it.dir}/${it.file}.glb`, { method: 'POST', body: glb });
    log(`${res.ok ? 'saved' : 'FAILED'} models/${it.dir}/${it.file}.glb  ${(glb.byteLength / 1024).toFixed(0)} KB${clips.length ? `  (${clips.length} opening)` : ''}`);
  }
  Q.decompose(pos, quat, scl);
  it.entry = { name: R.name || undefined, model: `models/${it.dir}/${it.file}.glb`, parent: it.parent,
    position: pos.toArray().map(r5), quaternion: quat.toArray().map(r5), scale: scl.toArray().map(r5) };
}

/* ─── 3. the level ─── */

const house = {
  about: 'crazyhouse level: which model goes where (models/*.glb), the groups they belong to, and the lights. Built by tools/export-house.html; read by house.js.',
  units: 'feet, y up',
  groups: containers,
  items: items.map(i => i.entry),
  lights
};
if (!only) {
  const res = await fetch(SAVE + 'house.json', { method: 'POST', body: JSON.stringify(house, null, 1) });
  log(`${res.ok ? 'saved' : 'FAILED'} house.json  (${house.items.length} items, ${lights.length} lights)`);
}
log('done');
window.exportDone = true;
