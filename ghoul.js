/* ============================================================
   crazyhouse: ghoul1.

   A thin, hunched figure with a narrow head, staring eyes and
   shoulder-length hair. He lurches a loop through the house with
   his arms up in front of him, wrists limp, like Nosferatu. When
   he's in a room that has a cam, his head turns to stare straight
   into it, all the way round if it has to.

   He's out of reality most of the time, walking unseen. Every so
   often he blurs back in, and he stays until an EMP hits his room.
   This file only decides WHEN (api.presence and api.blur); the
   blur itself is drawn by ghost.js.

   Same style as the house: lit grey surfaces, dark ink edges, lit
   by the room's lamp and casting a real shadow. Sizes are in feet. His feet are at y = 0 in his own space and he faces +z.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';
import { X, Z, FLOOR, surface, solid, lines, roomAt } from './world.js?v=47';

/* The loop he walks, in blueprint pixels (same as world.js), through
   the doorways and around the furniture. It's smoothed into a curve.
   After changing it, run: node games/crazyhouse/check-route.mjs */
const ROUTE = [
  [215, 700], [250, 640], [330, 606], [440, 610],                 // foyer, out through the hall
  [560, 645], [582, 560], [585, 390], [660, 385], [790, 400],      // living room, past the sofa and table
  [1135, 402], [1135, 595], [830, 600],                            // round the kitchen island
  [770, 655], [770, 738], [845, 780],                              // past the stove, in the master door
  [1010, 835], [1116, 868], [1116, 950],                           // down the side of the bed
  [1112, 862], [960, 852], [880, 880], [855, 925],                 // back round the foot of it
  [812, 935], [700, 945], [608, 945],                              // through the laundry
  [520, 925], [482, 872], [475, 800],                              // through the bathroom
  [475, 700], [380, 662], [340, 612], [240, 630]                   // back up the hall to the foyer
];

/* A smooth curve through the route would bow outward on the long
   straights. Adding a point just after and just before each corner
   keeps the straights straight and only rounds off the corners. */
function pinCorners(route, d = 22) {
  const out = [];
  for (let i = 0; i < route.length; i++) {
    const a = route[i], b = route[(i + 1) % route.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    out.push(a);
    if (len > d * 3) {
      out.push([a[0] + dx / len * d, a[1] + dy / len * d]);
      out.push([b[0] - dx / len * d, b[1] - dy / len * d]);
    }
  }
  return out;
}

const SPEED = 1.5;            // feet per second, a slow lurch
const STRIDE = 2.0;           // feet per full step cycle
const HEAD_TURN = 2.2;        // how fast his head swings round to a cam (higher = snappier)
const LEAN = 0.26;            // how far forward he's hunched, in radians (~15°)

/* He's gone most of the time. When he fades in he STAYS until an EMP
   hits his room (main.js calls zap()). Times are in seconds, each
   picked at random between the two numbers. */
const FIRST = 10;             // seconds before he first shows up
const GONE = [25, 50];        // how long he stays gone after being zapped
const FADE = [1.6, 2.6];      // how long it takes him to fade in
const ZAPPED = 2.4;           // how long his death takes when an EMP hits him
const AGONY = 0.6;            // seconds to snap into the reaching pose

const WHITE  = new THREE.MeshBasicMaterial({ color: 0xffffff });   // pupils: tiny points of light
const SOCKET = new THREE.MeshBasicMaterial({ color: 0x000000 });   // eye sockets: pure black
const SKIN   = surface(0xc9c9c9, 0.7);
const CLOTH  = surface(0x262626, 0.95);
const HAIR   = surface(0x121212, 0.6, THREE.DoubleSide);

/* ─── a seeded random, so his hair is the same every time ─── */
function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/* ─── the head ──────────────────────────────── */

const HEAD = { rx: 0.24, ry: 0.4, rz: 0.29 };     // narrow and long

// A point on the front of the head, from face coordinates (u across, v up).
function onFace(u, v, lift = 1.03) {
  const { rx, ry, rz } = HEAD;
  const k = 1 - (u / rx) ** 2 - (v / ry) ** 2;
  return [u * lift, v * lift, rz * Math.sqrt(Math.max(k, 0)) * lift];
}

// Just the eyes: rings with pinprick pupils. No mouth.
function eyes() {
  const pairs = [];
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const cx = side * 0.085, cy = 0.06;
    let last = null;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16 * Math.PI * 2;
      const p = onFace(cx + Math.cos(t) * 0.048, cy + Math.sin(t) * 0.058);
      if (last) pairs.push([last, p]);
      last = p;
    }
    // a black socket lying on the face
    const p = new THREE.Vector3(...onFace(cx, cy, 1.015));
    const n = new THREE.Vector3(p.x / HEAD.rx ** 2, p.y / HEAD.ry ** 2, p.z / HEAD.rz ** 2).normalize();
    const socket = new THREE.Mesh(new THREE.CircleGeometry(1, 16), SOCKET);
    socket.scale.set(0.05, 0.06, 1);
    socket.position.copy(p);
    socket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    g.add(socket);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), WHITE);
    pupil.position.set(...onFace(cx, cy - 0.006, 1.05));
    g.add(pupil);
  }
  g.add(lines(pairs));
  return g;
}

