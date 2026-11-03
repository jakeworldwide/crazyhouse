/* ============================================================
   crazyhouse: components, the behaviour that goes on the models.

   The house is model files (models/*.glb) placed by a level file
   (house.json), the way a real game is put together. A model file is
   just shape, materials and animation; anything that *does* something
   is a component, named in the model's own data (its glTF "extras",
   which every engine can read):

     userData.component = { type: 'fire', ... }

   applyComponents(scene) finds them all once the house is loaded and
   wires each one up here. The types:

     openable     a door, lid, drawer...: its "open" animation, baked into
                  the model, played by setOpen(t) / openTo(t, seconds)
     fire         the wood stove's flicker (its lights and its embers)
     fridgeLight  the light inside the fridge, on while a door is open
     sway         the laundry bulb swinging on its cord, its light with it
     mirror       the bathroom mirror's live reflection
     halo         a soft glow round a light (the streetlight, the Tiffany lamp)
     painting     one painting: packed onto one sheet with the rest at load;
                  a craziness can paint over it and put it back

   Moving the game to another engine means rewriting this file (and the
   game code), not the models or the level.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';

export const GLASS_LAYER = 2, CULL_LAYER = 4;           // (same as world.js)

const root = o => { while (o.parent) o = o.parent; return o; };

/* ─── openable ─── */

/* The model has an animation clip named after the part ("door-front"),
   one second long, from shut (0) to open (1). setOpen(t) poses it at t;
   openTo(t, seconds) eases there; step(dt) does the easing (main.js calls
   it every frame); userData.open is where it is now. */
function openable(part, clip) {
  const nodes = [];
  for (const track of clip.tracks) {
    const [name, prop] = track.name.split('.');
    const node = name === part.name ? part : part.getObjectByName(name) || root(part).getObjectByName(name);
    if (node) nodes.push({ node, prop, at: track.createInterpolant(), track });
  }
  const box = new THREE.Box3();
  const ud = part.userData;
  let from = 0, goal = 0, p = 1, secs = 1;
  ud.setOpen = t => {
    t = THREE.MathUtils.clamp(t, 0, 1);
    for (const { node, prop, at } of nodes) {
      const v = at.evaluate(t);
      if (prop === 'quaternion') node.quaternion.set(v[0], v[1], v[2], v[3]).normalize();
      else node[prop].fromArray(v);
    }
    ud.open = t;
    // lamps near it redraw their shadows (main.js)
    const r = root(part);
    if (r !== part) (r.userData.moved ||= []).push(box.setFromObject(part).getCenter(new THREE.Vector3()));
  };
  ud.openTo = (t, seconds = 1.2) => { from = ud.open; goal = THREE.MathUtils.clamp(t, 0, 1); p = 0; secs = Math.max(0.01, seconds); };
  ud.step = dt => {
    if (p >= 1) return;
    p = Math.min(1, p + dt / secs);
    ud.setOpen(from + (goal - from) * p * p * (3 - 2 * p));
  };
  ud.setOpen(ud.open ?? 0);
}

/* ─── fire ─── */

function fire(g, { strength }) {
  const room = g.getObjectByName('fire-light'), inside = g.getObjectByName('fire-inside-light');
  const mats = {};
  g.traverse(o => { if (o.isMesh && (o.material.name === 'fire-bark' || o.material.name === 'fire-coals')) mats[o.material.name] = o.material; });
  let t = 0;
  g.userData.tick = dt => {
    t += dt;
    const f = 1 + 0.08 * Math.sin(t * 2.1) + 0.06 * Math.sin(t * 5.3 + 1) + 0.04 * Math.sin(t * 9.7 + 2);
    if (room) room.intensity = strength * f;
    if (inside) inside.intensity = 0.9 * f;
    mats['fire-bark']?.color.setScalar(0.8 + 0.25 * f);
    mats['fire-coals']?.color.setScalar(0.75 + 0.35 * f);
  };
}

/* ─── fridge light ─── */

function fridgeLight(g, { light, doors, strength }) {
  const l = g.getObjectByName(light);
  let parts = null;
  g.userData.tick = () => {
    parts ||= doors.map(n => root(g).getObjectByName(n)).filter(Boolean);
    if (l) l.intensity = strength * Math.max(0, ...parts.map(d => Math.min(1, (d.userData.open || 0) * 3)));
  };
}

