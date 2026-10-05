/* ============================================================
   crazyhouse: title screen, the security cams, input, and
   keeping ghoul1 walking (and drawing him through the ghost pass).
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';
import { buildWorld, ROOMS, roomAt, GLASS_LAYER, CULL_LAYER, captureReflections, shadowed } from './world.js?v=42';
import { buildPVS } from './pvs.js?v=1';
import { createEmp } from './emp.js?v=6';
import { CAMS, camAt } from './cams.js?v=8';
import { createGhoul } from './ghoul.js?v=12';
import { createGhostPass, GHOST_LAYER } from './ghost.js?v=4';
import { createTv } from './tv.js?v=8';
import { openSignalURL } from './signal-clip.js?v=7';
import { createAnalogPass } from './analog.js?v=26';


const $ = id => document.getElementById(id);
const frame   = $('frame');
const canvas  = $('view');
const title   = $('title');
const startBt = $('start');
const camNum  = $('camNum');
const camName = $('camName');
const clock   = $('clock');
const dots    = $('dots');

let state = 'title';
// filled in by debug.js when ?debug is on
const debug = { composite: false, free: false, fov: null, tick: null, onCam: null, fp: false, unlit: false };
let camIndex = 0;
export function setComposite(enabled){debug.composite=Boolean(enabled);}
let renderer, scene, camera, ghoul, ghost, lamps, emp, ticks, ir, tv, analog, pvs;
const EXPOSURE = 0.75;         // overall brightness of the picture
const RESOLUTION = 1;          // pixel ratio (window.devicePixelRatio for full retina sharpness, at 4x the cost)
const buffer = new THREE.Vector2();
let shiftStart = 0;
let lastFrame = 0;

/* Shadows are drawn once, then only redrawn when something moves. Each
   redraw of a lamp's shadows draws the house around it six times, so:
   - lamps only redraw for ghoul1 while he's actually here (he casts no
     shadow while gone, see ghoul.js) and only once he's moved,
   - and only the lamps whose light the current cam can see: those redraw
     every frame he moves, so his shadow glides with him. Lamps the cam
     can't see wait, and catch up all at once when the cam changes,
   - a lamp he just walked away from gets one more redraw to clear him,
   - when something else moves (a door, an anomaly), lamps near it redraw. */
const NEAR_LAMP = 18;          // feet
const LIT_REACH = 14;          // a lamp counts as "seen" if the cam sees this close round it
let nearLamps = new Set(), wasHere = false, camChanged = true;
const stale = new Set();       // lamps whose shadows changed while the cam couldn't see them
const lastPos = new THREE.Vector3(), lampAt = new THREE.Vector3(), reach = new THREE.Sphere();
function refreshShadows() {
  const here = ghoul.presence > 0.5, pos = ghoul.object.position;     // he casts a shadow while mostly here (ghoul.js)
  const moved = pos.distanceTo(lastPos) > 0.02;
  const now = new Set();
  if (here || wasHere) {
    for (const l of lamps) if (l.isPointLight && l.getWorldPosition(lampAt).distanceTo(pos) < NEAR_LAMP) now.add(l);
  }
  const redraw = new Set();
  for (const l of now) {
    reach.set(l.getWorldPosition(lampAt), LIT_REACH);
    const seen = frustum.intersectsSphere(reach);
    if (camChanged || (here !== wasHere) || (here && moved && seen)) redraw.add(l);
  }
  for (const l of nearLamps) if (!now.has(l)) redraw.add(l);
  // something else moved (a door swinging, an anomaly): lamps near it that the cam
  // can see redraw now; the rest catch up when the cam changes (or when it settles)
  const things = scene.userData.moved;
  if (things) {
    for (const at of things) for (const l of lamps) {
      if (!l.isPointLight || l.getWorldPosition(lampAt).distanceTo(at) >= NEAR_LAMP) continue;
      reach.set(lampAt, LIT_REACH);
      if (frustum.intersectsSphere(reach)) redraw.add(l); else stale.add(l);
    }
    scene.userData.moved = null;
  }
  for (const l of stale) {                                  // catch up once the cam sees them (or it changes)
    reach.set(l.getWorldPosition(lampAt), LIT_REACH);
    if (camChanged || frustum.intersectsSphere(reach)) redraw.add(l);
  }
  for (const l of redraw) { l.shadow.needsUpdate = true; stale.delete(l); }
  nearLamps = now;
  wasHere = here;
  camChanged = false;
  lastPos.copy(pos);
}