/* Hair: strands from the crown, over the skull, then hanging to
   about the shoulders. A gap at the front for the face. A black
   curtain between the strands hides whatever's behind them. */
function hair() {
  const rand = seeded(1312);
  const { rx, ry, rz } = HEAD;
  const strands = [];
  const N = 30;
  for (let k = 0; k < N; k++) {
    const phi = THREE.MathUtils.degToRad(-145 + 290 * k / (N - 1));   // 0 = straight back
    const sx = Math.sin(phi), sz = -Math.cos(phi);
    const pts = [];
    for (const latDeg of [82, 62, 40, 18, -4, -20]) {
      const lat = THREE.MathUtils.degToRad(latDeg);
      pts.push([rx * 1.1 * Math.cos(lat) * sx, ry * 1.1 * Math.sin(lat), rz * 1.1 * Math.cos(lat) * sz]);
    }
    // longer at the back, shorter by the face
    const len = 0.55 + 0.45 * (1 + Math.cos(phi)) / 2 + (rand() - 0.5) * 0.15;
    const startR = Math.cos(THREE.MathUtils.degToRad(-20)) * 1.1;
    for (let i = 1; i <= 4; i++) {
      const f = i / 4;
      const r = THREE.MathUtils.lerp(startR, 1.45, f);
      const wob = (rand() - 0.5) * 0.04;
      pts.push([(rx * r + wob) * sx, -ry * 0.37 - len * f, (rz * r + wob) * sz]);
    }
    strands.push(pts);
  }

  const pos = [];
  for (let k = 0; k < strands.length - 1; k++) {
    const a = strands[k], b = strands[k + 1];
    for (let i = 0; i < a.length - 1; i++) {
      pos.push(...a[i], ...b[i], ...a[i + 1], ...a[i + 1], ...b[i], ...b[i + 1]);
    }
  }
  const curtain = new THREE.BufferGeometry();
  curtain.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));

  const pairs = [];
  for (const s of strands) for (let i = 0; i < s.length - 1; i++) pairs.push([s[i], s[i + 1]]);

  const g = new THREE.Group();
  curtain.computeVertexNormals();
  g.add(new THREE.Mesh(curtain, HAIR), lines(pairs));
  return g;
}

/* ─── the body ──────────────────────────────── */

const HIP = 3.1, CHEST = 1.95;          // chest = hip to shoulder
const NECK_UP = 0.36, HEAD_UP = 0.36;

function limb(w, len, d, mat = CLOTH) {
  // a box hanging down from its pivot
  return solid(new THREE.BoxGeometry(w, len, d), [0, -len / 2, 0], null, mat);
}

function pivot(x, y, z, ...kids) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (kids.length) g.add(...kids);
  return g;
}

