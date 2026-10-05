/* ============================================================
   crazyhouse: the EMP effect.

   fire(room) sets off crackling electric arcs around the edges of
   a room (along the floor, along the ceiling, and sparking up the
   corners) plus a flickering light inside it and a crackling zap
   sound, for about a second and a half. Purely the effect; main.js
   decides what it hits.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';
import { X, Z, FLOOR, CEIL } from './world.js?v=43';

const LENGTH = 1.5;           // seconds the arcs crackle for
const INSET = 0.5;            // feet in from the room's edges, so walls don't hide the arcs
const MAX_VERTS = 12000;

export function createEmp(scene) {
  const positions = new Float32Array(MAX_VERTS * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, toneMapped: false
  });
  const arcs = new THREE.LineSegments(geo, mat);
  arcs.frustumCulled = false;
  arcs.renderOrder = 10;

  // a light that strobes inside the room while it fires (always in the
  // scene at zero, so turning it on doesn't make the browser stall)
  const flash = new THREE.PointLight(0xffffff, 0, 0, 2);

  scene.add(arcs, flash);

  let edges = [];             // [ax, az, bx, bz] in feet
  let corners = [];
  let t = LENGTH;

  function fire(room) {
    edges = [];
    corners = [];
    let cx = 0, cz = 0, n = 0;
    for (const [x0, x1, y0, y1] of room.rects) {
      const a = X(x0) + INSET, b = X(x1) - INSET, c = Z(y0) + INSET, d = Z(y1) - INSET;
      edges.push([a, c, b, c], [b, c, b, d], [b, d, a, d], [a, d, a, c]);
      corners.push([a, c], [b, c], [b, d], [a, d]);
      cx += (a + b) / 2; cz += (c + d) / 2; n++;
    }
    flash.position.set(cx / n, FLOOR + 6.5, cz / n);
    t = 0;
  }


  let count = 0;
  const push = (x, y, z) => {
    if (count >= MAX_VERTS) return;
    positions[count * 3] = x; positions[count * 3 + 1] = y; positions[count * 3 + 2] = z;
    count++;
  };

  // one jagged arc from a to b, kinked at random every half foot or so
  function bolt(ax, ay, az, bx, by, bz, jag) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const steps = Math.max(2, Math.round(len / 0.45));
    let px = ax, py = ay, pz = az;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps, end = i === steps;
      const x = ax + (bx - ax) * f + (end ? 0 : (Math.random() - 0.5) * jag);
      const y = ay + (by - ay) * f + (end ? 0 : (Math.random() - 0.5) * jag);
      const z = az + (bz - az) * f + (end ? 0 : (Math.random() - 0.5) * jag);
      push(px, py, pz); push(x, y, z);
      px = x; py = y; pz = z;
    }
  }

  function update(dt) {
    t += dt;
    if (t >= LENGTH) {
      geo.setDrawRange(0, 0);
      flash.intensity = 0;
      return;
    }
    const fade = 1 - t / LENGTH;
    count = 0;
    for (const [ax, az, bx, bz] of edges) {
      // each edge crackles on and off independently
      if (Math.random() < 0.75) bolt(ax, FLOOR + 0.15, az, bx, FLOOR + 0.15, bz, 0.35);
      if (Math.random() < 0.6) bolt(ax, CEIL - 0.15, az, bx, CEIL - 0.15, bz, 0.35);
      if (Math.random() < 0.35) {
        const h = FLOOR + 1 + Math.random() * 5;
        bolt(ax, h, az, bx, h + (Math.random() - 0.5), bz, 0.6);
      }
    }
    for (const [x, z] of corners) {
      if (Math.random() < 0.5) bolt(x, FLOOR + 0.15, z, x, CEIL - 0.15, z, 0.4);
    }
    geo.attributes.position.needsUpdate = true;
    geo.setDrawRange(0, count);
    mat.opacity = fade * (0.55 + Math.random() * 0.45);
    flash.intensity = Math.random() < 0.5 ? 60 * fade * Math.random() : 0;
  }

  return { fire: (room) => { fire(room); zapSound(); }, update, get active() { return t < LENGTH; } };

}

/* ─── the sound ─────────────────────────────── */

/* Made on the fly with the Web Audio API, no sound files: a sharp
   crack sweeping down, sparse crackling sparks, and a mains hum that
   stutters out, all fading over the same 1.5 seconds as the arcs.
   Browsers only allow sound after a click or key press, and pressing
   the EMP counts. */
let audio = null;

function zapSound() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  if (audio.state === 'suspended') audio.resume();
  const now = audio.currentTime, dur = LENGTH;

  const out = audio.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.exponentialRampToValueAtTime(0.6, now + 0.015);
  out.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  out.connect(audio.destination);

  // the crack: a bright tone diving fast
  const crack = audio.createOscillator();
  crack.type = 'sawtooth';
  crack.frequency.setValueAtTime(2400, now);
  crack.frequency.exponentialRampToValueAtTime(60, now + 0.22);
  const crackGain = audio.createGain();
  crackGain.gain.setValueAtTime(0.5, now);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  crack.connect(crackGain).connect(out);
  crack.start(now);
  crack.stop(now + 0.3);

  // the sparks: hiss plus random pops, through a band-pass so it sizzles
  const len = Math.floor(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const d = buf.getChannelData(0);
  let pop = 0;
  for (let i = 0; i < len; i++) {
    if (Math.random() < 0.0016) pop = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
    pop *= 0.985;
    d[i] = pop + (Math.random() * 2 - 1) * 0.12;
  }
  const sparks = audio.createBufferSource();
  sparks.buffer = buf;
  const band = audio.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2600;
  band.Q.value = 0.6;
  sparks.connect(band).connect(out);
  sparks.start(now);

  // the hum: a buzzing low note that stutters on and off
  const hum = audio.createOscillator();
  hum.type = 'square';
  hum.frequency.value = 58;
  const humGain = audio.createGain();
  humGain.gain.setValueAtTime(0, now);
  for (let k = 0.03; k < dur; k += 0.045) humGain.gain.setValueAtTime(Math.random() < 0.6 ? 0.18 : 0, now + k);
  const low = audio.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 900;
  hum.connect(low).connect(humGain).connect(out);
  hum.start(now);
  hum.stop(now + dur);
}