/* The light budget. Every light costs every pixel it might touch (and a
   shadowed one costs a shadow lookup per pixel on top), whether or not a
   wall is in the way. So only the nearest few of each kind are switched
   on at any moment, lights in the room you're in counting nearest; the
   rest are behind walls anyway. The counts never change, so the
   graphics card never has to rebuild its shaders. Lights that come back
   on redraw their shadows if anything moved while they were off. */
const LIGHT_BUDGET = { 'PointLight+shadow': 5, 'SpotLight': 5 };
let budgeted = null;
const lightAt = new THREE.Vector3();
function applyLightBudget(from) {
  if (!budgeted) {
    budgeted = {};
    scene.traverse(l => {
      const key = l.isLight && l.type + (l.castShadow ? '+shadow' : '');
      if (key && LIGHT_BUDGET[key]) (budgeted[key] ||= []).push(l);
    });
  }
  const here = roomAt(from.x, from.z);
  for (const [key, list] of Object.entries(budgeted)) {
    const score = new Map(list.map(l => {
      l.getWorldPosition(lightAt);
      let d = lightAt.distanceTo(from);
      const r = roomAt(lightAt.x, lightAt.z);
      if (here && r && r.name === here.name) d *= 0.4;
      if (l.intensity <= 0) d += 1000;                     // switched off: last
      return [l, d];
    }));
    list.sort((a, b) => score.get(a) - score.get(b));
    list.forEach((l, i) => { l.visible = i < LIGHT_BUDGET[key]; });
  }
}

// what the current cam can see this frame (things like the swaying bulb ask it)
const frustum = new THREE.Frustum(), viewProj = new THREE.Matrix4(), around = new THREE.Sphere();
function updateView() {
  camera.updateMatrixWorld();
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProj);
  scene.userData.frustum = frustum;
}

// is ghoul1 anywhere in front of the current cam? (skips the ghost pass if not)
function ghoulInView() {
  around.center.copy(ghoul.object.position);
  around.center.y += 3;
  around.radius = 4;
  return frustum.intersectsSphere(around);
}


/* ─── setup (runs once, on the first START) ─── */

