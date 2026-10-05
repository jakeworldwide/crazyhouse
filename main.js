/* ============================================================
   crazyhouse: title screen, the security cams, input, and
   keeping ghoul1 walking (and drawing him through the ghost pass).
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';
import { buildWorld, ROOMS, roomAt, GLASS_LAYER, CULL_LAYER, captureReflections, shadowed } from './world.js?v=44';
import { buildPVS } from './pvs.js?v=1';
import { createEmp } from './emp.js?v=6';
import { CAMS, camAt } from './cams.js?v=8';
import { createGhoul } from './ghoul.js?v=12';
import { createGhostPass, GHOST_LAYER } from './ghost.js?v=4';
import { createTv } from './tv.js?v=8';
import { openSignalURL } from './signal-clip.js?v=7';
import { createAnalogPass } from './analog.js?v=36';
import { createOsd } from './osd.js?v=4';
import { createSounds } from './sound.js?v=2';


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
const sounds = createSounds();
const debug = { composite: true, free: false, fov: null, tick: null, onCam: null, fp: false, unlit: false };
let camIndex = 0;
export function setComposite(enabled){debug.composite=Boolean(enabled);}
let renderer, scene, camera, ghoul, ghost, lamps, emp, ticks, ir, tv, analog, pvs, osd, osdTex;
let signalOK = true, signalTries = 0;
const EXPOSURE = 0.66;         // overall brightness of the picture
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


/* ─── the screen (runs at page load) ───────── */

/* The renderer and the NTSC pass come up straight away, so the title
   screen is a dead channel: real composite snow, no signal. The house
   itself is built on the first START (setup). */
function initGL() {
  try {
    // no antialiasing on the page itself: the scene is drawn (antialiased)
    // into the NTSC pass's own picture, and only a flat quad reaches the page
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
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
  analog = createAnalogPass(renderer, {receiverParameters:{comb:true}});
  // the feed's own text, drawn into the picture so it gets the same fuzz (osd.js)
  osd = createOsd(frame);
  osdTex = new THREE.CanvasTexture(osd.canvas);
  osdTex.colorSpace = THREE.NoColorSpace;        // its colours go straight into the picture as they are
  osdTex.generateMipmaps = false;
  osdTex.minFilter = THREE.LinearFilter;
  analog.controls.osd = osdTex;
  // the true signal needs the device to draw and read back 32-bit float pictures; without that
  // (some phones) the feed is the clean picture, lens, text and all, with a simpler static
  signalOK = renderer.extensions.has('EXT_color_buffer_float') && !new URLSearchParams(location.search).has('nosignal');   // (?nosignal tries it without)
  if (!signalOK) debug.composite = false;
  if (new URLSearchParams(location.search).has('diag')) showDiag();
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
  new ResizeObserver(fit).observe(canvas);
  fit();
  if (new URLSearchParams(location.search).has('debug')) window.crazyhouse = { renderer, analog };   // filled in properly on START
  renderer.setAnimationLoop(loop);
  return true;
}

function fit() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  renderer.getDrawingBufferSize(buffer);
  analog.setSize?.(buffer.x,buffer.y);
  if (ghost) ghost.setSize(analog.picture.width,analog.picture.height);
  if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
}

/* ─── setup (runs once, on the first START) ─── */

function setup() {
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
  ir = new THREE.PointLight(0xffffff, 0, 0, 1);     // falls off gently, so what's near the cam isn't blown out
  scene.add(ir);
  // ...so the lights have to reach that layer too, and their shadows include him
  scene.traverse(o => {
    if (!o.isLight) return;
    o.layers.enable(GHOST_LAYER);
    if (o.shadow) { o.shadow.camera.layers.enable(GHOST_LAYER); o.shadow.camera.layers.enable(CULL_LAYER); }
  });
  ghost = createGhostPass(renderer);
  applyLightBudget(new THREE.Vector3(...CAMS[0].pos));     // before anything's drawn, so shaders are built for the budget
  // each window's reflection: one small snapshot apiece, taken now, never again
  captureReflections(renderer, scene);
  camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 600);
  camera.layers.enable(GLASS_LAYER);        // the main view draws window glass too
  // per-cam culling: what each cam can see, worked out once (pvs.js)
  pvs = buildPVS(renderer, scene, worldRoots, CAMS, CULL_LAYER);
  scene.userData.pvs = pvs;

  fit();

  // the cam dots, drawn into the feed with its text (osd.js)
  CAMS.forEach(() => { const d = document.createElement('i'); d.dataset.osd = 'hud'; dots.appendChild(d); });

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
    import('./debug.js?v=21').then(m => m.createDebug(api));
  }

  return true;
}