/* ─── sway ─── */

/* The bare bulb swings very gently on its cord, its light with it; its
   shadows are redrawn every other frame, and only while a cam can see
   round here, so it stays cheap. */
function sway(g, { swing, light, near }) {
  const s = g.getObjectByName(swing), l = g.getObjectByName(light);
  const around = new THREE.Sphere(new THREE.Vector3(...near), 14);
  let t = 0, n = 0;
  g.userData.tick = dt => {
    t += dt;
    if (s) { s.rotation.z = 0.035 * Math.sin(t * 1.1); s.rotation.x = 0.02 * Math.sin(t * 0.73 + 1); }
    const view = root(g).userData.frustum;
    if (l && ++n % 2 === 0 && (!view || view.intersectsSphere(around))) l.shadow.needsUpdate = true;
  };
}

/* ─── mirror ─── */

/* While a cam can see it, the scene is drawn a second time from the cam's
   reflection, into a picture the mirror shows (the same trick as
   three.js's Reflector). It costs nothing while no cam is looking at it.
   ghoul1 lives on a layer the reflection doesn't draw, so he has no
   reflection. Like a vampire. */
function mirror(mesh) {
  const target = new THREE.WebGLRenderTarget(1024, 576, { type: THREE.HalfFloatType, samples: 4 });
  const textureMatrix = new THREE.Matrix4();
  mesh.material = new THREE.ShaderMaterial({
    uniforms: { map: { value: target.texture }, textureMatrix: { value: textureMatrix }, tint: { value: new THREE.Color(0xd4dade) } },
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      void main() {
        vUv = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 tint;
      varying vec4 vUv;
      void main() {
        gl_FragColor = vec4(texture2DProj(map, vUv).rgb * tint, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const view = new THREE.PerspectiveCamera();
  view.layers.set(0);
  view.layers.enable(GLASS_LAYER);
  view.layers.enable(CULL_LAYER);                 // the mirror shows what's behind the cam, culled or not
  const at = new THREE.Vector3(), eye = new THREE.Vector3(), normal = new THREE.Vector3();
  const look = new THREE.Vector3(), aim = new THREE.Vector3(), turn = new THREE.Matrix4();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    at.setFromMatrixPosition(mesh.matrixWorld);
    eye.setFromMatrixPosition(camera.matrixWorld);
    turn.extractRotation(mesh.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(turn);
    look.subVectors(at, eye);
    if (look.dot(normal) > 0) return;             // looking at its back
    look.reflect(normal).negate().add(at);        // the camera, mirrored through the glass
    turn.extractRotation(camera.matrixWorld);
    aim.set(0, 0, -1).applyMatrix4(turn).add(eye);
    aim.subVectors(at, aim).reflect(normal).negate().add(at);
    view.position.copy(look);
    view.up.set(0, 1, 0).applyMatrix4(turn).reflect(normal);
    view.lookAt(aim);
    view.far = camera.far;
    view.updateMatrixWorld();
    view.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(view.projectionMatrix).multiply(view.matrixWorldInverse).multiply(mesh.matrixWorld);
    // move the near plane onto the mirror, so the wall and yard behind it don't get drawn
    plane.setFromNormalAndCoplanarPoint(normal, at).applyMatrix4(view.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = view.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1; e[14] = clip.w;
    mesh.visible = false;
    const was = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;        // the shadows are already drawn this frame
    renderer.setRenderTarget(target);
    renderer.state.buffers.depth.setMask(true);
    renderer.render(scene, view);
    renderer.setRenderTarget(was);
    renderer.shadowMap.autoUpdate = shadows;
    mesh.visible = true;
  };
}

/* ─── halo ─── */

let haloTexture = null;
function halo(g, { size, color = 0xffffff, boost = 1 }) {
  if (typeof document === 'undefined') return;
  if (!haloTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d'), grad = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 128, 128);
    haloTexture = new THREE.CanvasTexture(c);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sprite.material.color.set(color).multiplyScalar(boost);
  sprite.scale.set(size, size, 1);
  g.add(sprite);
}

/* ─── paintings ─── */

/* Each painting's picture is its own little image in its own model. When
   the house loads they're packed onto one sheet (a texture atlas, like any
   engine does), so all the paintings can be drawn together. A craziness
   can paint over one (repaint) and put it back (restore): the 'paintings'
   group gets repaint(name, draw, { crisp }) and restore(name), for
   craziness-list.js. */
function paintings(list, group) {
  if (typeof document === 'undefined' || !list.length) return;
  const pics = [];
  for (const g of list) {
    let mesh = null;
    g.traverse(o => { if (o.isMesh && o.material.map && !mesh) mesh = o; });
    if (mesh?.material.map.image?.width) pics.push({ name: g.userData.component.name, mesh, img: mesh.material.map.image });
  }
  if (!pics.length) return;
  // shelf-pack them onto one square sheet
  const pad = 2, S = 1024, sheet = document.createElement('canvas');
  sheet.width = sheet.height = S;
  const x = sheet.getContext('2d');
  let cx = 0, cy = 0, row = 0;
  for (const p of pics) {
    const w = p.img.width, h = p.img.height;
    if (cx + w > S) { cx = 0; cy += row + pad; row = 0; }
    p.slot = { x: cx, y: cy, w, h };
    x.drawImage(p.img, cx, cy);
    cx += w + pad; row = Math.max(row, h);
  }
  const tex = new THREE.CanvasTexture(sheet), first = pics[0].mesh.material;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.flipY = first.map.flipY;
  tex.anisotropy = 4;
  const mat = first.clone();
  mat.map = tex;
  if (first.emissiveMap) mat.emissiveMap = tex;
  const api = {};
  for (const p of pics) {
    // its picture's corner of the sheet
    const { x: sx, y: sy, w, h } = p.slot, flip = tex.flipY;
    const geo = p.mesh.geometry = p.mesh.geometry.clone(), uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      const u = uv.getX(k), v = uv.getY(k);
      uv.setXY(k, (sx + u * w) / S, flip ? 1 - (sy + (1 - v) * h) / S : (sy + v * h) / S);
    }
    uv.needsUpdate = true;
    p.mesh.material = mat;
    let saved = null;
    api[p.name] = {
      // crisp: drawn sharp at full size; otherwise drawn small and blown up with hard pixels, like the rest
      repaint(draw, { crisp = false } = {}) {
        saved ||= x.getImageData(sx, sy, w, h);
        x.save(); x.beginPath(); x.rect(sx, sy, w, h); x.clip();
        // (model files keep pictures bottom row first, so the sheet is upside down; draw to match)
        if (flip) x.translate(sx, sy); else { x.translate(sx, sy + h); x.scale(1, -1); }
        if (crisp) { x.imageSmoothingEnabled = true; draw(x, w, h); }
        else {
          const small = document.createElement('canvas');
          small.width = Math.round(w / 2); small.height = Math.round(h / 2);
          draw(small.getContext('2d'), small.width, small.height);
          x.imageSmoothingEnabled = false;
          x.drawImage(small, 0, 0, w, h);
        }
        x.restore();
        tex.needsUpdate = true;
      },
      restore() {
        if (!saved) return;
        x.putImageData(saved, sx, sy);
        saved = null;
        tex.needsUpdate = true;
      }
    };
  }
  // (no names of their own, so the whole wall of them draws together, like before)
  for (const g of list) g.name = '';
  if (group) {
    group.userData.repaint = (name, draw, opts) => api[name]?.repaint(draw, opts);
    group.userData.restore = name => api[name]?.restore();
  }
}

/* ─── wiring it all up ─── */

export function applyComponents(scene) {
  const pictures = [];
  scene.traverse(o => {
    const c = o.userData.component;
    if (!c) return;
    if (c.type === 'fire') fire(o, c);
    else if (c.type === 'fridgeLight') fridgeLight(o, c);
    else if (c.type === 'sway') sway(o, c);
    else if (c.type === 'mirror') mirror(o);
    else if (c.type === 'halo') halo(o, c);
    else if (c.type === 'painting') pictures.push(o);
  });
  // openables: each model brings its clips along (house.js puts them on userData.clips)
  scene.traverse(o => {
    if (!o.userData.clips) return;
    for (const clip of o.userData.clips) {
      const part = clip.name === o.name ? o : o.getObjectByName(clip.name);
      if (part) openable(part, clip);
    }
  });
  paintings(pictures, scene.getObjectByName('paintings'));
}