function setup() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    frame.classList.add('no-gl');
    return false;
  }
  // 1 pixel per screen pixel, even on retina screens: a quarter of the work
  // at 2x, and security cam footage is meant to look a little soft
  renderer.setPixelRatio(RESOLUTION);
  // real lighting: shadows from every lamp, and film-like tone mapping
  // so bright lamp light rolls off softly instead of clipping
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  scene = buildWorld();
  const worldRoots = [...scene.children];      // the house and yard (ghoul1 and the EMP come later)
  lamps = scene.userData.lamps;
  tv = createTv(shadowed);
  scene.add(tv.object);
  lamps.push(tv.light);
  // things that move on their own every frame: the clouds, the fire
  ticks = [];
  scene.traverse(o => { if (o.userData.tick) ticks.push(o.userData.tick); });
  // ...and everything that opens, so openTo() can swing doors smoothly
  scene.traverse(o => { if (o.userData.step) ticks.push(o.userData.step); });
  ghoul = createGhoul();
  // he lives on his own layer: the normal render skips him and the
  // ghost pass draws him, so he can blur and fade
  ghoul.object.traverse(o => o.layers.set(GHOST_LAYER));
  scene.add(ghoul.object);
  // ghoul1 is out of the house for now (he'll come back as an anomaly);
  // ?debug has a button to spawn him
  ghoul.enabled = false;
  ghoul.object.visible = false;
  emp = createEmp(scene);
  // the camera's infrared light: off until night vision is on (always in
  // the scene so switching it on doesn't make the browser stall)
  ir = new THREE.PointLight(0xffffff, 0, 0, 2);
  scene.add(ir);
  // ...so the lights have to reach that layer too, and their shadows include him
  scene.traverse(o => {
    if (!o.isLight) return;
    o.layers.enable(GHOST_LAYER);
    if (o.shadow) { o.shadow.camera.layers.enable(GHOST_LAYER); o.shadow.camera.layers.enable(CULL_LAYER); }
  });
  ghost = createGhostPass(renderer);
  analog = createAnalogPass(renderer, {receiverParameters:{comb:true}});
  const testInterference = Number(new URLSearchParams(location.search).get('interference'));
  if (Number.isFinite(testInterference)) analog.controls.interference = Math.max(0, Math.min(1, testInterference));
  const recordingURL=new URLSearchParams(location.search).get('signal');
  if(recordingURL){
    openSignalURL(recordingURL).then(async clip=>{
      await clip.prime();
      if(clip.error){clip.dispose();throw new Error(clip.error);}
      const gain=Number(new URLSearchParams(location.search).get('signalGain') ?? 0.25);
      clip.gain=Number.isFinite(gain)?Math.max(0,Math.min(2,gain)):0.25;
      analog.setClip(clip);
    }).catch(error=>console.error('Signal recording:',error.message));
  }
  applyLightBudget(new THREE.Vector3(...CAMS[0].pos));     // before anything's drawn, so shaders are built for the budget
  // each window's reflection: one small snapshot apiece, taken now, never again
  captureReflections(renderer, scene);
  camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 600);
  camera.layers.enable(GLASS_LAYER);        // the main view draws window glass too
  // per-cam culling: what each cam can see, worked out once (pvs.js)
  pvs = buildPVS(renderer, scene, worldRoots, CAMS, CULL_LAYER);
  scene.userData.pvs = pvs;

  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(buffer);
    analog.setSize?.(buffer.x,buffer.y);
    ghost.setSize(analog.picture.width,analog.picture.height);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(canvas);
  fit();

  CAMS.forEach(() => dots.appendChild(document.createElement('i')));

  // add ?debug to the URL for the debug panel (free cam, FOV, lighting
  // modes) and to poke at the scene from the browser console
  if (new URLSearchParams(location.search).has('debug')) {
    const api = {
      THREE, scene, camera, renderer, CAMS, showCam, ghoul, lamps, fireEmp, toggleNight, frame, debug, tv, analog, pvs,
      resizeAnalog: fit,
      setComposite,
      isNight: () => night, camIndex: () => camIndex
    };
    window.crazyhouse = api;
    import('./debug.js?v=20').then(m => m.createDebug(api));
  }

  renderer.setAnimationLoop(now => {
    if (state !== 'playing') return;
    // seconds since the last frame, capped so a hidden tab doesn't make him jump
    const dt = Math.min((now - lastFrame) / 1000 || 0, 0.1);
    lastFrame = now;
    analog.stats.renderFrames=(analog.stats.renderFrames??0)+1;
    if(analog.stats.renderStart===undefined)analog.stats.renderStart=now;
    const renderElapsed=now-analog.stats.renderStart;
    if(renderElapsed>=1000){analog.stats.renderFPS=analog.stats.renderFrames*1000/renderElapsed;analog.stats.renderFrames=0;analog.stats.renderStart=now;}
    if (ghoul.enabled) ghoul.update(dt, camAt);
    else ghoul.presence = 0;
    emp.update(dt);
    tv.update(dt);
    analog.controls.monochrome = night;
    if (debug.tick) debug.tick(dt);
    ir.position.copy(camera.position);
    // free cam or a changed FOV can see anything, so cull nothing then
    pvs.apply(debug.free || debug.fov || debug.fp ? null : camIndex);
    if (!debug.unlit) applyLightBudget(camera.position);        // lighting off (debug) keeps every light off
    updateView();
    for (const tick of ticks) tick(dt);
    tickEmp();
    refreshShadows();
    tickClock();
    const target = analog.picture;
    const height = analog.picture.height;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    // blur scales with the picture, so it looks the same at any size
    if (ghoul.enabled && ghoulInView()) ghost.render(scene, camera, ghoul.presence, ghoul.blur * height * 0.022, target);
    if (debug.composite) analog.render(now / 1000);
    else analog.presentClean();
  });
  return true;
}

/* ─── cams ──────────────────────────────────── */

function showCam(i) {
  if (debug.fp && debug.leaveFP) debug.leaveFP();        // switching cams leaves first person
  camIndex = (i + CAMS.length) % CAMS.length;
  camChanged = true;                        // lamps the last cam couldn't see catch up
  const c = CAMS[camIndex];
  camera.position.set(...c.pos);
  camera.fov = debug.fov || c.fov;
  if (debug.free) { debug.free = false; if (debug.onCam) debug.onCam(); }
  camera.updateProjectionMatrix();
  camera.lookAt(...c.look);

  camNum.textContent = 'cam ' + (camIndex + 1);
  camName.textContent = c.name;
  [...dots.children].forEach((d, n) => d.classList.toggle('on', n === camIndex));

}

const next = () => showCam(camIndex + 1);
const prev = () => showCam(camIndex - 1);

/* ─── the clock (night shift starts at midnight) ─── */

function tickClock() {
  const secs = Math.floor((performance.now() - shiftStart) / 1000);
  const h24 = Math.floor(secs / 3600) % 24;
  const m = Math.floor(secs / 60) % 60;
  const s = secs % 60;
  const h12 = h24 % 12 || 12;
  const pad = n => String(n).padStart(2, '0');
  const text = `${h12}:${pad(m)}:${pad(s)} ${h24 < 12 ? 'am' : 'pm'}`;
  if (clock.textContent !== text) clock.textContent = text;
}