/* ─── every frame ───────────────────────────── */

const GLITCH = 0.45;           // seconds of signal trouble when the feed switches cams
const FISHEYE = 0.2;           // the cams' wide lens (0 is a flat picture)
let glitch = 0;
// the title's tracking twitch: now and then a band of lines slips sideways for a moment
let twitchAt = 0, twitchUntil = 0;
function titleTwitch(now) {
  if (now > twitchAt) {
    twitchAt = now + 1800 + Math.random() * 4200;
    twitchUntil = now + 90 + Math.random() * 90;
    analog.controls.twitchY = 0.15 + Math.random() * 0.7;
    analog.controls.twitchX = (Math.random() < 0.5 ? -1 : 1) * (0.004 + Math.random() * 0.008);
  }
  if (now > twitchUntil) analog.controls.twitchY = -1;
}
function loop(now) {
  // seconds since the last frame, capped so a hidden tab doesn't make him jump
  const dt = Math.min((now - lastFrame) / 1000 || 0, 0.1);
  lastFrame = now;
  if (state !== 'playing' || !scene) {
    // the title: a dead channel, nothing but snow
    Object.assign(analog.controls, { signalLevel: 1, snow: 0.04, glitch: 0, fisheye: 0, monochrome: false, twitchW: 0.03, twitchNoise: 0 });
    if (osd.update('title', now)) osdTex.needsUpdate = true;
    titleTwitch(now);
    analog.snow(now / 1000);
    present(now);
    return;
  }
  glitch = Math.max(0, glitch - dt);
  Object.assign(analog.controls, { signalLevel: 1, snow: 0, glitch: glitch / GLITCH, fisheye: debug.fp ? 0 : FISHEYE });     // (the free cam keeps the lens, so its view matches the cams')
  // night vision switching: the picture goes out completely for a moment (anything
  // can happen behind it), then a wide band of tracking trouble rolls up as it comes back
  const nvT = (now - sweepStart) / 1000;
  if (nvT < BLACKOUT) Object.assign(analog.controls, { signalLevel: 0.02, glitch: 1 });
  if (nvT >= BLACKOUT * 0.45) applyNight();                // halfway through the dark, the picture switches
  else if (!nvBack) { nvBack = true; glitch = GLITCH; }
  const sweep = (nvT - BLACKOUT) / SWEEP;
  if (sweep >= 0 && sweep < 1) Object.assign(analog.controls, { twitchY: sweep * 1.3 - 0.15, twitchW: 0.11, twitchNoise: 0.55, twitchX: 0.035 * Math.sin(now * 0.09) });
  else Object.assign(analog.controls, { twitchY: -1, twitchW: 0.03, twitchNoise: 0 });
  analog.stats.renderFrames=(analog.stats.renderFrames??0)+1;
  if(analog.stats.renderStart===undefined)analog.stats.renderStart=now;
  const renderElapsed=now-analog.stats.renderStart;
  if(renderElapsed>=1000){analog.stats.renderFPS=analog.stats.renderFrames*1000/renderElapsed;analog.stats.renderFrames=0;analog.stats.renderStart=now;}
  if (ghoul.enabled) ghoul.update(dt, camAt);
  else ghoul.presence = 0;
  emp.update(dt);
  tv.update(dt);
  analog.controls.monochrome = nightShown === true;     // (follows the picture, which switches in the dark)
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
  tickReport(now);
  if (osd.update('hud', now, analog.controls.fisheye)) osdTex.needsUpdate = true;
  const target = analog.picture;
  const height = analog.picture.height;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  // blur scales with the picture, so it looks the same at any size
  if (ghoul.enabled && ghoulInView()) ghost.render(scene, camera, ghoul.presence, ghoul.blur * height * 0.022, target);
  present(now);
}

