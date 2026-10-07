/* ============================================================
   Checks ghoul1's walking loop against the house.

   Walks him all the way round, frame by frame, and tests every
   outer point of his body (hair, hands, feet mid-stride) against
   every wall, door and piece of furniture. Run it after changing
   ROUTE in ghoul.js:

     node check-route.mjs

   Add a number to walk him more laps (node check-route.mjs 2).
   Takes about a minute a lap. It's a tool, not part of the game, so
   the website leaves it out when it copies the game in.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';
import { buildWorld } from './world.js?v=47';
import { createGhoul } from './ghoul.js';
import { camAt } from './cams.js?v=13';

const scene = buildWorld({ weld: false });   // same shapes, unwelded: much quicker to test
scene.updateMatrixWorld(true);
const meshes = [];
scene.traverse(o => { if (o.isMesh && !o.userData.passable) meshes.push(o); });   // he walks through the bead curtain

const ghoul = createGhoul();
const length = ghoul.curve.getLength();
const dt = 1 / 30;
const laps = Number(process.argv[2]) || 1;           // e.g. `node check-route.mjs 2`
const frames = Math.ceil(laps * length / 1.5 / dt) + 30;
const toPx = p => [Math.round(p.x * 27.42 + 680.5), Math.round(p.z * 27.42 + 620.5)];
const nameOf = o => { while (o && !o.name) o = o.parent; return o ? o.name : 'something'; };

const ray = new THREE.Raycaster();
const v = new THREE.Vector3(), c = new THREE.Vector3(), dir = new THREE.Vector3();
const clips = new Map();
const rooms = {};

for (let f = 0; f < frames; f++) {
  // the real cams, so his head (and hair) turn exactly as in the game
  const room = ghoul.update(dt, camAt);
  rooms[room || 'between rooms'] = (rooms[room || 'between rooms'] || 0) + dt;
  ghoul.object.updateMatrixWorld(true);
  const centre = ghoul.object.position;

  ghoul.object.traverse(o => {
    const pos = o.geometry && o.geometry.attributes.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i += 2) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      c.set(centre.x, v.y, centre.z);
      const d = c.distanceTo(v);
      if (d < 0.5) continue;              // well inside his body, can't touch anything
      ray.set(c, dir.subVectors(v, c).normalize());
      ray.far = d;
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit) clips.set(toPx(centre).join(','), `${nameOf(hit.object)}, ${(d - hit.distance).toFixed(2)} ft in`);
    }
  });
}

console.log(`Loop: ${length.toFixed(0)} ft, about ${(length / 1.5).toFixed(0)} seconds per lap, ${laps} lap(s) checked.`);
console.log('Seconds in each room:', Object.fromEntries(Object.entries(rooms).map(([k, s]) => [k, Math.round(s)])));
if (clips.size) {
  console.log(`\nHe clips into something at ${clips.size} spots (blueprint px of his centre):`);
  for (const [at, what] of clips) console.log(`  ${at}  ${what}`);
  process.exitCode = 1;
} else {
  console.log('\nNo clipping anywhere on the loop.');
}