/* ─── the EMP ───────────────────────────────── */

/* Fires at the room the current cam is watching. If ghoul1 is in that
   room, he's knocked out of reality. Then it needs RECHARGE seconds
   before it can fire again. */
const RECHARGE = 6;
let empReadyAt = 0;
const empBt = $('emp');

function fireEmp() {
  if (state !== 'playing' || performance.now() < empReadyAt) return;
  empReadyAt = performance.now() + RECHARGE * 1000;
  const room = ROOMS.find(r => r.cam === CAMS[camIndex].name);
  if (room) {
    emp.fire(room);
    const his = roomAt(ghoul.object.position.x, ghoul.object.position.z);
    if (ghoul.enabled && his && his.name === room.name) ghoul.zap();
  }
  frame.classList.remove('emp-hit');
  void frame.offsetWidth;
  frame.classList.add('emp-hit');
}

// the button's charge bar
function tickEmp() {
  const left = Math.max(0, empReadyAt - performance.now()) / (RECHARGE * 1000);
  empBt.style.setProperty('--charge', (1 - left).toFixed(3));
  empBt.classList.toggle('charging', left > 0);
}

/* ─── night vision ──────────────────────────── */

/* Like a real security cam: switching to night vision turns on an
   infrared light at the camera that floods the room it's watching,
   and the picture gets brighter and monochrome. */
const IR_STRENGTH = 900;
const NV_GAIN = 3;            // how much brighter the picture gets
let night = false;
const nvBt = $('nv');

function toggleNight() {
  if (state !== 'playing') return;
  night = !night;
  frame.classList.toggle('night', night);
  nvBt.classList.toggle('on', night);
  nvBt.setAttribute('aria-pressed', night);
  ir.intensity = night ? IR_STRENGTH : 0;
  renderer.toneMappingExposure = EXPOSURE * (night ? NV_GAIN : 1);
}

/* ─── start / quit ──────────────────────────── */

function start() {
  if (state === 'playing') return;
  if (!renderer && !setup()) return;
  state = 'playing';
  tv.play();
  shiftStart = performance.now();
  startBt.blur();
  frame.classList.add('playing');
  showCam(0);
}

function quit() {
  state = 'title';
  tv.pause();
  analog.heldSignals.clear();
  frame.classList.remove('playing');
}

/* ─── input ─────────────────────────────────── */

startBt.addEventListener('click', start);
$('prev').addEventListener('click', prev);
$('next').addEventListener('click', next);
empBt.addEventListener('click', () => { fireEmp(); empBt.blur(); });
nvBt.addEventListener('click', () => { toggleNight(); nvBt.blur(); });

addEventListener('keydown', e => {
  if (e.repeat || e.target.closest?.('input, textarea, select, [contenteditable=true]')) return;
  // the debug free cam owns these keys while it's flying
  if (debug.free && ['w', 'a', 's', 'd', 'c', 'shift', 'control', 'escape'].includes(e.key.toLowerCase())) return;
  // ...and first person owns everything but night vision
  if (debug.fp && e.key.toLowerCase() !== 'n') return;
  if (state === 'title') {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
    return;
  }
  if (/^KeyW$/.test(e.code)) {
    e.preventDefault();
    analog.heldSignals.add(e.code);
    if (e.shiftKey) analog.heldSignals.add('boost');
    return;
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') analog.heldSignals.add('boost');
  // arrows, the number pad (4 / 6), or A / D
  if (e.key === 'ArrowRight' || e.code === 'Numpad6' || e.key === 'd' || e.key === 'D') {
    e.preventDefault(); next();
  } else if (e.key === 'ArrowLeft' || e.code === 'Numpad4' || e.key === 'a' || e.key === 'A') {
    e.preventDefault(); prev();
  } else if (e.key === 'n' || e.key === 'N') {
    e.preventDefault(); toggleNight();
  } else if (e.key === 'b' || e.key === 'B') {
    e.preventDefault(); fireEmp();
  } else if (e.key === 'Escape') {
    quit();
  }
});
// Hold generators to inject; release or lose focus to disconnect all voltage sources.
addEventListener('keyup', e => {
  if (!analog) return;
  analog.heldSignals.delete(e.code);
  if (!e.shiftKey) analog.heldSignals.delete('boost');
});
addEventListener('blur', () => analog?.heldSignals.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) analog?.heldSignals.clear();
});