/* The picture goes out through the signal, or straight to the screen when
   the signal's off (debug) or the device can't run it. If the signal errors,
   or hasn't shown a single frame after a few seconds, it's switched off for
   good and the clean picture takes over, so nobody's left on a black screen. */
function present(now) {
  if (signalOK && debug.composite) {
    analog.render(now / 1000);
    signalTries++;
    if (analog.stats.error || (signalTries > 240 && analog.stats.frames === 0)) {
      signalOK = false; debug.composite = false;
      reportProblem('signal off: ' + (analog.stats.error || 'no frames decoded'));
    }
  } else analog.presentClean();
}

// a problem worth knowing about shows in the corner with ?diag (and goes to the console)
const diagBox = $('diag');
function reportProblem(text) {
  console.warn('crazyhouse:', text);
  if (!diagBox.hidden) diagBox.textContent += '\n' + text;
}
function showDiag() {
  const gl = renderer.getContext(), ext = n => renderer.extensions.has(n) ? 'yes' : 'NO';
  diagBox.hidden = false;
  diagBox.textContent = [`webgl2 ${renderer.capabilities.isWebGL2 ? 'yes' : 'NO'}  samples ${gl.getParameter(gl.MAX_SAMPLES)}`,
    `float draw ${ext('EXT_color_buffer_float')}  half draw ${ext('EXT_color_buffer_half_float')}  float smooth ${ext('OES_texture_float_linear')}`,
    `signal ${signalOK ? 'on' : 'off (clean picture)'}`].join('\n');
}
addEventListener('error', e => reportProblem(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
addEventListener('unhandledrejection', e => reportProblem(String(e.reason && e.reason.message || e.reason)));

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

  camNum.textContent = 'CAM ' + String(camIndex + 1).padStart(2, '0');
  camName.textContent = c.name;
  [...dots.children].forEach((d, n) => d.classList.toggle('on', n === camIndex));

  // the feed switching over: the dial thunks and the signal breaks up for a moment
  glitch = GLITCH;
  sounds.thunk();
  if (!debug.composite) {
    frame.classList.remove('cut');
    void frame.offsetWidth;
    frame.classList.add('cut');
  }
}

const next = () => showCam(camIndex + 1);
const prev = () => showCam(camIndex - 1);

/* ─── the clock (night shift starts at midnight) ─── */

// the shift's clock: midnight at the start, and an hour goes by every 5 real minutes
const HOUR = 5 * 60;           // real seconds per hour on the clock
function tickClock() {
  const minutes = Math.floor((performance.now() - shiftStart) / 1000 / HOUR * 60);
  const h24 = Math.floor(minutes / 60) % 24, m = minutes % 60;
  const text = `${h24 % 12 || 12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
  if (clock.textContent !== text) clock.textContent = text;
}

/* ─── the EMP ───────────────────────────────── */

/* Fires at the room the current cam is watching. If ghoul1 is in that
   room, he's knocked out of reality. Then it needs RECHARGE seconds
   before it can fire again. */
const RECHARGE = 6;
let empReadyAt = 0;
const empBt = $('emp');        // (no button for now: B fires it)

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
  if (!empBt) return;
  const left = Math.max(0, empReadyAt - performance.now()) / (RECHARGE * 1000);
  empBt.style.setProperty('--charge', (1 - left).toFixed(3));
  empBt.classList.toggle('charging', left > 0);
}

/* ─── night vision ──────────────────────────── */

/* Like a real security cam: switching to night vision turns on an
   infrared light at the camera that floods the room it's watching,
   and the picture gets brighter, green and grainy. */
const IR_STRENGTH = 20;
const NV_GAIN = 1.2;          // how much brighter the picture gets
const BLACKOUT = 0.25;        // seconds the picture is completely out when it switches
const SWEEP = 0.5;            // seconds: then a tracking band rolls up the picture
let sweepStart = -1e9, nvBack = true;
let night = false;
const nvBt = $('nv');

function toggleNight() {
  if (state !== 'playing') return;
  night = !night;
  // the switch-over knocks the signal out completely for a moment, then it rolls back
  // like changing cams. Anything that wants to change while nobody can see (a
  // jumpscare, say) listens for 'crazyhouse:blackout'.
  sweepStart = performance.now();
  nvBack = false;
  sounds.relay();
  dispatchEvent(new CustomEvent('crazyhouse:blackout', { detail: { night, seconds: BLACKOUT } }));
  if (!debug.composite) { frame.classList.remove('cut'); void frame.offsetWidth; frame.classList.add('cut'); }
  nvBt.classList.toggle('on', night);
  nvBt.setAttribute('aria-pressed', night);
  // the picture itself only switches once it's gone dark (applyNight, from the loop)
  nightShown = null;
}

// the night vision look and light, switched while the picture is out
let nightShown = false;
function applyNight() {
  if (nightShown === night) return;
  nightShown = night;
  frame.classList.toggle('night', night);
  ir.intensity = night ? IR_STRENGTH : 0;
  renderer.toneMappingExposure = EXPOSURE * (night ? NV_GAIN : 1);
}

// a tile of random grain for the night-vision layer, made once
(function makeGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const x = c.getContext('2d');
  const img = x.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 34;
  }
  x.putImageData(img, 0, 0);
  frame.style.setProperty('--grain', `url(${c.toDataURL()})`);
})();

/* ─── reporting an anomaly ──────────────────── */

/* Bottom right: say which room something crazy is going on in. There's
   nothing crazy yet, so for now every report comes back with nothing
   found; checkAnomaly(camIndex) is where it'll be looked up. */
const reportBtn = $('reportBtn'), reportList = $('reportList'), reportMsg = $('reportMsg');
let reportSteps = [];
function checkAnomaly(cam) { return false; }
// one button per cam, then cancel
for (const [i, c] of [...CAMS.entries(), [-1, { name: 'cancel' }]]) {
  const b = document.createElement('button');
  b.dataset.osd = 'hud'; b.dataset.cam = i; b.textContent = c.name;
  reportList.appendChild(b);
}
function openReport(open) {
  reportList.hidden = !open;
  reportBtn.setAttribute('aria-expanded', open);
}
function fileReport(cam) {
  openReport(false);
  if (cam < 0) return;
  const t = performance.now();
  reportSteps = [
    [t, `reporting: ${CAMS[cam].name}...`],
    [t + 2200, checkAnomaly(cam) ? 'craziness fixed' : 'no craziness found'],
    [t + 4600, null]
  ];
}
function tickReport(now) {
  while (reportSteps.length && now >= reportSteps[0][0]) {
    const [, text] = reportSteps.shift();
    reportMsg.hidden = !text;
    if (text) reportMsg.textContent = text;
  }
}
reportBtn.addEventListener('click', () => { if (reportSteps.length) return; openReport(reportList.hidden); reportBtn.blur(); });
reportList.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { fileReport(Number(b.dataset.cam)); b.blur(); } });

/* ─── the options menu (Esc) ───────────────── */

const pauseMenu = $('pauseMenu');
function openPause(open) {
  pauseMenu.hidden = !open;
  if (open) openReport(false);
}
$('resumeBt').addEventListener('click', e => { openPause(false); e.currentTarget.blur(); });
$('quitBt').addEventListener('click', e => { e.currentTarget.blur(); quit(); });

/* ─── start / quit ──────────────────────────── */

function start() {
  if (state === 'playing') return;
  if (!renderer) return;
  sounds.unlock();                            // (sound is only allowed after a click or key)
  if (!scene) setup();
  state = 'playing';
  tv.play();
  shiftStart = performance.now();
  startBt.blur();
  frame.classList.add('playing');
  showCam(0);
}

function quit() {
  state = 'title';
  openPause(false);
  openReport(false); reportSteps = []; reportMsg.hidden = true;
  tv.pause();
  analog.heldSignals.clear();
  frame.classList.remove('playing');
}

/* ─── input ─────────────────────────────────── */

startBt.addEventListener('click', start);
$('prev').addEventListener('click', prev);
$('next').addEventListener('click', next);
empBt?.addEventListener('click', () => { fireEmp(); empBt.blur(); });
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
  if (!pauseMenu.hidden && e.key !== 'Escape') return;
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
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault(); if (!reportSteps.length) openReport(reportList.hidden);
  } else if (e.key === 'b' || e.key === 'B') {
    e.preventDefault(); fireEmp();
  } else if (e.key === 'Escape') {
    if (!reportList.hidden) openReport(false);
    else openPause(pauseMenu.hidden);
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

initGL();