/* Arm pose, relative to the hunched chest, in radians: elbows
   tucked down by his sides, forearms raised up in front of his
   chest, hands hanging limp from the wrists. */
const POSE = { upper: -0.56, forearm: -2.0, hand: 2.55, inward: 0.16 };

export function createGhoul() {
  const root = new THREE.Group();
  root.name = 'ghoul1';
  const body = new THREE.Group();
  root.add(body);

  // legs, thin
  const legs = [-1, 1].map(side => {
    const leg = pivot(side * 0.15, HIP, 0,
      limb(0.17, HIP - 0.1, 0.2),
      solid(new THREE.BoxGeometry(0.18, 0.1, 0.46), [0, -HIP + 0.05, 0.1], null, CLOTH));      // foot
    body.add(leg);
    return leg;
  });
  body.add(solid(new THREE.BoxGeometry(0.44, 0.26, 0.26), [0, HIP, 0], null, CLOTH));          // hips

  // everything from the hips up, hunched forward
  const chest = pivot(0, HIP, 0);
  body.add(chest);
  const torsoGeo = new THREE.CylinderGeometry(0.34, 0.22, CHEST, 6);
  torsoGeo.rotateY(Math.PI / 6);
  torsoGeo.scale(1, 1, 0.58);
  chest.add(solid(torsoGeo, [0, CHEST / 2, 0], null, CLOTH));

  // arms: shoulder → elbow → wrist, long thin fingers
  const arms = [-1, 1].map(side => {
    const fingers = [];
    for (let f = 0; f < 4; f++) {
      const x = -0.06 + f * 0.04;
      fingers.push([[x, -0.26, 0], [x * 1.3, -0.78, 0.04]]);
    }
    const wrist = pivot(0, -0.95, 0,
      solid(new THREE.BoxGeometry(0.14, 0.26, 0.05), [0, -0.13, 0], null, SKIN),
      lines(fingers));
    const elbow = pivot(0, -1.1, 0, limb(0.1, 0.95, 0.11, SKIN), wrist);
    const shoulder = pivot(side * 0.39, CHEST - 0.06, 0, limb(0.12, 1.1, 0.13), elbow);
    shoulder.rotation.order = 'YXZ';            // swing forward first, then turn inward
    shoulder.rotation.y = -side * POSE.inward;
    chest.add(shoulder);
    return { shoulder, elbow, wrist, side };
  });

  // neck, jutting forward a little
  const neck = solid(new THREE.CylinderGeometry(0.06, 0.08, NECK_UP + 0.1, 6), [0, CHEST + NECK_UP / 2, 0.05], null, SKIN);
  chest.add(neck);

  // head: yaw (turns) → pitch (nods). Hair goes with the head.
  const headYaw = pivot(0, CHEST + NECK_UP, 0.08);
  chest.add(headYaw);
  const headPitch = pivot(0, HEAD_UP, 0);
  headYaw.add(headPitch);
  const skullGeo = new THREE.SphereGeometry(1, 10, 8);
  skullGeo.scale(HEAD.rx, HEAD.ry, HEAD.rz);
  headPitch.add(new THREE.Mesh(skullGeo, SKIN));     // no facet lines, so the eyes read clean
  headPitch.add(eyes(), hair());

  /* ─── walking ─── */
  const curve = new THREE.CatmullRomCurve3(
    pinCorners(ROUTE).map(([px, py]) => new THREE.Vector3(X(px), FLOOR, Z(py))), true, 'centripetal');
  // Measure the curve finely, so walking a set distance per frame really
  // is a steady pace. (The default 200 samples over a 130 ft loop made him
  // crawl in some spots and rush at nearly 4x speed in others.)
  curve.arcLengthDivisions = 5000;
  curve.updateArcLengths();
  const length = curve.getLength();

  let dist = 0;                 // feet walked along the loop
  let bodyYaw = null;
  let yaw = 0, pitch = LEAN;    // head, relative to the chest
  const here = new THREE.Vector3(), tangent = new THREE.Vector3(), target = new THREE.Vector3();

  function turnToward(current, want, rate, dt) {
    let d = want - current;
    d = Math.atan2(Math.sin(d), Math.cos(d));          // shortest way round
    return current + d * (1 - Math.exp(-rate * dt));
  }

  /* ─── slipping in and out of reality ─── */
  const pick = ([a, b]) => a + Math.random() * (b - a);
  let state = 'gone', timer = FIRST, fadeLen = 1, fadeT = 0, casting = true, leaveFrom = 1, highSide = 1;

  function phase(dt) {
    if (state === 'gone') {
      timer -= dt;
      if (timer <= 0) { state = 'arriving'; fadeLen = pick(FADE); fadeT = 0; }
    } else if (state === 'arriving' || state === 'leaving') {
      fadeT += dt;
      if (fadeT >= fadeLen) {
        if (state === 'arriving') state = 'seen';
        else { state = 'gone'; timer = pick(GONE); }
      }
    }

    const f = THREE.MathUtils.smoothstep(fadeT / fadeLen, 0, 1);
    // dying: he holds on for the first stretch while he reaches up, then fades
    const dying = THREE.MathUtils.smoothstep((fadeT / fadeLen - 0.3) / 0.7, 0, 1);
    let p = state === 'seen' ? 1 : state === 'gone' ? 0 : state === 'arriving' ? f : leaveFrom * (1 - dying);
    const t = fadeT * 9;
    // a little flicker while he's slipping in
    if (state === 'arriving' && Math.sin(t * 3.1) * Math.sin(t * 1.7 + 1.3) > 0.55) p *= 0.45;
    // a hard stutter while the EMP rips him out
    if (state === 'leaving' && Math.sin(t * 7.3) * Math.sin(t * 4.1 + 0.7) > 0.2) p *= 0.15;
    if (api.forcePresence !== null) p = api.forcePresence;
    api.presence = p;
    api.blur = Math.pow(1 - p, 0.6);
    // he only throws a shadow while he's mostly here
    const solidEnough = p > 0.5;
    if (solidEnough !== casting) {
      casting = solidEnough;
      root.traverse(o => { if (o.isMesh && !o.material.isMeshBasicMaterial) o.castShadow = casting; });
    }
  }

  /* camFor(name) → [x, y, z] of that cam, or null. Returns his room. */
  function update(dt, camFor) {
    phase(dt);
    if (!api.paused && state !== 'leaving') dist = (dist + SPEED * dt) % length;   // he stops dead when hit
    const u = dist / length;
    curve.getPointAt(u, here);
    curve.getTangentAt(u, tangent);

    // body: on the path, turning smoothly to face where he's going
    const want = Math.atan2(tangent.x, tangent.z);
    bodyYaw = bodyYaw === null ? want : turnToward(bodyYaw, want, 4, dt);
    root.position.copy(here);
    root.rotation.y = bodyYaw;

    // the lurch: a stiff stride, swaying side to side, hunch bobbing
    const step = dist / STRIDE * Math.PI * 2;
    const s = Math.sin(step);
    legs[0].rotation.x = s * 0.28;
    legs[1].rotation.x = -s * 0.28;
    body.rotation.z = s * 0.05;
    body.position.y = Math.abs(Math.cos(step)) * 0.05;
    chest.rotation.x = LEAN + Math.abs(s) * 0.04;
    chest.rotation.y = 0;
    for (const a of arms) {
      a.shoulder.rotation.x = POSE.upper + s * a.side * 0.05;
      a.shoulder.rotation.y = -a.side * POSE.inward;
      a.elbow.rotation.x = POSE.forearm;
      a.wrist.rotation.x = POSE.hand + Math.sin(step * 0.5 + a.side) * 0.12;   // limp hands dangle
    }

    // head: stare at this room's cam, if it has one; otherwise peer ahead
    const room = roomAt(here.x, here.z);
    const cam = room && room.cam ? camFor(room.cam) : null;
    let wantYaw = 0, wantPitch = LEAN * 0.6;
    if (cam) {
      chest.updateWorldMatrix(true, false);
      chest.worldToLocal(target.set(cam[0], cam[1], cam[2]));
      target.sub(headYaw.position).y -= HEAD_UP;
      wantYaw = Math.atan2(target.x, target.z);
      wantPitch = THREE.MathUtils.clamp(Math.atan2(target.y, Math.hypot(target.x, target.z)), -0.6, 0.9);
    }
    yaw = turnToward(yaw, wantYaw, HEAD_TURN, dt);
    pitch = turnToward(pitch, wantPitch, HEAD_TURN, dt);
    headYaw.rotation.y = yaw;
    headPitch.rotation.x = -pitch;

    if (state === 'leaving') agony(dt);

    return room ? room.name : null;
  }

  /* Death: blend from wherever he was into the agony pose. He arches
     back, throws both arms straight up over his head with his hands
     clawed, and his head tips back to the ceiling, all trembling. */
  function agony(dt) {
    const k = THREE.MathUtils.smoothstep(fadeT / AGONY, 0, 1);
    const shake = () => (Math.random() - 0.5) * 0.08 * k;
    const mix = (a, b) => a + (b - a) * k;
    chest.rotation.x = mix(chest.rotation.x, -0.22) + shake();
    body.position.y = mix(body.position.y, 0.08);
    legs[0].rotation.x = mix(legs[0].rotation.x, 0.05);
    legs[1].rotation.x = mix(legs[1].rotation.x, -0.05);
    // not symmetrical: one arm strains high, the other only half rises,
    // bent at the elbow, and his body twists and leans toward the high one
    for (const a of arms) {
      const high = a.side === highSide;
      a.shoulder.rotation.x = mix(a.shoulder.rotation.x, high ? -2.9 : -2.05) + shake();
      a.shoulder.rotation.y = mix(-a.side * POSE.inward, a.side * (high ? 0.08 : 0.3));
      a.elbow.rotation.x = mix(a.elbow.rotation.x, high ? -0.2 : -0.85) + shake();
      a.wrist.rotation.x = mix(a.wrist.rotation.x, high ? -0.5 : 0.4) + shake();   // high hand claws, low one hangs
    }
    body.rotation.z = mix(body.rotation.z, -highSide * 0.07) + shake() * 0.5;
    chest.rotation.y = mix(0, highSide * 0.18);
    yaw = mix(yaw, highSide * 0.25);
    headYaw.rotation.y = yaw;
    headPitch.rotation.x = mix(headPitch.rotation.x, -0.75) + shake();    // looking up, a little off to one side
  }

  // Drop him at the closest point on his loop to blueprint pixel (px, py).
  function jumpTo(px, py) {
    const spot = new THREE.Vector3(X(px), FLOOR, Z(py));
    let best = Infinity;
    for (let i = 0; i < 1000; i++) {
      const d = curve.getPointAt(i / 1000).distanceTo(spot);
      if (d < best) { best = d; dist = i / 1000 * length; }
    }
    bodyYaw = null;
  }

  /* presence: 1 = fully here, 0 = gone. blur: how smeared his lines
     are (0 = sharp). paused stops him walking; forcePresence pins his
     presence to a number (both handy with ?debug). */
  /* An EMP hit his room. If he's here (or slipping in), he's knocked
     out of reality: true. If he's already gone: false. */
  function zap() {
    if (state === 'gone' || state === 'leaving') return false;
    leaveFrom = api.presence;
    highSide = Math.random() < 0.5 ? -1 : 1;          // which arm reaches highest this time
    state = 'leaving';
    fadeLen = ZAPPED;
    fadeT = 0;
    return true;
  }

  const api = {
    object: root, update, jumpTo, zap, curve, route: ROUTE,
    get state() { return state; },
    presence: 0, blur: 1, paused: false, forcePresence: null
  };
  return api;
}
