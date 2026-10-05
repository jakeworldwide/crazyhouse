/* ============================================================
   crazyhouse: the world.

   The house started out built straight off blueprint.png, and
   it's free to drift from it now. Every plan coordinate in this
   file is still a PIXEL on that image, so you can open it in any
   image editor, hover a spot, and find the same numbers here. X() and Z() turn pixels into feet (27.42 px per
   foot, taken from the plan's 42' and 34' dimensions). Heights
   are in feet.

   Every solid is a plain lit surface, no outlines. Real
   lights (a lamp in each room, a streetlight, faint moonlight) cast
   real shadows, so light only reaches what it can actually see:
   through doorways, out of windows, into the yard.

   Walls are extruded from their elevation, so windows are real
   holes and doorways are real gaps. Where two walls meet at a
   corner, both ends are cut on the diagonal (a mitre) so no
   stray seam lines show up on the faces.

   Top-level pieces have a .name (sofa, bed, door-front, ...) so
   later code can grab one with scene.getObjectByName() and mess
   with it.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';

/* ─── units ─────────────────────────────────── */

const K = 27.42;                          // blueprint pixels per foot
export const X = px => (px - 680.5) / K;         // blueprint x → feet (house centred on 0)
export const Z = py => (py - 620.5) / K;         // blueprint y → feet

export const FLOOR = 2.5;                 // main floor, feet above the yard
export const CEIL = FLOOR + 8;            // 8' ceilings
const SLAB = 0.4;                         // ceiling thickness
const EAVE = CEIL + SLAB;                 // where the roofs start
const DOOR_H = 6.8;

/* Which room is where, as blueprint rectangles [x0, x1, y0, y1], and
   which cam (by its name in main.js) covers it. First match wins.
   The hall where the stairs used to be counts as the living room. */
export const ROOMS = [
  { name: 'patio',          cam: 'patio',          rects: [[738, 1256, 0, 345]] },
  { name: 'foyer',          cam: 'foyer',          rects: [[105, 295, 482, 814]] },
  { name: 'living room',    cam: 'living room',    rects: [[295, 790, 154, 806], [790, 807, 715, 806]] },
  { name: 'kitchen',        cam: 'kitchen',        rects: [[790, 1256, 345, 715]] },
  { name: 'master bedroom', cam: 'master bedroom', rects: [[807, 1256, 715, 1087]] },
  { name: 'bathroom',       cam: 'bathroom',       rects: [[295, 605, 806, 1087]] },
  { name: 'laundry',        cam: 'laundry',        rects: [[605, 807, 806, 1087]] }
];

export function roomAt(x, z) {
  const px = x * K + 680.5, py = z * K + 620.5;
  for (const r of ROOMS) {
    if (r.rects.some(([x0, x1, y0, y1]) => px >= x0 && px <= x1 && py >= y0 && py <= y1)) return r;
  }
  return null;
}

/* ─── materials ─────────────────────────────── */

/* A surface that light falls on. Faces are pushed back a hair, so
   anything drawn flat against them (labels, lines) shows cleanly. */
export function surface(color, roughness = 0.9, side = THREE.FrontSide) {
  return new THREE.MeshStandardMaterial({
    color, roughness, metalness: 0, side,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });
}

/* Flat colours, no texture images, so it costs nothing extra to draw. */
const metal = (color, rough = 0.45) => {
  const m = surface(color, rough);
  m.metalness = 0.35;
  return m;
};

export const MAT = {
  wall:      surface(0xd8cdb8),          // warm off-white paint
  ceiling:   surface(0xe9e4da),
  floor:     surface(0x86603d, 0.7),     // wood floorboards
  roof:      surface(0x3a3d42),          // dark slate shingles
  door:      surface(0x7a5232, 0.7),     // stained wood
  frontDoor: surface(0x7c2a24, 0.6),     // red front door
  furniture: surface(0x8a6440, 0.75),    // default: wood
  dark:      surface(0x2b2b2d),          // black stools, stove, lamp bases
  soft:      surface(0xece9e2),          // linens, white things
  porcelain: surface(0xf2f1ec, 0.25),    // toilet, sink, shower
  appliance: surface(0xe6e6e3, 0.4),     // washer, dryer
  steel:     metal(0xb9bec2),            // fridge
  cabinet:   surface(0x76866f, 0.7),     // sage kitchen cabinets
  sofa:      surface(0x4c5b70),          // blue-grey fabric
  armchair:  surface(0x3e5a45),          // bottle green
  mustard:   surface(0x9c7a36),          // tub chairs
  brick:     surface(0x7b3d2f),          // hearth
  wood:      surface(0x8b6b4a, 0.85),    // weathered porch decking
  ground:    surface(0x355f2a, 1),       // grass
  concrete:  surface(0x9a968d, 0.95),
  bark:      surface(0x4a3626, 1),
  leaves:    surface(0x2f5a2b, 1),
  pine:      surface(0x24432a, 1),
  pole:      metal(0x2e3832, 0.6),       // streetlight, dark green paint
  trim:      surface(0xefede6, 0.6),     // white window frames
  track:     metal(0x6b6f72, 0.5),       // sliding door frames
  // faint see-through glass. Unlit on purpose: lit glass shows every lamp
  // as a hard white dot. It reflects a snapshot of what's around it instead
  // (captureReflections), so this colour is just the slight dark tint.
  glass:     new THREE.MeshBasicMaterial({
    color: 0x10161b, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
    combine: THREE.MixOperation, reflectivity: 0.45
  }),
  liner:     surface(0xf0efe9, 0.6, THREE.BackSide),   // inside the fridge (drawn inside out)
  drum:      (() => {                     // washer tub, dryer drum
    const m = surface(0x9aa0a4, 0.4, THREE.DoubleSide);
    m.metalness = 0.35;
    return m;
  })(),
  basin:     (() => {                     // the kitchen sink bowls, seen from above and from under the sink
    const m = surface(0xa7adb1, 0.3, THREE.DoubleSide);
    m.metalness = 0.35;
    return m;
  })(),
  // 90s colours, for clothes, cushions, the bathmat
  flannel:   surface(0x8b2e2a),          // red
  denim:     surface(0x3d5a80),
  hunter:    surface(0x2f4a35),          // hunter green
  plum:      surface(0x5d3a6b),
  teal:      surface(0x1f7a7a, 0.6),
  cream:     surface(0xd9cfb8),
  mauve:     surface(0x9c6b7a, 1),       // fuzzy bathmat
  brass:     metal(0xb8963e, 0.35),      // shower frame, knobs
  chrome:    metal(0xd0d4d8, 0.25),      // taps, stools, closet rods
  counter:   surface(0xcfc6b2, 0.6),     // almond laminate countertops
  cabShelf:  surface(0xcdb98f, 0.8),     // pale wood inside the cabinets
  cabInside: surface(0xd8c7a3, 0.8, THREE.BackSide),   // cabinet insides (drawn inside out)
  firebrick: surface(0x4a2a1e, 1, THREE.BackSide),     // inside the wood stove
  porcelainBoth: surface(0xf2f1ec, 0.65, THREE.DoubleSide),   // the toilet bowl, seen inside and out
  toilet:    surface(0xf2f1ec, 0.65),    // matte, so it doesn't shine
  bowl:      surface(0xf2f1ec, 0.25, THREE.BackSide),         // the bathroom sink, drawn inside out
  glow:      new THREE.MeshBasicMaterial({ color: 0xfff0d4 }),  // lampshades, bulbs: they ARE the light
  shadeGlow: new THREE.MeshBasicMaterial({ color: 0xf2dfbf, side: THREE.DoubleSide })   // open shades, lit inside and out
};

// dark lines for cords and wires
export const EDGE  = new THREE.LineBasicMaterial({ color: 0x0b0b0b });

/* ─── building blocks ───────────────────────── */

// A solid: a lit surface.
export function solid(geo, [x, y, z] = [0, 0, 0], rot, mat = MAT.furniture) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  g.position.set(x, y, z);
  if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
  return g;
}

// Paint a part now and keep that colour (paint() skips it).
function tint(obj, mat) {
  obj.traverse(o => { if (o.isMesh && !o.material.isMeshBasicMaterial && !o.userData.keep) { o.material = mat; o.userData.keep = true; } });
  return obj;
}

function named(name, ...parts) {
  const g = new THREE.Group();
  g.name = name;
  g.add(...parts);
  return g;
}

// Loose lines from a list of [a, b] point pairs (feet).
export function lines(pairs, mat = EDGE) {
  const pts = pairs.flat().map(p => new THREE.Vector3(p[0], p[1], p[2]));
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

// Rewrite every vertex of a geometry through fn(x, y, z) → [x, y, z].
function remap(geo, fn) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [a, b, c] = fn(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, a, b, c);
  }
  p.needsUpdate = true;
  outwardFaces(geo);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/* Some remaps mirror the geometry (swapping two axes), which turns
   it inside out. Light and shadows care which way faces point, so
   if the shape's volume comes out negative, flip every triangle. */
function outwardFaces(geo) {
  const p = geo.attributes.position;
  if (geo.index) return;
  let vol = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const bx = p.getX(i + 1), by = p.getY(i + 1), bz = p.getZ(i + 1);
    const cx = p.getX(i + 2), cy = p.getY(i + 2), cz = p.getZ(i + 2);
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol >= 0) return;
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name], n = a.itemSize;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t = a.array[(i + 1) * n + k];
        a.array[(i + 1) * n + k] = a.array[(i + 2) * n + k];
        a.array[(i + 2) * n + k] = t;
      }
    }
    a.needsUpdate = true;
  }
}

/* A box from blueprint pixels (x0..x1, y0..y1) and heights h0..h1.
   Heights are above the main floor unless you pass base = 0. */
function block(x0, x1, y0, y1, h1, h0 = 0, base = FLOOR) {
  const w = X(x1) - X(x0), d = Z(y1) - Z(y0), h = h1 - h0;
  return solid(new THREE.BoxGeometry(w, h, d),
    [(X(x0) + X(x1)) / 2, base + h0 + h / 2, (Z(y0) + Z(y1)) / 2]);
}

// Something round, centred on blueprint pixel (cx, cy). r is in feet.
function round(cx, cy, r, h1, h0 = 0, segs = 12, rTop = r) {
  const h = h1 - h0;
  return solid(new THREE.CylinderGeometry(rTop, r, h, segs), [X(cx), FLOOR + h0 + h / 2, Z(cy)]);
}

// A flat slab from a blueprint polygon, with optional holes, between heights y0..y1.
function slab(outline, holes, y0, y1) {
  const v = ([px, py]) => new THREE.Vector2(X(px), Z(py));
  const shape = new THREE.Shape(outline.map(v));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(v)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  return solid(remap(geo, (x, y, z) => [x, y0 + z, y]));
}

/* ─── glass ─────────────────────────────────── */

export const GLASS_LAYER = 2;
// things the current cam can't see go here (pvs.js): lights still see them
export const CULL_LAYER = 4;

/* A frame for windows and mirrors, inside an opening. place(u, y, w)
   maps along-the-opening, height and depth to the world (same as
   walls). It's ONE solid: a rectangle with a hole per pane, so the bars
   between panes come free. panes across, rows up. Kept parts aren't
   repainted. */
function paneFrame(place, u0, u1, y0, y1, w, { panes = 1, rows = 1, border = 0.14, bar = 0.08, depth = 0.12, mat = MAT.trim } = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(u0, y0); shape.lineTo(u1, y0); shape.lineTo(u1, y1); shape.lineTo(u0, y1);
  const across = (u1 - u0 - border * 2 - bar * (panes - 1)) / panes;
  const up = (y1 - y0 - border * 2 - bar * (rows - 1)) / rows;
  for (let k = 0; k < panes; k++) for (let r = 0; r < rows; r++) {
    const a = u0 + border + k * (across + bar), b = a + across;
    const c = y0 + border + r * (up + bar), d = c + up;
    const hole = new THREE.Path();
    hole.moveTo(a, c); hole.lineTo(b, c); hole.lineTo(b, d); hole.lineTo(a, d);
    shape.holes.push(hole);
  }
  const geo = remap(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }),
    (u, y, d) => place(u, y, w - depth / 2 + d));
  const frame = solid(geo, [0, 0, 0], null, mat);
  frame.traverse(o => { if (o.isMesh) o.userData.keep = true; });
  return frame;
}

/* A window frame with its glass. The glass is one sheet behind all the
   panes, so each window costs only a couple of draws. */
function glazing(place, u0, u1, y0, y1, w, opts = {}) {
  const b = opts.border ?? 0.14;
  const geo = new THREE.PlaneGeometry(1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) < 0 ? u0 + b : u1 - b, y = pos.getY(i) < 0 ? y0 + b : y1 - b;
    pos.setXYZ(i, ...place(u, y, w));
  }
  geo.computeVertexNormals();
  const glass = new THREE.Mesh(geo, MAT.glass);
  glass.layers.set(GLASS_LAYER);       // see-through, so it mustn't hide ghoul1 (ghost.js skips this layer)
  glass.userData.keep = true;
  glass.userData.noShadow = true;
  glass.userData.reflect = true;       // gets its own reflection snapshot (captureReflections)
  const g = new THREE.Group();
  g.add(paneFrame(place, u0, u1, y0, y1, w, opts), glass);
  return g;
}

/* Window reflections. Once, at the start, each pane of glass takes a
   tiny six-way snapshot from where it sits, and then faintly reflects
   it. So a window shows the room right around it from inside, and the
   yard and sky from outside. One snapshot each and then it costs
   nothing; the reflections just don't move. (Needs a renderer, so
   main.js calls it.) */
export function captureReflections(renderer, scene) {
  scene.updateMatrixWorld(true);
  const panes = [];
  scene.traverse(o => { if (o.userData.reflect) panes.push(o); });
  // no sky: blown up in a reflection, each star turns into a white block
  const heavens = scene.getObjectByName('heavens');
  if (heavens) heavens.visible = false;
  for (const glass of panes) {
    glass.geometry.computeBoundingSphere();
    const target = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const snap = new THREE.CubeCamera(0.2, 600, target);      // sees layer 0 only: no glass, no ghoul1
    snap.position.copy(glass.geometry.boundingSphere.center).applyMatrix4(glass.matrixWorld);
    snap.updateMatrixWorld(true);
    snap.update(renderer, scene);
    glass.material = MAT.glass.clone();
    glass.material.envMap = target.texture;
  }
  if (heavens) heavens.visible = true;
}

/* A real mirror. While a cam can see it, the scene is drawn a second
   time from the cam's reflection, into a picture the mirror shows (the
   same trick as three.js's Reflector). It costs nothing while no cam is
   looking at it. ghoul1 lives on a layer the reflection doesn't draw,
   so he has no reflection. Like a vampire. */
function mirror(u0, u1, y0, y1, z) {
  const target = new THREE.WebGLRenderTarget(1024, 576, { type: THREE.HalfFloatType, samples: 4 });
  const textureMatrix = new THREE.Matrix4();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(u1 - u0, y1 - y0), new THREE.ShaderMaterial({
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
  }));
  mesh.position.set((u0 + u1) / 2, (y0 + y1) / 2, z);
  mesh.rotation.y = Math.PI;                      // facing north, into the room
  mesh.layers.set(GLASS_LAYER);                   // so window snapshots and the ghost pass skip it
  mesh.userData.keep = mesh.userData.noShadow = true;

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
    // the camera, mirrored through the glass
    look.reflect(normal).negate().add(at);
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
  return mesh;
}

/* ─── walls ─────────────────────────────────── */

const win  = (from, to, sill, head = 7) => [from, to, sill, head];
const door = (from, to, head = DOOR_H) => [from, to, 0, head];

/* One straight wall.
   dir 'h' runs left-right on the plan, c0..c1 are the rows of its
   two faces (top face = a, bottom face = b).
   dir 'v' runs up-down, c0..c1 are the columns (left face = a,
   right face = b).
   a = [start, end] of face a along the wall, b = the same for face
   b. They only differ at a mitred corner; leave b out otherwise.
   openings: win() / door() ranges along the wall, in pixels. */
function wall(dir, c0, c1, a, b, openings = [], { bottom = FLOOR, top = CEIL, outside = null } = {}) {
  b = b || a;
  const M = dir === 'h' ? X : Z;          // along the wall
  const N = dir === 'h' ? Z : X;          // across it
  const a0 = M(a[0]), a1 = M(a[1]), b0 = M(b[0]), b1 = M(b[1]);
  const w0 = N(c0), t = N(c1) - N(c0);
  const place = dir === 'h'
    ? (u, y, w) => [u, y, w0 + w]
    : (u, y, w) => [w0 + w, y, u];

  const ops = openings
    .map(o => ({ u0: M(o[0]), u1: M(o[1]), sill: o[2], head: o[3] }))
    .sort((p, q) => p.u0 - q.u0);

  // elevation: doorways are notches in the outline, windows are holes
  const shape = new THREE.Shape();
  shape.moveTo(a0, bottom);
  for (const o of ops) if (o.sill <= 0) {
    shape.lineTo(o.u0, bottom);
    shape.lineTo(o.u0, bottom + o.head);
    shape.lineTo(o.u1, bottom + o.head);
    shape.lineTo(o.u1, bottom);
  }
  shape.lineTo(a1, bottom);
  shape.lineTo(a1, top);
  shape.lineTo(a0, top);
  for (const o of ops) if (o.sill > 0) {
    const hole = new THREE.Path();
    hole.moveTo(o.u0, bottom + o.sill);
    hole.lineTo(o.u1, bottom + o.sill);
    hole.lineTo(o.u1, bottom + o.head);
    hole.lineTo(o.u0, bottom + o.head);
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  remap(geo, (u, y, w) => {
    // mitre: slide the end vertices so face b starts/ends where it should
    const f = w / t;
    if (Math.abs(u - a0) < 1e-5) u = a0 + (b0 - a0) * f;
    else if (Math.abs(u - a1) < 1e-5) u = a1 + (b1 - a1) * f;
    return place(u, y, w);
  });

  // a real window in each hole: white frame, bars between panes, glass
  const g = solid(geo);
  for (const o of ops) if (o.sill > 0) {
    const panes = Math.max(1, Math.ceil((o.u1 - o.u0) / 3.2));
    g.add(glazing(place, o.u0, o.u1, bottom + o.sill, bottom + o.head, t / 2, { panes }));
  }
  // an outside face: dress it craftsman style
  if (outside) {
    const s0 = M(outside.from), s1 = M(outside.to), out = outside.face === 'a' ? -1 : 1, base = outside.face === 'a' ? 0 : t;
    const at = (u, y, d) => place(u, y, base + out * d);                       // d: feet out from the face
    g.add(...craftsman(dir, at, s0, s1, ops.filter(o => o.u1 > s0 && o.u0 < s1), bottom));
  }
  return g;
}

/* Craftsman dressing for one outside wall face (90s Oregon): olive lap
   siding with its board lines, a stone skirt below the floor, cream
   corner boards, a belly band and a frieze board under the eaves, and
   wide flat casings round the windows and doors with a capped head.
   at(u, y, d) places a point on the face, d feet out from it. */
const SIDING = surface(0x58614a, 0.85), STONE = surface(0x6e6a62, 1);
const SIDING_LINE = new THREE.LineBasicMaterial({ color: 0x353c2c });
function craftsman(dir, at, s0, s1, ops, bottom) {
  const top = EAVE, parts = [];
  const sheet = (shape, d, mat) => {
    const geo = remap(new THREE.ShapeGeometry(shape), (u, y) => at(u, y, d));
    const m = new THREE.Mesh(geo, mat);
    m.userData.keep = true;
    return m;
  };
  // the siding sheet: the face with the windows cut out and the doors notched in
  const face = new THREE.Shape();
  face.moveTo(s0, bottom);
  for (const o of ops) if (o.sill <= 0) {
    face.lineTo(o.u0, bottom); face.lineTo(o.u0, bottom + o.head); face.lineTo(o.u1, bottom + o.head); face.lineTo(o.u1, bottom);
  }
  face.lineTo(s1, bottom); face.lineTo(s1, top); face.lineTo(s0, top);
  for (const o of ops) if (o.sill > 0) {
    const h = new THREE.Path();
    h.moveTo(o.u0, bottom + o.sill); h.lineTo(o.u1, bottom + o.sill); h.lineTo(o.u1, bottom + o.head); h.lineTo(o.u0, bottom + o.head);
    face.holes.push(h);
  }
  SIDING.side = STONE.side = THREE.DoubleSide;
  parts.push(sheet(face, 0.025, SIDING));
  const skirt = new THREE.Shape();
  skirt.moveTo(s0, 0); skirt.lineTo(s1, 0); skirt.lineTo(s1, bottom); skirt.lineTo(s0, bottom);
  parts.push(sheet(skirt, 0.06, STONE));
  // lap siding lines, stopping at window and door trim
  const boards = [];
  for (let y = bottom + 0.75; y < top - 0.6; y += 0.42) {
    let u = s0 + 0.36;
    const stops = ops.filter(o => y > bottom + Math.max(0, o.sill) - 0.2 && y < bottom + o.head + 0.55)
      .map(o => [o.u0 - 0.32, o.u1 + 0.32]).sort((p, q) => p[0] - q[0]);
    for (const [a, b] of stops) { if (a > u) boards.push([at(u, y, 0.035), at(a, y, 0.035)]); u = Math.max(u, b); }
    if (u < s1 - 0.36) boards.push([at(u, y, 0.035), at(s1 - 0.36, y, 0.035)]);
  }
  parts.push(lines(boards, SIDING_LINE));
  // trim boards
  const trim = (u0, u1, y0, y1, depth) => {
    const c = at((u0 + u1) / 2, (y0 + y1) / 2, depth / 2), w = u1 - u0, h = y1 - y0;
    return tint(solid(dir === 'h' ? new THREE.BoxGeometry(w, h, depth) : new THREE.BoxGeometry(depth, h, w), c), MAT.trim);
  };
  parts.push(trim(s0, s0 + 0.36, bottom, top, 0.09), trim(s1 - 0.36, s1, bottom, top, 0.09),   // corner boards
    trim(s0, s1, bottom, bottom + 0.35, 0.1),                                                   // belly band
    trim(s0, s1, top - 0.55, top, 0.08));                                                       // frieze under the eaves
  for (const o of ops) {
    const y0 = bottom + Math.max(0, o.sill), y1 = bottom + o.head;
    parts.push(trim(o.u0 - 0.3, o.u0, y0 - (o.sill > 0 ? 0.1 : 0), y1, 0.08), trim(o.u1, o.u1 + 0.3, y0 - (o.sill > 0 ? 0.1 : 0), y1, 0.08),
      trim(o.u0 - 0.38, o.u1 + 0.38, y1, y1 + 0.45, 0.09),                                    // head casing
      trim(o.u0 - 0.48, o.u1 + 0.48, y1 + 0.45, y1 + 0.53, 0.15));                            // its cap
    if (o.sill > 0) parts.push(trim(o.u0 - 0.38, o.u1 + 0.38, y0 - 0.14, y0, 0.2));           // sill
  }
  return parts;
}

function walls() {
  const W = [];
  const add = (...args) => W.push(wall(...args));
  // an outside face, for the craftsman dressing: which face (a or b) and its extent, in px
  const out = (face, from, to) => ({ outside: { face, from, to } });

  // exterior
  add('h', 154, 173, [295, 738], [315, 719], [win(348, 494, 2), win(539, 685, 2)], out('a', 295, 738));   // living room, north
  add('v', 295, 315, [154, 558], [173, 566], [win(211, 429, 2)], out('a', 154, 482));          // living room, west
  add('v', 719, 738, [173, 364], [154, 345], [win(186, 332, 2)], out('b', 154, 345));          // living room, east (porch)
  add('h', 345, 364, [738, 1256], [719, 1237], [door(774, 1024), win(1099, 1172, 3)], out('a', 738, 1256));   // kitchen, north: patio doors
  add('v', 1237, 1256, [364, 1068], [345, 1087], [win(416, 607, 3.6), win(826, 1016, 2.5)], out('b', 345, 1087));   // east: sink + master windows
  add('h', 1068, 1087, [315, 1237], [295, 1256],
    [win(839, 912, 3), win(1087, 1159, 3)], out('b', 295, 1256));                              // south: master windows (a mirror over the bath sink)
  add('v', 295, 315, [731, 1087], [731, 1068], [win(928, 969, 4.2)], out('a', 814, 1087));     // west of the storage and bath (the foyer opens wide onto the living room)

  // foyer
  add('h', 482, 501, [105, 295], [124, 295], [], out('a', 105, 295));                          // north
  add('v', 105, 124, [482, 814], [501, 794], [door(600, 695)], out('a', 482, 814));           // west: front door, centred
  add('h', 794, 814, [124, 295], [105, 295], [win(163, 263, 3)], out('b', 105, 295));        // south
  add('h', 558, 566, [124, 295], [124, 315], [door(141, 284)]);                                 // coat closet front

  // storage, bathroom, laundry (the hall where the stairs were is left open)
  add('h', 731, 740, [315, 428], [315, 419], [door(325, 409)]);                                 // storage, north: accordion door, facing the couch
  add('v', 419, 428, [740, 902], [731, 902]);                                                   // storage, east
  add('h', 853, 861, [315, 419]);                                                               // storage, south
  add('h', 810, 825, [428, 807], null, [door(438, 511)]);                                       // bathroom + laundry, north
  add('v', 605, 614, [825, 1068], null, [door(902, 980)]);                                      // bathroom | laundry: a regular doorway

  // master, kitchen, pantry
  add('v', 807, 815, [715, 1068], [724, 1068], [door(732, 805), door(902, 980)]);               // master, west (and the laundry doorway)
  add('h', 715, 724, [807, 1063], [815, 1063]);                                                 // kitchen | master
  add('v', 1063, 1072, [661, 789], [669, 780]);                                                 // pantry, west
  add('h', 661, 669, [1063, 1237], [1072, 1237], [door(1078, 1162)]);                           // pantry, north: door, clear of the counter
  add('h', 780, 789, [1072, 1237], [1063, 1237]);                                               // pantry, south

  return named('walls', ...W);
}

/* ─── doors ─────────────────────────────────── */

/* A door leaf. Hinge at blueprint (hx, hy), latch edge at (ex, ey)
   when shut. It swings toward the point (tx, ty), and starts open
   `open` degrees. setOpen(1) is 90°. lite = { panes, rows } puts a
   window in the top half. */
function leaf(name, hx, hy, ex, ey, open = 0, tx = 680, ty = 620, lite = null) {
  const x0 = X(hx), z0 = Z(hy), dx = X(ex) - x0, dz = Z(ey) - z0;
  const w = Math.hypot(dx, dz), h = DOOR_H - 0.01;     // fills the opening, no double edge
  const th = Math.atan2(dz, dx);
  const sign = Math.sign(Math.sin(Math.atan2(Z(ty) - z0, X(tx) - x0) - th)) || 1;
  let body = solid(new THREE.BoxGeometry(w, h, 0.15), [w / 2, FLOOR + h / 2, 0]);
  if (lite) {
    // the door with a hole cut in it, and a framed window in the hole
    const m = 0.5, y0 = 3.75, y1 = h - 0.55;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(w, 0); shape.lineTo(w, h); shape.lineTo(0, h);
    const hole = new THREE.Path();
    hole.moveTo(m, y0); hole.lineTo(w - m, y0); hole.lineTo(w - m, y1); hole.lineTo(m, y1);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false });
    geo.translate(0, FLOOR, -0.075);
    body = new THREE.Group();
    body.add(solid(geo), glazing((u, y, d) => [u, y, d], m, w - m, FLOOR + y0, FLOOR + y1, 0,
      { ...lite, border: 0.1, bar: 0.07, depth: 0.17 }));
  }
  const g = named(name,
    body,
    solid(new THREE.BoxGeometry(0.12, 0.12, 0.4), [w - 0.28, FLOOR + 3, 0])      // knob
  );
  g.position.set(x0, 0, z0);
  openable(g, t => { g.rotation.y = -(th + sign * t * Math.PI / 2); });
  g.userData.setOpen(open / 90);
  return g;
}

/* Gives a moving part setOpen(t), 0 shut to 1 open (anything between
   works, instantly), and openTo(t, seconds) to swing it there smoothly,
   so anomalies can open things:
     scene.getObjectByName('fridge-door').userData.openTo(1, 2)
   userData.open says where it is now. move(t) does the moving. */
function openable(g, move) {
  const box = new THREE.Box3();
  // openTo(t, seconds) swings it there smoothly, easing in and out;
  // main.js calls step(dt) on everything every frame
  let from = 0, goal = 0, p = 1, secs = 1;
  g.userData.openTo = (t, seconds = 1.2) => {
    from = g.userData.open; goal = THREE.MathUtils.clamp(t, 0, 1); p = 0; secs = Math.max(0.01, seconds);
  };
  g.userData.step = dt => {
    if (p >= 1) return;
    p = Math.min(1, p + dt / secs);
    g.userData.setOpen(from + (goal - from) * p * p * (3 - 2 * p));
  };
  g.userData.setOpen = t => {
    t = THREE.MathUtils.clamp(t, 0, 1);
    move(t);
    g.userData.open = t;
    // tell main.js what moved, so lamps near it redraw their shadows
    let root = g;
    while (root.parent) root = root.parent;
    if (root !== g) (root.userData.moved ||= []).push(box.setFromObject(g).getCenter(new THREE.Vector3()));
  };
  g.userData.setOpen(0);
  return g;
}

function doors() {
  return named('doors',
    // flush with the outside face, so from the yard it reads as one door
    leaf('door-front', 107, 600, 107, 695, 0, 680, 620, { panes: 2, rows: 2 }),
    slidingDoor(),
    leaf('door-master', 811, 733, 811, 804, 75, 900, 733),
    coatClosetDoors(),
    // pantry door, standing partly open into the pantry
    leaf('door-pantry', 1080, 665, 1160, 665, 55, 1120, 720),
    accordionDoor(),
    beadCurtain(),
    pocketDoor()
  );
}

/* The storage closet's folding door, facing the couch: three panels
   hinged together on a track. Shut, it's nearly flat across the
   doorway; open, it folds out toward the couch at the west end.
     scene.getObjectByName('door-closet').userData.setOpen(0.5) */
function accordionDoor() {
  const x0 = X(325), x1 = X(409), z = Z(735.5), N = 3;
  const SHUT = 6 * Math.PI / 180, OPEN = 78 * Math.PI / 180;
  const p = (x1 - x0) / (N * Math.cos(SHUT)), h = DOOR_H - 0.12;
  const panels = [];
  for (let i = 0; i < N; i++) {
    const geo = new THREE.BoxGeometry(p, h, 0.08);
    geo.translate(p / 2, h / 2, 0);                       // hinged on its left edge
    const panel = solid(geo, [0, FLOOR + 0.06, 0]);
    if (i === N - 1) panel.add(tint(solid(new THREE.BoxGeometry(0.05, 0.45, 0.16), [p - 0.14, 3.1, 0]), MAT.dark));   // pull
    panels.push(panel);
  }
  const g = named('door-closet', ...panels);
  g.userData.movesParts = true;
  return openable(g, t => {
    const th = SHUT + (OPEN - SHUT) * t, du = p * Math.cos(th), dz = p * Math.sin(th);
    panels.forEach((panel, i) => {
      const out = i % 2 === 0;                            // out toward the couch, then back
      panel.position.x = x0 + i * du;
      panel.position.z = out ? z : z - dz;
      panel.rotation.y = out ? th : -th;
    });
  });
}

/* An arched wooden bead curtain in the doorway from the bedroom to the
   laundry: strands of wood beads with white and black bands, a chevron
   up top, under a patterned header, the middle strands shorter so they
   make an arch. Each strand is one mesh (its beads joined, coloured bead
   by bead). setOpen(t) sweeps the strands aside toward the jambs.
   ghoul1 walks through it, so check-route.mjs ignores the beads. */
function beadCurtain() {
  const x = X(811), z0 = Z(904), z1 = Z(978), zc = (z0 + z1) / 2, half = (z1 - z0) / 2;
  const top = FLOOR + DOOR_H - 0.32, N = 23;
  const bead = new THREE.OctahedronGeometry(0.034, 0).scale(1, 1.35, 1);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const wood = new THREE.Color(0xb8732c), white = new THREE.Color(0xece4d2), black = new THREE.Color(0x1c1612), c = new THREE.Color();
  const band = (v, a, b) => v >= a && v < b;
  const colour = (v, s) => {
    if (Math.abs(v - (0.35 + 0.9 * s)) < 0.045) return white;                 // the chevron, following the arch
    if (Math.abs(v - (0.5 + 0.9 * s)) < 0.045) return black;
    if (band(v, 1.55, 1.64) || band(v, 1.9, 1.99) || band(v, 2.9, 2.99) || band(v, 3.75, 3.84)) return white;
    if (band(v, 1.73, 1.82) || band(v, 2.75, 2.84) || band(v, 3.6, 3.69)) return black;
    return null;
  };
  let seed = 41;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const strands = [];
  for (let i = 0; i < N; i++) {
    const zz = z0 + (i + 0.5) * (z1 - z0) / N, s = Math.abs(zz - zc) / half;
    const end = s < 0.62 ? 0.3 + 4.0 * (1 - (s / 0.62) ** 1.5) : 0.3;        // where the strand stops, above the floor
    const len = top - (FLOOR + end), pos = [], col = [];
    const bp = bead.attributes.position;
    for (let v = 0.05; v < len; v += 0.09) {
      const pick = colour(v, s) || c.copy(wood).multiplyScalar(0.88 + rand() * 0.2);
      for (let j = 0; j < bp.count; j++) { pos.push(bp.getX(j), -v + bp.getY(j), bp.getZ(j)); col.push(pick.r, pick.g, pick.b); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.userData.keep = m.userData.passable = true;
    const pivot = new THREE.Group();
    pivot.position.set(x, top, zz);
    pivot.userData.side = Math.sign(zz - zc) || 1;
    pivot.userData.s = s;
    pivot.add(m);
    strands.push(pivot);
  }
  // the header: a band of beads in a pattern (a tiny picture)
  const headMat = surface(0xffffff, 0.7);
  if (typeof document !== 'undefined') headMat.map = screenCanvas(128, 16, g => {
    g.fillStyle = '#b8732c'; g.fillRect(0, 0, 128, 16);
    for (let k = 0; k < 8; k++) {
      const cx = 8 + k * 16;
      g.fillStyle = k % 2 ? '#1c1612' : '#ece4d2';
      g.beginPath(); g.moveTo(cx, 2); g.lineTo(cx + 6, 8); g.lineTo(cx, 14); g.lineTo(cx - 6, 8); g.fill();
      g.fillStyle = '#b8732c'; g.fillRect(cx - 1.5, 6.5, 3, 3);
    }
  }); else headMat.color.set(0xb8732c);
  const header = tint(solid(new THREE.BoxGeometry(0.08, 0.32, z1 - z0), [x, top + 0.16, zc]), headMat);
  header.traverse(o => { if (o.isMesh) o.userData.passable = true; });
  const g = named('bead-curtain', header, ...strands);
  g.userData.movesParts = true;
  return openable(g, t => {
    for (const st of strands) st.rotation.x = -st.userData.side * t * 0.6 * (0.4 + 0.6 * st.userData.s);
  });
}

/* A pocket door between the laundry and the bathroom: it slides into
   the wall. White, two raised panels a side, a round flush pull on each
   face, and a little brass edge pull on its leading edge (the bit you
   press out to pull the door from the wall). setOpen(0) slides it shut,
   1 is all the way into the wall. It starts open: ghoul1 walks through. */
function pocketDoor() {
  const x = X(609.5), z0 = Z(902), w = Z(980) - z0, h = DOOR_H - 0.02, t = 0.12;
  const box = (bw, bh, bd, px, py, pz) => solid(new THREE.BoxGeometry(bw, bh, bd), [px, FLOOR + py, pz]);
  const parts = [box(t, h, w, 0, h / 2, w / 2)];
  for (const side of [-1, 1]) {
    parts.push(box(0.02, 2.6, w - 0.55, side * (t / 2 + 0.01), 3.65 + 1.3, w / 2),     // upper panel
               box(0.02, 2.4, w - 0.55, side * (t / 2 + 0.01), 0.4 + 1.2, w / 2),      // lower panel
               tint(solid(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14), [side * (t / 2 + 0.005), FLOOR + 3.25, 0.32], [0, 0, Math.PI / 2]), MAT.chrome));
  }
  parts.push(tint(box(0.04, 0.24, 0.03, 0, 3.25, -0.015), MAT.brass));                   // the edge pull
  const g = named('door-pocket', ...parts);
  g.position.set(x, 0, z0);
  openable(g, v => { g.position.z = z0 + v * (w - 0.08); });
  g.userData.setOpen(1);
  return g;
}

/* The coat closet's sliding doors: two panels on two tracks, like real
   bypass closet doors. The room-side one slides over the other.
     scene.getObjectByName('door-coat-closet').userData.setOpen(1) */
function coatClosetDoors() {
  const h = DOOR_H - 0.12, y = FLOOR + 0.04;
  const panel = (px0, px1, py0, py1, pullAt) => {
    const g = new THREE.Group();
    g.add(solid(new THREE.BoxGeometry(X(px1) - X(px0), h, Z(py1) - Z(py0)),
      [(X(px0) + X(px1)) / 2, y + h / 2, (Z(py0) + Z(py1)) / 2]));
    g.add(tint(solid(new THREE.BoxGeometry(0.06, 0.5, 0.03), [X(pullAt), y + 3.2, Z(py1) + 0.015]), MAT.dark));   // finger pull
    return g;
  };
  const back = panel(141, 217, 559, 561.6, 147);          // closet-side track
  const front = panel(208, 284, 562.4, 565, 278);         // room-side track, slides over
  const track = tint(block(141, 284, 559, 565, DOOR_H, DOOR_H - 0.08), MAT.track);
  const slide = X(141) - X(208);
  const g = named('door-coat-closet', back, front, track);
  g.userData.movesParts = true;
  return openable(g, t => { front.position.x = slide * t; });
}

/* Sliding glass doors onto the patio: two big glass panels in metal
   frames on two tracks, the left one fixed, the right one (with the
   handle) slides in front of it. Plus the tracks along top and bottom. */
function slidingDoor() {
  const z0 = Z(345), t = Z(364) - Z(345);
  const place = (u, y, w) => [u, y, z0 + w];
  const a = X(774), b = X(1024), mid = (a + b) / 2, lap = 0.15;
  const y0 = FLOOR + 0.06, y1 = FLOOR + DOOR_H - 0.06;
  const opts = { panes: 1, border: 0.16, depth: 0.1, mat: MAT.track };
  const handle = solid(new THREE.BoxGeometry(0.06, 0.9, 0.08), [mid - lap + 0.35, FLOOR + 3.4, z0 + t / 2 + 0.2], null, MAT.track);
  handle.traverse(o => { if (o.isMesh) o.userData.keep = true; });
  const tracks = [y0 - 0.04, y1 + 0.04].map(y => {
    const tr = solid(new THREE.BoxGeometry(b - a, 0.08, t * 0.7), [mid, y, z0 + t / 2], null, MAT.track);
    tr.traverse(o => { if (o.isMesh) o.userData.keep = true; });
    return tr;
  });
  // the sliding panel (with the handle) slides over the fixed one: setOpen(1) is wide open
  const slider = named('door-patio-slide', glazing(place, mid - lap, b, y0, y1, t / 2 + 0.08, opts), handle);
  openable(slider, v => { slider.position.x = -v * (b - mid - 0.1); });
  return named('door-patio',
    glazing(place, a, mid + lap, y0, y1, t / 2 - 0.08, opts),       // fixed panel, outer track
    slider, ...tracks);
}

/* ─── floor, ceilings, roof ─────────────────── */

function shell() {
  const parts = [];

  // foundation: yard level up to the floor, main house + foyer in one piece
  parts.push(named('foundation', slab([
    [295, 154], [738, 154], [738, 345], [1256, 345], [1256, 1087],
    [295, 1087], [295, 814], [105, 814], [105, 482], [295, 482]
  ], [], 0, FLOOR)));

  // ceilings
  parts.push(named('ceiling',
    slab([[295, 154], [1256, 154], [1256, 1087], [295, 1087]], [], CEIL, EAVE),
    slab([[0, 482], [295, 482], [295, 814], [0, 814]], [], CEIL, EAVE)));

  // main roof: ridge runs left-right on the plan, gables at both ends
  const main = gableRoof({ z0: Z(154), z1: Z(1087), x0: X(295) - 1.5, x1: X(1256) + 1.5, over: 1.5 });
  parts.push(named('roof', main.roof,
    gable(Z(154), Z(1087), X(295), X(315), main.ridge),
    gable(Z(154), Z(1087), X(1237), X(1256), main.ridge)));

  // foyer + front porch roof, a smaller gable butting into the main one
  const foyer = gableRoof({ z0: Z(482), z1: Z(814), x0: X(0) - 1, x1: X(295), over: 1 });
  parts.push(named('foyer-roof', foyer.roof, gable(Z(482), Z(814), X(0), X(11), foyer.ridge)));

  // craftsman gables: cedar shingles over each gable end, and knee braces under the rake
  parts.push(named('gable-dressing',
    ...gableShingles(Z(154), Z(1087), X(295), -1, main.ridge), ...gableShingles(Z(154), Z(1087), X(1256), 1, main.ridge),
    ...gableShingles(Z(482), Z(814), X(0), -1, foyer.ridge),
    ...kneeBraces(Z(154), Z(1087), X(295), -1, main.ridge, 1.5), ...kneeBraces(Z(154), Z(1087), X(1256), 1, main.ridge, 1.5),
    ...kneeBraces(Z(482), Z(814), X(0), -1, foyer.ridge, 1)));
  return named('shell', ...parts);
}

// cedar shingles on a gable end facing out along x (side -1 west, +1 east): a sheet and its courses
const SHINGLE = surface(0x7a5636, 0.95), SHINGLE_LINE = new THREE.LineBasicMaterial({ color: 0x3e2a18 });
function gableShingles(z0, z1, x, side, ridge) {
  const zc = (z0 + z1) / 2, half = (z1 - z0) / 2, d = x + side * 0.03;
  const tri = new THREE.Shape([new THREE.Vector2(z0, EAVE), new THREE.Vector2(z1, EAVE), new THREE.Vector2(zc, ridge)]);
  SHINGLE.side = THREE.DoubleSide;
  const sheet = new THREE.Mesh(remap(new THREE.ShapeGeometry(tri), (u, y) => [d, y, u]), SHINGLE);
  sheet.userData.keep = true;
  const courses = [];
  for (let y = EAVE + 0.45; y < ridge - 0.3; y += 0.45) {
    const w = half * (ridge - y) / (ridge - EAVE);
    courses.push([[d + side * 0.01, y, zc - w], [d + side * 0.01, y, zc + w]]);
    for (let z = zc - w + (Math.round(y * 2.2) % 2) * 0.35; z < zc + w; z += 0.7) {            // staggered joints
      courses.push([[d + side * 0.01, y, z], [d + side * 0.01, Math.min(y + 0.45, ridge), z]]);
    }
  }
  return [sheet, lines(courses, SHINGLE_LINE)];
}

// triangular craftsman knee braces under a gable's overhanging rake
function kneeBraces(z0, z1, x, side, ridge, over) {
  const zc = (z0 + z1) / 2, half = (z1 - z0) / 2, out = [];
  for (const f of [-0.62, 0, 0.62]) {
    const z = zc + f * half, roofY = ridge - Math.abs(z - zc) * 0.5 - 0.42;            // just under the roof there
    const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(over * 0.85, 0), new THREE.Vector2(0, -over * 0.85)]);
    const geo = remap(new THREE.ExtrudeGeometry(tri, { depth: 0.22, bevelEnabled: false }),
      (u, v, d) => [x + side * u, roofY + v, z + d - 0.11]);
    out.push(tint(solid(geo), MAT.trim));
  }
  return out;
}

/* Gable roof with its ridge running along x, between z0 and z1,
   from x0 to x1. Built as one solid with a chevron cross-section
   so the ridge is clean. 6-in-12 pitch. */
function gableRoof({ z0, z1, x0, x1, over, pitch = 0.5, thick = 0.35 }) {
  const zc = (z0 + z1) / 2, half = (z1 - z0) / 2;
  const ridge = EAVE + half * pitch;
  const th = Math.atan(pitch), s = Math.sin(th), c = Math.cos(th);
  const run = (half + over) / c;
  const tz = c * run, ty = ridge - s * run;
  const shape = new THREE.Shape([
    [0, ridge], [tz, ty], [tz + s * thick, ty + c * thick],
    [0, ridge + thick / c], [-tz - s * thick, ty + c * thick], [-tz, ty]
  ].map(([u, y]) => new THREE.Vector2(u, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  return { roof: solid(remap(geo, (u, y, w) => [x0 + w, y, zc + u])), ridge };
}

// The triangle of wall under a gable, x0..x1 thick.
function gable(z0, z1, x0, x1, ridge) {
  const zc = (z0 + z1) / 2;
  const shape = new THREE.Shape([
    new THREE.Vector2(z0 - zc, EAVE), new THREE.Vector2(z1 - zc, EAVE), new THREE.Vector2(0, ridge)
  ]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  return solid(remap(geo, (u, y, w) => [x0 + w, y, zc + u]));
}

/* ─── railings ──────────────────────────────── */

// Railing along a line: top rail, end posts, balusters as plain lines.
function rail(dir, at, from, to, h = 3, base = FLOOR) {
  const parts = [];
  const pairs = [];
  if (dir === 'h') {
    parts.push(block(from, to, at - 3, at + 3, h, h - 0.2, base));
    parts.push(block(from, from + 7, at - 4, at + 4, h, 0, base), block(to - 7, to, at - 4, at + 4, h, 0, base));
    for (let x = from + 13; x < to - 9; x += 12) pairs.push([[X(x), base, Z(at)], [X(x), base + h - 0.2, Z(at)]]);
  } else {
    parts.push(block(at - 3, at + 3, from, to, h, h - 0.2, base));
    parts.push(block(at - 4, at + 4, from, from + 7, h, 0, base), block(at - 4, at + 4, to - 7, to, h, 0, base));
    for (let y = from + 13; y < to - 9; y += 12) pairs.push([[X(at), base, Z(y)], [X(at), base + h - 0.2, Z(y)]]);
  }
  parts.push(lines(pairs));
  return named('railing', ...parts);
}

/* ─── furniture, room by room ───────────────── */

// A simple chair facing +z in its own space: seat, back, four legs.
function chair(w = 1.5, seat = 1.5, back = 3) {
  const t = 0.12, l = 0.12, g = new THREE.Group();
  g.add(solid(new THREE.BoxGeometry(w, t, w), [0, seat, 0]));
  g.add(solid(new THREE.BoxGeometry(w, back - seat, t), [0, seat + (back - seat) / 2, -w / 2 + t / 2]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(solid(new THREE.BoxGeometry(l, seat - t / 2, l), [sx * (w / 2 - l), (seat - t / 2) / 2, sz * (w / 2 - l)]));
  }
  return g;
}

// Put something at blueprint (cx, cy) on the floor, facing an angle (degrees, 0 = down the plan).
function at(obj, cx, cy, face = 0, y = FLOOR) {
  obj.position.set(X(cx), y, Z(cy));
  obj.rotation.y = face * Math.PI / 180;
  return obj;
}

/* An end table: a top, a shelf underneath with a couple of magazines
   on it, and four square legs. */
function endTable(name, x0, x1, y0, y1, h) {
  const leg = (x, y) => block(x, x + 3, y, y + 3, h - 0.08);
  return named(name,
    block(x0, x1, y0, y1, h, h - 0.08),                                       // top
    block(x0 + 3, x1 - 3, y0 + 3, y1 - 3, 0.62, 0.55),                         // shelf
    leg(x0 + 1, y0 + 1), leg(x1 - 4, y0 + 1), leg(x0 + 1, y1 - 4), leg(x1 - 4, y1 - 4),
    tint(solid(new THREE.BoxGeometry(0.75, 0.04, 0.95), [X(x0 + 20), FLOOR + 0.64, Z(y0 + 22)], [0, 0.2, 0]), MAT.cream),   // magazines
    tint(solid(new THREE.BoxGeometry(0.72, 0.04, 0.92), [X(x0 + 21), FLOOR + 0.68, Z(y0 + 21)], [0, -0.1, 0]), MAT.flannel));
}

// a folded newspaper lying on the table (its front page is a tiny picture)
function newspaper(cx, cy) {
  const m = surface(0xe3dfd2, 0.9);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#e3dfd2'; g.fillRect(0, 0, 96, 64);
    g.fillStyle = '#2a2a2a'; g.fillRect(6, 4, 84, 6);                   // the masthead
    g.fillRect(6, 13, 60, 4);                                            // headline
    g.fillStyle = '#9a968c'; g.fillRect(56, 21, 34, 22);                 // a photo
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = '#7d7a72';
    for (let col = 0; col < 3; col++) {                                  // columns of print
      for (let y = 22; y < 60; y += 3) {
        if (col === 2 && y < 45) continue;
        g.fillRect(6 + col * 26, y, 20 + rand() * 4, 1);
      }
    }
    m.map = new THREE.CanvasTexture(c);
    m.map.colorSpace = THREE.SRGBColorSpace;
  }
  return named('newspaper', tint(solid(new THREE.BoxGeometry(1.2, 0.04, 0.8), [X(cx), FLOOR + 2.52, Z(cy)], [0, 0.35, 0]), m));
}

// a small cobalt bud vase with one flower in it
function budVase(cx, cy) {
  const x = X(cx), z = Z(cy), y = FLOOR + 2.5;
  const vase = new THREE.LatheGeometry([[0.07, 0], [0.12, 0.08], [0.11, 0.22], [0.04, 0.38], [0.035, 0.5], [0.05, 0.54]]
    .map(([r, h]) => new THREE.Vector2(r, h)), 16);
  const petals = [0, 1, 2, 3, 4].map(i => {
    const a = i / 5 * Math.PI * 2, p = new THREE.SphereGeometry(0.055, 6, 4);
    p.scale(1, 0.35, 0.6);
    return tint(solid(p, [x + Math.cos(a) * 0.06, y + 1.02, z + Math.sin(a) * 0.06], [0, -a, 0.3]), MAT.flannel);
  });
  const leaf = new THREE.SphereGeometry(0.08, 6, 4);
  leaf.scale(1, 0.2, 0.4);
  return [
    tint(solid(vase, [x, y, z]), surface(0x2f4f9a, 0.25)),
    tint(solid(new THREE.CylinderGeometry(0.01, 0.012, 0.55, 5), [x, y + 0.75, z], [0, 0, 0.05]), MAT.leaves),
    tint(solid(leaf, [x + 0.06, y + 0.72, z], [0, 0, -0.5]), MAT.leaves),
    ...petals,
    tint(solid(new THREE.SphereGeometry(0.035, 6, 4), [x, y + 1.03, z]), MAT.mustard)
  ];
}

function livingRoom() {
  const armchair = new THREE.Group();
  armchair.add(
    solid(new THREE.BoxGeometry(2.6, 1.4, 2.6), [0, 0.7, 0]),
    solid(new THREE.BoxGeometry(2.6, 1.4, 0.55), [0, 2.1, -1.02]),
    solid(new THREE.BoxGeometry(0.5, 0.7, 2.6), [-1.05, 1.75, 0]),
    solid(new THREE.BoxGeometry(0.5, 0.7, 2.6), [1.05, 1.75, 0])
  );
  const table = named('dining-table',
    block(655, 735, 455, 590, 2.5, 2.35),
    block(659, 666, 459, 466, 2.35), block(724, 731, 459, 466, 2.35),
    block(659, 666, 579, 586, 2.35), block(724, 731, 579, 586, 2.35),
    newspaper(718, 488),
    ...budVase(690, 532)
  );
  return named('living-room',
    sofa(),
    rug(),
    named('armchair', at(armchair, 650, 262, -45)),
    endTable('side-table', 555, 598, 193, 237, 2),
    table,
    named('dining-chairs',
      at(chair(), 644, 492, 90), at(chair(), 644, 555, 90),
      at(chair(), 746, 492, -90), at(chair(), 746, 555, -90),
      at(chair(), 695, 443, 0), at(chair(), 695, 602, 180)
    ),
    woodStove(),
    fire(),
    named('post', block(511, 522, 568, 579, 8)),
    pillarLamp()
  );
}

/* The sectional: a skirted base, separate seat and back cushions,
   square arms at both ends, and a couple of throw pillows. */
function sofa() {
  const seat = 1.45, base = 0.85, backTop = 2.65, lean = 0.12;
  const cushion = (x0, x1, y0, y1) => block(x0 + 1, x1 - 1, y0 + 1, y1 - 1, seat, base);   // small gaps so each one reads
  // a back cushion resting on the seat, leaning back a touch
  const backCushion = (x0, x1, y0, y1, alongWall) => {
    const w = X(x1) - X(x0), d = Z(y1) - Z(y0), h = backTop - seat;
    return solid(new THREE.BoxGeometry(w, h, d), [(X(x0) + X(x1)) / 2, FLOOR + seat + h / 2, (Z(y0) + Z(y1)) / 2],
      alongWall ? [0, 0, lean] : [lean, 0, 0]);
  };
  // a square arm
  const arm = (x0, x1, y0, y1) => [block(x0, x1, y0, y1, 2.25)];
  const pillow = (cx, cy, mat, rot) => tint(solid(new THREE.BoxGeometry(0.75, 0.75, 0.22), [X(cx), FLOOR + seat + 0.42, Z(cy)], rot), mat);
  return named('sofa',
    block(342, 405, 318, 535, base), block(405, 530, 478, 535, base),       // skirted base
    block(322, 342, 300, 555, 2.7), block(342, 548, 535, 555, 2.7),         // back frame
    cushion(342, 405, 318, 398), cushion(342, 405, 398, 478), cushion(342, 405, 478, 535),
    cushion(405, 467, 478, 535), cushion(467, 530, 478, 535),
    backCushion(342, 360, 320, 397, true), backCushion(342, 360, 399, 476, true), backCushion(342, 360, 478, 533, true),
    backCushion(362, 445, 517, 535, false), backCushion(447, 529, 517, 535, false),
    ...arm(322, 405, 300, 318, true), ...arm(530, 548, 478, 535, false),
    pillow(368, 336, MAT.flannel, [0, Math.PI / 2 - 0.3, 0.25]),
    pillow(382, 508, MAT.mustard, [0.25, 0.5, 0]),
    throwBlanket());
}

/* A knit 90s afghan thrown over the sofa: over a back cushion, down onto
   the seat, across it and hanging off the front, with a few soft folds. */
function throwBlanket() {
  const zc = Z(435), width = 2.4;
  // its line in profile (x across the sofa, y up), from the back cushion to the hem
  const profile = new THREE.CatmullRomCurve3([[X(338), FLOOR + 2.72], [X(352), FLOOR + 2.62], [X(361), FLOOR + 1.95], [X(366), FLOOR + 1.5],
    [X(392), FLOOR + 1.49], [X(405) + 0.1, FLOOR + 1.36], [X(405) + 0.17, FLOOR + 0.9], [X(405) + 0.2, FLOOR + 0.5]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const n = 40, m = 12, pos = [], uv = [], index = [];
  for (let i = 0; i <= n; i++) {
    const p = profile.getPoint(i / n), hang = THREE.MathUtils.smoothstep(i / n, 0.7, 1);
    for (let j = 0; j <= m; j++) {
      const f = j / m, z = zc + (f - 0.5) * width;
      const fold = Math.sin(f * Math.PI * 3.2 + 0.6) * 0.06 * (0.3 + hang);            // soft folds, deeper where it hangs
      pos.push(p.x + fold * hang, p.y + fold * (1 - hang) * 0.4 + 0.02, z);
      uv.push(f * 2, i / n * 2.6);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * (m + 1) + j, b = a + m + 1;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const knit = surface(0xffffff, 1, THREE.DoubleSide);
  if (typeof document !== 'undefined') {
    knit.map = screenCanvas(32, 32, g => {
      [['#7b2a2c', 0, 10], ['#d9cfb8', 10, 4], ['#2f4a35', 14, 10], ['#d9cfb8', 24, 4], ['#b58a3c', 28, 4]].forEach(([c, y, h]) => { g.fillStyle = c; g.fillRect(0, y, 32, h); });
      g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < 32; x += 2) g.fillRect(x, 0, 1, 32);     // the knit
    });
    knit.map.wrapS = knit.map.wrapT = THREE.RepeatWrapping;
  } else knit.color.set(0x7b2a2c);
  const mesh = new THREE.Mesh(geo, knit);
  mesh.userData.keep = true;
  return mesh;
}

/* A casual 90s rug in front of the sofa, 4' x 6', sitting a bit crooked:
   oatmeal with a sage border, a thin rust stripe and a little woven
   speckle, and slightly messy fringe on the two short ends. The pattern is one small picture drawn when the
   game starts, no image files. */
function rug() {
  const W = X(550) - X(440), D = Z(470) - Z(305);
  const top = surface(0xffffff, 1);
  if (typeof document !== 'undefined') top.map = rugPattern();
  const r = tint(solid(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), [0, 0.015, 0], null, top), top);
  // fringe: each tassel a slightly different length, bent a little, some splayed
  let seed = 17;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const fringe = [];
  for (let x = -W / 2 + 0.08; x < W / 2 - 0.05; x += 0.09) {
    for (const end of [-1, 1]) {
      const z = end * D / 2, len = 0.2 + rand() * 0.14, bend = (rand() - 0.5) * 0.12, mid = len * (0.4 + rand() * 0.3);
      const a = [x, 0.01, z], b = [x + bend * 0.4, 0.01, z + end * mid], c = [x + bend, 0.01, z + end * len];
      fringe.push([a, b], [b, c]);
    }
  }
  const g = named('rug', r, lines(fringe, new THREE.LineBasicMaterial({ color: 0xb8a984 })));
  g.position.set(X(485), FLOOR, Z(387.5));
  g.rotation.y = 0.14;                       // kicked a little crooked, the way rugs end up
  return g;
}

function rugPattern() {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 240;                         // the rug's shape, 4 by 6
  const g = c.getContext('2d');
  const band = (inset, fill) => { g.fillStyle = fill; g.fillRect(inset, inset, 160 - inset * 2, 240 - inset * 2); };
  band(0, '#5f6f55');                      // sage border
  band(15, '#c9b791');                     // oatmeal
  band(21, '#8a4034');                     // rust stripe
  band(23, '#c9b791');
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2200; i++) {         // woven speckle
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
    g.fillRect(rand() * 160, rand() * 240, 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* The wood stove: a hollow iron box on legs, firebrick inside, a
   window in its door, on a brick hearth. */
const STOVE = { x0: X(603), x1: X(690), zf: Z(740), zb: Z(796), y0: FLOOR + 0.35, y1: FLOOR + 2.3, s: 0.1,
  win: [X(618), X(675), FLOOR + 0.75, FLOOR + 1.95] };
function woodStove() {
  const { x0, x1, zf, zb, y0, y1, s, win } = STOVE;
  const cx = (x0 + x1) / 2, cz = (zf + zb) / 2, w = x1 - x0, h = y1 - y0;
  const box = (bw, bh, bd, x, y, z) => solid(new THREE.BoxGeometry(bw, bh, bd), [x, y, z]);
  const face = new THREE.Shape();
  face.moveTo(x0, y0); face.lineTo(x1, y0); face.lineTo(x1, y1); face.lineTo(x0, y1);
  const hole = new THREE.Path();
  hole.moveTo(win[0], win[2]); hole.lineTo(win[1], win[2]); hole.lineTo(win[1], win[3]); hole.lineTo(win[0], win[3]);
  face.holes.push(hole);
  return named('wood-stove',
    block(588, 706, 722, 806, 0.12),                                         // brick hearth (first: painted brick)
    solid(new THREE.ExtrudeGeometry(face, { depth: s, bevelEnabled: false }).translate(0, 0, zf)),   // front, with the window
    box(s, h, zb - zf - s, x0 + s / 2, y0 + h / 2, (zf + s + zb) / 2),
    box(s, h, zb - zf - s, x1 - s / 2, y0 + h / 2, (zf + s + zb) / 2),
    box(w - 2 * s, h, s, cx, y0 + h / 2, zb - s / 2),
    box(w - 2 * s, s, zb - zf - 2 * s, cx, y0 + s / 2, (zf + s + zb - s) / 2),
    box(w, s, zb - zf, cx, y1 + s / 2, cz),                                  // top
    tint(box(w - 2 * s - 0.02, h - s - 0.02, zb - zf - 2 * s - 0.02, cx, y0 + s + (h - s) / 2, cz), MAT.firebrick),
    block(606, 614, 790, 796, 0.35), block(679, 687, 790, 796, 0.35),         // legs
    block(606, 614, 740, 746, 0.35), block(679, 687, 740, 746, 0.35),
    round(646, 780, 0.28, 8, 2.4, 6));                                      // stovepipe to the ceiling
}

/* The fire: crossed logs on a bed of coals inside the stove, glowing
   softly and breathing a little brighter and dimmer. A small light
   inside lights the firebrick, and a soft orange spotlight with no
   shadows, aimed out through the window, warms the room. (Shadows cost a
   texture slot in every material and the card only has 16; the 13
   shadowed lights use most of them. Aimed away from the wall behind the
   stove, it can't leak into the bathroom.) FIRE is how bright. */
const FIRE = 4;
function fire() {
  const { x0, x1, zf, zb, y0, s, win: [wx0, wx1, wy0, wy1] } = STOVE;
  const cx = (x0 + x1) / 2, cz = (zf + zb) / 2, floor = y0 + s + 0.38, b = 0.12;    // on a grate, up where the window shows it
  // logs and coals the Half-Life way: few sides, chunky pixel textures,
  // lit by themselves (the glowing cracks are in the picture)
  const tex = fireTextures();
  const log = (len, x, y, z, turn, r = 0.17) => {
    const geo = new THREE.CylinderGeometry(r, r + 0.02, len, 7);
    geo.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geo, [tex.bark, tex.ends, tex.ends]);
    m.position.set(x, y, z);
    m.rotation.y = turn;
    return m;
  };
  const coal = (x, z, r) => {
    const geo = new THREE.DodecahedronGeometry(r, 0);
    geo.scale(1, 0.45, 1);
    const m = new THREE.Mesh(geo, tex.coals);
    m.position.set(x, floor + r * 0.3, z);
    return m;
  };
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(wx1 - wx0 - 2 * b, wy1 - wy0 - 2 * b),
    new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.25, depthWrite: false }));
  glass.position.set((wx0 + wx1) / 2, (wy0 + wy1) / 2, zf - 0.04);
  glass.layers.set(GLASS_LAYER);
  glass.userData.keep = glass.userData.noShadow = true;
  const inside = new THREE.PointLight(0xff6a20, 0.9, 2.0, 2);              // lights the firebrick, nothing else
  inside.position.set(cx, floor + 0.9, cz);
  const room = new THREE.SpotLight(0xff8c3a, FIRE, 16, 1.05, 0.8, 2);
  room.name = 'fire-light';
  room.position.set(cx, FLOOR + 1.3, zf - 0.4);
  room.target.position.set(cx, FLOOR + 0.5, zf - 8);
  const g = named('fire',
    paneFrame((u, y, w) => [u, y, zf - w], wx0, wx1, wy0, wy1, 0.04, { border: b, depth: 0.08, mat: MAT.dark }),
    tint(solid(new THREE.BoxGeometry(0.08, 0.35, 0.1), [wx1 - 0.2, (wy0 + wy1) / 2, zf - 0.12]), MAT.dark),   // door handle
    glass,
    // the grate: four iron bars on two feet
    ...[-0.45, -0.15, 0.15, 0.45].map(z => tint(solid(new THREE.BoxGeometry(2.2, 0.05, 0.05), [cx, floor - 0.03, cz + z]), MAT.dark)),
    ...[-0.9, 0.9].map(x => tint(solid(new THREE.BoxGeometry(0.06, 0.38, 1.0), [cx + x, floor - 0.22, cz]), MAT.dark)),
    ...[[-0.8, -0.3, 0.16], [-0.3, 0.25, 0.2], [0.35, -0.2, 0.18], [0.85, 0.3, 0.15], [0.1, 0.45, 0.14], [-0.6, 0.4, 0.13], [0.6, -0.45, 0.14]]
      .map(([x, z, r]) => coal(cx + x, cz + z, r)),
    log(1.9, cx, floor + 0.22, cz, 0.45),                                   // two logs crossed,
    log(1.9, cx, floor + 0.5, cz, -0.45),                                   // one on the other
    log(1.4, cx, floor + 0.36, cz + 0.55, 0.05, 0.14),                      // and one at the back
    inside, room, room.target);
  let t = 0;
  g.userData.tick = dt => {
    t += dt;
    const f = 1 + 0.08 * Math.sin(t * 2.1) + 0.06 * Math.sin(t * 5.3 + 1) + 0.04 * Math.sin(t * 9.7 + 2);
    room.intensity = FIRE * f;
    inside.intensity = 0.9 * f;
    tex.bark.color.setScalar(0.8 + 0.25 * f);
    tex.coals.color.setScalar(0.75 + 0.35 * f);
  };
  return g;
}

// chunky little pictures for the fire: bark with glowing cracks, cut ends, hot coals
function fireTextures() {
  const mats = { bark: new THREE.MeshBasicMaterial({ color: 0x4a3020 }), ends: new THREE.MeshBasicMaterial({ color: 0x6b4a2a }),
    coals: new THREE.MeshBasicMaterial({ color: 0xc8501c }) };
  if (typeof document === 'undefined') return mats;
  let seed = 23;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pixels = (draw) => {
    const t = screenCanvas(32, 32, draw);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const dot = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  mats.bark.map = pixels(g => {
    g.fillStyle = '#3a2a1c'; g.fillRect(0, 0, 32, 32);
    for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) {
      const r = rand();
      if (r < 0.25) dot(g, '#24180f', x, y); else if (r < 0.4) dot(g, '#4f3a24', x, y);
    }
    for (let k = 0; k < 7; k++) dot(g, '#1a110a', Math.floor(rand() * 32), 0, 1, 32);          // bark grooves
    for (let k = 0; k < 5; k++) {                                                               // glowing cracks
      const x = Math.floor(rand() * 30), y = Math.floor(rand() * 28);
      dot(g, '#ff6a14', x, y, 1, 3 + Math.floor(rand() * 3)); dot(g, '#ffb347', x, y + 1, 1, 1);
    }
  });
  mats.bark.map.repeat.set(2, 1);
  mats.ends.map = pixels(g => {
    g.fillStyle = '#1a110a'; g.fillRect(0, 0, 32, 32);
    for (const [r, c] of [[14, '#4a321c'], [11, '#6b4a2a'], [8, '#7d5a34'], [5, '#6b4a2a'], [2, '#ff8a2a']]) {
      g.fillStyle = c; g.beginPath(); g.arc(16, 16, r, 0, 7); g.fill();
    }
  });
  mats.coals.map = pixels(g => {
    for (let x = 0; x < 32; x += 2) for (let y = 0; y < 32; y += 2) {
      const r = rand();
      dot(g, r < 0.3 ? '#1a0a05' : r < 0.55 ? '#7a2408' : r < 0.85 ? '#ff5a14' : '#ffb347', x, y, 2, 2);
    }
  });
  mats.bark.color.set(0xffffff); mats.ends.color.set(0xffffff); mats.coals.color.set(0xffffff);
  return mats;
}

/* A little old-timey sconce on the pillar by the sofa: a brass backplate
   with curls, and a flared cup of Tiffany glass pointing up like a
   gaudy torch, with a flame-shaped bulb in it. Both its lights sit in the
   bulb: a soft spot down onto the sofa and a small one up the pillar to
   the ceiling. No shadows (no texture slots left). */
function pillarLamp() {
  const x = X(516.5), z = Z(568), y = FLOOR + 5.1;
  const brass = (geo, p, rot) => tint(solid(geo, p, rot), MAT.brass);
  const curl = (dx) => {
    const c = new THREE.TorusGeometry(0.07, 0.014, 4, 12, Math.PI * 1.6);
    c.rotateY(Math.PI / 2);
    return brass(c, [x + dx, y - 0.12, z - 0.24]);
  };
  // the cup: muted pieces of glass in dark lead, a tiny picture drawn at start
  const cup = new THREE.CylinderGeometry(0.24, 0.06, 0.32, 24, 1, true);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  if (typeof document !== 'undefined') glassMat.map = leadedGlass(); else glassMat.color.set(0x8a6a32);
  glassMat.color.multiplyScalar(1.3);                                        // lit from inside
  const aura = halo(0.9);
  if (aura.material) { aura.material.color.set(0xffc27a).multiplyScalar(1.6); aura.scale.set(0.9, 0.9, 1); }   // a warm haze,
  aura.position.set(x, y + 0.34, z - 0.4);                                   // in the cup, spilling out the top
  const bulb = new THREE.SphereGeometry(0.05, 10, 8);
  bulb.scale(1, 2.2, 1);
  // its light: a wide soft spot down onto the sofa (a plain bulb this close
  // to the pillar would just blow the pillar out)
  const light = new THREE.SpotLight(LAMP_COLOR, 17, 14, 1.2, 0.9, 2);
  light.name = 'lamp-pillar-light';
  light.position.set(x, y + 0.24, z - 0.4);                                 // right in the bulb
  light.target.position.set(X(440), FLOOR + 1.2, Z(440));
  // and like a torch, it throws light up the pillar and onto the ceiling
  const up = new THREE.SpotLight(LAMP_COLOR, 5, 6, 0.6, 0.8, 2);
  up.position.copy(light.position);
  up.target.position.set(x, CEIL, z - 0.4);
  return named('lamp-pillar',
    brass(new THREE.BoxGeometry(0.2, 0.45, 0.04), [x, y, z - 0.02]),                  // backplate
    brass(new THREE.BoxGeometry(0.03, 0.03, 0.36), [x, y - 0.02, z - 0.2]),           // arm
    curl(-0.05), curl(0.05),
    brass(new THREE.ConeGeometry(0.035, 0.14, 8).rotateX(Math.PI), [x, y - 0.19, z - 0.4]),   // drop finial
    brass(new THREE.CylinderGeometry(0.07, 0.05, 0.1, 8), [x, y + 0.03, z - 0.4]),    // collar
    solid(cup, [x, y + 0.24, z - 0.4], null, glassMat),
    glow(bulb, x, y + 0.24, z - 0.4),
    aura, light, light.target, up, up.target);
}

// Tiffany glass: three rows of irregular pieces in muted colours, thick dark lead between
function leadedGlass() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  const colours = ['#8a6a32', '#5d6b3f', '#7a3f2c', '#46566a', '#9a8350', '#6b4a5a', '#7d7445'];
  let seed = 13;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = [[0, 18, 8], [18, 38, 11], [38, 58, 14]];                 // bottom to top: y0, y1, pieces
  for (const [y0, y1, n] of rows) {
    let x = 0;
    const cuts = Array.from({ length: n }, (_, i) => (i + 0.3 + rand() * 0.4) * 256 / n);
    cuts.push(256 + cuts[0]);
    for (let i = 0; i < n; i++) {
      const a = cuts[i], b = cuts[i + 1], lean = (rand() - 0.5) * 8;
      g.fillStyle = colours[Math.floor(rand() * colours.length)];
      g.beginPath();
      for (const dx of [0, -256]) {                                         // wraps round the cup
        g.moveTo(a + dx, 64 - y0); g.lineTo(b + dx, 64 - y0); g.lineTo(b + dx + lean, 64 - y1); g.lineTo(a + dx + lean, 64 - y1); g.closePath();
      }
      g.fill();
      g.strokeStyle = '#17110c'; g.lineWidth = 3; g.stroke();
      x = b;
    }
  }
  g.fillStyle = '#2a2016';
  g.fillRect(0, 0, 256, 6);                                                  // the rim
  g.fillRect(0, 62, 256, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* A 90s counter stool: chrome base, post and foot ring, a coloured
   seat, and a little chrome hoop for a back. Faces +z. */
function stool(seatMat) {
  const ring = new THREE.TorusGeometry(0.4, 0.03, 6, 20);
  ring.rotateX(Math.PI / 2);
  return tint(new THREE.Group().add(
    solid(new THREE.CylinderGeometry(0.5, 0.56, 0.06, 16), [0, 0.03, 0]),
    solid(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 8), [0, 1.3, 0]),
    solid(ring, [0, 0.95, 0]),
    solid(new THREE.BoxGeometry(0.8, 0.03, 0.03), [0, 0.95, 0]),
    solid(new THREE.BoxGeometry(0.03, 0.03, 0.8), [0, 0.95, 0]),
    tint(solid(new THREE.CylinderGeometry(0.6, 0.5, 0.2, 16), [0, 2.65, 0]), seatMat),
    solid(new THREE.TorusGeometry(0.32, 0.035, 6, 14, Math.PI), [0, 2.78, -0.45])), MAT.chrome);
}

function kitchen() {
  return named('kitchen',
    cabinets('island', { along: 'x', a0: 868, a1: 1087, back: Z(470), front: Z(565), splits: [941, 1014],
      stuff: islandStuff }, tint(block(866, 1089, 468, 567, 3, 2.85), MAT.counter)),
    cooktop(),
    named('stools', at(stool(MAT.teal), 902, 452), at(stool(MAT.plum), 947, 452), at(stool(MAT.teal), 993, 452), at(stool(MAT.plum), 1047, 452)),
    // the east counter's top has a hole cut in it for the sink
    cabinets('counter-east', { along: 'z', a0: 364, a1: 660, back: X(1237), front: X(1183), splits: [438, 585],
      open: [1], stuff: sinkStuff },
      tint(slab([[1181, 364], [1237, 364], [1237, 660], [1181, 660]],
        [[[1189, 475], [1225, 475], [1225, 547], [1189, 547]]], FLOOR + 2.85, FLOOR + 3), MAT.counter)),
    sink(),
    sinkLight(),
    dishDrainer(),
    ...pizzaBoxes(),
    cabinets('counter-south', { along: 'x', a0: 807, a1: 980, back: Z(715), front: Z(660), splits: [865, 922],
      stuff: counterStuff }, tint(block(807, 980, 658, 715, 3, 2.85), MAT.counter)),
    fridge(),
    fridgeLight(),
    named('pantry-shelves', shelving(1190, 1237, 669, 780), shelving(1072, 1187, 748, 780))
  );
}

/* Base cabinets along a run: a hollow box with a pale inside, a shelf
   in each section (not where `open` says, like under the sink), and
   doors that swing, one per section or a pair if it's wide. Each door is
   named 'cabinet-door-<run>-<n>' and has setOpen(t) like the others.
   The run goes along x or z between blueprint a0..a1, from the back
   (feet) to the front (feet), split into sections at `splits` (px).
   stuff(box, sections) adds whatever's kept inside. */
function cabinets(name, { along, a0, a1, back, front, splits = [], open = [], stuff }, ...extra) {
  const A = along === 'x' ? X : Z, A0 = A(a0), L = A(a1) - A0;
  const n = Math.sign(front - back), D = Math.abs(front - back);
  const s = 0.06, H = 2.85, toe = 0.35;
  // a box in run space: u along the run, d from the back toward the front, y up from the floor
  const box = (u0, u1, d0, d1, y0, y1) => {
    const p = [A0 + u0, A0 + u1], q = [back + n * d0, back + n * d1].sort((a, b) => a - b);
    const [xs, zs] = along === 'x' ? [p, q] : [q, p];
    return solid(new THREE.BoxGeometry(xs[1] - xs[0], y1 - y0, zs[1] - zs[0]),
      [(xs[0] + xs[1]) / 2, FLOOR + (y0 + y1) / 2, (zs[0] + zs[1]) / 2]);
  };
  const cuts = [0, ...splits.map(px => A(px) - A0), L];
  const sections = cuts.slice(1).map((u, i) => [cuts[i], u]);
  const parts = [
    box(0, s, 0, D, 0, H), box(L - s, L, 0, D, 0, H),                       // ends
    box(s, L - s, 0, s, toe, H),                                            // back
    box(s, L - s, 0, D - 0.25, 0, toe),                                     // toe kick
    box(s, L - s, D - s, D, H - 0.2, H),                                    // rail under the counter
    tint(box(s, L - s, s, D, toe, toe + s), MAT.cabShelf),                  // floor
    tint(box(s + 0.01, L - s - 0.01, s + 0.01, D - 0.01, toe + s + 0.01, H - 0.01), MAT.cabInside)
  ];
  for (const u of cuts.slice(1, -1)) parts.push(tint(box(u - s / 2, u + s / 2, s, D, toe + s, H - 0.2), MAT.cabShelf));
  sections.forEach(([u0, u1], i) => {
    if (!open.includes(i)) parts.push(tint(box(u0 + s / 2, u1 - s / 2, s, D - 0.1, 1.45, 1.5), MAT.cabShelf));
  });
  // doors
  const axis = along === 'x' ? [1, 0] : [0, 1], out = along === 'x' ? [0, n] : [n, 0];
  let k = 0;
  const door = (hingeU, freeU) => {
    const w = Math.abs(freeU - hingeU) - 0.02, dir = Math.sign(freeU - hingeU);
    const t = [axis[0] * dir, axis[1] * dir];                              // hinge toward the free edge
    const beta = Math.atan2(-t[1], t[0]);
    const sgn = Math.round(out[0] * -t[1] + out[1] * t[0]) || 1;           // which local side faces out
    const y0 = toe + 0.03, y1 = H - 0.22, h = y1 - y0;
    const g = named(`cabinet-door-${name}-${++k}`,
      solid(new THREE.BoxGeometry(w, h, 0.06), [w / 2, FLOOR + y0 + h / 2, sgn * 0.03]),
      solid(new THREE.BoxGeometry(w - 0.3, h - 0.3, 0.025), [w / 2, FLOOR + y0 + h / 2, sgn * 0.072]),   // raised panel
      tint(solid(new THREE.SphereGeometry(0.045, 8, 6), [w - 0.12, FLOOR + y1 - 0.25, sgn * 0.12]), MAT.brass));
    const hx = A0 + hingeU, hd = back + n * D;
    if (along === 'x') g.position.set(hx, 0, hd); else g.position.set(hd, 0, hx);
    return openable(g, v => { g.rotation.y = beta - sgn * v * 1.75; });
  };
  for (const [u0, u1] of sections) {
    if (u1 - u0 > 2.2) { const m = (u0 + u1) / 2; parts.push(door(u0 + 0.01, m), door(u1 - 0.01, m)); }
    else parts.push(door(u0 + 0.01, u1 - 0.01));
  }
  if (stuff) parts.push(...stuff(box, sections, { s, toe, D }));
  return named(name, ...parts, ...extra);
}

// under the sink: the drain pipes, a bucket and some cleaning bottles
function sinkStuff(box, [, [u0, u1]], { toe, s }) {
  const floor = toe + s;
  return [
    // a drain down from each bowl, joined, and back into the wall
    tint(box(4.67, 4.77, 1.05, 1.15, 1.6, 2.25), MAT.soft), tint(box(5.97, 6.07, 1.05, 1.15, 1.6, 2.25), MAT.soft),
    tint(box(4.67, 6.07, 1.05, 1.15, 1.55, 1.65), MAT.soft), tint(box(5.3, 5.4, 0.06, 1.05, 1.55, 1.65), MAT.soft),
    tint(box(u0 + 0.4, u0 + 1.1, 0.9, 1.6, floor, floor + 0.85), MAT.flannel),   // bucket
    tint(box(u1 - 0.9, u1 - 0.7, 1.2, 1.4, floor, floor + 0.65), MAT.teal),      // bottles
    tint(box(u1 - 0.6, u1 - 0.4, 1.0, 1.2, floor, floor + 0.55), MAT.cream)
  ];
}

// in the island: pots on the floor and bowls on the shelves
function islandStuff(box, sections, { toe, s }) {
  const floor = toe + s, out = [];
  sections.forEach(([u0, u1], i) => {
    if (i === 1) return;                                       // under the cooktop: gas pipes, nothing kept
    out.push(tint(box(u0 + 0.3, u0 + 1.2, 0.6, 1.5, floor, floor + 0.6), MAT.steel),
             tint(box(u0 + 1.4, u0 + 2.2, 0.8, 1.6, floor, floor + 0.45), MAT.dark),
             tint(box(u0 + 0.4, u0 + 1.1, 0.8, 1.5, 1.5, 1.8), MAT.cream),
             tint(box(u0 + 1.4, u0 + 2.0, 0.9, 1.5, 1.5, 1.7), MAT.mustard));
  });
  return out;
}

// next to the fridge: stacks of plates, glasses and cans
function counterStuff(box, sections, { toe, s }) {
  const floor = toe + s, out = [];
  sections.forEach(([u0, u1]) => {
    out.push(tint(box(u0 + 0.3, u0 + 1.1, 0.3, 1.1, 1.5, 1.85), MAT.soft),      // plates
             tint(box(u0 + 1.3, u0 + 1.8, 0.4, 0.9, 1.5, 1.95), MAT.cabinet),   // glasses
             tint(box(u0 + 0.3, u0 + 1.6, 0.4, 1.2, floor, floor + 0.5), MAT.denim));   // pans
  });
  return out;
}

/* By the sink: a chrome-wire dish drainer on its tray, plates standing
   in it, a mug upside down, a cup of cutlery, and a green bottle of
   dish soap beside the faucet. */
function dishDrainer() {
  const top = FLOOR + 3, cx = X(1210), cz = Z(420), chrome = (geo, p, rot) => tint(solid(geo, p, rot), MAT.chrome);
  const parts = [
    tint(solid(new THREE.BoxGeometry(1.35, 0.05, 1.75), [cx, top + 0.025, cz]), surface(0xdcdcd4, 0.5)),   // drip tray
  ];
  // the wire basket: rails round the top and bottom, and uprights
  for (const y of [0.1, 0.42]) {
    parts.push(chrome(new THREE.BoxGeometry(1.2, 0.025, 0.025), [cx, top + y, cz - 0.8]), chrome(new THREE.BoxGeometry(1.2, 0.025, 0.025), [cx, top + y, cz + 0.8]),
      chrome(new THREE.BoxGeometry(0.025, 0.025, 1.6), [cx - 0.6, top + y, cz]), chrome(new THREE.BoxGeometry(0.025, 0.025, 1.6), [cx + 0.6, top + y, cz]));
  }
  for (let k = 0; k < 9; k++) {
    const z = cz - 0.8 + k * 0.2;
    parts.push(chrome(new THREE.BoxGeometry(0.02, 0.32, 0.02), [cx - 0.6, top + 0.26, z]), chrome(new THREE.BoxGeometry(0.02, 0.32, 0.02), [cx + 0.6, top + 0.26, z]));
  }
  // plates standing on edge, a mug upside down, cutlery
  for (let k = 0; k < 4; k++) {
    parts.push(tint(solid(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 18).rotateZ(Math.PI / 2), [cx - 0.15, top + 0.5, cz - 0.55 + k * 0.17], [0, Math.PI / 2, 0.08]), MAT.soft));
  }
  parts.push(tint(solid(new THREE.CylinderGeometry(0.14, 0.12, 0.32, 12), [cx + 0.3, top + 0.27, cz + 0.45]), MAT.teal),
    tint(solid(new THREE.CylinderGeometry(0.11, 0.09, 0.3, 10), [cx + 0.3, top + 0.25, cz - 0.4]), MAT.soft),
    ...[[-0.03, 0.05], [0.04, -0.03], [0, 0.02]].map(([dx, lean]) => chrome(new THREE.BoxGeometry(0.03, 0.45, 0.02), [cx + 0.3 + dx, top + 0.45, cz - 0.4], [lean, 0, lean])));
  // dish soap: a tall green bottle with a white flip cap
  const sx = X(1229), sz = Z(556);
  parts.push(tint(solid(new THREE.CylinderGeometry(0.1, 0.12, 0.62, 12).scale(1, 1, 0.6), [sx, top + 0.31, sz]), surface(0x2f8a3a, 0.35)),
    tint(solid(new THREE.CylinderGeometry(0.05, 0.08, 0.1, 10), [sx, top + 0.67, sz]), MAT.soft));
  return named('dish-drainer', ...parts);
}

/* Two pizza boxes on the island: one shut, one open with a couple of
   pepperoni slices left in it, lid up. The lids' art is a tiny picture. */
function pizzaBoxes() {
  const top = FLOOR + 3, S = 1.35, T = 0.15, card = surface(0xc9a46a, 0.95);
  const lidArt = surface(0xffffff, 0.9);
  if (typeof document !== 'undefined') lidArt.map = screenCanvas(64, 64, g => {
    g.fillStyle = '#f2ece0'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#c4161c'; g.lineWidth = 3; g.strokeRect(4, 4, 56, 56);
    g.fillStyle = '#2f6b45'; g.fillRect(8, 8, 48, 6); g.fillRect(8, 50, 48, 6);
    g.fillStyle = '#c4161c'; g.font = 'bold italic 14px serif'; g.fillText('Pizza', 12, 30);
    g.font = 'bold 9px sans-serif'; g.fillText('HOT & FRESH', 6, 44);
  }); else lidArt.color.set(0xf2ece0);
  const box = (x, z, turn) => {
    const g = new THREE.Group();
    g.add(tint(solid(new THREE.BoxGeometry(S, T, S), [0, T / 2, 0]), card),
      tint(solid(new THREE.PlaneGeometry(S - 0.06, S - 0.06).rotateX(-Math.PI / 2), [0, T + 0.002, 0]), lidArt));
    g.position.set(x, top, z); g.rotation.y = turn;
    return g;
  };
  // the open one: a tray, its lid standing up at the back, grease, slices
  const open = new THREE.Group();
  const tray = new THREE.Group();
  tray.add(tint(solid(new THREE.BoxGeometry(S, 0.02, S), [0, 0.01, 0]), card),
    ...[[S, T, 0.02, 0, T / 2, -S / 2], [S, T, 0.02, 0, T / 2, S / 2], [0.02, T, S, -S / 2, T / 2, 0], [0.02, T, S, S / 2, T / 2, 0]]
      .map(([w, h, d, x, y, z]) => tint(solid(new THREE.BoxGeometry(w, h, d), [x, y, z]), card)));
  const lid = new THREE.Group();
  lid.add(tint(solid(new THREE.BoxGeometry(S, 0.02, S), [0, 0, S / 2]), card));
  lid.position.set(0, T, -S / 2);
  lid.rotation.x = -1.85;                                                      // flopped open, past upright
  // pepperoni slices: wedges of cheese with a crust along the arc and pepperoni on top
  const slice = (x, z, turn) => {
    const r = 0.6, a = Math.PI / 4, sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.absarc(0, 0, r, -a / 2, a / 2, false); sh.lineTo(0, 0);
    const g = new THREE.Group();
    g.add(tint(solid(remap(new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false, curveSegments: 6 }), (u, v, d) => [u, d, v])), surface(0xe3b04b, 0.7)),
      tint(solid(new THREE.TorusGeometry(r, 0.045, 5, 8, a).rotateX(Math.PI / 2).rotateY(a / 2), [0, 0.04, 0]), surface(0xb87a3a, 0.9)),
      ...[[0.25, 0.04], [0.42, -0.07], [0.45, 0.1]].map(([pr, pz]) => tint(solid(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), [pr, 0.05, pz]), surface(0x9c2a1c, 0.6))));
    g.position.set(x, 0.02, z); g.rotation.y = turn;
    return g;
  };
  open.add(tray, lid, slice(-0.15, 0.05, 0.4), slice(-0.1, 0.0, -0.4),
    tint(solid(new THREE.CircleGeometry(0.3, 10).rotateX(-Math.PI / 2), [0.3, 0.022, 0.25]), surface(0xa8823e, 1)));   // a grease spot
  open.position.set(X(1050), top, Z(512));
  open.rotation.y = 0.15;
  return [named('pizza-boxes', box(X(895), Z(518), -0.2), box(X(897), Z(516), 0.1).translateY(T), open)];
}

/* A little schoolhouse pendant over the kitchen sink. Its light is a
   spot tipped away from the window wall and fading out before the
   floor, so it lights the sink without shining through the wall. */
function sinkLight() {
  const x = X(1200), z = Z(511), y = FLOOR + 6.8;
  const shade = new THREE.CylinderGeometry(0.16, 0.3, 0.38, 14, 1, true);
  const light = new THREE.SpotLight(LAMP_COLOR, 22, 6.5, 0.45, 0.6, 2);
  light.name = 'lamp-sink-light';
  light.position.set(x, y - 0.15, z);
  light.target.position.set(x - 1.15, FLOOR + 3, z);
  return named('lamp-sink',
    lines([[[x, CEIL, z], [x, y + 0.2, z]]]),
    tint(solid(shade, [x, y, z]), MAT.shadeGlow),
    glow(new THREE.SphereGeometry(0.08, 10, 8), x, y - 0.05, z),
    tint(solid(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), [x, y + 0.22, z]), MAT.brass),
    light, light.target);
}

/* The fridge's light: bright and white, and only on while a door is open
   (it fades with the door). One spot, high in the freezer, aimed out and
   down through both compartments into the kitchen. */
function fridgeLight() {
  const cx = (X(980) + X(1060)) / 2, zf = Z(655);
  const light = new THREE.SpotLight(0xf2f6ff, 0, 10, 0.9, 0.4, 2);
  light.name = 'fridge-light';
  light.position.set(cx, FLOOR + 6.05, zf + 0.5);
  light.target.position.set(cx, FLOOR + 0.6, zf - 3.6);
  const g = named('fridge-glow', light, light.target);
  let doors = null;
  g.userData.tick = () => {
    if (!doors) {
      let root = g;
      while (root.parent) root = root.parent;
      doors = ['fridge-door', 'freezer-door'].map(n => root.getObjectByName(n)).filter(Boolean);
    }
    light.intensity = 16 * Math.max(0, ...doors.map(d => Math.min(1, d.userData.open * 3)));
  };
  return g;
}

/* A gas cooktop set into the island: black top, four burners under
   iron grates, knobs along the cook's side. */
function cooktop() {
  const top = FLOOR + 3, x0 = X(945), x1 = X(1015), z0 = Z(508), z1 = Z(560);
  const cx = (x0 + x1) / 2, w = x1 - x0;
  const rows = [z0 + 0.5, z0 + 1.2], cols = [x0 + w * 0.27, x1 - w * 0.27];
  const bar = (len, alongX, x, z) =>
    solid(new THREE.BoxGeometry(alongX ? len : 0.05, 0.05, alongX ? 0.05 : len), [x, top + 0.14, z]);
  const parts = [solid(new THREE.BoxGeometry(w, 0.05, z1 - z0), [cx, top + 0.025, (z0 + z1) / 2])];
  for (const z of rows) for (const x of cols) {
    parts.push(
      tint(solid(new THREE.CylinderGeometry(0.2, 0.23, 0.06, 12), [x, top + 0.08, z]), MAT.steel),   // burner
      solid(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10), [x, top + 0.125, z]),                  // its cap
      bar(0.6, true, x, z), bar(0.6, false, x, z));                                                   // grate over it
  }
  const g0 = z0 + 0.12, g1 = z0 + 1.58, gm = (g0 + g1) / 2;
  parts.push(bar(w - 0.2, true, cx, g0), bar(w - 0.2, true, cx, g1), bar(w - 0.2, true, cx, (rows[0] + rows[1]) / 2),
    bar(g1 - g0, false, x0 + 0.1, gm), bar(g1 - g0, false, x1 - 0.1, gm), bar(g1 - g0, false, cx, gm));
  for (let i = 0; i < 4; i++) {
    parts.push(tint(solid(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 8), [x0 + w * (0.2 + i * 0.2), top + 0.09, z1 - 0.15]), MAT.steel));
  }
  return named('cooktop', ...parts);
}

/* A top-freezer fridge against the kitchen | master wall, facing the
   kitchen. It's hollow, with shelves, door bins, food and a little
   light inside, and both doors open, for anomalies:
     scene.getObjectByName('fridge-door').userData.setOpen(1)
     scene.getObjectByName('freezer-door').userData.setOpen(1)
   (Wide open, the fridge door reaches ghoul1's path round the island.) */
function fridge() {
  const x0 = X(980), x1 = X(1060), zf = Z(655), zb = Z(715);
  const W = x1 - x0, T = 0.18, cx = (x0 + x1) / 2;
  const front = zf + T, D = zb - front, zc = front + D / 2;
  const H = 6.3, SPLIT = 4.5, s = 0.08;
  const lo = 0.3, hi = SPLIT - 0.07, flo = SPLIT + 0.07, fhi = H - s;      // inside floors and ceilings
  const inW = W - 2 * s, inD = D - s, back = zb - s;
  const box = (w, h, d, x, y, z) => solid(new THREE.BoxGeometry(w, h, d), [x, FLOOR + y, z]);
  const cyl = (r, h, x, y, z) => solid(new THREE.CylinderGeometry(r, r, h, 8), [x, FLOOR + y + h / 2, z]);
  const shelf = y => tint(box(inW - 0.06, 0.04, inD - 0.35, cx, y, back - (inD - 0.35) / 2), MAT.soft);
  const food = z => [                                          // [shape, colour], sitting on whatever's below
    [cyl(0.14, 0.6, cx - 0.15, 1.54, z), MAT.mustard],         // juice
    [box(0.35, 0.75, 0.35, cx - 0.65, 1.54 + 0.375, z), MAT.soft],    // milk
    [box(0.6, 0.25, 0.4, cx + 0.6, 1.54 + 0.125, z), MAT.cabinet],   // leftovers
    [cyl(0.1, 0.45, cx - 0.7, 2.59, z), MAT.frontDoor],         // ketchup
    [cyl(0.15, 0.3, cx - 0.3, 2.59, z), MAT.brick],             // jar
    [box(0.7, 0.3, 0.5, cx + 0.5, 2.59 + 0.15, z), MAT.sofa],
    [box(0.9, 0.2, 0.35, cx - 0.2, 3.54 + 0.1, z), MAT.soft],   // eggs
    [cyl(0.12, 0.7, cx + 0.7, 3.54, z), MAT.cabinet],           // bottle
    [box(0.8, 0.35, 0.6, cx - 0.5, flo + 0.175, z), MAT.soft],  // freezer: ice cream, peas, a pizza
    [box(0.6, 0.2, 0.5, cx + 0.45, flo + 0.1, z), MAT.mustard],
    [box(0.9, 0.12, 0.6, cx, flo + 0.79 + 0.06, z), MAT.sofa]
  ].map(([part, mat]) => tint(part, mat));

  const door = (name, y0, y1, grip, bins) => {
    const h = y1 - y0;
    const g = named(name,
      solid(new THREE.BoxGeometry(W, h, T), [-W / 2, FLOOR + y0 + h / 2, T / 2]),
      tint(solid(new THREE.BoxGeometry(W - 0.3, h - 0.3, 0.03), [-W / 2, FLOOR + y0 + h / 2, T + 0.015]), MAT.soft),
      // handle on standoffs, on the side away from the hinge
      solid(new THREE.BoxGeometry(0.07, grip[1] - grip[0], 0.07), [-W + 0.2, FLOOR + (grip[0] + grip[1]) / 2, -0.15]),
      solid(new THREE.BoxGeometry(0.05, 0.05, 0.12), [-W + 0.2, FLOOR + grip[0] + 0.06, -0.07]),
      solid(new THREE.BoxGeometry(0.05, 0.05, 0.12), [-W + 0.2, FLOOR + grip[1] - 0.06, -0.07]),
      ...bins.flatMap(yb => [
        tint(solid(new THREE.BoxGeometry(W - 0.6, 0.22, 0.03), [-W / 2, FLOOR + yb + 0.11, T + 0.26]), MAT.soft),
        tint(solid(new THREE.BoxGeometry(W - 0.6, 0.03, 0.24), [-W / 2, FLOOR + yb + 0.015, T + 0.15]), MAT.soft),
        tint(solid(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), [-W / 2 - 0.3, FLOOR + yb + 0.23, T + 0.15]), MAT.cabinet),
        tint(solid(new THREE.CylinderGeometry(0.08, 0.08, 0.32, 8), [-W / 2 + 0.25, FLOOR + yb + 0.19, T + 0.15]), MAT.frontDoor)
      ]));
    g.position.set(x1, 0, zf);                                  // hinged at its front corner by the pantry wall
    return openable(g, t => { g.rotation.y = -t * 100 * Math.PI / 180; });
  };

  return named('fridge',
    box(s, H, D, x0 + s / 2, H / 2, zc), box(s, H, D, x1 - s / 2, H / 2, zc),           // sides
    box(W, s, D, cx, H - s / 2, zc), box(W, lo, D, cx, lo / 2, zc),                    // top, base
    box(W, H, s, cx, H / 2, zb - s / 2), box(W, flo - hi, D, cx, SPLIT, zc),           // back, between the two
    // white insides, drawn inside out so they only show from in front
    tint(box(inW - 0.04, hi - lo - 0.04, inD - 0.04, cx, (lo + hi) / 2, front + inD / 2), MAT.liner),
    tint(box(inW - 0.04, fhi - flo - 0.04, inD - 0.04, cx, (flo + fhi) / 2, front + inD / 2), MAT.liner),
    shelf(1.5), shelf(2.55), shelf(3.5), shelf(flo + 0.75),
    tint(box(inW - 0.1, 0.9, inD - 0.4, cx, lo + 0.47, back - (inD - 0.4) / 2), MAT.soft),   // crisper
    glow(new THREE.BoxGeometry(0.5, 0.05, 0.2), cx, FLOOR + hi - 0.05, back - 0.4),         // the light
    ...food(back - 0.6),
    fridgeFront(door('fridge-door', 0.03, SPLIT - 0.03, [2.6, 4.1], [0.9, 2.1, 3.3]), [
      ['photo', -1.05, 3.65, 0.08, 'beach'], ['photo', -1.75, 3.3, -0.11, 'dog'], ['memo', -1.3, 2.35, 0.04],
      ['letters', -0.75, 1.45], ['magnet', -2.15, 1.9, 0, 0xc4161c]]),
    fridgeFront(door('freezer-door', SPLIT + 0.03, H - 0.02, [SPLIT + 0.2, SPLIT + 0.95], [5.0]), [
      ['drawing', -1.45, 5.35, -0.05], ['magnet', -0.7, 5.6, 0, 0x2f6b45]]));
}

/* Things stuck on the fridge, added to a door so they swing with it:
   polaroid photos, a to-do memo, a kid's crayon drawing, round magnets
   and alphabet magnets. Each picture is a tiny canvas drawn at the start.
   x and y are on the door's face (x from the hinge, y above the floor). */
function fridgeFront(door, items) {
  const z = -0.012;                                        // just in front of the door
  const card = (w, h, x, y, tilt, draw, fallback) => {
    const m = surface(0xffffff, 0.8);
    if (typeof document !== 'undefined') m.map = screenCanvas(Math.round(w * 160), Math.round(h * 160), draw); else m.color.set(fallback);
    return tint(solid(new THREE.PlaneGeometry(w, h).rotateY(Math.PI), [x, FLOOR + y, z], [0, 0, tilt]), m);
  };
  const magnet = (x, y, col) => tint(solid(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10).rotateX(Math.PI / 2), [x, FLOOR + y, z - 0.02]), surface(col, 0.4));
  const pictures = {
    beach: g => {
      g.fillStyle = '#7fb3d9'; g.fillRect(6, 6, 52, 30); g.fillStyle = '#e3cf98'; g.fillRect(6, 36, 52, 20);
      g.fillStyle = '#c4161c'; g.fillRect(22, 26, 5, 14); g.fillStyle = '#1f3a8a'; g.fillRect(33, 24, 5, 16);
      g.fillStyle = '#f2c38a'; g.beginPath(); g.arc(24.5, 23, 3, 0, 7); g.arc(35.5, 21, 3, 0, 7); g.fill();
    },
    dog: g => {
      g.fillStyle = '#4f7a3a'; g.fillRect(6, 6, 54, 58); g.fillStyle = '#7a4a26';
      g.beginPath(); g.ellipse(32, 42, 14, 9, 0, 0, 7); g.fill(); g.beginPath(); g.arc(44, 30, 7, 0, 7); g.fill();
      g.fillStyle = '#111'; g.fillRect(45, 28, 2, 2);
    }
  };
  for (const [kind, x, y, tilt = 0, extra] of items) {
    if (kind === 'photo') {
      door.add(card(0.4, 0.48, x, y, tilt, g => {
        g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, 64, 77);                // the polaroid's white border
        g.fillStyle = '#222'; g.fillRect(6, 6, 52, 50);
        pictures[extra](g);
      }, 0xd8d0c0), magnet(x, y + 0.22, 0xf0c020));
    } else if (kind === 'memo') {
      door.add(named('fridge-memo', card(0.55, 0.75, x, y, tilt, g => {
        g.fillStyle = '#f6e58a'; g.fillRect(0, 0, 88, 120);
        g.strokeStyle = '#9fb7d8'; for (let ly = 24; ly < 116; ly += 11) { g.beginPath(); g.moveTo(4, ly); g.lineTo(84, ly); g.stroke(); }
        g.fillStyle = '#1f3a8a'; g.font = 'bold 11px cursive'; g.fillText('TO DO', 24, 15);
        g.font = '9px cursive';
        ['milk', 'eggs', 'bread', 'call mom', 'fix closet door', 'who moved', 'the chair??'].forEach((l, i) => g.fillText(l, 8, 33 + i * 11));
        g.strokeStyle = '#1f3a8a'; g.beginPath(); g.moveTo(6, 42); g.lineTo(34, 42); g.stroke();       // eggs, crossed out
      }, 0xf6e58a), magnet(x, y + 0.36, 0x1f3a8a)));
    } else if (kind === 'drawing') {
      door.add(card(0.62, 0.46, x, y, tilt, g => {
        g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, 99, 74);
        g.strokeStyle = '#c4161c'; g.lineWidth = 3; g.strokeRect(30, 34, 34, 28);       // a crayon house
        g.beginPath(); g.moveTo(26, 36); g.lineTo(47, 16); g.lineTo(68, 36); g.stroke();
        g.fillStyle = '#f0c020'; g.beginPath(); g.arc(84, 14, 8, 0, 7); g.fill();          // the sun
        g.fillStyle = '#4f7a3a'; g.fillRect(0, 64, 99, 10);
        g.strokeStyle = '#222'; g.lineWidth = 2; g.beginPath(); g.moveTo(14, 64); g.lineTo(14, 48); g.stroke();   // someone by the house
        g.beginPath(); g.arc(14, 44, 4, 0, 7); g.stroke();
      }, 0xfbfbf6), magnet(x - 0.25, y + 0.2, 0xc4161c), magnet(x + 0.25, y + 0.2, 0x1f7a7a));
    } else if (kind === 'letters') {
      [[0xc4161c, 0], [0x1f7a7a, 0.13], [0xf0c020, 0.26], [0x5d3a6b, 0.39]].forEach(([col, dx], i) =>
        door.add(tint(solid(new THREE.BoxGeometry(0.1, 0.13, 0.03), [x - dx, FLOOR + y + (i % 2) * 0.03, z - 0.015], [0, 0, (i - 1.5) * 0.12]), surface(col, 0.4))));
    } else if (kind === 'magnet') {
      door.add(magnet(x, y, extra));
    }
  }
  return door;
}

// Open shelves against a wall: an upright at each end, boards up to h,
// and a few cans and boxes on each board.
function shelving(x0, x1, y0, y1, h = 6.5, boards = 5) {
  const alongX = X(x1) - X(x0) > Z(y1) - Z(y0);
  const parts = alongX
    ? [block(x0, x0 + 3, y0, y1, h), block(x1 - 3, x1, y0, y1, h)]
    : [block(x0, x1, y0, y0 + 3, h), block(x0, x1, y1 - 3, y1, h)];
  let seed = x0 * 7 + y0 * 13;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const colours = [MAT.mustard, MAT.frontDoor, MAT.cabinet, MAT.soft, MAT.sofa, MAT.brick];
  const mid = alongX ? (Z(y0) + Z(y1)) / 2 : (X(x0) + X(x1)) / 2;
  for (let i = 0; i < boards; i++) {
    const hb = 0.35 + i * (h - 0.41) / (boards - 1);
    parts.push(alongX ? block(x0 + 3, x1 - 3, y0, y1, hb + 0.06, hb) : block(x0, x1, y0 + 3, y1 - 3, hb + 0.06, hb));
    if (i === boards - 1) continue;                       // nothing on the top board
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5 + (rand() - 0.5) * 0.5) / n;
      const along = alongX ? X(x0 + 3) + f * (X(x1 - 3) - X(x0 + 3)) : Z(y0 + 3) + f * (Z(y1 - 3) - Z(y0 + 3));
      const tall = 0.4 + rand() * 0.6, can = rand() < 0.5;
      const ht = can ? tall * 0.7 : tall;
      const y = FLOOR + hb + 0.06 + ht / 2;
      const thing = can
        ? solid(new THREE.CylinderGeometry(0.17, 0.17, ht, 8), alongX ? [along, y, mid] : [mid, y, along])
        : solid(new THREE.BoxGeometry(0.55, ht, 0.2), alongX ? [along, y, mid] : [mid, y, along], alongX ? null : [0, Math.PI / 2, 0]);
      parts.push(tint(thing, colours[Math.floor(rand() * colours.length)]));
    }
  }
  return named('shelving', ...parts);
}

/* A double stainless sink under the east window, with a faucet. Each
   bowl is a box drawn inside out (only its inner faces show), so from
   above it looks like an open basin. A steel rim hides the cut edge. */
function sink() {
  const top = FLOOR + 3, deep = 0.75;
  // an open-topped steel box: from above it's the bowl, from under the sink its outside
  const bowl = (y0, y1) => {
    const b = block(1191, 1223, y0, y1, 3, 3 - deep);
    const geo = b.children[0].geometry, idx = geo.index.array;
    geo.setIndex([...idx.slice(0, 12), ...idx.slice(18)]);       // drop the top face
    return tint(b, MAT.basin);
  };
  const fx = X(1231), fz = Z(511), spout = 0.78;
  return named('kitchen-sink',
    bowl(477, 510), bowl(513, 545),
    slab([[1187, 473], [1227, 473], [1227, 549], [1187, 549]],
      [[[1191, 477], [1223, 477], [1223, 510], [1191, 510]], [[1191, 513], [1223, 513], [1223, 545], [1191, 545]]],
      top, top + 0.03),
    solid(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 10), [fx, top + 0.06, fz]),               // faucet base
    solid(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 8), [fx, top + 0.65, fz]),              // riser
    solid(new THREE.BoxGeometry(spout, 0.07, 0.07), [fx - spout / 2, top + 1.2, fz]),           // spout
    solid(new THREE.BoxGeometry(0.07, 0.18, 0.07), [fx - spout + 0.035, top + 1.1, fz]),        // nozzle
    solid(new THREE.BoxGeometry(0.05, 0.05, 0.32), [fx, top + 0.8, fz + 0.18])                  // lever
  );
}

function master() {
  return named('master',
    bed(),
    named('nightstands', block(875, 925, 1022, 1068, 2.1), block(1075, 1125, 1022, 1068, 2.1)),
    bookshelf(),
    standingLamp(),
    computerDesk(),
    named('round-table', round(1206, 846, 0.6, 1.9, 1.84, 14), round(1206, 846, 0.08, 1.84, 0.1, 8), round(1206, 846, 0.35, 0.1, 0, 12),
      tint(block(1196, 1214, 838, 852, 1.98, 1.9), MAT.flannel))          // a book on it
  );
}

/* A soft slab with rounded edges and corners: a rounded rectangle pushed
   up into a slab with a rounded bevel. puff > 0 bulges the middle, for
   pillows. Centred on (x, y, z). */
function softSlab(w, h, d, r, x, y, z, puff = 0, { corner = 0.06, flatBottom = false } = {}) {
  const c = corner, a = w / 2 - r - c, b = d / 2 - r - c;
  const sh = new THREE.Shape();
  sh.moveTo(-a, -b - c); sh.lineTo(a, -b - c); sh.quadraticCurveTo(a + c, -b - c, a + c, -b);
  sh.lineTo(a + c, b); sh.quadraticCurveTo(a + c, b + c, a, b + c); sh.lineTo(-a, b + c);
  sh.quadraticCurveTo(-a - c, b + c, -a - c, b); sh.lineTo(-a - c, -b); sh.quadraticCurveTo(-a - c, -b - c, -a, -b - c);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: h - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
  return solid(remap(geo, (u, v, dd) => {
    const yy = dd - (h - 2 * r) / 2;                                 // -h/2 .. h/2
    const bulge = puff && !(flatBottom && yy < 0) ? 1 - puff + puff * (1 - (u / (w / 2)) ** 2) * (1 - (v / (d / 2)) ** 2) : 1;
    return [x + u, y + yy * bulge, z + v];
  }));
}

/* The bed: a wood frame and headboard, a mattress with rounded edges, two
   puffy pillows, and a 90s plaid flannel comforter hanging over the sides
   and foot, its top corner flipped back so the sheet shows. */
function bed() {
  const x0 = X(930), x1 = X(1065), zf = Z(893), zh = Z(1060), cx = (x0 + x1) / 2;
  const top = FLOOR + 1.9, lift = 0.05, over = 0.06;
  const plaid = surface(0xffffff, 0.95, THREE.DoubleSide);
  if (typeof document !== 'undefined') plaid.map = plaidPattern(); else plaid.color.set(0x2f4a35);
  // a flat sheet of comforter from (x, z) points, facing up, plaid by the foot
  const flat = (pts, y, mat) => {
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([px, pz]) => new THREE.Vector2(px, -pz))));
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), pz = -pos.getY(i);
      pos.setXYZ(i, px, y, pz);
      uv.setXY(i, px / 1.5, pz / 1.5);
    }
    geo.computeVertexNormals();
    return tint(solid(geo), mat);
  };
  // a hanging side of the comforter, from a to b along x or z
  const drape = (a, b, at, alongX) => {
    const len = b - a, hang = 0.85;
    const geo = new THREE.PlaneGeometry(len, hang);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 1.5, uv.getY(i) * hang / 1.5);
    const pos = alongX ? [(a + b) / 2, top + lift - hang / 2, at] : [at, top + lift - hang / 2, (a + b) / 2];
    return tint(solid(geo, pos, alongX ? null : [0, Math.PI / 2, 0]), plaid);
  };
  const L = x0 - over, R = x1 + over, F = zf - over, B = Z(1000), c = 1.2;   // comforter edges; c: the folded corner
  return named('bed',
    tint(block(925, 1070, 890, 1060, 1.15, 0.3), MAT.furniture),                                  // frame
    ...[[927, 892], [1064, 892]].map(([px, py]) => tint(block(px, px + 4, py, py + 4, 0.3), MAT.furniture)),   // feet
    tint(block(925, 1070, 1060, 1068, 3.6), MAT.furniture),                                       // headboard
    tint(softSlab(x1 - x0, 0.75, zh - zf, 0.12, cx, top - 0.375, (zf + zh) / 2), MAT.soft),       // mattress
    ...pillow(X(968), top, Z(1037)), ...pillow(X(1027), top, Z(1035)),
    flat([[L, F], [R, F], [R, B], [L + c, B], [L, B - c]], top + lift, plaid),                    // the comforter,
    flat([[L + c, B], [L + c, B - c], [L, B - c]], top + lift + 0.02, MAT.flannel),              // its corner folded back: the red underside
    drape(F, B, R, false), drape(F, B - c, L, false), drape(L, R, F, true));
}

/* A bed pillow sitting on the mattress (top = the mattress top):
   rectangular from above, flat underneath, its top bulging up in the
   middle and thinning to soft flat edges and corners, with the
   pillowcase's seam running across one end. */
function pillow(x, top, z) {
  const w = 1.7, h = 0.48, d = 1.1, hw = w / 2, hd = d / 2;
  const rise = (u, v) => Math.max(0.14, Math.sqrt(Math.max(0, 1 - (u / hw) ** 2)) * Math.sqrt(Math.max(0, 1 - (v / hd) ** 2)));
  const geo = new THREE.BoxGeometry(w, h, d, 16, 1, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i), v = pos.getZ(i), up = pos.getY(i) > 0;
    pos.setY(i, up ? -h / 2 + h * rise(u, v) : -h / 2);
  }
  geo.computeVertexNormals();
  const body = tint(solid(geo, [x, top + h / 2, z]), MAT.soft);
  const u = -hw + 0.24, seam = [];                                // the end facing the cam
  for (let k = 0; k < 10; k++) {
    const v0 = -hd + 0.1 + k * (d - 0.2) / 10, v1 = v0 + (d - 0.2) / 10;
    const yAt = v => top + h * rise(u, v) + 0.01;
    seam.push([[x + u, yAt(v0), z + v0], [x + u, yAt(v1), z + v1]]);
  }
  return [body, lines(seam, new THREE.LineBasicMaterial({ color: 0x8f8a80 }))];
}

// red and black flannel plaid on hunter green (it wraps)
function plaidPattern() {
  const tex = screenCanvas(64, 64, g => {
    g.fillStyle = '#2f4a35'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(139,46,42,0.75)'; g.fillRect(0, 20, 64, 16); g.fillRect(20, 0, 16, 64);
    g.fillStyle = 'rgba(20,20,20,0.45)'; g.fillRect(0, 26, 64, 4); g.fillRect(26, 0, 4, 64);
    g.fillStyle = 'rgba(214,190,90,0.6)'; g.fillRect(0, 50, 64, 2); g.fillRect(50, 0, 2, 64);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* A 90s floor lamp in the corner between the bedroom door and the
   bookshelf: a weighted base, a brass pole, a pleated fabric shade lit
   from inside. Its light is a spot tipped out into the room, away from
   the wall behind (no shadows: no texture slots left). */
function standingLamp() {
  const x = X(914), z = Z(744);                         // between the bookshelf and the door's swing
  const light = new THREE.SpotLight(LAMP_COLOR, 18, 10, 0.6, 0.7, 2);
  light.name = 'lamp-standing-light';
  light.position.set(x, FLOOR + 5.2, z);
  light.target.position.set(x + 2.5, FLOOR, z + 4.5);
  return named('lamp-standing',
    tint(solid(new THREE.CylinderGeometry(0.42, 0.48, 0.08, 16), [x, FLOOR + 0.04, z]), MAT.dark),
    tint(solid(new THREE.CylinderGeometry(0.035, 0.035, 5.0, 8), [x, FLOOR + 2.55, z]), MAT.brass),
    tint(solid(new THREE.CylinderGeometry(0.5, 0.75, 0.95, 18, 1, true), [x, FLOOR + 5.35, z]), MAT.shadeGlow),
    tint(solid(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), [x, FLOOR + 5.1, z]), MAT.brass),           // socket
    glow(new THREE.SphereGeometry(0.13, 12, 8).scale(1, 1.25, 1), x, FLOOR + 5.38, z),                     // the bulb
    tint(solid(new THREE.TorusGeometry(0.5, 0.012, 4, 20).rotateX(Math.PI / 2), [x, FLOOR + 5.82, z]), MAT.brass),   // harp ring
    light, light.target);
}

/* The bookshelf facing the bed: four shelves of books (a jumble of
   heights and colours, some leaning, some stacked flat), a framed photo,
   and a plant on top. Books are welded together by colour, so it's cheap. */
function bookshelf() {
  const parts = [
    block(940, 943, 728, 762, 5.0), block(1052, 1055, 728, 762, 5.0),       // sides
    block(938, 1057, 727, 764, 5.1, 5.0),                                   // top
    block(943, 1052, 728, 730, 5.0),                                        // back
    block(943, 1052, 730, 762, 0.3)                                         // base
  ];
  const covers = [MAT.flannel, MAT.hunter, MAT.denim, MAT.plum, MAT.mustard, MAT.cream, MAT.brick, MAT.dark, MAT.teal];
  let seed = 21;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const zb = Z(731), x1 = X(1051);
  for (const [i, base] of [0.3, 1.45, 2.6, 3.75].entries()) {
    if (i) parts.push(block(943, 1052, 730, 762, base, base - 0.06));       // the shelf board
    let x = X(944);
    while (x < x1 - 0.1) {
      const r = rand();
      if (r < 0.06 && x < x1 - 0.6) {                                       // a short stack lying flat
        for (let k = 0; k < 3; k++) {
          parts.push(tint(solid(new THREE.BoxGeometry(0.5 - k * 0.04, 0.09, 0.62), [x + 0.26, FLOOR + base + 0.045 + k * 0.09, zb + 0.4]),
            covers[Math.floor(rand() * covers.length)]));
        }
        x += 0.6;
      } else if (r < 0.1 && i === 2 && x < x1 - 0.5) {                      // a framed photo
        parts.push(tint(solid(new THREE.BoxGeometry(0.4, 0.5, 0.04), [x + 0.22, FLOOR + base + 0.25, zb + 0.6], [-0.15, 0, 0]), MAT.brass));
        x += 0.5;
      } else {
        const w = 0.08 + rand() * 0.13, h = 0.6 + rand() * 0.35, d = 0.55 + rand() * 0.2;
        const lean = x > x1 - 0.35 && rand() < 0.6 ? 0.3 : 0;               // the last one leans over
        parts.push(tint(solid(new THREE.BoxGeometry(w, h, d), [x + w / 2 + lean * 0.3, FLOOR + base + h / 2 - lean * 0.05, zb + d / 2 + 0.05], [0, 0, -lean]),
          covers[Math.floor(rand() * covers.length)]));
        x += w + 0.005;
        if (lean) break;
      }
    }
  }
  // a plant on top
  parts.push(tint(round(1030, 745, 0.28, 5.55, 5.1, 10, 0.34), MAT.brick),
    tint(solid(new THREE.IcosahedronGeometry(0.45, 0), [X(1030), FLOOR + 5.85, Z(745)]), MAT.leaves));
  return named('bookshelf', ...parts);
}

// a 90s black gooseneck desk lamp at the back corner, bent over the mess
// soda can materials, made once (the pictures need a browser)
const CAN = (() => {
  const side = surface(0xffffff, 0.35), top = surface(0xffffff, 0.35), metal = surface(0xc3c3c8, 0.35);
  for (const m of [side, top, metal]) m.metalness = 0.4;
  if (typeof document !== 'undefined') { side.map = dietChoke(); top.map = canTop(); }
  else { side.color.set(0xd8d8dc); top.color.set(0xc3c3c8); }
  return { side, top, metal };
})();

/* A 90s computer desk under the bedroom window: a drawer pedestal, a
   pull-out keyboard tray, two beige CRT monitors (one at a DOS prompt, one
   on a teal desktop), a beige tower on the floor, keyboard, mouse and pad,
   an office chair, and a mess: an ashtray of cigarette butts, more butts
   about, and empty cans of Diet Choke. Screens and can labels are tiny
   pictures drawn at the start. */
function computerDesk() {
  const x0 = X(1172), x1 = X(1232), z0 = Z(875), z1 = Z(1025), top = FLOOR + 2.5;
  const zc = (z0 + z1) / 2, beige = surface(0xd9d0b8, 0.7), keys = surface(0xb9b09a, 0.8);
  const box = (w, h, d, x, y, z, mat, rot) => {
    const b = solid(new THREE.BoxGeometry(w, h, d), [x, y, z], rot);
    return mat ? tint(b, mat) : b;
  };
  const cyl = (r, h, x, y, z, mat, rot, segs = 10) => tint(solid(new THREE.CylinderGeometry(r, r, h, segs), [x, y, z], rot), mat);
  const parts = [
    box(x1 - x0, 0.1, z1 - z0, (x0 + x1) / 2, top - 0.05, zc),                        // desktop
    box(x1 - x0, 2.4, 1.4, (x0 + x1) / 2, FLOOR + 1.2, z0 + 0.7),                    // drawer pedestal
    box(x1 - x0, 2.4, 0.1, (x0 + x1) / 2, FLOOR + 1.2, z1 - 0.05),                   // end panel
    box(0.08, 1.4, z1 - z0 - 1.5, x1 - 0.1, FLOOR + 1.6, (z0 + 1.4 + z1 - 0.1) / 2),  // modesty panel
    box(1.1, 0.05, 1.9, x0 + 0.25, top - 0.3, zc + 0.6)                              // keyboard tray, pulled out
  ];
  for (let k = 0; k < 3; k++) {                                                      // drawer fronts and pulls
    parts.push(box(0.04, 0.7, 1.25, x0 - 0.02, FLOOR + 0.5 + k * 0.78, z0 + 0.7),
      tint(box(0.06, 0.05, 0.35, x0 - 0.06, FLOOR + 0.62 + k * 0.78, z0 + 0.7), MAT.brass));
  }
  // two CRTs, angled in toward the chair a touch
  const crt = (z, turn, screen) => {
    const g = new THREE.Group();
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.8), new THREE.MeshBasicMaterial({ color: 0xcccccc }));
    if (screen) scr.material.map = screen; else scr.material.color.set(0x1d2a3a);
    scr.position.set(-0.71, 0.62, 0);
    scr.rotation.y = -Math.PI / 2;
    g.add(
      box(0.75, 0.06, 0.75, 0, 0.03, 0, beige), box(0.3, 0.12, 0.3, 0, 0.12, 0, beige),   // swivel base
      box(0.4, 1.15, 1.3, -0.5, 0.62, 0, beige),                                         // front: the bezel
      box(0.9, 0.85, 0.95, 0.15, 0.62, 0, beige),                                        // the deep back
      scr,
      tint(box(0.03, 0.05, 0.05, -0.71, 0.12 + 0.05, 0.5, null), MAT.glow));            // power light
    g.position.set(x1 - 0.95, top, z);
    g.rotation.y = turn;
    return g;
  };
  const [dos, desktop] = typeof document === 'undefined' ? [null, null] : [dosScreen(), win95Screen()];
  // a soda can: the label wraps the side only; the top is plain aluminium
  // with the opening and the tab, the bottom plain too
  const can = (lying, crushed) => {
    const h = crushed ? 0.22 : 0.36, g = new THREE.Group();
    g.add(tint(solid(new THREE.CylinderGeometry(0.11, 0.11, h, 16, 1, true), [0, h / 2 + 0.02, 0]), CAN.side),
      tint(solid(new THREE.CylinderGeometry(0.085, 0.11, 0.04, 16, 1, true), [0, h + 0.04, 0]), CAN.metal),   // the neck
      tint(solid(new THREE.CylinderGeometry(0.11, 0.1, 0.02, 16, 1, true), [0, 0.01, 0]), CAN.metal),
      tint(solid(new THREE.CircleGeometry(0.085, 16).rotateX(-Math.PI / 2), [0, h + 0.06, 0]), CAN.top),
      tint(solid(new THREE.CircleGeometry(0.1, 16).rotateX(Math.PI / 2), [0, 0.001, 0]), CAN.metal));
    if (crushed) g.scale.set(1.08, 1, 0.85);
    return g;
  };
  const soda = (x, z, lying, crushed) => {
    const c = can(lying, crushed);
    if (lying) { c.position.set(x, top + 0.11, z); c.rotation.set(Math.PI / 2, 0, 0.7); }
    else { c.position.set(x, top, z); c.rotation.set(0, 1.3, crushed ? 0.12 : 0); }
    return c;
  };
  // cigarette butts: white paper and a tan filter
  const butt = (x, y, z, turn) => {
    const g = new THREE.Group();
    g.add(cyl(0.022, 0.09, 0, 0, -0.045, MAT.soft, [Math.PI / 2, 0, 0], 6), cyl(0.023, 0.06, 0, 0, 0.03, surface(0xc98a4b, 0.9), [Math.PI / 2, 0, 0], 6));
    g.position.set(x, y + 0.023, z);
    g.rotation.y = turn;
    return g;
  };
  let seed = 31;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tray = [x0 + 0.45, zc - 1.6];
  parts.push(
    say("Both monitors are still on. On the black one, someone's typed a file out to the screen. The last line says: it is in the house.",
      crt(zc - 0.95, 0.12, dos), crt(zc + 0.65, -0.12, desktop)),
    box(0.55, 0.06, 1.5, x0 + 0.4, top - 0.24, zc + 0.6, beige),                       // keyboard
    box(0.4, 0.03, 1.36, x0 + 0.42, top - 0.2, zc + 0.6, keys),                        // its keys
    box(0.75, 0.01, 0.65, x0 + 0.45, top + 0.005, zc + 1.75, MAT.denim),               // mousepad
    box(0.32, 0.1, 0.2, x0 + 0.42, top + 0.06, zc + 1.72, beige, [0, 0.2, 0]),         // mouse
    say("The ashtray is overflowing, and one of the butts is still warm.",
      cyl(0.28, 0.06, tray[0], top + 0.03, tray[1], surface(0x3a4a48, 0.3), null, 14),   // the ashtray
      ...Array.from({ length: 14 }, (_, k) => butt(tray[0] + (rand() - 0.5) * 0.34, top + 0.05 + (k > 8 ? 0.04 : 0), tray[1] + (rand() - 0.5) * 0.34, rand() * 6))),   // overflowing
    butt(x0 + 0.9, top, zc - 0.2, 1.1), butt(x0 + 0.3, top, zc + 1.1, 2.6), butt(x0 + 0.6, top, z0 + 0.3, 0.4),
    butt(x0 + 0.75, top, zc - 1.15, 2.2), butt(x0 + 0.2, top, zc - 1.9, 0.7), butt(x0 + 1.25, top, zc + 1.6, 1.9),
    butt(x0 - 0.9, FLOOR, zc - 0.3, 0.3), butt(x0 - 0.15, FLOOR, zc + 1.9, 1.4), butt(x0 + 0.2, FLOOR, z0 - 0.3, 2.8),
    butt(x0 - 0.6, FLOOR, zc + 0.4, 2), butt(x0 - 0.3, FLOOR, zc - 1.0, 0.9),            // on the floor
    ...[soda(x0 + 0.8, zc - 0.6), soda(x0 + 1.1, z0 + 0.35), soda(x0 + 0.5, zc + 0.15, true), soda(x1 - 0.35, z1 - 0.4, false, true),
      soda(x0 + 1.3, zc + 1.45), soda(x0 + 0.3, zc - 2.2, false, true), soda(x0 + 1.5, zc - 1.95, true), soda(x1 - 0.3, zc - 0.15)]
      .map(c => say("Diet Choke, empty. All of them. Somebody drank these one after another and didn't stop.", c)),
    ...[[x0 - 0.5, zc + 1.2, 2.1], [x0 - 1.0, zc - 0.7, 0.6]].map(([cx2, cz2, turn]) => {        // rolled onto the floor
      const c = can(true); c.position.set(cx2, FLOOR + 0.11, cz2); c.rotation.set(Math.PI / 2, 0, turn); return c;
    }),
    bankersLamp(x0, x1, z0, zc, top),
    // a couple of floppy disks
    box(0.3, 0.01, 0.3, x0 + 0.95, top + 0.005, zc + 0.15, MAT.dark, [0, 0.4, 0]), box(0.3, 0.01, 0.3, x0 + 0.98, top + 0.016, zc + 0.2, MAT.denim, [0, 0.9, 0])
  );
  // the tower, on the floor under the desk at the open end: drive bays, floppy slot, power light
  const tx = x0 + 0.95, tz = z1 - 0.48;
  parts.push(
    box(1.5, 1.55, 0.62, tx, FLOOR + 0.78, tz, beige),
    box(0.02, 0.18, 0.5, tx - 0.76, FLOOR + 1.35, tz, keys), box(0.02, 0.18, 0.5, tx - 0.76, FLOOR + 1.1, tz, keys),   // 5.25" bays
    box(0.02, 0.05, 0.3, tx - 0.76, FLOOR + 0.88, tz, MAT.dark),                                                      // 3.5" slot
    box(0.03, 0.1, 0.1, tx - 0.76, FLOOR + 0.5, tz + 0.15, keys),                                                     // power button
    tint(box(0.02, 0.03, 0.03, tx - 0.76, FLOOR + 0.5, tz - 0.12, null), MAT.glow));                                 // power light
  // a 90s office chair: five-star base, gas post, seat, back
  const chair = new THREE.Group(), fabric = surface(0x3a3d44, 0.9);
  for (let k = 0; k < 5; k++) chair.add(tint(solid(new THREE.BoxGeometry(0.85, 0.08, 0.12), [Math.cos(k * 1.2566) * 0.42, 0.12, Math.sin(k * 1.2566) * 0.42], [0, -k * 1.2566, 0]), MAT.dark));
  chair.add(tint(solid(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 8), [0, 0.7, 0]), MAT.dark),
    tint(solid(new THREE.BoxGeometry(1.5, 0.3, 1.45), [0, 1.4, 0]), fabric),
    tint(solid(new THREE.BoxGeometry(0.14, 1.4, 1.3), [-0.78, 2.3, 0], [0, 0, -0.12]), fabric),
    tint(solid(new THREE.BoxGeometry(0.1, 0.6, 0.1), [-0.7, 1.75, 0]), MAT.dark));
  chair.position.set(X(1160), FLOOR, zc + 0.3);
  chair.rotation.y = 0.25;
  parts.push(chair);
  return named('computer-desk', ...parts);
}

function screenCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// a DOS prompt
function dosScreen() {
  return screenCanvas(128, 96, g => {
    g.fillStyle = '#05070a'; g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#b8b8b8'; g.font = '8px monospace';
    ['C:\\>dir', ' Volume in drive C has no label', ' Directory of C:\\', 'DOOM     EXE', 'AUTOEXECBAT', 'NOTES    TXT', 'HELPME   TXT',
      '        7 file(s)', 'C:\\>type helpme.txt', 'it is in the house', 'C:\\>_'].forEach((l, i) => g.fillText(l, 3, 10 + i * 8));
  });
}

// a teal desktop: icons, a taskbar, an open window
function win95Screen() {
  return screenCanvas(128, 96, g => {
    g.fillStyle = '#008080'; g.fillRect(0, 0, 128, 96);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#e8e0a0'; g.fillRect(6, 6 + i * 18, 10, 9); g.fillStyle = '#ffffff'; g.fillRect(4, 17 + i * 18, 14, 2); }
    g.fillStyle = '#c0c0c0'; g.fillRect(0, 86, 128, 10); g.fillRect(34, 16, 80, 56);
    g.fillStyle = '#000080'; g.fillRect(36, 18, 76, 8);
    g.fillStyle = '#ffffff'; g.fillRect(36, 28, 76, 42);
    g.fillStyle = '#808080';
    for (let y = 32; y < 66; y += 5) g.fillRect(39, y, 30 + (y * 7) % 35, 2);
    g.fillStyle = '#000000'; g.font = 'bold 7px sans-serif'; g.fillText('Start', 3, 94);
  });
}

// a silver can with a red swoosh: Diet Choke
function dietChoke() {
  return screenCanvas(128, 64, g => {
    // silver-white with grey pinstripes, a red ribbon, and the name running up the can
    const grad = g.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0, '#c9c9ce'); grad.addColorStop(0.5, '#f4f4f6'); grad.addColorStop(1, '#c9c9ce');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 64);
    g.strokeStyle = 'rgba(120,120,128,0.35)'; g.lineWidth = 1;
    for (let k = -64; k < 128; k += 5) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 40, 0); g.stroke(); }
    for (const off of [0, 64]) {                                   // both sides of the can
      g.fillStyle = '#c4161c';
      g.beginPath(); g.moveTo(off + 44, 64); g.quadraticCurveTo(off + 38, 30, off + 56, 0); g.lineTo(off + 60, 0); g.quadraticCurveTo(off + 43, 30, off + 49, 64); g.fill();
      g.save(); g.translate(off + 30, 60); g.rotate(-Math.PI / 2);
      g.font = 'bold italic 13px serif'; g.fillText('diet', 0, -10);
      g.font = 'bold 17px serif'; g.fillText('Choke', 0, 6);
      g.restore();
    }
  });
}

// the can's top: aluminium, a rim, the drinking hole and the pull tab
function canTop() {
  return screenCanvas(64, 64, g => {
    g.fillStyle = '#c3c3c8'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#8d8d93'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 29, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#1a1a1c';                                       // the opening
    g.beginPath(); g.ellipse(32, 15, 8, 6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#9c9ca2'; g.lineWidth = 3;                    // the tab, bent up
    g.beginPath(); g.ellipse(32, 30, 7, 11, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#7a7a80'; g.beginPath(); g.arc(32, 32, 2.5, 0, Math.PI * 2); g.fill();   // rivet
  });
}

function bathroom() {
  return named('bathroom',
    toilet(),
    named('shower', block(320, 460, 985, 1068, 0.35), showerGlass(), showerhead()),
    vanity(),
    vanityMirror(),
    bathmat()
  );
}

/* The toilet: tank with its lid and a chrome handle, a rounded bowl
   (a lathe: a profile spun round, squashed to an oval), water, the seat,
   and the lid up against the tank. Faces +z. */
function toilet() {
  const cx = X(365), cz = Z(905), S = 1.35;               // bowl centre; bowls are longer than wide
  const profile = [[0.4, 0], [0.36, 0.25], [0.34, 0.6], [0.48, 1.0], [0.62, 1.28], [0.66, 1.38], [0.6, 1.42],
    [0.52, 1.38], [0.36, 1.05], [0.2, 0.86], [0.001, 0.82]].map(([r, y]) => new THREE.Vector2(r, y));
  const bowl = new THREE.LatheGeometry(profile, 28);
  bowl.scale(1, 1, S);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.27, 20).rotateX(-Math.PI / 2).scale(1, 1, S), surface(0x7d97a0, 0.2));
  water.position.set(cx, FLOOR + 0.93, cz);
  water.userData.keep = true;
  const ellipse = (rx, rz) => {
    const sh = new THREE.Shape();
    sh.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false);
    return sh;
  };
  const ring = ellipse(0.66, 0.66 * S);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, 0.4, 0.4 * S, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const flat = (shape, y, z) => remap(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 24 }),
    (u, v, d) => [cx + u, FLOOR + y + d, z + v]);
  const lidShape = new THREE.Shape();
  lidShape.absellipse(0, 0.64 * S, 0.64, 0.64 * S, 0, Math.PI * 2, false);
  const lid = new THREE.Group();
  lid.add(solid(remap(new THREE.ExtrudeGeometry(lidShape, { depth: 0.06, bevelEnabled: false, curveSegments: 24 }), (u, v, d) => [u, d, v])));
  lid.position.set(cx, FLOOR + 1.48, cz - 0.66 * S + 0.05);
  lid.rotation.x = -1.62;                                    // up, leaning back on the tank
  return named('toilet',
    block(338, 392, 861, 877, 2.6, 1.45),                    // tank
    block(335, 395, 859, 880, 2.7, 2.6),                     // tank lid
    solid(new THREE.BoxGeometry(0.7, 0.45, 0.35), [cx, FLOOR + 1.25, Z(877) + 0.15]),   // where the tank meets the bowl
    tint(solid(bowl, [cx, FLOOR, cz]), MAT.porcelainBoth),
    water,
    solid(flat(ring, 1.42, cz)),                             // seat
    lid,
    tint(solid(new THREE.BoxGeometry(0.28, 0.05, 0.06), [X(347), FLOOR + 2.4, Z(877) + 0.04]), MAT.chrome));   // flush handle
}

/* The vanity: an oak cabinet with two doors and brass knobs, a cultured
   marble top, an oval sink set into it (drawn inside out, like the
   kitchen sink), and a two-handle chrome faucet. */
function vanity() {
  const top = 2.8, cx = 535, cy = 1036, rx = 25, ry = 17;              // the sink, in blueprint px
  const hole = Array.from({ length: 24 }, (_, i) => {
    const a = i / 24 * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
  const bowl = new THREE.SphereGeometry(1, 24, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bowl.scale(rx / K, 0.5, ry / K);
  const fz = Z(1061), chrome = (geo, x, y, z) => tint(solid(geo, [x, FLOOR + y, z]), MAT.chrome);
  const knob = x => tint(solid(new THREE.SphereGeometry(0.06, 8, 6), [X(x), FLOOR + 1.9, Z(1010) - 0.05]), MAT.brass);
  return named('vanity',
    slab([[468, 1012], [600, 1012], [600, 1068], [468, 1068]], [hole], FLOOR, FLOOR + top - 0.15),
    block(474, 532, 1010, 1012, 2.45, 0.3), block(538, 594, 1010, 1012, 2.45, 0.3),          // cabinet doors
    knob(522), knob(548),
    tint(slab([[465, 1009], [603, 1009], [603, 1068], [465, 1068]], [hole], FLOOR + top - 0.15, FLOOR + top), MAT.porcelain),
    tint(solid(bowl, [X(cx), FLOOR + top, Z(cy)]), MAT.bowl),
    tint(solid(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 10), [X(cx), FLOOR + top - 0.495, Z(cy)]), MAT.dark),   // drain
    chrome(new THREE.BoxGeometry(0.9, 0.05, 0.18), X(cx), top + 0.025, fz),                // faucet plate
    chrome(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 8), X(cx), top + 0.15, fz),
    chrome(new THREE.BoxGeometry(0.07, 0.06, 0.4), X(cx), top + 0.25, fz - 0.2),             // spout
    chrome(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 8), X(cx) - 0.4, top + 0.12, fz),   // hot
    chrome(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 8), X(cx) + 0.4, top + 0.12, fz));  // cold
}

/* Frosted glass on the shower, in brass frames. A tiny picture of fine
   grain, drawn when the game starts, gives the surface a light texture
   that catches the bathroom light. */
function showerGlass() {
  const y0 = FLOOR + 0.35, y1 = FLOOR + 6.6, h = y1 - y0, TILE = 1.2;
  const mat = new THREE.MeshStandardMaterial({
    color: 0xdde5e8, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.72,
    depthWrite: false, side: THREE.DoubleSide
  });
  if (typeof document !== 'undefined') {
    mat.bumpMap = grain();
    mat.bumpScale = 0.4;
  }
  const pane = (len, x, z, turn) => {
    const geo = new THREE.PlaneGeometry(len, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / TILE, uv.getY(i) * h / TILE);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, (y0 + y1) / 2, z);
    m.rotation.y = turn;
    m.layers.set(GLASS_LAYER);
    m.userData.keep = m.userData.noShadow = true;
    return m;
  };
  const bar = (w, ht, d, x, y, z) => tint(solid(new THREE.BoxGeometry(w, ht, d), [x, y, z]), MAT.brass);
  const n = Z(985), e = X(460), w0 = X(322), xd = X(398);
  const ns = Z(987), ne = Z(1066);
  // the door: hinged on the post at xd, swinging out into the bathroom
  const dw = e - xd - 0.06, yc = (y0 + y1) / 2;
  const door = named('door-shower',
    pane(dw - 0.08, dw / 2, 0, 0),
    bar(0.06, h, 0.06, dw - 0.03, yc, 0), bar(dw, 0.06, 0.06, dw / 2, y1 - 0.06, 0), bar(dw, 0.05, 0.06, dw / 2, y0 + 0.06, 0),
    bar(0.05, 0.8, 0.26, dw - 0.25, FLOOR + 3.6, 0));                                      // handle
  door.position.set(xd + 0.03, 0, n);
  openable(door, v => { door.rotation.y = v * 1.5; });
  return named('shower-glass',
    pane(xd - w0, (w0 + xd) / 2, n, 0),
    pane(ne - ns, e, (ns + ne) / 2, Math.PI / 2),
    // frames: posts at the ends, by the door and in the corner; rails top and bottom
    bar(0.08, h, 0.08, w0, yc, n), bar(0.08, h, 0.08, xd, yc, n), bar(0.08, h, 0.08, e, yc, n), bar(0.08, h, 0.08, e, yc, ne),
    bar(xd - w0, 0.08, 0.08, (w0 + xd) / 2, y1, n), bar(xd - w0, 0.06, 0.08, (w0 + xd) / 2, y0 + 0.03, n),
    bar(e - xd, 0.08, 0.08, (xd + e) / 2, y1 + 0.08, n),                                  // header over the door
    bar(0.08, 0.08, ne - ns, e, y1, (ns + ne) / 2), bar(0.08, 0.06, ne - ns, e, y0 + 0.03, (ns + ne) / 2),
    door);
}

// a tile of fine grain, as heights (it wraps)
function grain() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  let seed = 5;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + rand() * 16;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// chrome shower arm and head on the back wall
function showerhead() {
  const wz = Z(1068), x = X(390);
  const head = new THREE.CylinderGeometry(0.2, 0.1, 0.12, 12);
  head.rotateX(-0.5);
  return tint(new THREE.Group().add(
    solid(new THREE.BoxGeometry(0.06, 0.06, 0.55), [x, FLOOR + 6.35, wz - 0.27]),
    solid(head, [x, FLOOR + 6.28, wz - 0.58])), MAT.chrome);
}

// a fuzzy mauve bathmat with soft rounded corners, in front of the shower
function bathmat() {
  const x0 = X(345), x1 = X(432), z0 = Z(950), z1 = Z(981), r = 0.25;
  const sh = new THREE.Shape();
  sh.moveTo(x0 + r, z0); sh.lineTo(x1 - r, z0); sh.quadraticCurveTo(x1, z0, x1, z0 + r);
  sh.lineTo(x1, z1 - r); sh.quadraticCurveTo(x1, z1, x1 - r, z1); sh.lineTo(x0 + r, z1);
  sh.quadraticCurveTo(x0, z1, x0, z1 - r); sh.lineTo(x0, z0 + r); sh.quadraticCurveTo(x0, z0, x0 + r, z0);
  const geo = remap(new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.03, bevelSegments: 2, curveSegments: 6 }),
    (u, v, d) => [u, FLOOR + d + 0.015, v]);
  return named('bathmat', tint(solid(geo), MAT.mauve));
}

// a wood-framed mirror on the wall over the bathroom sink
function vanityMirror() {
  const wallZ = Z(1068), u0 = X(492), u1 = X(578), y0 = FLOOR + 3.5, y1 = FLOOR + 6.35, b = 0.16;
  return named('mirror',
    paneFrame((u, y, w) => [u, y, wallZ - w], u0, u1, y0, y1, 0.06, { border: b, depth: 0.12, mat: MAT.furniture }),
    mirror(u0 + b, u1 - b, y0 + b, y1 - b, wallZ - 0.07));
}

function laundry() {
  return named('laundry',
    washer(620, 680),
    dryer(686, 746),
    named('shelf', block(614, 807, 825, 860, 5.4, 5.2), ...laundryShelf()),
    walkInCloset()
  );
}

// up on the laundry shelf: bottles of Tried and YEP, and a green laundry basket of folded clothes
function laundryShelf() {
  const y = FLOOR + 5.4;
  return [say("Tried and YEP. The YEP is nearly empty, and you can't remember the last time anyone did a load.",
    ...detergent(X(634), y, Z(841), DETERGENTS.tried), ...detergent(X(661), y, Z(841), DETERGENTS.yep)),
  say("Clean laundry, folded and stacked. None of it is in your size.", ...laundryBasket(X(724), y, Z(842)))];
}

/* A liquid detergent bottle: an oval body (round-shouldered, oval from
   above), a collar and a big ridged cap on top, a thin handle looping out
   from the upper right and back into the shoulder, and a label wrapped
   round the front. Centred on (cx, cz), standing at y0.
   look = { body, cap, label: (g) => draws the label }. */
function detergent(cx, y0, cz, look) {
  const H = 0.9, oval = 0.62;                                             // height to the neck; front-to-back squash
  const profile = [[0.001, 0], [0.24, 0], [0.27, 0.025], [0.28, 0.07], [0.28, 0.6], [0.265, 0.68], [0.21, 0.77],
    [0.14, 0.84], [0.12, 0.87], [0.12, H]].map(([r, h]) => new THREE.Vector2(r, h));
  const body = new THREE.LatheGeometry(profile, 24).scale(1, 1, oval);
  // the handle: a thin tube from the body's side, out, up and back into the shoulder
  const loop = new THREE.CatmullRomCurve3([[0.2, 0.42], [0.33, 0.46], [0.4, 0.57], [0.38, 0.69], [0.28, 0.77], [0.15, 0.81]]
    .map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const handle = new THREE.TubeGeometry(loop, 24, 0.036, 8, false).scale(1, 1, 1.5);
  const label = surface(0xffffff, 0.6);
  if (typeof document !== 'undefined') label.map = screenCanvas(64, 72, look.label); else label.color.set(0x16245e);
  const wrap = new THREE.CylinderGeometry(0.283, 0.283, 0.46, 16, 1, true, -0.85, 1.7).scale(1, 1, oval);
  return [
    tint(solid(body, [cx, y0, cz]), look.body),
    tint(solid(handle, [cx, y0, cz]), look.body),
    tint(solid(wrap, [cx, y0 + 0.33, cz]), label),
    tint(solid(new THREE.CylinderGeometry(0.135, 0.14, 0.06, 20), [cx, y0 + H + 0.03, cz]), look.body),   // collar
    tint(solid(new THREE.CylinderGeometry(0.125, 0.125, 0.17, 12), [cx, y0 + H + 0.145, cz]), look.cap)     // ridged cap
  ];
}

const DETERGENTS = {
  tried: {                                     // orange, navy cap, a yellow bullseye, TRIED
    body: surface(0xe0601c, 0.4), cap: surface(0x1c2240, 0.5),
    label: g => {
      g.fillStyle = '#e0601c'; g.fillRect(0, 0, 64, 72);
      for (const [rad, col] of [[34, '#f08a1c'], [26, '#f6c21c'], [18, '#fbe6a0'], [10, '#f6c21c']]) {
        g.fillStyle = col; g.beginPath(); g.arc(34, 38, rad, 0, 7); g.fill();
      }
      g.fillStyle = '#1c2a78'; g.font = 'bold italic 8px sans-serif'; g.fillText('LIQUID', 6, 26);
      g.font = 'bold italic 21px sans-serif'; g.lineWidth = 3; g.strokeStyle = '#ffffff';
      g.strokeText('Tried', 3, 50); g.fillText('Tried', 3, 50);
      g.font = '5px sans-serif'; g.fillText('LAUNDRY DETERGENT', 8, 62);
    }
  },
  yep: {                                       // navy blue, orange stripes, a price tag, YEP
    body: surface(0x1f3a8a, 0.4), cap: surface(0x1f3a8a, 0.45),
    label: g => {
      g.fillStyle = '#16245e'; g.fillRect(0, 0, 64, 72);
      for (const [c, k] of [['#f08a1c', 0], ['#f6b21c', 8], ['#e85c1a', 16]]) {
        g.fillStyle = c; g.beginPath(); g.moveTo(10 + k, 40); g.lineTo(30 + k, 4); g.lineTo(38 + k, 4); g.lineTo(18 + k, 40); g.fill();
      }
      g.fillStyle = '#f6e04a'; g.fillRect(2, 8, 26, 10);
      g.fillStyle = '#c4161c'; g.font = 'bold 8px sans-serif'; g.fillText('$3.29', 3, 16);
      g.fillStyle = '#f6e04a'; g.font = 'bold 7px sans-serif'; g.fillText('2 in One', 4, 36);
      g.fillStyle = '#ffffff'; g.font = 'bold 22px sans-serif'; g.fillText('YEP', 6, 60);
      g.font = '5px sans-serif'; g.fillText('ULTRA  50 OZ', 10, 69);
    }
  }
};

/* A green plastic laundry basket: sloped sides, each a grid of square
   holes in panels, a rolled lip round the top, and folded clothes stacked
   flat inside. */
function laundryBasket(bx, y0, zc) {
  const W0 = 2.0, D0 = 1.0, H = 0.8, t = 0.035, flare = 0.1, green = surface(0x2f6b45, 0.55);
  const hw = v => W0 / 2 + flare * v / H, hd = v => D0 / 2 + flare * v / H;
  // a side: a flat panel with rows of square holes, then bent into place
  const side = (len, panels, cols, place) => {
    const sh = new THREE.Shape();
    sh.moveTo(-len / 2, 0); sh.lineTo(len / 2, 0); sh.lineTo(len / 2, H); sh.lineTo(-len / 2, H);
    const m = 0.1, rib = 0.08, pw = (len - 2 * m - rib * (panels - 1)) / panels, bar = 0.03, rows = 4;
    const hwid = (pw - bar * (cols - 1)) / cols, hh = (H - 0.22 - bar * (rows - 1)) / rows;
    for (let p = 0; p < panels; p++) for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const a = -len / 2 + m + p * (pw + rib) + c * (hwid + bar), b = 0.1 + r * (hh + bar);
      const hole = new THREE.Path();
      hole.moveTo(a, b); hole.lineTo(a + hwid, b); hole.lineTo(a + hwid, b + hh); hole.lineTo(a, b + hh);
      sh.holes.push(hole);
    }
    return tint(solid(remap(new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }), place)), green);
  };
  const parts = [
    tint(solid(new THREE.BoxGeometry(W0, t, D0), [bx, y0 + t / 2, zc]), green),                       // floor
    ...[-1, 1].map(s => side(W0, 3, 4, (u, v, d) => [bx + u * hw(v) / (W0 / 2), y0 + v, zc + s * (hd(v) - d)])),
    ...[-1, 1].map(s => side(D0 - 2 * t, 1, 3, (u, v, d) => [bx + s * (hw(v) - d), y0 + v, zc + u * (hd(v) - t) / (D0 / 2 - t)]))
  ];
  // the rolled lip
  const lip = 0.06, top = y0 + H;
  parts.push(
    tint(solid(new THREE.BoxGeometry(2 * hw(H) + 2 * lip, 0.05, lip), [bx, top, zc - hd(H) - lip / 2 + 0.02]), green),
    tint(solid(new THREE.BoxGeometry(2 * hw(H) + 2 * lip, 0.05, lip), [bx, top, zc + hd(H) + lip / 2 - 0.02]), green),
    tint(solid(new THREE.BoxGeometry(lip, 0.05, 2 * hd(H)), [bx - hw(H) - lip / 2 + 0.02, top, zc]), green),
    tint(solid(new THREE.BoxGeometry(lip, 0.05, 2 * hd(H)), [bx + hw(H) + lip / 2 - 0.02, top, zc]), green));
  // folded clothes: two neat stacks
  const looks = [MAT.denim, MAT.cream, MAT.flannel, MAT.soft, MAT.teal, MAT.mustard, MAT.plum];
  let k = 0;
  for (const dx of [-0.45, 0.45]) {
    for (let n = 0; n < 4; n++) {
      parts.push(tint(solid(new THREE.BoxGeometry(0.82, 0.1, 0.72), [bx + dx + (n % 2 ? 0.03 : -0.02), y0 + t + 0.05 + n * 0.105, zc + (n % 3 - 1) * 0.02],
        [0, (n % 2 ? 0.05 : -0.04), 0]), looks[k++ % looks.length]));
    }
  }
  return parts;
}

/* The walk-in closet: on each side a white shelf on brackets, a chrome
   rod hung under it, clothes on hangers (90s flannel, denim, a long
   coat...), and a few boxes up on the shelf. */
function walkInCloset() {
  const parts = [], hangers = [];
  const looks = [MAT.flannel, MAT.denim, MAT.hunter, MAT.mustard, MAT.plum, MAT.cream, MAT.dark, MAT.teal];
  let seed = 9;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // garment outlines, hanging from the shoulders: shirt, long coat, trousers folded over the bar
  const outline = (half, len, flare) => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.15, 0); sh.lineTo(-half, -0.12); sh.lineTo(-half - 0.04, -0.5); sh.lineTo(-half + flare, -len);
    sh.lineTo(half - flare, -len); sh.lineTo(half + 0.04, -0.5); sh.lineTo(half, -0.12); sh.lineTo(0.15, 0);
    return new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false }).translate(0, 0, -0.05);
  };
  const kinds = [() => outline(0.6, 2.3, 0.04), () => outline(0.64, 3.4, -0.06), () => outline(0.4, 1.4, 0.06)];
  const shelfY = 5.95, rodY = 5.55;
  for (const { wall, rod, dir } of [{ wall: 614, rod: 644, dir: 1 }, { wall: 807, rod: 777, dir: -1 }]) {
    const out = wall + dir * 44;                                 // front edge of the shelf
    parts.push(block(Math.min(wall, out), Math.max(wall, out), 985, 1068, shelfY + 0.08, shelfY));
    const rx = X(rod);
    for (const yb of [990, 1027, 1063]) {
      // bracket: a triangle off the wall under the shelf, and a hanger down to the rod
      const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.35, 0), new THREE.Vector2(0, -0.6)]);
      parts.push(solid(remap(new THREE.ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: false }),
        (u, v, d) => [X(wall) + dir * u, FLOOR + shelfY + v, Z(yb) + d - 0.02])));
      parts.push(solid(new THREE.BoxGeometry(0.03, shelfY - rodY, 0.03), [rx, FLOOR + (shelfY + rodY) / 2, Z(yb)]));
    }
    const bar = new THREE.CylinderGeometry(0.04, 0.04, Z(1066) - Z(987), 8);
    bar.rotateX(Math.PI / 2);
    parts.push(tint(solid(bar, [rx, FLOOR + rodY, (Z(987) + Z(1066)) / 2]), MAT.chrome));
    // clothes
    for (let i = 0; i < 9; i++) {
      const z = Z(992) + i * (Z(1061) - Z(992)) / 8 + (rand() - 0.5) * 0.06;
      const top = FLOOR + rodY - 0.12;
      parts.push(tint(solid(kinds[Math.floor(rand() * kinds.length)](), [rx, top, z], [0, (rand() - 0.5) * 0.25, 0]),
        looks[Math.floor(rand() * looks.length)]));
      hangers.push([[rx, FLOOR + rodY + 0.06, z], [rx, top, z]],
        [[rx - 0.6, top - 0.1, z], [rx, top, z]], [[rx, top, z], [rx + 0.6, top - 0.1, z]], [[rx - 0.6, top - 0.1, z], [rx + 0.6, top - 0.1, z]]);
    }
    // boxes up on the shelf
    for (const [yc, w, h, mat] of [[1000, 0.9, 0.45, MAT.cream], [1030, 1.0, 0.35, MAT.denim], [1031, 0.8, 0.3, MAT.flannel]]) {
      parts.push(tint(solid(new THREE.BoxGeometry(1.0, h, w), [X(wall) + dir * 0.75, FLOOR + shelfY + 0.08 + h / 2 + (yc === 1031 ? 0.35 : 0), Z(yc)]), mat));
    }
    // two shoeboxes stacked, each with its lid
    for (const [k, body, lid] of [[0, surface(0xd2691e, 0.8), MAT.dark], [1, MAT.soft, MAT.denim]]) {
      const yb = FLOOR + shelfY + 0.08 + k * 0.46, xc = X(wall) + dir * 0.7;
      parts.push(tint(solid(new THREE.BoxGeometry(1.0, 0.38, 0.62), [xc, yb + 0.19, Z(1054)], [0, k * 0.08, 0]), body),
                 tint(solid(new THREE.BoxGeometry(1.04, 0.07, 0.66), [xc, yb + 0.41, Z(1054)], [0, k * 0.08, 0]), lid));
    }
  }
  return named('closet-shelves', ...parts, lines(hangers, new THREE.LineBasicMaterial({ color: 0x8a8f94 })));
}

/* Old school machines, backed up near the wall: a top-loading washer
   whose lid lifts, and a dryer with a square door on the front. Both
   are hollow with a drum inside, for anomalies:
     scene.getObjectByName('washer-lid').userData.setOpen(1)
     scene.getObjectByName('dryer-door').userData.setOpen(1) */
const MACHINE = { back: 829, front: 886, h: 3, s: 0.08 };

// the box both machines are built in: sides, back, base, and the
// control panel along the back with two knobs
function machine(px0, px1) {
  const { h, s } = MACHINE, zb = Z(MACHINE.back), zf = Z(MACHINE.front);
  const x0 = X(px0), x1 = X(px1), W = x1 - x0, D = zf - zb, cx = (x0 + x1) / 2, zc = (zb + zf) / 2;
  const box = (w, ht, d, x, y, z) => solid(new THREE.BoxGeometry(w, ht, d), [x, FLOOR + y, z]);
  const knob = x => tint(solid(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), [x, FLOOR + h + 0.25, zb + 0.34], [Math.PI / 2, 0, 0]), MAT.dark);
  // (parts just meet, never overlap face to face, so nothing flickers)
  const lo = h - s, sz = zb + (D - s) / 2;
  const parts = [
    box(s, lo, D - s, x0 + s / 2, lo / 2, sz), box(s, lo, D - s, x1 - s / 2, lo / 2, sz),    // sides
    box(W - 2 * s, lo, s, cx, lo / 2, zb + s / 2),                                         // back
    box(W - 2 * s, 0.4, D - 2 * s, cx, 0.2, zc),                                           // base
    box(W, 0.68, 0.3, cx, lo + 0.34, zb + 0.15),                                           // control panel
    knob(cx - 0.6), knob(cx + 0.55)
  ];
  return { parts, box, x0, x1, W, D, cx, zb, zf };
}

function washer(px0, px1) {
  const { h, s } = MACHINE;
  const { parts, box, W, cx, zb, zf } = machine(px0, px1);
  const deckZ0 = zb + 0.3, dd = zf - deckZ0, R = 0.75, dz = deckZ0 + dd / 2;
  // the top deck, with a round hole for the tub
  const deck = new THREE.Shape();
  deck.moveTo(-W / 2, -dd / 2); deck.lineTo(W / 2, -dd / 2); deck.lineTo(W / 2, dd / 2); deck.lineTo(-W / 2, dd / 2);
  const hole = new THREE.Path();
  hole.absarc(0, 0, R, 0, Math.PI * 2, false);
  deck.holes.push(hole);
  const deckGeo = remap(new THREE.ExtrudeGeometry(deck, { depth: s, bevelEnabled: false, curveSegments: 20 }),
    (u, v, d) => [cx + u, FLOOR + h - s + d, dz + v]);
  const tubH = h - s - 0.5;
  const lid = named('washer-lid',
    solid(new THREE.BoxGeometry(W - 0.12, 0.05, dd - 0.06), [0, 0.025, (dd - 0.06) / 2]),
    solid(new THREE.BoxGeometry(0.5, 0.05, 0.07), [0, 0.03, dd - 0.05]));       // lip to lift it by
  lid.position.set(cx, FLOOR + h, deckZ0);
  return named('washer', ...parts,
    box(W, h - s, s, cx, (h - s) / 2, zf - s / 2),                                // front
    solid(deckGeo),
    tint(solid(new THREE.CylinderGeometry(R - 0.03, R - 0.03, tubH, 20, 1, true), [cx, FLOOR + 0.5 + tubH / 2, dz]), MAT.drum),
    tint(solid(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.04, 20), [cx, FLOOR + 0.5, dz]), MAT.drum),
    tint(solid(new THREE.CylinderGeometry(0.12, 0.22, 1.4, 10), [cx, FLOOR + 1.2, dz]), MAT.soft),   // agitator
    openable(lid, t => { lid.rotation.x = -t * 85 * Math.PI / 180; }));
}

function dryer(px0, px1) {
  const { h, s } = MACHINE;
  const { parts, box, W, D, cx, zb, zf } = machine(px0, px1);
  const DY = 1.6, half = 0.675, R = 0.95;
  // the front, with a square hole for the door
  const face = new THREE.Shape();
  face.moveTo(-W / 2, 0); face.lineTo(W / 2, 0); face.lineTo(W / 2, h); face.lineTo(-W / 2, h);
  const hole = new THREE.Path();
  hole.moveTo(-half, DY - half); hole.lineTo(half, DY - half); hole.lineTo(half, DY + half); hole.lineTo(-half, DY + half);
  face.holes.push(hole);
  const faceGeo = remap(new THREE.ExtrudeGeometry(face, { depth: s, bevelEnabled: false }),
    (u, y, d) => [cx + u, FLOOR + y, zf - s + d]);
  const len = D - 2 * s - 0.05, drumZ = zf - s - len / 2;
  const drum = new THREE.CylinderGeometry(R, R, len, 20, 1, true);
  drum.rotateX(Math.PI / 2);
  const back = new THREE.CylinderGeometry(R, R, 0.04, 20);
  back.rotateX(Math.PI / 2);
  const fins = [0, 2.1, 4.2].map(a => tint(solid(new THREE.BoxGeometry(0.1, 0.16, len * 0.9),
    [cx + Math.sin(a) * (R - 0.08), FLOOR + DY + Math.cos(a) * (R - 0.08), drumZ], [0, 0, -a]), MAT.drum));
  const door = named('dryer-door',
    solid(new THREE.BoxGeometry(1.5, 1.5, 0.1), [0.75, FLOOR + DY, 0.05]),
    solid(new THREE.BoxGeometry(0.08, 0.4, 0.08), [1.36, FLOOR + DY, 0.13]));   // handle
  door.position.set(cx - 0.75, 0, zf);                                         // hinged on its left
  return named('dryer', ...parts,
    box(W, s, D - 0.3 - s, cx, h - s / 2, zb + 0.3 + (D - 0.3 - s) / 2),        // top
    solid(faceGeo),
    tint(solid(drum, [cx, FLOOR + DY, drumZ]), MAT.drum),
    tint(solid(back, [cx, FLOOR + DY, drumZ - len / 2]), MAT.drum),
    ...fins,
    openable(door, t => { door.rotation.y = -t * 100 * Math.PI / 180; }));
}

function foyer() {
  return named('foyer', named('bench', block(155, 270, 745, 780, 1.6)));
}

/* ─── porches ───────────────────────────────── */

/* A craftsman porch column: square, tapering toward the top, with a cap
   and a base; out front it stands on a stone pier. */
function column(px, py, y0, y1, pier = false) {
  const x = X(px), z = Z(py), h = y1 - y0, parts = [];
  if (pier) parts.push(tint(solid(new THREE.BoxGeometry(1.25, y0, 1.25), [x, y0 / 2, z]), STONE),
    tint(solid(new THREE.BoxGeometry(1.4, 0.12, 1.4), [x, y0 + 0.06, z]), STONE));
  const taper = new THREE.CylinderGeometry(0.32 * Math.SQRT2, 0.5 * Math.SQRT2, h - 0.5, 4).rotateY(Math.PI / 4);
  parts.push(tint(solid(taper, [x, y0 + 0.2 + (h - 0.5) / 2, z]), MAT.trim),
    tint(solid(new THREE.BoxGeometry(1.1, 0.2, 1.1), [x, y0 + 0.1, z]), MAT.trim),                 // base
    tint(solid(new THREE.BoxGeometry(0.8, 0.3, 0.8), [x, y1 - 0.15, z]), MAT.trim));               // cap
  const g = new THREE.Group();
  g.add(...parts);
  return g;
}

function porches() {
  const parts = [];
  const beamLo = CEIL - 0.8;

  // back porch (top right of the plan)
  parts.push(block(738, 1256, 154, 345, FLOOR, FLOOR - 0.6, 0));                  // deck
  parts.push(column(987.5, 163.5, 0, beamLo), column(1247, 163.5, 0, beamLo));
  parts.push(block(738, 1256, 154, 173, CEIL, beamLo, 0), block(1237, 1256, 173, 345, CEIL, beamLo, 0));
  parts.push(rail('h', 163, 738, 815), rail('h', 163, 905, 982), rail('h', 163, 993, 1241), rail('v', 1247, 169, 345));
  for (let i = 0; i < 3; i++) {                                                   // steps down to the yard
    parts.push(block(815, 905, 154 - (i + 1) * K, 154 - i * K, FLOOR - 0.625 * (i + 1), 0, 0));
  }
  const table = named('porch-table', round(1167, 250, 1.7, 2.4, 2.25, 16), round(1167, 250, 0.15, 2.25, 0, 6));
  parts.push(table,
    at(chair(), 1167, 202, 0), at(chair(), 1167, 298, 180), at(chair(), 1120, 250, 90), at(chair(), 1214, 250, -90));

  // front porch (far left of the plan)
  parts.push(block(0, 105, 482, 814, FLOOR, FLOOR - 0.6, 0));
  parts.push(column(5.5, 491, FLOOR + 1.6, beamLo, true), column(5.5, 805, FLOOR + 1.6, beamLo, true));
  parts.push(block(0, 11, 482, 814, CEIL, beamLo, 0));
  for (let i = 0; i < 3; i++) {
    parts.push(block(-(i + 1) * K, -i * K, 593, 703, FLOOR - 0.625 * (i + 1), 0, 0));
  }
  return named('porches', ...parts);
}

/* The front porch's lantern, by the door, and a rocking chair. */
function frontPorch(lamps) {
  const wx = X(105), lx = wx - 0.32, ly = FLOOR + 6.3, lz = Z(717);
  const lantern = named('lamp-porch',
    solid(new THREE.BoxGeometry(0.34, 0.08, 0.08), [wx - 0.17, ly + 0.3, lz]),        // bracket
    solid(new THREE.BoxGeometry(0.52, 0.1, 0.52), [lx, ly + 0.4, lz]),                // cap
    solid(new THREE.ConeGeometry(0.2, 0.18, 4), [lx, ly + 0.54, lz], [0, Math.PI / 4, 0]),
    glow(new THREE.BoxGeometry(0.4, 0.64, 0.4), lx, ly, lz),                          // the glass, lit
    solid(new THREE.BoxGeometry(0.46, 0.06, 0.46), [lx, ly - 0.35, lz]),              // base
    bulb(lamps, 'lamp-porch-light', 105 - 0.45 * K, 717, 6.3, 34));
  // its own frame mustn't shadow the lamp inside it
  lantern.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  return named('front-porch', lantern, at(rockingChair(), 50, 764, -75, FLOOR));
}

// A wooden rocking chair, facing +z in its own space.
function rockingChair() {
  const W = 1.8, R = 3.2, arc = 0.9, side = W / 2 - 0.1;
  const rocker = sx => {
    const geo = new THREE.TorusGeometry(R, 0.06, 4, 14, arc);
    geo.rotateZ(-Math.PI / 2 - arc / 2);     // middle of the curve at the bottom
    geo.rotateY(Math.PI / 2);                // into the front-back plane
    geo.translate(sx * side, R + 0.06, 0);
    return solid(geo);
  };
  const back = new THREE.Group();            // leans back from the seat
  back.add(
    solid(new THREE.BoxGeometry(0.12, 2.3, 0.12), [-side, 1.15, 0]),
    solid(new THREE.BoxGeometry(0.12, 2.3, 0.12), [side, 1.15, 0]),
    solid(new THREE.BoxGeometry(W, 0.3, 0.1), [0, 2.2, 0]),
    ...[-0.45, -0.15, 0.15, 0.45].map(x => solid(new THREE.BoxGeometry(0.06, 2, 0.06), [x, 1.05, 0])));
  back.position.set(0, 1.55, -0.72);
  back.rotation.x = -0.22;
  const g = named('rocking-chair',
    rocker(-1), rocker(1),
    solid(new THREE.BoxGeometry(W, 0.12, 1.6), [0, 1.55, 0.05]),                       // seat
    ...[-1, 1].flatMap(sx => [
      solid(new THREE.BoxGeometry(0.12, 2.2, 0.12), [sx * side, 1.2, 0.65]),           // front post, up to the arm
      solid(new THREE.BoxGeometry(0.12, 1.45, 0.12), [sx * side, 0.82, -0.7]),         // back leg
      solid(new THREE.BoxGeometry(0.14, 0.08, 1.6), [sx * (W / 2 - 0.05), 2.32, -0.02])  // arm
    ]),
    back);
  return g;
}

/* ─── the yard ──────────────────────────────── */

/* The front walk's line: from the porch steps, winding down to the road. */
const WALK = new THREE.CatmullRomCurve3([[-27.8, 1.0], [-35, 2.2], [-45, 6.5], [-57, 8.5], [-68, 5.0], [-78, -2.5], [-90, -6], [-100, -4.5], [-105.4, -3]]
  .map(([x, z]) => new THREE.Vector3(x, 0, z)));
const WALK_PTS = WALK.getSpacedPoints(80);
/* The driveway: a short gravel pull-off down by the road, south of the
   walk. You park at the bottom and walk up the hill to the house, like
   plenty of country places. DRIVE is roughly where it is, for levelling
   the ground and keeping trees off it. */
const DRIVE = { x0: -107, x1: -84, z0: 4, z1: 36 };
const ROAD = [-130, -106];                              // the road's x range, in feet

// how far (x, z) is from the walk's centre line (or another line of points)
function walkDistance(x, z, pts = WALK_PTS) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return best;
}

/* How high the floor is under (x, z), for walking around in first person:
   the house and its porches are at FLOOR, the porch steps step down,
   everywhere else is the land. */
const FOOTPRINT = [[295, 154], [738, 154], [738, 345], [1256, 345], [1256, 1087], [295, 1087], [295, 814], [105, 814], [105, 482], [295, 482]];
function inside(px, py, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
export function walkHeight(x, z) {
  const px = x * K + 680.5, py = z * K + 620.5;
  if (inside(px, py, FOOTPRINT) || (px >= 0 && px <= 105 && py >= 482 && py <= 814) || (px >= 738 && px <= 1256 && py >= 154 && py <= 345)) return FLOOR;
  if (py >= 593 && py <= 703 && px < 0 && px >= -3 * K) return FLOOR - 0.625 * (Math.floor(-px / K) + 1);             // front steps
  if (px >= 815 && px <= 905 && py < 154 && py >= 154 - 3 * K) return FLOOR - 0.625 * (Math.floor((154 - py) / K) + 1);   // back steps
  return groundHeight(x, z);
}

/* What you see when you look closely at things (first person, E). Keyed
   by the name of the thing; anything else with userData.inspect works
   the same way. */
export const INSPECT = {
  'pizza-boxes': "Looks like someone had a pizza party. There are still a few slices left, but they're rock hard.",
  'bed': "The covers are turned back on one side, like someone just got up. The sheets are cold.",
  'bookshelf': "Old paperbacks. One lies open, a line circled in red ink: they only come in when you stop watching.",
  'wood-stove': "The fire's still going. Someone fed it not long ago.",
  'fire': "The logs hiss and pop. You don't remember anyone lighting it.",
  'mirror': "You look tired. For a second you'd swear your reflection moved before you did.",
  'toilet': "The seat is up. The water in the bowl is perfectly still.",
  'dish-drainer': "Four plates, washed and drying. Somebody's been eating here.",
  'rocking-chair': "It's still rocking, just a little. There's no wind tonight.",
  'fridge-memo': "A to-do list. The last line has been gone over again and again, pressed so hard the pen tore through: who moved the chair??",
  'closet-shelves': "Flannel shirts and a long coat. The coat pockets are full of dirt.",
  'mailbox': "Empty. The little red flag is up anyway.",
  'pantry-shelves': "Cans and boxes. Every label has been turned to face the wall.",
  'shower': "The glass is fogged up. From the inside.",
  'washer': "The washer is still warm. The cycle finished hours ago.",
  'sofa': "The afghan smells like cigarettes and somebody's perfume. The cushions still hold the shape of someone sitting.",
  'newspaper': "Yesterday's paper. No. The date says next Tuesday.",
  'cooktop': "One of the burners is still warm.",
  'lamp-pillar': "A gaudy little Tiffany lamp. The bulb flickers when you lean in close.",
  'fridge': "The fridge hums. Something inside it ticks, then stops.",
  'stereo': "The receiver's dial is lit, tuned between stations. Under the hiss, very faintly, someone is counting.",
  'fiddle-fig': "The soil is wet. Somebody watered it today. One leaf has been torn in half and laid neatly on the soil.",
};

/* The lie of the land, in feet: flat round the house, falling away
   gently toward the road out front (so the walk goes up to the house),
   rolling further off, and low hills on the horizon. The walk and the
   road are smoothed flat into it. */
function groundHeight(x, z) {
  const ss = THREE.MathUtils.smoothstep;
  const out = Math.hypot(Math.max(0, -32 - x, x - 26), Math.max(0, -24 - z, z - 22));   // outside the house's flat patch
  const fall = -0.075 * THREE.MathUtils.clamp(-40 - x, 0, 64);
  const drive = Math.hypot(Math.max(0, DRIVE.x0 - x, x - DRIVE.x1), Math.max(0, DRIVE.z0 - z, z - DRIVE.z1));
  const keep = ss(out, 2, 30) * ss(walkDistance(x, z), 5, 16) * ss(Math.abs(x - (ROAD[0] + ROAD[1]) / 2), 15, 28)
    * ss(drive, 3, 14);
  const roll = 3.5 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.04 - 0.7) + 1.8 * Math.sin(x * 0.11 + z * 0.08);
  const a = Math.atan2(z, x), hills = ss(Math.hypot(x, z), 140, 270) * (30 + 14 * Math.sin(a * 3 + 0.8) + 8 * Math.sin(a * 7));
  return fall + keep * (roll + hills);
}

function ground() {
  // the land: a big sheet shaped by groundHeight(); no ink edges
  const geo = new THREE.PlaneGeometry(640, 640, 160, 160).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  return named('ground', new THREE.Mesh(geo, MAT.ground));
}

/* The road out front, running past the house: asphalt, concrete curbs,
   a dashed yellow line down the middle. ROAD is its x range, in feet. */
/* A country road: worn asphalt with a faded centre line, crumbling into
   gravel shoulders that fade into the grass. No curbs out here. */
const ROAD_HALF = (ROAD[1] - ROAD[0]) / 2 - 2, ROAD_X = (ROAD[0] + ROAD[1]) / 2;
// what the ground looks like at (x, z) as far as the road's concerned: tar, then gravel shoulder, then grass
function roadColour(x, z) {
  const ASPHALT = new THREE.Color(0x2b2c2f), WORN = new THREE.Color(0x3c3c3b);
  const d = Math.abs(x - ROAD_X), n = wobble(x, z * 0.6), half = ROAD_HALF;
  const tar = half - 0.3 + n * 0.5, shoulder = half + 2.4 + n * 0.8, grass = half + 5 + n;
  const c = ASPHALT.lerp(WORN, 0.5 + 0.5 * Math.sin(z * 0.23 + x * 0.5) * Math.sin(z * 0.071));
  if (d > tar - 0.6) c.lerp(GRAVEL, THREE.MathUtils.smoothstep(d, tar - 0.6, tar + 0.6));
  if (d > shoulder) c.lerp(GRASS, THREE.MathUtils.smoothstep(d, shoulder, grass));
  return c;
}

function road() {
  const cx = ROAD_X, half = ROAD_HALF, y = groundHeight(cx, 0);
  const parts = [groundPatch(cx - half - 7, cx + half + 7, -310, 310, 44, 310, roadColour)];
  const line = surface(0xa8913c, 0.9);                                           // faded centre line
  for (let z = -300; z <= 300; z += 20) parts.push(tint(solid(new THREE.BoxGeometry(0.3, 0.01, 9), [cx, y + 0.035, z]), line));
  return named('road', ...parts);
}

/* A patch of ground surface laid over the land, coloured point by point:
   colourAt(x, z) says what it is there, and where it says grass the patch
   matches the lawn exactly. So gravel and worn asphalt fade raggedly into
   the grass instead of stopping at a hard edge. */
function groundPatch(x0, x1, z0, z1, nx, nz, colourAt, offset = -1) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (x0 + x1) / 2, z = pos.getZ(i) + (z0 + z1) / 2;
    pos.setXYZ(i, x, groundHeight(x, z) + 0.02, z);
    const c = colourAt(x, z);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset
  }));
  m.userData.keep = true;
  return m;
}

// a little roughness for ragged edges and worn patches
// (all gentle enough to change smoothly between the points they're painted on)
const wobble = (x, z) => Math.sin(x * 0.9 + z * 0.4) * 0.55 + Math.sin(z * 1.3 - x * 0.35) * 0.45;
const GRASS = MAT.ground.color, GRAVEL = new THREE.Color(0x8a8273), GRAVEL_DARK = new THREE.Color(0x6f685b);

/* The driveway: gravel fanning out from the road's shoulder into a
   parking spot, with two worn tyre tracks, its edges fading raggedly
   into the grass. */
function driveway() {
  const cz = 20, c = new THREE.Color();
  const amount = (x, z) => {
    const hz = 10 + THREE.MathUtils.clamp((-98 - x) / 8, 0, 1) * 6;      // widens where it meets the road
    const dz = Math.abs(z - cz) - hz, dx = x + 86, r = 5;                    // the far end has round corners
    const sd = dx > -r && dz > -r ? Math.hypot(Math.max(dx + r, 0), Math.max(dz + r, 0)) - r : Math.max(dx, dz);
    return 1 - THREE.MathUtils.smoothstep(sd + wobble(x, z), -1.2, 1.4);
  };
  const colourAt = (x, z) => {
    const m = amount(x, z);
    c.copy(GRAVEL).lerp(GRAVEL_DARK, 0.35 + 0.3 * Math.sin(x * 0.35 + 1) * Math.cos(z * 0.3));
    const rut = Math.min(Math.abs(z - cz - 2.8), Math.abs(z - cz + 2.8));
    if (rut < 1.0 && x < -88) c.lerp(GRAVEL_DARK, 0.5 * (1 - rut / 1.0));   // tyre tracks
    return c.clone().lerp(roadColour(x, z), 1 - m);                       // fades into the shoulder or the grass
  };
  return named('driveway', groundPatch(DRIVE.x0, DRIVE.x1 + 4, DRIVE.z0 - 4, DRIVE.z1 + 4, 60, 72, colourAt, -2));
}

function path() {
  // the front walk: a concrete ribbon following WALK over the ground, with joints every few feet
  const n = 160, hw = 2, pts = WALK.getSpacedPoints(n), pos = [], joints = [];
  const at = (p, side, t) => {
    const nx = -t.z, nz = t.x, l = Math.hypot(nx, nz), x = p.x + side * hw * nx / l, z = p.z + side * hw * nz / l;
    return [x, groundHeight(x, z) + 0.05, z];
  };
  const rows = pts.map((p, i) => {
    const t = WALK.getTangentAt(i / n);
    return [at(p, 1, t), at(p, -1, t)];
  });
  for (let i = 1; i <= n; i++) {
    const [a, b] = rows[i - 1], [c, d] = rows[i];
    pos.push(...a, ...b, ...c, ...b, ...d, ...c);
    if (i % 3 === 0) joints.push([c, d]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const walk = new THREE.Mesh(geo, MAT.concrete);
  walk.material.side = THREE.DoubleSide;
  return named('path', walk, lines(joints, new THREE.LineBasicMaterial({ color: 0x6b675f })));   // expansion joints
}


/* Little 90s pagoda path lights lining the walk: a stake, three tiers of
   bronze shades with a glow between them, and a soft pool of light on the
   ground. The pools are drawn, not lit, so a whole row costs nearly
   nothing. */
function pathLamps() {
  const bronze = surface(0x4a3a28, 0.6), parts = [], pools = [];
  const len = WALK.getLength();
  let side = 1;
  for (let d = 7; d < len - 4; d += 8.5, side = -side) {
    const u = d / len, p = WALK.getPointAt(u), t = WALK.getTangentAt(u);
    const l = Math.hypot(t.x, t.z), x = p.x + side * 3.3 * -t.z / l, z = p.z + side * 3.3 * t.x / l, y = groundHeight(x, z);
    parts.push(tint(solid(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 6), [x, y + 0.6, z]), bronze));
    [[0.42, 1.25], [0.36, 1.45], [0.3, 1.65]].forEach(([r, h]) => parts.push(tint(solid(new THREE.ConeGeometry(r, 0.14, 10), [x, y + h, z]), bronze)));
    parts.push(tint(solid(new THREE.ConeGeometry(0.12, 0.2, 10), [x, y + 1.82, z]), bronze),
      glow(new THREE.CylinderGeometry(0.17, 0.2, 0.1, 10), x, y + 1.33, z), glow(new THREE.CylinderGeometry(0.14, 0.17, 0.1, 10), x, y + 1.53, z));
    // the pool of light, laid over the ground's shape
    const disc = new THREE.CircleGeometry(3.2, 20).rotateX(-Math.PI / 2), dp = disc.attributes.position;
    for (let i = 0; i < dp.count; i++) dp.setXYZ(i, x + dp.getX(i), groundHeight(x + dp.getX(i), z + dp.getZ(i)) + 0.09, z + dp.getZ(i));
    pools.push(disc);
  }
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  if (typeof document !== 'undefined') poolMat.map = softDisc(0);
  pools.forEach(geo => { const m = new THREE.Mesh(geo, poolMat); m.userData.keep = m.userData.noShadow = true; parts.push(m); });
  return named('path-lamps', ...parts);
}

/* An old-style lamp post by the tree at the head of the walk: a tall dark
   post and a tapered four-sided lantern of glowing glass under a little
   roof. It's the light that throws a glow (and shadows) across the front
   of the house. */
function lampPost(lamps, x, z) {
  const y = groundHeight(x, z), H = 9.5, iron = surface(0x1c2a30, 0.6);
  const lantern = new THREE.CylinderGeometry(0.5, 0.32, 0.95, 4, 1).rotateY(Math.PI / 4);
  const roof = new THREE.ConeGeometry(0.62, 0.45, 4).rotateY(Math.PI / 4);
  const light = shadowed(new THREE.PointLight(0xffd59a, 320, 0, 2), 512, 70);
  light.name = 'lamp-post-light';
  light.position.set(x, y + H + 0.5, z);
  light.shadow.intensity = 0.85;
  lamps.push(light);
  return named('lamp-post',
    tint(solid(new THREE.CylinderGeometry(0.22, 0.32, 0.8, 8), [x, y + 0.4, z]), iron),
    tint(solid(new THREE.CylinderGeometry(0.1, 0.12, H, 8), [x, y + H / 2, z]), iron),
    tint(solid(new THREE.CylinderGeometry(0.24, 0.2, 0.3, 4).rotateY(Math.PI / 4), [x, y + H + 0.1, z]), iron),
    glow(lantern, x, y + H + 0.6, z),
    tint(solid(roof, [x, y + H + 1.3, z]), iron),
    tint(solid(new THREE.CylinderGeometry(0.06, 0.1, 0.25, 6), [x, y + H + 1.6, z]), iron),
    light);
}

function mailbox() {
  return named('mailbox',
    solid(new THREE.BoxGeometry(0.4, 3.6, 0.4), [0, 1.8, 0]),          // post
    solid(new THREE.BoxGeometry(2, 1.1, 1.2), [0, 4.15, 0]),           // box
    solid(new THREE.BoxGeometry(0.33, 1, 0.1), [-0.4, 4.6, 0.66]));    // flag
}


function pineTree(scale = 1, seed = 1) {
  // a trunk and five stacked tiers of boughs, each a little turned
  const tiers = [[4.8, 5.5, 5.2], [4.0, 5.0, 8.0], [3.2, 4.5, 10.6], [2.4, 4.0, 13.0], [1.5, 3.4, 15.2]];
  return named('pine',
    solid(new THREE.CylinderGeometry(0.35 * scale, 0.55 * scale, 6 * scale, 8), [0, 3 * scale, 0]),
    ...tiers.map(([r, h, y], i) => solid(new THREE.ConeGeometry(r * scale, h * scale, 12), [0, y * scale, 0], [0, (seed * 1.7 + i) * 0.45, 0])));
}

function bush() {
  return named('bush', solid(new THREE.DodecahedronGeometry(2.3, 0), [0, 1.9, 0]));
}

function yardAt(obj, x, z) {
  obj.position.set(x, groundHeight(x, z), z);
  return obj;
}

/* Pines scattered over the hills, welded into a few draws. None between
   the front yard cam and the house, none on the walk or the road. */
function forest() {
  const parts = [];
  let seed = 77;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 400 && parts.length < 90; k++) {
    const a = rand() * Math.PI * 2, r = 60 + rand() * 170, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const cam = new THREE.Vector2(x + 78, z - 50), look = new THREE.Vector2(73, -49).normalize();
    if (cam.length() < 95 && cam.clone().normalize().dot(look) > 0.85) continue;     // would hide the house from the front cam
    const nearDrive = x > DRIVE.x0 - 12 && x < DRIVE.x1 + 12 && z > DRIVE.z0 - 12 && z < DRIVE.z1 + 12;
    if (walkDistance(x, z) < 12 || nearDrive || Math.abs(x - (ROAD[0] + ROAD[1]) / 2) < 20) continue;
    const s = 0.7 + rand() * 0.7, y = groundHeight(x, z);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.55 * s, 6 * s, 6), MAT.bark);
    t.position.set(x, y + 3 * s, z);
    parts.push(t);
    [[4.8, 5.5, 5.2], [3.6, 5.0, 8.4], [2.4, 4.4, 11.4], [1.4, 3.4, 14]].forEach(([tr, th, ty]) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(tr * s, th * s, 8), MAT.pine);
      c.position.set(x, y + ty * s, z);
      parts.push(c);
    });
  }
  return named('forest', ...parts);
}

/* ─── lights ────────────────────────────────── */

/* Every lamp is two things: a fixture you can see (its shade or bulb
   glows) and a real light that casts shadows. Shadows are worked out
   once at the start and only redrawn near ghoul1 (see main.js), which
   keeps all this affordable. Intensities are by eye; raise or lower
   them to taste. Lamps are warm, the streetlight a little orange, the
   moon a little blue. */

const STREET = [-104.5, -14];  // on the grass by the curb, beside the mailbox
const LAMP_COLOR = 0xffdcae;                    // warm bulbs (0xffffff for plain white)                       // where the streetlight stands, in feet

export function shadowed(light, size = 512, far = 40) {
  light.castShadow = true;
  light.shadow.mapSize.set(size, size);
  light.shadow.camera.near = 0.25;
  light.shadow.camera.far = far;
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.04;
  light.shadow.radius = 3;                      // soft edges, like real lamp shadows
  light.shadow.intensity = 0.62;                // not pitch black: light bouncing round a room fills shadows in
  light.shadow.autoUpdate = false;              // drawn once, then on demand
  light.shadow.needsUpdate = true;
  return light;
}

// a shadow-casting bulb at blueprint (cx, cy), h feet above the floor
function bulb(lamps, name, cx, cy, h, intensity, dz = 0) {
  const light = shadowed(new THREE.PointLight(LAMP_COLOR, intensity, 0, 2));
  light.name = name;
  light.position.set(X(cx), FLOOR + h, Z(cy) + dz);
  lamps.push(light);
  return light;
}

const glow = (geo, x, y, z) => solid(geo, [x, y, z], null, MAT.glow);
const shadeMat = surface(0x2e2e2e, 0.5, THREE.DoubleSide);   // open metal pendant shades

function floorLamp(lamps, name, cx, cy, intensity) {
  const x = X(cx), z = Z(cy);
  return named(name,
    solid(new THREE.CylinderGeometry(0.42, 0.48, 0.08, 12), [x, FLOOR + 0.04, z]),
    solid(new THREE.CylinderGeometry(0.04, 0.04, 4.9, 6), [x, FLOOR + 2.5, z]),
    glow(new THREE.CylinderGeometry(0.42, 0.7, 0.9, 14), x, FLOOR + 5.4, z),
    bulb(lamps, name + '-light', cx, cy, 5.2, intensity));
}

function pendant(lamps, name, cx, cy, intensity) {
  const x = X(cx), z = Z(cy);
  const shade = new THREE.CylinderGeometry(0.12, 0.75, 0.55, 18, 1, true);
  return named(name,
    lines([[[x, CEIL, z], [x, FLOOR + 6.85, z]]]),                              // cord
    solid(shade, [x, FLOOR + 6.58, z], null, shadeMat),
    glow(new THREE.SphereGeometry(0.15, 10, 8), x, FLOOR + 6.38, z),
    bulb(lamps, name + '-light', cx, cy, 6.2, intensity));
}

/* A bare bulb hanging on its cord, with a pull string, that sways very
   very gently, carrying its light with it so the shadows sway too. */
function pullBulb(lamps, name, cx, cy, intensity) {
  const drop = CEIL - (FLOOR + 6.9);                                       // cord length
  const swing = new THREE.Group();
  swing.position.set(X(cx), CEIL, Z(cy));
  swing.add(
    lines([[[0, 0, 0], [0, -drop, 0]]]),
    tint(solid(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 10), [0, -drop - 0.08, 0]), MAT.dark),   // socket
    glow(new THREE.SphereGeometry(0.13, 10, 8), 0, -drop - 0.26, 0),
    lines([[[0.07, -drop - 0.12, 0], [0.07, -drop - 1.3, 0]]], new THREE.LineBasicMaterial({ color: 0xd8d0c0 })),   // pull string
    tint(solid(new THREE.SphereGeometry(0.03, 6, 4), [0.07, -drop - 1.32, 0]), MAT.cream));                       // its bead
  // the light hangs in the bulb and swings with it. Its shadows follow:
  // redrawn every other frame, at half size, reaching only 16 feet, so it
  // stays cheap.
  const light = bulb(lamps, name + '-light', cx, cy, 6.64, intensity);
  light.position.set(0, -drop - 0.26, 0);
  light.distance = 16;
  light.shadow.mapSize.set(256, 256);
  swing.add(light);
  const g = named(name, swing);
  let t = 0, n = 0, root = null;
  const near = new THREE.Sphere(new THREE.Vector3(X(cx), FLOOR + 4, Z(cy)), 14);
  g.userData.tick = dt => {
    t += dt;
    swing.rotation.z = 0.035 * Math.sin(t * 1.1);
    swing.rotation.x = 0.02 * Math.sin(t * 0.73 + 1);
    // only redraw its shadows while the cam can see round here
    if (!root) { root = g; while (root.parent) root = root.parent; }
    const view = root.userData.frustum;
    if (++n % 2 === 0 && (!view || view.intersectsSphere(near))) light.shadow.needsUpdate = true;
  };
  return g;
}

/* The pantry's round ceiling light: a milk glass dome with a real bulb
   in it, so the whole little room fills with light and shadows. */
function pantryLight(lamps) {
  const x = X(1155), z = Z(724);
  const dome = new THREE.SphereGeometry(0.42, 16, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  dome.scale(1, 0.45, 1);
  const light = bulb(lamps, 'lamp-pantry-light', 1155, 724, CEIL - FLOOR - 0.35, 30);
  light.shadow.mapSize.set(256, 256);
  light.shadow.camera.far = 14;
  light.distance = 14;
  return named('lamp-pantry',
    tint(solid(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), [x, CEIL - 0.025, z]), MAT.trim),
    solid(dome, [x, CEIL - 0.05, z], null, MAT.glow),
    light);
}

/* A round flush ceiling light (over the toilet): a milk glass
   dome on a white base. Its light is a narrow spot straight down with
   soft edges that fades out just past the floor, so it makes a pool of
   light without shining through walls (no texture slots left for a
   shadowed one). */
function ceilingLight(name, cx, cy, intensity = 70) {
  const x = X(cx), z = Z(cy);
  const dome = new THREE.SphereGeometry(0.42, 16, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  dome.scale(1, 0.45, 1);
  const light = new THREE.SpotLight(LAMP_COLOR, intensity, 9, 0.36, 0.5, 2);    // fades out just past the floor
  light.name = name + '-light';
  light.position.set(x, CEIL - 0.25, z);
  light.target.position.set(x, FLOOR, z);
  return named(name,
    tint(solid(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), [x, CEIL - 0.025, z]), MAT.trim),
    solid(dome, [x, CEIL - 0.05, z], null, MAT.glow),
    light, light.target);
}

/* ─── lamps with some character ─────────────── */

const v2 = pts => pts.map(([r, y]) => new THREE.Vector2(r, y));

/* A big ceramic table lamp: a glazed ginger jar on a wooden foot, a
   brass neck, and a wide linen drum shade lit from inside. */
function ceramicLamp(lamps, name, cx, cy, top, intensity) {
  const x = X(cx), z = Z(cy), y = FLOOR + top;
  const jar = new THREE.LatheGeometry(v2([[0.001, 0], [0.22, 0], [0.25, 0.06], [0.36, 0.3], [0.42, 0.62], [0.38, 0.95],
    [0.24, 1.18], [0.16, 1.26], [0.17, 1.34], [0.001, 1.34]]), 28);
  return named(name,
    tint(solid(new THREE.CylinderGeometry(0.3, 0.33, 0.08, 20), [x, y + 0.04, z]), PROP.veneer),
    tint(solid(jar, [x, y + 0.08, z]), PROP.celadon),
    tint(solid(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8), [x, y + 1.71, z]), MAT.brass),
    solid(new THREE.CylinderGeometry(0.62, 0.78, 1.0, 28, 1, true), [x, y + 2.15, z], null, MAT.shadeGlow),
    tint(solid(new THREE.SphereGeometry(0.05, 8, 6), [x, y + 2.72, z]), MAT.brass),            // finial
    bulb(lamps, name + '-light', cx, cy, top + 2.0, intensity));
}

/* A Tiffany table lamp: a bronze base and a dome of leaded glass in
   muted colours, glowing from the bulb inside. */
function tiffanyLamp(lamps, name, cx, cy, top, intensity) {
  const x = X(cx), z = Z(cy), y = FLOOR + top;
  const base = new THREE.LatheGeometry(v2([[0.001, 0], [0.3, 0], [0.3, 0.04], [0.22, 0.1], [0.07, 0.18], [0.05, 0.5],
    [0.065, 0.9], [0.05, 1.2], [0.001, 1.2]]), 20);
  const dome = new THREE.LatheGeometry(v2([[0.8, 0], [0.76, 0.12], [0.64, 0.32], [0.44, 0.5], [0.2, 0.61], [0.09, 0.64]]), 32);
  const glass = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  if (typeof document !== 'undefined') glass.map = leadedGlass(); else glass.color.set(0x8a6a32);
  glass.color.multiplyScalar(0.95);                                          // lit from inside, but muted
  return named(name,
    tint(solid(base, [x, y, z]), PROP.bronze),
    solid(dome, [x, y + 1.15, z], null, glass),
    tint(solid(new THREE.TorusGeometry(0.8, 0.018, 4, 32).rotateX(Math.PI / 2), [x, y + 1.15, z]), PROP.bronze),   // the rim
    tint(solid(new THREE.SphereGeometry(0.05, 8, 6), [x, y + 1.82, z]), PROP.bronze),                               // finial
    glow(new THREE.SphereGeometry(0.07, 10, 8), x, y + 1.3, z),
    bulb(lamps, name + '-light', cx, cy, top + 1.3, intensity));
}

/* A brass candlestick lamp with a pleated shade, for the nightstands. */
function bedsideLamp(lamps, name, cx, cy, top, intensity) {
  const x = X(cx), z = Z(cy), y = FLOOR + top;
  const base = new THREE.LatheGeometry(v2([[0.001, 0], [0.26, 0], [0.26, 0.05], [0.16, 0.12], [0.08, 0.2], [0.06, 0.3],
    [0.09, 0.38], [0.05, 0.46], [0.045, 0.95], [0.07, 1.0], [0.06, 1.05], [0.001, 1.05]]), 20);
  const shade = new THREE.CylinderGeometry(0.3, 0.48, 0.6, 72, 1, true);
  const p = shade.attributes.position;
  for (let i = 0; i < p.count; i++) {                                        // the pleats
    const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.04 * Math.cos(a * 24);
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  shade.computeVertexNormals();
  return named(name,
    tint(solid(base, [x, y, z]), MAT.brass),
    solid(shade, [x, y + 1.25, z], null, MAT.shadeGlow),
    bulb(lamps, name + '-light', cx, cy, top + 1.2, intensity));
}

/* A banker's lamp on the computer desk: brass base and stem, a green
   glass shade lying lengthways, a pull chain, and the light pooled on
   the desk under it. */
function bankersLamp(x0, x1, z0, zc, top) {
  const bx = x1 - 0.55, bz = zc - 2.05, sy = top + 0.88;
  const green = new THREE.MeshBasicMaterial({ color: 0x1c4a2c, side: THREE.DoubleSide });   // emerald glass, lit through
  const shade = new THREE.CylinderGeometry(0.22, 0.22, 0.8, 20, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
  const ends = [-0.4, 0.4].map(dz => new THREE.CircleGeometry(0.22, 12, 0, Math.PI).translate(0, 0, dz));
  const light = new THREE.SpotLight(LAMP_COLOR, 9, 4.5, 0.85, 0.55, 2);
  light.name = 'lamp-desk-light';
  light.position.set(bx - 0.05, sy - 0.05, bz);
  light.target.position.set(x0 + 0.7, top, bz + 0.3);
  const brass = (geo, p) => tint(solid(geo, p), MAT.brass);
  return named('lamp-desk',
    brass(new THREE.BoxGeometry(0.42, 0.07, 0.7), [bx, top + 0.035, bz]),
    brass(new THREE.CylinderGeometry(0.035, 0.04, 0.72, 8), [bx, top + 0.43, bz]),
    brass(new THREE.BoxGeometry(0.05, 0.05, 0.55), [bx, sy - 0.12, bz]),
    solid(shade, [bx - 0.05, sy, bz], null, green),
    ...ends.map(e => solid(e, [bx - 0.05, sy, bz], null, green)),
    brass(new THREE.CylinderGeometry(0.015, 0.015, 0.84, 6).rotateX(Math.PI / 2), [bx - 0.05, sy + 0.22, bz]),   // brass ridge along the top
    glow(new THREE.PlaneGeometry(0.38, 0.74).rotateX(Math.PI / 2), bx - 0.05, sy - 0.01, bz),
    lines([[[bx - 0.12, sy - 0.05, bz + 0.3], [bx - 0.12, sy - 0.42, bz + 0.3]]], new THREE.LineBasicMaterial({ color: 0xb8963e })),
    brass(new THREE.SphereGeometry(0.025, 6, 4), [bx - 0.12, sy - 0.44, bz + 0.3]),
    light, light.target);
}

/* ─── the lived-in stuff ────────────────────── */

const PROP = {
  paper:     surface(0xeeeae0, 0.95),
  cardboard: surface(0xb08a5a, 0.95),
  black:     surface(0x1c1c1e, 0.5),
  silver:    metal(0xa9adb0, 0.4),
  veneer:    surface(0x5a3b24, 0.6),       // walnut-look stereo wood
  grille:    surface(0x161616, 1),
  leaf:      surface(0x2c4f26, 0.55, THREE.DoubleSide),
  soil:      surface(0x2e2219, 1),
  potWhite:  surface(0xe8e4da, 0.5),
  celadon:   surface(0x7d9a8c, 0.3),       // glazed ceramic
  bronze:    metal(0x5c4326, 0.5),
  red:       surface(0x9a2a24, 0.6),
  blue:      surface(0x2f4f7a, 0.7),
  white:     surface(0xf2efe8, 0.6),
  mug:       surface(0x2e5a7a, 0.4),
  beige:     surface(0xd9d0b8, 0.7),       // 90s plastic
  wicker:    surface(0x9b7a4a, 1),
  pink:      surface(0xd99aa5, 0.5),
  yellow:    surface(0xd8b13a, 0.6),
  green:     surface(0x5b7d3a, 0.7),
  orange:    surface(0xd9772b, 0.7),
  rubber:    surface(0x26201c, 1),
  water:     new THREE.MeshBasicMaterial({ color: 0x8fa6b0, transparent: true, opacity: 0.28, depthWrite: false })
};

// small things don't cast shadows (a pen's shadow is lost from across a room, and each one is drawn again per lamp)
function small(obj) {
  obj.traverse(o => { if (o.isMesh) o.userData.small = true; });
  return obj;
}
const box = (w, h, d, x, y, z, mat, rot) => tint(solid(new THREE.BoxGeometry(w, h, d), [x, y, z], rot), mat);
const cyl = (r, h, x, y, z, mat, rot, segs = 12, rTop = r) => tint(solid(new THREE.CylinderGeometry(rTop, r, h, segs), [x, y, z], rot), mat);
const glowing = (mat, geo, x, y, z, rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rot) m.rotation.set(...rot); return m; };

/* A 90s hi-fi against the living room's north wall, facing the couch:
   a walnut cabinet, a rack of components (CD player, double cassette
   deck, receiver with a glowing dial, turntable under a smoked lid) and
   two tall floor speakers. */
function stereo() {
  const zb = Z(174), d = 0.95, zf = zb + d, cx = X(478), top = FLOOR + 1.9, w = 1.5;
  const amber = new THREE.MeshBasicMaterial({ color: 0xe0a040 }), teal = new THREE.MeshBasicMaterial({ color: 0x4fc6b8 });
  const lid = new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.35, depthWrite: false });
  const unit = (y0, h, mat) => box(w, h - 0.02, d - 0.15, cx, y0 + h / 2, zb + d / 2 - 0.05, mat);
  const speaker = sx => [
    box(0.84, 3.0, 0.8, sx, FLOOR + 1.5, zb + 0.42, PROP.veneer),
    box(0.74, 2.6, 0.03, sx, FLOOR + 1.62, zb + 0.83, PROP.grille),
    box(0.2, 0.05, 0.01, sx, FLOOR + 0.42, zb + 0.85, PROP.silver)                 // the badge
  ];
  return named('stereo',
    // the cabinet: two doors with a gap, little feet
    box(3.45, 1.78, d, cx, FLOOR + 1.0, zb + d / 2, PROP.veneer),
    box(1.68, 1.55, 0.03, cx - 0.86, FLOOR + 1.0, zf + 0.01, PROP.veneer),
    box(1.68, 1.55, 0.03, cx + 0.86, FLOOR + 1.0, zf + 0.01, PROP.veneer),
    cyl(0.03, 0.1, cx - 0.1, FLOOR + 1.0, zf + 0.04, MAT.brass, [Math.PI / 2, 0, 0], 6),
    cyl(0.03, 0.1, cx + 0.1, FLOOR + 1.0, zf + 0.04, MAT.brass, [Math.PI / 2, 0, 0], 6),
    box(3.45, 0.04, d, cx, top + 0.02, zb + d / 2, PROP.veneer),
    // CD player
    unit(top + 0.04, 0.26, PROP.silver),
    box(0.6, 0.03, 0.01, cx - 0.3, top + 0.2, zf - 0.09, PROP.black),
    glowing(teal, new THREE.PlaneGeometry(0.3, 0.07), cx + 0.35, top + 0.17, zf - 0.088),
    // double cassette deck
    unit(top + 0.3, 0.36, PROP.black),
    box(0.45, 0.24, 0.01, cx - 0.4, top + 0.48, zf - 0.09, MAT.dark), box(0.45, 0.24, 0.01, cx + 0.15, top + 0.48, zf - 0.09, MAT.dark),
    // receiver: a long amber dial and a big volume knob
    unit(top + 0.66, 0.42, PROP.silver),
    glowing(amber, new THREE.PlaneGeometry(0.8, 0.1), cx - 0.2, top + 0.93, zf - 0.088),
    cyl(0.12, 0.08, cx + 0.5, top + 0.86, zf - 0.06, PROP.black, [Math.PI / 2, 0, 0], 16),
    // turntable on top, under its smoked dust cover
    box(w, 0.14, d - 0.1, cx, top + 1.15, zb + d / 2 - 0.05, PROP.veneer),
    cyl(0.48, 0.04, cx - 0.12, top + 1.24, zb + d / 2 - 0.05, PROP.black, null, 28),
    cyl(0.06, 0.02, cx - 0.12, top + 1.27, zb + d / 2 - 0.05, PROP.red, null, 10),     // the label
    box(0.025, 0.025, 0.6, cx + 0.5, top + 1.28, zb + d / 2 - 0.1, PROP.silver, [0, 0.35, 0]),   // tonearm
    glowing(lid, new THREE.BoxGeometry(w, 0.32, d - 0.1), cx, top + 1.38, zb + d / 2 - 0.05),
    ...speaker(X(415.5)), ...speaker(X(540.5)));
}

/* A fiddle leaf fig in a white pot in the corner behind the couch: a bare
   trunk, then big violin-shaped leaves, glossy and drooping a little. */
function fiddleFig(cx, cy) {
  const x = X(cx), z = Z(cy);
  // one leaf, about a foot long: narrow at the stalk, a waist, broad and round at the tip
  const s = new THREE.Shape();
  const half = [[0, 0], [0.09, 0.08], [0.17, 0.25], [0.15, 0.45], [0.22, 0.65], [0.25, 0.82], [0.2, 0.96], [0.08, 1.04], [0, 1.05]];
  s.moveTo(0, 0);
  for (const [px, py] of half.slice(1)) s.lineTo(px, py);
  for (const [px, py] of half.slice(1, -1).reverse()) s.lineTo(-px, py);
  const leafGeo = new THREE.ShapeGeometry(s, 2);
  const lp = leafGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) {                                       // cupped, and the tip droops
    const lx = lp.getX(i), ly = lp.getY(i);
    lp.setZ(i, 0.25 * lx * lx - 0.22 * ly * ly);
  }
  leafGeo.computeVertexNormals();
  let seed = 31;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const trunk = new THREE.CatmullRomCurve3([[0, 0.85, 0], [0.04, 2.0, 0.02], [0.1, 3.4, -0.04], [0.06, 5.6, 0]].map(p => new THREE.Vector3(...p)));
  const parts = [
    tint(solid(new THREE.LatheGeometry(v2([[0.001, 0], [0.34, 0], [0.42, 0.85], [0.46, 0.9], [0.44, 0.92], [0.001, 0.92]]), 24)), PROP.potWhite),
    tint(solid(new THREE.CylinderGeometry(0.41, 0.41, 0.02, 20), [0, 0.86, 0]), PROP.soil),
    tint(solid(new THREE.TubeGeometry(trunk, 16, 0.045, 6, false)), MAT.bark)
  ];
  for (let i = 0; i < 46; i++) {
    const t = 0.32 + 0.68 * Math.pow(i / 45, 0.8);                          // more leaves up top
    const at = trunk.getPoint(t), size = 0.75 + 0.45 * rand();
    const leaf = new THREE.Mesh(leafGeo, PROP.leaf);
    leaf.scale.setScalar(size);
    leaf.rotation.set(-(Math.PI / 2 - (0.25 + 0.7 * rand()) - (t > 0.95 ? 0.6 : 0)), 0, (rand() - 0.5) * 0.6);
    const holder = new THREE.Group();
    holder.position.copy(at);
    holder.rotation.y = i * 2.4 + rand() * 0.4;                              // spiralling round the trunk
    holder.add(leaf);
    parts.push(holder);
  }
  const g = named('fiddle-fig', ...parts);
  g.position.set(x, FLOOR, z);
  return g;
}

/* A coffee mug: a hollow glazed body with a rolled rim, a looped handle,
   cold coffee a little way down, and a ring on the table where it sat
   before. y is the table top. */
function coffeeMug(x, y, z) {
  const glaze = surface(0x2f4a35, 0.3);
  const body = new THREE.LatheGeometry(v2([[0.001, 0], [0.08, 0], [0.092, 0.012], [0.098, 0.06], [0.104, 0.2], [0.11, 0.238], [0.104, 0.248],
    [0.094, 0.236], [0.086, 0.04], [0.001, 0.034]]), 28);
  const handle = new THREE.TorusGeometry(0.058, 0.017, 8, 18, Math.PI).rotateZ(-Math.PI / 2);
  const coffee = new THREE.CircleGeometry(0.09, 24).rotateX(-Math.PI / 2);
  const ring = new THREE.RingGeometry(0.084, 0.1, 28).rotateX(-Math.PI / 2);
  return [
    tint(solid(body, [x, y, z]), glaze),
    tint(solid(handle, [x + 0.1, y + 0.13, z]), glaze),
    tint(solid(coffee, [x, y + 0.17, z]), surface(0x241509, 0.2)),
    tint(solid(ring, [x - 0.13, y + 0.003, z + 0.09]), surface(0x4a2e18, 0.8))
  ];
}

// a stack of loose paper, each sheet a little askew
function paperStack(x, y, z, n, w = 0.7, d = 0.9, mat = PROP.paper) {
  let seed = Math.round(x * 100 + z * 7) & 0xffff || 5;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, (_, i) => box(w, 0.025, d, x + (rand() - 0.5) * 0.08, y + 0.0125 + i * 0.026, z + (rand() - 0.5) * 0.08,
    i % 4 === 3 ? PROP.cardboard : mat, [0, (rand() - 0.5) * 0.3, 0]));
}

// a little pile of clothes on the floor: a few soft lumps in a heap
function clothesPile(x, z, mats) {
  const spots = [[0, 0], [0.5, 0.3], [-0.45, 0.35], [0.25, -0.45], [-0.3, -0.3], [0.1, 0.1]];
  return mats.map((m, i) => {
    const [dx, dz] = spots[i % spots.length];
    const s = new THREE.SphereGeometry(0.5, 12, 6);
    s.scale(1.7 - i * 0.12, 0.26, 1.15 - i * 0.07);
    return tint(solid(s, [x + dx, FLOOR + 0.06 + i * 0.05, z + dz], [0, i * 1.3, i % 2 ? 0.05 : -0.05]), m);
  });
}

// a pair of shoes: each a low rounded block with a pale sole
function shoes(x, z, turn, mat, sole = PROP.white, len = 0.95) {
  const one = dx => {
    const g = new THREE.Group();
    g.add(box(0.36, 0.08, len, 0, 0.04, 0, sole),
      tint(solid(new THREE.SphereGeometry(0.5, 10, 6).scale(0.36, 0.3, len), [0, 0.08, 0.05]), mat));
    g.position.set(dx, 0, 0);
    return g;
  };
  const g = new THREE.Group();
  g.add(one(-0.22), one(0.22));
  g.position.set(x, FLOOR, z);
  g.rotation.y = turn;
  return g;
}

/* Clutter, room by room. Each room's clutter is one group, so it's drawn
   in a handful of goes however many little things are in it. Things you
   can look at in first person are wrapped in say(text, ...parts): the
   text belongs to just the space those parts take up (examineAreas). */
const say = (text, ...parts) => {
  const g = new THREE.Group();
  g.add(...parts);
  g.userData.say = text;
  return g;
};
function clutter() {
  const T = FLOOR + 3;                                                       // kitchen counters
  // the wall phone's keypad, and a calendar (a picture each)
  const keypad = surface(0xffffff, 0.6), month = surface(0xffffff, 0.9), led = new THREE.MeshBasicMaterial({ color: 0xffffff });
  if (typeof document !== 'undefined') {
    keypad.map = screenCanvas(32, 64, g => {
      g.fillStyle = '#d9d0b8'; g.fillRect(0, 0, 32, 64);
      g.fillStyle = '#6b6658';
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.fillRect(4 + c * 9, 24 + r * 9, 6, 6);
    });
    month.map = screenCanvas(64, 80, g => {
      g.fillStyle = '#f2ede2'; g.fillRect(0, 0, 64, 80);
      g.fillStyle = '#5b7d6a'; g.fillRect(0, 0, 64, 34);                    // the picture: a lake, some pines
      g.fillStyle = '#2e4a36'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(4 + i * 10, 34); g.lineTo(9 + i * 10, 14 + (i % 3) * 4); g.lineTo(14 + i * 10, 34); g.fill(); }
      g.strokeStyle = '#9a968c'; g.lineWidth = 0.6;
      for (let r = 0; r <= 5; r++) { g.beginPath(); g.moveTo(3, 40 + r * 7); g.lineTo(61, 40 + r * 7); g.stroke(); }
      for (let c = 0; c <= 7; c++) { g.beginPath(); g.moveTo(3 + c * 8.3, 40); g.lineTo(3 + c * 8.3, 75); g.stroke(); }
      g.strokeStyle = '#b02a20'; g.lineWidth = 1.5;                         // one day circled. Then crossed out, hard
      g.beginPath(); g.arc(32, 58, 4, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(26, 52); g.lineTo(38, 64); g.moveTo(38, 52); g.lineTo(26, 64); g.stroke();
    });
    led.map = screenCanvas(64, 24, g => {
      g.fillStyle = '#120404'; g.fillRect(0, 0, 64, 24);
      g.fillStyle = '#ff2a1a'; g.font = 'bold 18px monospace'; g.fillText('3:33', 8, 19);
    });
  } else { keypad.color.set(0xd9d0b8); month.color.set(0xf2ede2); led.color.set(0xff2a1a); }

  // ---- living room
  const living = named('living-clutter',
    say("Months of old newspapers. Every one has the obituaries torn out.",
      ...paperStack(X(562), FLOOR, Z(532), 9, 0.9, 1.15, MAT.cream)),                 // old newspapers by the couch
    say("Cold coffee with a skin on it. There's lipstick on the rim. Nobody here wears lipstick.",
      ...coffeeMug(X(390), FLOOR + 1.9, Z(284))),                                         // a coffee mug by the Tiffany lamp
    // a crate of records under the window, sleeves leaning
    say("A crate of old records. Somebody's pulled one halfway out and left it.",
      box(1.1, 0.04, 0.9, X(617), FLOOR + 0.02, Z(190), PROP.cardboard),
      box(1.1, 0.95, 0.04, X(617), FLOOR + 0.48, Z(190) - 0.43, PROP.cardboard), box(1.1, 0.95, 0.04, X(617), FLOOR + 0.48, Z(190) + 0.43, PROP.cardboard),
      box(0.04, 0.95, 0.9, X(617) - 0.53, FLOOR + 0.48, Z(190), PROP.cardboard), box(0.04, 0.95, 0.9, X(617) + 0.53, FLOOR + 0.48, Z(190), PROP.cardboard),
      ...[PROP.red, PROP.black, PROP.yellow, PROP.blue, PROP.paper, PROP.green, PROP.black].map((m, i) =>
        box(1.02, 1.02, 0.02, X(617), FLOOR + 0.55, Z(190) - 0.33 + i * 0.1, m, [0.12, 0, 0]))));

  // ---- kitchen
  const kitchen = named('kitchen-clutter',
    // a drip coffee maker, beige, with its pot half full
    say("The pot's half full and still warm. The clock on the front is blinking 12:00.",
      box(0.45, 1.15, 0.75, X(1218) + 0.1, T + 0.575, Z(600), PROP.beige),
      box(0.4, 0.14, 0.75, X(1218) - 0.32, T + 1.08, Z(600), PROP.beige),             // the brew head, over the pot
      box(0.45, 0.04, 0.75, X(1218) - 0.32, T + 0.02, Z(600), PROP.black),           // the hot plate
      cyl(0.22, 0.5, X(1218) - 0.32, T + 0.29, Z(600), PROP.water, null, 14),
      cyl(0.225, 0.22, X(1218) - 0.32, T + 0.15, Z(600), PROP.soil, null, 14)),      // the coffee in it
    // paper towels on a wooden stand
    cyl(0.18, 0.04, X(1215), T + 0.02, Z(632), PROP.veneer, null, 12),
    cyl(0.16, 0.95, X(1215), T + 0.5, Z(632), PROP.white, null, 14),
    // the mail on the island: bills, a catalogue
    say("Bills, a catalogue, a postcard. The postcard is a picture of this house. On the back, in your handwriting: wish you were here.",
      ...paperStack(X(1050), T + 0.04, Z(550), 5, 0.75, 0.42),
      box(0.65, 0.04, 0.85, X(1030), T + 0.02, Z(545), PROP.blue, [0, 0.4, 0])),
    // a fruit bowl with a few apples and a banana going brown
    say("The apples look fine. The banana has gone black from the inside out.",
      cyl(0.42, 0.18, X(1000), T + 0.09, Z(483), PROP.wicker, null, 16, 0.5),
      ...[[-0.12, 0.08, PROP.red], [0.15, -0.05, PROP.red], [0.02, 0.18, PROP.green]].map(([dx, dz, m]) =>
        tint(solid(new THREE.SphereGeometry(0.14, 10, 8), [X(1000) + dx, T + 0.28, Z(483) + dz]), m)),
      tint(solid(new THREE.TorusGeometry(0.25, 0.06, 6, 12, 2.2), [X(1000), T + 0.3, Z(483) - 0.1], [Math.PI / 2, 0, 0.6]), PROP.yellow)),
    // canisters on the south counter: flour, sugar, coffee, tallest first
    say("Flour, sugar, coffee. Something in the sugar one rattles when you touch it.",
      ...[[0.62, 0.38], [0.5, 0.33], [0.4, 0.28]].map(([h, r], i) => [
        cyl(r, h, X(822) + i * 0.75, T + h / 2, Z(700), PROP.white, null, 16),
        cyl(r * 0.85, 0.08, X(822) + i * 0.75, T + h + 0.04, Z(700), MAT.brass, null, 16)]).flat()),
    // a wall phone above the counter, its coiled cord hanging down
    say("The cord's stretched out and kinked, like someone pulled it as far as it would go. You lift the handset. Someone is already on the line, breathing.",
      box(0.4, 0.75, 0.16, X(905), FLOOR + 5.0, Z(715) - 0.08, PROP.beige),
      tint(solid(new THREE.PlaneGeometry(0.3, 0.6), [X(905), FLOOR + 5.0, Z(715) - 0.165], [0, Math.PI, 0]), keypad),
      box(0.16, 0.85, 0.16, X(905) - 0.25, FLOOR + 5.0, Z(715) - 0.12, PROP.beige),      // the handset, hung on the side
      tint(solid(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[X(905) - 0.25, FLOOR + 4.55, Z(715) - 0.12], [X(905) - 0.3, FLOOR + 3.6, Z(715) - 0.3],
        [X(905) - 0.1, FLOOR + 3.15, Z(715) - 0.4], [X(905) + 0.05, FLOOR + 4.55, Z(715) - 0.12]].map(p => new THREE.Vector3(...p))), 16, 0.025, 4, false)), PROP.beige)),
    // and a calendar beside it
    say("One day is circled, then crossed out so hard the paper tore. It's today.",
      tint(solid(new THREE.PlaneGeometry(1.0, 1.25), [X(948), FLOOR + 4.9, Z(715) - 0.01], [0, Math.PI, 0]), month)));

  // ---- bathroom
  const tp = (x, y, z, rot) => [cyl(0.2, 0.42, x, y, z, PROP.white, rot, 14), cyl(0.07, 0.43, x, y, z, PROP.cardboard, rot, 8)];
  const bath = named('bath-clutter',
    // a roll on the holder on the wall beside the toilet
    cyl(0.025, 0.55, X(316) + 0.25, FLOOR + 2.35, Z(925), MAT.chrome, [Math.PI / 2, 0, 0], 6),
    ...tp(X(316) + 0.25, FLOOR + 2.15, Z(925), [Math.PI / 2, 0, 0]),
    // spares stacked on the tank
    ...tp(X(350), FLOOR + 2.7 + 0.21, Z(869), null), ...tp(X(380), FLOOR + 2.7 + 0.21, Z(869), null), ...tp(X(365), FLOOR + 2.7 + 0.63, Z(869), null),
    // soap in a dish, a cup of toothbrushes on the vanity
    say("The soap is still wet. There's a long dark hair stuck to it.",
      cyl(0.2, 0.04, X(582), FLOOR + 2.82, Z(1052), PROP.potWhite, null, 14),
      box(0.26, 0.08, 0.16, X(582), FLOOR + 2.88, Z(1052), PROP.pink)),
    say("Two toothbrushes in the cup. Both still wet.",
      cyl(0.1, 0.35, X(488), FLOOR + 2.98, Z(1056), PROP.blue, null, 12),
      ...[[-0.03, 0.02, PROP.red, 0.15], [0.04, -0.02, PROP.yellow, -0.2]].map(([dx, dz, m, tilt]) =>
        box(0.03, 0.65, 0.03, X(488) + dx, FLOOR + 3.15, Z(1056) + dz, m, [tilt, 0, tilt]))),
    // a wicker basket of magazines by the toilet
    say("Old magazines. Every face in them has been scratched out with a pen.",
      cyl(0.32, 0.75, X(408), FLOOR + 0.375, Z(888), PROP.wicker, null, 14, 0.36),
      ...[PROP.paper, PROP.red, PROP.blue].map((m, i) => box(0.6, 0.85, 0.02, X(408), FLOOR + 0.6, Z(888) - 0.08 + i * 0.08, m, [0.1 - i * 0.08, 0, 0]))),
    // and shampoo in the back corner of the shower
    cyl(0.12, 0.6, X(328), FLOOR + 0.35 + 0.3, Z(1059), PROP.green, null, 10),
    cyl(0.1, 0.5, X(337), FLOOR + 0.35 + 0.25, Z(1060), PROP.pink, null, 10));

  // ---- bedroom
  const bed = named('bed-clutter',
    // the nightstand on the left: the alarm clock (its red numbers stuck at 3:33)
    say("The alarm clock says 3:33. It's said that all night.",
      box(0.5, 0.22, 0.24, X(882), FLOOR + 2.1 + 0.11, Z(1030), PROP.black),
      glowing(led, new THREE.PlaneGeometry(0.4, 0.15), X(882), FLOOR + 2.22, Z(1030) - 0.125, [0, Math.PI, 0])),
    // the other one: a glass of water, a stack of paperbacks
    say("Half a glass of water. There's dust on the surface, but the level keeps going down.",
      cyl(0.1, 0.4, X(1117), FLOOR + 2.1 + 0.2, Z(1032), PROP.water, null, 12)),
    say("Library books, years overdue. The last one is checked out in your name.",
      ...[PROP.red, PROP.blue, PROP.paper, PROP.green].map((m, i) => box(0.55 - i * 0.04, 0.12, 0.38, X(1084), FLOOR + 2.1 + 0.06 + i * 0.12, Z(1032), m, [0, i * 0.2 - 0.3, 0]))),
    // clothes dropped in the corner, a pile of papers
    ...clothesPile(X(1203), Z(808), [MAT.denim, MAT.flannel, MAT.hunter]),
    say("Printouts, hundreds of pages. The same line over and over: I am not the one watching.",
      ...paperStack(X(1095), FLOOR, Z(815), 14, 0.75, 0.95)));

  // ---- foyer: shoes on a tray by the door, keys and mail on the bench
  const foyer = named('foyer-clutter',
    say("Two pairs of shoes by the door. The boots are caked in fresh mud, and the mud is still wet.",
      box(0.95, 0.05, 1.5, X(140), FLOOR + 0.025, Z(722), PROP.rubber),
      shoes(X(140) - 0.05, Z(700), Math.PI / 2, PROP.rubber, PROP.rubber, 1.0),
      shoes(X(140) + 0.05, Z(740), Math.PI / 2 + 0.2, MAT.wood, PROP.rubber, 1.05)),
    say("A bowl for keys. The keys are in it. Whoever lives here never left.",
      cyl(0.28, 0.1, X(185), FLOOR + 1.6 + 0.05, Z(762), PROP.celadon, null, 14, 0.36),
      box(0.25, 0.03, 0.08, X(185), FLOOR + 1.72, Z(762), MAT.brass, [0, 0.6, 0])),
    ...paperStack(X(240), FLOOR + 1.6, Z(762), 4, 0.42, 0.75));

  // ---- laundry: a heap waiting against the back wall
  const laundry = named('laundry-clutter',
    say("A heap of clothes waiting for the wash. Something at the bottom of the pile is damp.",
      ...clothesPile(X(708), Z(1036), [MAT.denim, MAT.plum, MAT.flannel])));

  return named('clutter', ...[living, kitchen, bath, bed, foyer, laundry].map(small));
}

/* ─── paintings ─────────────────────────────── */

/* Old oil paintings in heavy frames, all over the house, every one of
   them a little wrong. They're drawn at the start, all onto one picture
   sheet (so every painting in the house is one material and a single
   draw), each in its own square. */
const ART = 160, ART_COLS = 6, ART_SHEET = 1024;
const PAINTINGS = [
  // [name, wall face, px, py, width, height, centre height, frame, text]
  // landscapes (drawn here, paintArt) ...
  ['valley', 'x+', 315, 490, 3.0, 2.0, 5.3, 'gilt', "A river valley at sundown, a little farmhouse with one window lit. Every time you look, the light is in a different window."],
  ['forest', 'z-', 752, 810, 2.6, 1.8, 5.3, 'gilt', "A path into an old forest, light coming down between the trunks. The path bends exactly like the walk out front."],
  ['moonrise', 'z+', 1062, 364, 2.0, 1.33, 5.9, 'wood', "A lake under the moon and a ruined tower on the hill. There's a light at the top of the tower. It wasn't painted on."],
  ['coast', 'z+', 1205, 364, 1.7, 1.3, 5.6, 'gilt', "Cliffs in a storm, the sea breaking white. It's painted so well you can almost hear it. You can hear it."],
  ['field', 'z-', 845, 715, 1.6, 1.2, 5.6, 'wood', "A wheat field and one old oak at sunset. The crows are all facing the same way. Toward you."],
  ['mountains', 'z-', 1005, 1068, 3.4, 1.9, 6.0, 'gilt', "Mountains over a still lake at dusk. The reflection in the water doesn't quite match the mountains."],
  ['waterfall', 'x+', 815, 862, 2.2, 1.7, 5.4, 'wood', "A waterfall in a gorge, all mist and spray. Your fingertips come away damp."],
  ['church', 'z+', 1150, 789, 2.2, 1.5, 5.4, 'wood', "A little white church at the end of a country road. The road is the road out front. There's no church down there."],
  ['marsh', 'z+', 570, 825, 1.4, 1.0, 5.6, 'wood', "A marsh at dusk, reeds and still water. Something just under the surface has left a ring on the water."],
  ['isle', 'z-', 1198, 1068, 2.0, 1.4, 5.5, 'gilt', "A little island of black cypresses on a dead calm sea. A rowboat is heading out to it with nobody rowing."],
  ['winter', 'x-', 1237, 390, 1.2, 1.0, 5.9, 'wood', "A ruined chapel in the snow with bare oaks all round it. Footprints in the snow going in. None coming out."],
  ['cypress', 'x-', 719, 348, 0.85, 1.15, 5.4, 'wood', "One tall cypress under a thin moon. Cypresses are what they plant in graveyards."],
  // ... modern art ...
  ['color-field', 'z+', 997, 724, 2.6, 1.4, 6.55, 'black', "Modern art: two smudgy blocks of dark red and black. Stare at it long enough and the black one gets deeper."],
  ['black-square', 'x-', 1237, 807, 1.0, 1.0, 5.5, 'black', "A black square on a white canvas, cracked all over. Through the cracks, the paint underneath is red."],
  // ... and real old portraits (art/portraits, credited in its CREDITS.md), pixelated to match
  ['ginevra', 'z+', 516.5, 173, 1.0, 1.5, 5.4, 'wood', "A young woman, pale as candle wax, against a dark bush. She looks bored, or sick. Her eyes are fixed just past your shoulder."],
  ['durer', 'z-', 556, 810, 1.5, 2.1, 5.2, 'wood', "A man with long curled hair staring straight out, one hand at his chest. He looks like he knows exactly what you did."],
  ['duchess', 'x+', 124, 735, 1.4, 1.8, 5.7, 'gilt', "An old woman dressed up for a ball, horned headdress, low neckline. She's grinning. Somebody hung her by the front door on purpose."],
  ['young-woman', 'z+', 365, 861, 1.0, 1.3, 5.7, 'wood', "A girl in a tall black hat, her eyes slanted toward you. She looks a little too real. You catch yourself waiting for her to blink."],
  ['weyden-lady', 'x-', 605, 862, 1.2, 1.6, 5.3, 'wood', "A woman in a white veil, eyes lowered, hands clasped. She's praying. You wonder what for."],
  ['eleonora', 'x+', 815, 1024, 1.3, 1.7, 5.4, 'gilt', "A duchess in a stiff brocade dress with her little son. Neither of them is smiling. Neither of them looks away."],
  ['erasmus', 'z+', 702, 173, 0.85, 1.15, 5.4, 'wood', "An old scholar in profile, writing. Lean in and the words on his page are this address."],
  ['condottiero', 'z+', 756, 364, 0.9, 1.2, 5.4, 'wood', "A soldier with a scar across his lip. He's been watching the patio door all night."],
  ['more', 'x-', 1237, 634, 1.2, 1.55, 5.6, 'gilt', "A stern man in a fur collar and a heavy gold chain. The stubble on his chin looks longer than it did this morning."],
  ['young-man', 'x-', 1237, 1042, 1.2, 1.55, 5.4, 'wood', "A young man in black with a book, one hand on his hip, looking down his nose at you. He doesn't like you being in here."],
  ['bembo', 'z+', 1212, 789, 0.9, 1.2, 5.4, 'wood', "A man holding up an old coin. There's a face on the coin. It's yours."],
  ['grandson', 'x+', 428, 775, 1.2, 1.6, 5.3, 'gilt', "An old man with a lumpy, ruined nose, and a little boy gazing up at him. The boy's eyes have moved. They're on you now."],
  ['turban', 'x+', 315, 885, 0.9, 1.2, 5.6, 'wood', "A man in a red turban, every hair of his stubble painted in. His eyes are wet and red-rimmed, like he hasn't slept. Neither have you."],
  ['lucrezia', 'x-', 295, 762, 0.9, 1.2, 5.6, 'wood', "A woman in a red dress with a gold chain and a little book. Her skin looks like porcelain. Up close, it looks warm."]
];
// the portraits that are real paintings: where to centre the crop (0..1 across and down the picture) and how far in to zoom
const PORTRAITS = {
  ginevra: [0.5, 0.4, 1], durer: [0.5, 0.35, 1], duchess: [0.5, 0.35, 1], 'young-woman': [0.5, 0.4, 1], 'weyden-lady': [0.5, 0.4, 1],
  eleonora: [0.5, 0.33, 1.2], erasmus: [0.5, 0.4, 1], condottiero: [0.5, 0.42, 1.18], more: [0.5, 0.35, 1], 'young-man': [0.5, 0.3, 1.3],
  bembo: [0.5, 0.4, 1], grandson: [0.5, 0.4, 1], turban: [0.5, 0.4, 1], lucrezia: [0.5, 0.36, 1.45]
};

/* The landscapes and modern pieces, drawn small (about 64 pixels across)
   like an old game's textures; paintings() roughs them up and blows them
   up with hard pixel edges. w and h are the small size. */
function paintArt(name, g, w, h, rand) {
  const grad = (y0, y1, ...stops) => { const l = g.createLinearGradient(0, y0, 0, y1); stops.forEach((c, i) => l.addColorStop(i / (stops.length - 1), c)); return l; };
  const rect = (x, y, rw, rh, c) => { g.fillStyle = c; g.fillRect(x, y, rw, rh); };
  const oval = (x, y, rx, ry, c, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, Math.max(rx, 0.5), Math.max(ry, 0.5), rot, 0, Math.PI * 2); g.fill(); };
  const poly = (pts, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.fill(); };
  const glow = (x, y, r, c) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  // a ridge line across the picture, filled down to the bottom
  const ridge = (y, amp, c, f = 1, phase = rand() * 9) => {
    g.fillStyle = c; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 1) g.lineTo(x, y - amp * (0.6 * Math.abs(Math.sin(x / w * 5 * f + phase)) + 0.4 * Math.sin(x / w * 13 * f + phase * 2)));
    g.lineTo(w, h); g.closePath(); g.fill();
  };
  const pine = (x, y, s, c) => { for (let i = 0; i < 3; i++) poly([[x, y - s * (1 - i * 0.28)], [x - s * (0.18 + i * 0.07), y - s * (0.55 - i * 0.25)], [x + s * (0.18 + i * 0.07), y - s * (0.55 - i * 0.25)]], c); rect(x - 0.5, y - s * 0.12, 1, s * 0.15, c); };
  const treeBlob = (x, y, r, dark, light) => { oval(x, y, r, r * 0.9, dark); oval(x - r * 0.25, y - r * 0.25, r * 0.55, r * 0.5, light); rect(x - 0.5, y + r * 0.6, 1.2, r * 0.9, dark); };
  const clouds = (n, y0, y1, c) => { for (let i = 0; i < n; i++) oval(rand() * w, y0 + rand() * (y1 - y0), w * (0.08 + rand() * 0.12), h * (0.02 + rand() * 0.025), c); };

  switch (name) {
    case 'valley': {
      rect(0, 0, w, h, grad(0, h * 0.6, '#4a5a7a', '#c88a5a', '#f0c27a'));
      glow(w * 0.62, h * 0.55, w * 0.35, 'rgba(255,215,140,0.6)');
      clouds(6, h * 0.08, h * 0.35, 'rgba(240,190,150,0.35)');
      ridge(h * 0.55, h * 0.12, '#6a7a9a', 1.2);
      ridge(h * 0.62, h * 0.08, '#4a5a4a', 0.8);
      ridge(h * 0.72, h * 0.06, '#2e3e26', 1.5);
      g.strokeStyle = '#e8c890'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(w * 0.62, h * 0.62);   // the river, catching the sky
      g.bezierCurveTo(w * 0.5, h * 0.72, w * 0.72, h * 0.8, w * 0.45, h); g.stroke();
      rect(w * 0.3, h * 0.66, w * 0.05, h * 0.04, '#3a2a1e'); poly([[w * 0.29, h * 0.66], [w * 0.325, h * 0.62], [w * 0.36, h * 0.66]], '#2a1a12');
      rect(w * 0.315, h * 0.675, 1, 1, '#ffd890');                                               // one lit window
      treeBlob(w * 0.08, h * 0.62, w * 0.09, '#1a2614', '#2e3e20'); treeBlob(w * 0.92, h * 0.6, w * 0.1, '#1a2614', '#2e3e20');
      break;
    }
    case 'forest': {
      rect(0, 0, w, h, grad(0, h, '#5a6a4a', '#2a3424', '#141a10'));
      glow(w * 0.55, h * 0.45, w * 0.3, 'rgba(230,220,170,0.45)');
      poly([[w * 0.5, h * 0.5], [w * 0.58, h * 0.5], [w * 0.85, h], [w * 0.25, h]], '#6a5a3a');   // the path
      for (let i = 0; i < 14; i++) {
        const x = rand() * w, near = rand(), tw = 1 + near * w * 0.05;
        if (Math.abs(x - w * 0.54) < w * 0.07) continue;
        rect(x, 0, tw, h, near > 0.6 ? '#141a10' : near > 0.3 ? '#2a3222' : '#46503a');
      }
      for (let i = 0; i < 4; i++) poly([[w * (0.48 + i * 0.03), 0], [w * (0.52 + i * 0.03), 0], [w * (0.62 + i * 0.05), h], [w * (0.56 + i * 0.05), h]], 'rgba(240,230,180,0.08)');   // light coming down
      rect(0, h * 0.8, w, h * 0.2, 'rgba(20,26,14,0.5)');
      break;
    }
    case 'moonrise': {
      rect(0, 0, w, h, grad(0, h * 0.55, '#0e1626', '#2a3a52', '#4a5a6a'));
      glow(w * 0.3, h * 0.3, w * 0.22, 'rgba(230,230,200,0.4)'); oval(w * 0.3, h * 0.3, w * 0.035, w * 0.035, '#f0ecd6');
      ridge(h * 0.52, h * 0.1, '#1a2230', 1);
      poly([[w * 0.66, h * 0.52], [w * 0.7, h * 0.24], [w * 0.75, h * 0.26], [w * 0.77, h * 0.52]], '#141820');   // the ruined tower
      rect(w * 0.715, h * 0.28, 1, 1, '#ffd890');
      rect(0, h * 0.55, w, h * 0.45, grad(h * 0.55, h, '#3a4a5a', '#0e141c'));
      for (let i = 0; i < 9; i++) rect(w * 0.3 - w * 0.03 + rand() * w * 0.06, h * (0.58 + i * 0.045), w * (0.04 + rand() * 0.06), 1, 'rgba(240,236,214,0.5)');
      for (let x = 0; x < w; x += 4) rect(x, h * 0.55, 3, 1, '#121820');
      break;
    }
    case 'coast': {
      rect(0, 0, w, h, grad(0, h * 0.6, '#1e2228', '#4a5258', '#8a8a7e'));
      glow(w * 0.3, h * 0.35, w * 0.25, 'rgba(240,230,200,0.35)');                          // a break in the clouds
      clouds(8, 0, h * 0.3, 'rgba(20,24,28,0.6)');
      poly([[w * 0.6, h], [w * 0.62, h * 0.5], [w * 0.75, h * 0.38], [w, h * 0.35], [w, h]], '#2a2620');   // cliffs
      poly([[w * 0.7, h], [w * 0.74, h * 0.6], [w * 0.85, h * 0.52], [w, h * 0.55], [w, h]], '#3a342a');
      rect(0, h * 0.6, w * 0.65, h * 0.4, grad(h * 0.6, h, '#3a4a48', '#1a2422'));
      for (let i = 0; i < 16; i++) oval(rand() * w * 0.68, h * (0.62 + rand() * 0.36), w * (0.03 + rand() * 0.05), 1, 'rgba(235,235,225,0.7)');
      oval(w * 0.62, h * 0.66, w * 0.06, h * 0.05, 'rgba(240,240,230,0.6)');                   // spray against the rocks
      break;
    }
    case 'field': {
      rect(0, 0, w, h, grad(0, h * 0.6, '#5a4a6a', '#d0784a', '#f2c070'));
      glow(w * 0.7, h * 0.58, w * 0.3, 'rgba(255,210,120,0.6)');
      rect(0, h * 0.6, w, h * 0.4, grad(h * 0.6, h, '#c8a050', '#6a5024'));
      for (let i = 0; i < 30; i++) rect(rand() * w, h * (0.62 + rand() * 0.36), 1, 2, 'rgba(90,60,20,0.5)');
      rect(w * 0.33, h * 0.38, 2, h * 0.25, '#2a1e12');                                       // the oak
      oval(w * 0.335, h * 0.34, w * 0.13, h * 0.12, '#2a2a16'); oval(w * 0.3, h * 0.31, w * 0.07, h * 0.07, '#3e3a20');
      for (let i = 0; i < 6; i++) rect(w * (0.5 + rand() * 0.4), h * (0.2 + rand() * 0.2), 2, 1, '#1a1410');   // crows
      rect(w * 0.82, h * 0.56, w * 0.05, h * 0.04, '#3a2a20');                                // a far farmhouse
      break;
    }
    case 'mountains': {
      rect(0, 0, w, h, grad(0, h * 0.55, '#2a3048', '#7a6a7a', '#d8a888'));
      ridge(h * 0.5, h * 0.25, '#7a82a0', 0.9);
      for (let x = 0; x < w; x += 1) { const y = h * 0.5 - h * 0.25 * (0.6 * Math.abs(Math.sin(x / w * 4.5 + 2)) + 0.25); rect(x, y, 1, 2, 'rgba(240,240,250,0.5)'); }   // snow
      ridge(h * 0.56, h * 0.08, '#3a4a40', 1.6);
      rect(0, h * 0.6, w, h * 0.4, grad(h * 0.6, h, '#9a8a90', '#2a3040'));
      for (let i = 0; i < 12; i++) rect(rand() * w, h * (0.62 + rand() * 0.3), w * 0.05, 1, 'rgba(255,235,220,0.3)');
      for (let i = 0; i < 9; i++) pine(i < 5 ? rand() * w * 0.2 : w * 0.8 + rand() * w * 0.2, h * (0.85 + rand() * 0.15), h * (0.25 + rand() * 0.15), '#121a14');
      break;
    }
    case 'waterfall': {
      rect(0, 0, w, h, grad(0, h, '#7a8a90', '#4a5a54'));
      poly([[0, 0], [w * 0.38, 0], [w * 0.42, h * 0.3], [w * 0.36, h], [0, h]], '#3a3a30');   // the gorge walls
      poly([[w, 0], [w * 0.6, 0], [w * 0.57, h * 0.35], [w * 0.64, h], [w, h]], '#2e3028');
      for (let i = 0; i < 6; i++) treeBlob(rand() < 0.5 ? rand() * w * 0.3 : w * 0.7 + rand() * w * 0.3, rand() * h * 0.4, w * 0.05, '#1e2a1a', '#34442a');
      rect(w * 0.44, h * 0.08, w * 0.12, h * 0.7, grad(h * 0.08, h * 0.78, '#e8ece8', '#b8c4c4'));   // the falls
      for (let i = 0; i < 10; i++) rect(w * (0.44 + rand() * 0.11), h * (0.1 + rand() * 0.6), 1, h * 0.12, 'rgba(120,140,140,0.5)');
      glow(w * 0.5, h * 0.8, w * 0.25, 'rgba(240,245,245,0.6)');                            // mist
      rect(w * 0.3, h * 0.85, w * 0.4, h * 0.15, '#3a4a4a');
      break;
    }
    case 'church': {
      rect(0, 0, w, h, grad(0, h * 0.6, '#3a3a5a', '#a87a6a', '#e0b080'));
      ridge(h * 0.6, h * 0.05, '#4a5a3a', 1);
      rect(0, h * 0.62, w, h * 0.38, '#3a4a2a');
      poly([[w * 0.47, h * 0.6], [w * 0.53, h * 0.6], [w * 0.75, h], [w * 0.25, h]], '#8a7a5a');   // the road
      rect(w * 0.55, h * 0.48, w * 0.12, h * 0.12, '#e6e0d0'); poly([[w * 0.54, h * 0.48], [w * 0.61, h * 0.4], [w * 0.68, h * 0.48]], '#4a3a3a');
      rect(w * 0.57, h * 0.3, w * 0.035, h * 0.18, '#e6e0d0'); poly([[w * 0.565, h * 0.3], [w * 0.5875, h * 0.18], [w * 0.61, h * 0.3]], '#4a3a3a');   // the steeple
      rect(w * 0.6, h * 0.52, 1, 2, '#2a2020');
      for (let i = 0; i < 8; i++) rect(w * (0.1 + i * 0.04), h * (0.7 + i * 0.03), 1, h * 0.05, '#2a2016');   // fence posts
      treeBlob(w * 0.82, h * 0.52, w * 0.07, '#1e2a16', '#34421e'); treeBlob(w * 0.15, h * 0.5, w * 0.08, '#1e2a16', '#34421e');
      break;
    }
    case 'marsh': {
      rect(0, 0, w, h, grad(0, h * 0.55, '#2a3040', '#8a8a8a', '#d0c0a0'));
      ridge(h * 0.52, h * 0.03, '#2e3a2e', 1);
      rect(0, h * 0.55, w, h * 0.45, grad(h * 0.55, h, '#a8a090', '#2a3030'));
      for (let i = 0; i < 40; i++) { const x = rand() * w, y = h * (0.55 + rand() * 0.45); rect(x, y - h * 0.12 * rand(), 1, h * 0.14, rand() < 0.5 ? '#2a2a1a' : '#4a4026'); }   // reeds
      rect(w * 0.2, h * 0.25, 1.5, h * 0.35, '#141410'); rect(w * 0.2, h * 0.32, w * 0.06, 1, '#141410'); rect(w * 0.15, h * 0.38, w * 0.05, 1, '#141410');   // a dead tree
      g.strokeStyle = 'rgba(240,235,220,0.55)'; g.lineWidth = 1; g.beginPath(); g.ellipse(w * 0.62, h * 0.72, w * 0.06, h * 0.02, 0, 0, Math.PI * 2); g.stroke();   // the ring
      rect(0, h * 0.5, w, h * 0.08, 'rgba(220,220,210,0.18)');                                  // low mist
      break;
    }
    case 'isle': {
      rect(0, 0, w, h, grad(0, h * 0.6, '#1a2428', '#4a5a5a', '#6a7470'));
      rect(0, h * 0.62, w, h * 0.38, grad(h * 0.62, h, '#2a3434', '#0e1414'));
      poly([[w * 0.28, h * 0.64], [w * 0.32, h * 0.42], [w * 0.4, h * 0.38], [w * 0.6, h * 0.37], [w * 0.68, h * 0.44], [w * 0.72, h * 0.64]], '#c8c0aa');   // pale cliffs
      for (let i = 0; i < 5; i++) rect(w * (0.36 + i * 0.065), h * 0.5, 2, h * 0.08, '#2a2620');   // openings in the rock
      for (let i = 0; i < 7; i++) { const x = w * (0.42 + i * 0.025), top = h * (0.08 + rand() * 0.1); poly([[x, top], [x - w * 0.018, h * 0.42], [x + w * 0.018, h * 0.42]], '#0e1410'); }   // cypresses
      for (let i = 0; i < 10; i++) rect(rand() * w, h * (0.66 + rand() * 0.3), w * 0.06, 1, 'rgba(160,170,165,0.3)');
      poly([[w * 0.44, h * 0.82], [w * 0.56, h * 0.82], [w * 0.53, h * 0.85], [w * 0.46, h * 0.85]], '#1a140e');   // the rowboat, nobody in it
      break;
    }
    case 'winter': {
      rect(0, 0, w, h, grad(0, h * 0.7, '#8a8c90', '#b8b4ac'));
      rect(0, h * 0.68, w, h * 0.32, grad(h * 0.68, h, '#e4e2dc', '#b8b8b4'));
      poly([[w * 0.38, h * 0.68], [w * 0.38, h * 0.3], [w * 0.5, h * 0.16], [w * 0.62, h * 0.3], [w * 0.62, h * 0.68], [w * 0.56, h * 0.68], [w * 0.56, h * 0.36], [w * 0.5, h * 0.27], [w * 0.44, h * 0.36], [w * 0.44, h * 0.68]], '#3a3632');   // the ruined arch
      const bare = (x, s) => { rect(x, h * 0.68 - s, 1.5, s, '#1a1612'); for (let k = 0; k < 5; k++) { const y = h * 0.68 - s * (0.4 + k * 0.12), d = (k % 2 ? 1 : -1) * s * (0.2 + rand() * 0.15); g.strokeStyle = '#1a1612'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + d, y - s * 0.15); g.stroke(); } };
      for (const [x, s] of [[0.1, 0.55], [0.22, 0.45], [0.75, 0.5], [0.88, 0.6], [0.3, 0.35]]) bare(w * x, h * s);
      for (let i = 0; i < 6; i++) rect(w * (0.5 + i * 0.012), h * (0.95 - i * 0.045), 1, 1, '#8a8a88');   // footprints, going in
      break;
    }
    case 'cypress': {
      rect(0, 0, w, h, grad(0, h, '#1a1e34', '#6a5a6a', '#a87a5a'));
      g.fillStyle = '#e8e4cc'; g.beginPath(); g.arc(w * 0.7, h * 0.18, w * 0.07, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a1e34'; g.beginPath(); g.arc(w * 0.73, h * 0.17, w * 0.065, 0, Math.PI * 2); g.fill();   // a thin moon
      rect(0, h * 0.82, w, h * 0.18, '#1a1a14');
      rect(w * 0.08, h * 0.74, w * 0.32, h * 0.08, '#3a3430');                                  // an old wall
      poly([[w * 0.5, h * 0.1], [w * 0.38, h * 0.5], [w * 0.4, h * 0.82], [w * 0.6, h * 0.82], [w * 0.62, h * 0.5]], '#0c140e');
      for (let i = 0; i < 12; i++) oval(w * (0.42 + rand() * 0.16), h * (0.2 + rand() * 0.55), w * 0.05, h * 0.02, '#16221a');
      break;
    }
    case 'color-field': {
      rect(0, 0, w, h, '#6a1c1c');
      const soft = (x, y, rw, rh, c) => { for (let k = 0; k < 4; k++) { g.globalAlpha = 0.35; rect(x - k, y - k * 0.6, rw + k * 2, rh + k * 1.2, c); } g.globalAlpha = 1; rect(x, y, rw, rh, c); };
      soft(w * 0.1, h * 0.1, w * 0.8, h * 0.42, '#1e0c0a');
      soft(w * 0.1, h * 0.6, w * 0.8, h * 0.28, '#a8401e');
      break;
    }
    case 'black-square': {
      rect(0, 0, w, h, '#e4dcc6');
      rect(w * 0.17, h * 0.15, w * 0.68, h * 0.68, '#141210');
      for (let i = 0; i < 26; i++) {                                                              // craquelure, a little red showing through
        const x = w * (0.17 + rand() * 0.68), y = h * (0.15 + rand() * 0.68);
        g.strokeStyle = i % 4 ? 'rgba(200,190,170,0.35)' : 'rgba(150,30,24,0.8)'; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * w * 0.15, y + (rand() - 0.5) * h * 0.15); g.stroke();
      }
      break;
    }
  }
}

function paintings() {
  // each painting is drawn small (64 across, or 72 tall for the narrow ones), then doubled
  // onto its own square of the sheet with hard pixel edges
  const slots = PAINTINGS.map(([, , , , w, h], i) => {
    const lw = w >= h ? 64 : Math.round(72 * w / h), lh = w >= h ? Math.round(64 * h / w) : 72;
    return { lw, lh, sx: (i % ART_COLS) * ART, sy: Math.floor(i / ART_COLS) * ART, sw: lw * 2, sh: lh * 2 };
  });
  const size = ART_SHEET, mat = surface(0xffffff, 0.85);
  if (typeof document !== 'undefined') {
    let seed = 77;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sheet = document.createElement('canvas');
    sheet.width = sheet.height = size;
    const g = sheet.getContext('2d');
    g.fillStyle = '#1a140e'; g.fillRect(0, 0, size, size);                     // (what a portrait shows until it's loaded)
    // old paint: grain, a slightly limited palette, darker corners, yellowed varnish; then onto the sheet
    const finish = (small2d, { lw, lh, sx, sy, sw, sh }) => {
      const img = small2d.getImageData(0, 0, lw, lh), d = img.data;
      for (let k = 0; k < d.length; k += 4) {
        const x = (k / 4) % lw / lw - 0.5, y = Math.floor(k / 4 / lw) / lh - 0.5;
        const shade = 1 - 0.3 * Math.min(1, (x * x + y * y) * 2.2), grain = (rand() - 0.5) * 12;
        [1, 0.95, 0.84].forEach((warm, ch) => { d[k + ch] = Math.min(255, Math.round((d[k + ch] * shade * warm + grain) / 6) * 6); });
      }
      small2d.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(small2d.canvas, sx, sy, sw, sh);
    };
    const smallCanvas = ({ lw, lh }) => { const c = document.createElement('canvas'); c.width = lw; c.height = lh; return c.getContext('2d'); };
    mat.map = new THREE.CanvasTexture(sheet);
    mat.map.colorSpace = THREE.SRGBColorSpace;
    PAINTINGS.forEach(([name], i) => {
      const slot = slots[i];
      if (!PORTRAITS[name]) {                                                  // drawn here
        const s2 = smallCanvas(slot);
        paintArt(name, s2, slot.lw, slot.lh, rand);
        finish(s2, slot);
        return;
      }
      // a real painting: crop it to the frame's shape round its sitter, shrink it, finish it like the rest
      const photo = new Image();
      photo.onload = () => {
        const [fx, fy, zoom] = PORTRAITS[name], want = slot.lw / slot.lh, iw = photo.width, ih = photo.height;
        let cw = Math.min(iw, ih * want) / zoom, ch = cw / want;
        const cx = Math.min(Math.max(iw * fx - cw / 2, 0), iw - cw), cy = Math.min(Math.max(ih * fy - ch / 2, 0), ih - ch);
        const s2 = smallCanvas(slot);
        s2.imageSmoothingQuality = 'high';
        s2.drawImage(photo, cx, cy, cw, ch, 0, 0, slot.lw, slot.lh);
        finish(s2, slot);
        mat.map.needsUpdate = true;
      };
      photo.src = 'art/portraits/' + name + '.jpg';
    });
    mat.map.magFilter = THREE.NearestFilter;
    mat.map.anisotropy = 4;
    // a faint glow of their own, so they read in a dark room
    mat.emissive.set(0xffffff);
    mat.emissiveMap = mat.map;
    mat.emissiveIntensity = 0.28;
  } else mat.color.set(0x4a3a2a);
  const frames = { gilt: metal(0x8a6a2e, 0.5), wood: surface(0x2e1e12, 0.6), black: surface(0x121212, 0.5) };
  const widths = { gilt: 0.17, wood: 0.12, black: 0.06 };
  const turn = { 'x+': Math.PI / 2, 'x-': -Math.PI / 2, 'z+': 0, 'z-': Math.PI };
  return named('paintings', ...PAINTINGS.map(([, face, px, py, w, h, cy, frame, text], i) => {
    const { sx, sy, sw, sh } = slots[i], f = widths[frame];
    const pic = new THREE.PlaneGeometry(w, h), uv = pic.attributes.uv;
    for (let k = 0; k < uv.count; k++)                                         // its own square of the sheet
      uv.setXY(k, (sx + uv.getX(k) * sw) / size, 1 - (sy + sh - uv.getY(k) * sh) / size);
    const bar = (bw, bh, x, y) => tint(solid(new THREE.BoxGeometry(bw, bh, 0.1), [x, y, 0.05]), frames[frame]);
    const g = new THREE.Group();
    g.add(tint(solid(pic, [0, 0, 0.03]), mat),
      bar(w + f * 2, f, 0, h / 2 + f / 2), bar(w + f * 2, f, 0, -h / 2 - f / 2),
      bar(f, h, -w / 2 - f / 2, 0), bar(f, h, w / 2 + f / 2, 0));
    const along = face[0] === 'x', sign = face[1] === '+' ? 1 : -1;
    g.position.set(along ? X(px) + sign * 0.01 : X(px), FLOOR + cy, along ? Z(py) : Z(py) + sign * 0.01);
    g.rotation.y = turn[face];
    return small(say(text, g));
  }));
}

function roomLamps(lamps) {
  const wallZ = Z(1068), patioZ = Z(345);
  return named('lamps',
    floorLamp(lamps, 'lamp-foyer', 140, 775, 28),
    ceramicLamp(lamps, 'lamp-living', 576, 215, 2, 20),
    pendant(lamps, 'lamp-dining', 695, 522, 36),
    pendant(lamps, 'lamp-kitchen', 978, 517, 36),
    bedsideLamp(lamps, 'lamp-master', 900, 1045, 2.1, 16),
    bedsideLamp(lamps, 'lamp-master-2', 1100, 1045, 2.1, 14),               // the other nightstand
    // an end table at the north end of the sectional, so the couch gets light
    endTable('end-table', 345, 400, 248, 294, 1.9),
    tiffanyLamp(lamps, 'lamp-sofa', 372, 271, 1.9, 22),
    pullBulb(lamps, 'lamp-laundry', 710, 898, 26),
    pantryLight(lamps),
    ceilingLight('lamp-toilet', 365, 905),          // over the toilet
    // bathroom: a light bar above the mirror
    named('lamp-bathroom',
      glow(new THREE.BoxGeometry(2, 0.18, 0.2), X(535), FLOOR + 6.75, wallZ - 0.12),
      bulb(lamps, 'lamp-bathroom-light', 535, 1068, 6.55, 24, -0.7)),
    // patio: a lantern on the back wall, beside the patio doors
    // (its light is a spot aimed out over the patio, so it can't shine back into the kitchen)
    (() => {
      const light = new THREE.SpotLight(LAMP_COLOR, 60, 30, 0.75, 0.6, 2);
      light.name = 'lamp-patio-light';
      light.position.set(X(1060), FLOOR + 6.8, patioZ - 0.75);
      light.target.position.set(X(1060), 0, patioZ - 9.5);
      return named('lamp-patio',
        solid(new THREE.BoxGeometry(0.5, 0.75, 0.35), [X(1060), FLOOR + 7, patioZ - 0.2], null, MAT.glow),
        light, light.target);
    })()
  );
}

/* A soft halo texture, drawn on a canvas, for the streetlight. (Skipped
   outside a browser, where there's no canvas.) */
function halo(size) {
  if (typeof document === 'undefined') return new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true
  }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

// The big streetlight by the front walk: pole, arm, head, and a spotlight down on the yard.
function streetlight(lamps) {
  // down by the road, its arm out over it, lighting the road (no shadows:
  // the lamp post by the house has the shadow slot now)
  const H = 26, reach = -5;
  const light = new THREE.SpotLight(0xffd9a0, 2400, 70, 1.0, 0.7, 2);
  light.name = 'streetlight-light';
  light.position.set(reach, H - 0.6, 0);
  light.target.position.set(reach - 1, 0, 0);
  const glare = halo(12);
  glare.position.set(reach, H - 0.7, 0);
  return named('streetlight',
    solid(new THREE.CylinderGeometry(0.22, 0.32, H, 8), [0, H / 2, 0], null, MAT.dark),
    solid(new THREE.BoxGeometry(-reach, 0.18, 0.18), [reach / 2, H - 0.1, 0], null, MAT.dark),
    solid(new THREE.BoxGeometry(1.6, 0.35, 0.8), [reach, H - 0.25, 0], null, MAT.dark),
    glow(new THREE.BoxGeometry(1.3, 0.06, 0.6), reach, H - 0.45, 0),
    light, light.target, glare);
}

// faint moonlight and a whisper of fill, so the dark isn't completely flat
function sky() {
  const moon = shadowed(new THREE.DirectionalLight(0xb8c8ff, 0.95), 2048, 240);     // soft enough to make the grass glow a little
  moon.name = 'moon';
  moon.position.copy(MOON_DIR);
  const cam = moon.shadow.camera;
  cam.left = cam.bottom = -60;
  cam.right = cam.top = 60;
  cam.near = 1;
  moon.shadow.normalBias = 0.08;
  moon.shadow.intensity = 0.85;
  // faint fill, standing in for light bouncing around: dark corners
  // read as dim, not pitch black
  const fill = new THREE.HemisphereLight(0x8ea0c8, 0x2a2016, 0.08);
  return named('sky', moon, moon.target, fill, heavens());
}

/* Stars, a moon and a few drifting clouds. Kept cheap: the stars are
   one draw of ~700 points, the clouds reuse one small soft image, and
   none of it is lit or casts shadows. Only the outside cams really see
   it. */
const SKY_R = 420;

/* Where the moon hangs: high up, where the moonlight comes from. */
const MOON_DIR = new THREE.Vector3(-70, 90, 50);

function heavens() {
  const g = new THREE.Group();
  g.name = 'heavens';

  // stars: random points on the upper half of a big dome
  const rand = (() => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; })();
  const pts = [];
  for (let i = 0; i < 700; i++) {
    const az = rand() * Math.PI * 2, el = Math.asin(0.08 + rand() * 0.92);
    pts.push(Math.cos(el) * Math.cos(az) * SKY_R, Math.sin(el) * SKY_R, Math.cos(el) * Math.sin(az) * SKY_R);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85
  })));

  if (typeof document === 'undefined') return g;      // no canvas outside a browser

  // the moon: a pale disc with a soft glow round it
  const m = MOON_DIR.clone().normalize().multiplyScalar(SKY_R * 0.95);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDisc(0.94), color: 0xf0f2ff, fog: false }));
  moon.position.copy(m);
  moon.scale.set(20, 20, 1);
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softDisc(0), color: 0x6f7fa8, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5
  }));
  glowSprite.position.copy(m);
  glowSprite.scale.set(90, 90, 1);
  g.add(glowSprite, moon);

  // clouds: one soft blob image, stretched and reused, drifting slowly
  const cloudTex = cloudImage();
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, color: 0x4a5670, fog: false, transparent: true, opacity: 0.9, depthWrite: false
    }));
    const az = rand() * Math.PI * 2, el = 0.25 + rand() * 0.6;
    c.userData = { az, el, speed: 0.004 + rand() * 0.006 };
    c.scale.set(140 + rand() * 120, 45 + rand() * 30, 1);
    clouds.push(c);
    g.add(c);
  }
  const place = c => {
    const { az, el } = c.userData, r = SKY_R * 0.9;
    c.position.set(Math.cos(el) * Math.cos(az) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(az) * r);
  };
  clouds.forEach(place);
  g.userData.tick = dt => clouds.forEach(c => { c.userData.az += c.userData.speed * dt; place(c); });
  return g;
}

// a round soft-edged disc (edge = 0 gives a pure glow falloff)
function softDisc(edge) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  if (edge) grad.addColorStop(edge, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// a lumpy soft cloud: a few overlapping blurry circles
function cloudImage() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  for (const [cx, cy, r] of [[70, 74, 44], [118, 58, 54], [170, 70, 46], [205, 82, 32], [42, 86, 28], [140, 88, 40]]) {
    const grad = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 256, 128);
  }
  return new THREE.CanvasTexture(c);
}

/* Give each part of the house its own grey, and switch on shadows:
   every solid casts and catches them, except things that glow. */
function paint(scene) {
  const set = (name, mat) => scene.traverse(o => {
    if (o.name === name) o.traverse(m => { if (m.isMesh && !m.material.isMeshBasicMaterial && !m.userData.keep) m.material = mat; });
  });
  // a group's solids in order, e.g. a tree's trunk then its canopy
  const parts = (name, ...mats) => scene.traverse(o => {
    if (o.name !== name) return;
    o.children.forEach((c, i) => {
      const mat = mats[Math.min(i, mats.length - 1)];
      c.traverse(m => { if (m.isMesh && !m.userData.keep) m.material = mat; });
    });
  });
  set('walls', MAT.wall);
  set('ceiling', MAT.ceiling);
  set('foundation', MAT.floor);
  set('roof', MAT.roof);
  set('foyer-roof', MAT.roof);
  set('doors', MAT.door);
  set('door-front', MAT.frontDoor);
  set('porches', MAT.wood);
  set('sofa', MAT.sofa);
  set('armchair', MAT.armchair);
  set('stools', MAT.dark);
  set('wood-stove', MAT.dark);
  parts('wood-stove', MAT.brick, MAT.dark);              // brick hearth, black iron stove
  set('island', MAT.cabinet);
  set('counter-east', MAT.cabinet);
  set('counter-south', MAT.cabinet);
  set('fridge', MAT.steel);
  set('washer', MAT.appliance);
  set('dryer', MAT.appliance);
  set('shower', MAT.porcelain);
  set('toilet', MAT.toilet);
  set('vanity', MAT.furniture);                          // oak cabinet (its top and sink keep their own)
  set('closet-shelves', MAT.trim);
  parts('pine', MAT.bark, MAT.pine);
  set('bush', MAT.leaves);
  set('streetlight', MAT.pole);
  parts('mailbox', MAT.furniture, MAT.dark, MAT.frontDoor);  // wood post, black box, red flag
  set('door-closet', MAT.trim);                          // white accordion door
  set('door-pocket', MAT.trim);                          // white pocket door
  set('kitchen-sink', MAT.steel);
  set('cooktop', MAT.dark);
  for (const n of ['lamp-foyer', 'lamp-living', 'lamp-master', 'lamp-master-2', 'lamp-sofa', 'lamp-porch']) set(n, MAT.dark);   // shades keep glowing
  scene.traverse(o => {
    if (!o.isMesh) return;
    const glows = o.material.isMeshBasicMaterial || o.userData.noShadow;
    o.castShadow = !glows && !o.userData.small;
    o.receiveShadow = !glows;
  });
}

/* ─── light switches ────────────────────────── */

/* A circuit is a few lamps switched together: each room's ceiling and
   wall lights hang off a switch plate by its doorway; lamps you switch
   at the lamp itself are circuits of their own (E on the lamp, or the
   laundry bulb's pull string). In first person, E on a switch plate or
   one of those lamps flips it; ?debug has them all as buttons; anomaly
   code can call scene.userData.switches.set('kitchen', false). */
export const CIRCUITS = {
  'porch light': ['lamp-porch', 'lamp-post', 'path-lamps'],
  'living room': ['lamp-pillar', 'lamp-dining'],
  'kitchen': ['lamp-kitchen', 'lamp-sink'],
  'patio': ['lamp-patio'],
  'pantry': ['lamp-pantry'],
  'bathroom': ['lamp-bathroom', 'lamp-toilet'],
  'bedroom': ['lamp-standing'],
  'foyer lamp': ['lamp-foyer'], 'table lamp': ['lamp-living'], 'sofa lamp': ['lamp-sofa'],
  'nightstand': ['lamp-master'], 'nightstand 2': ['lamp-master-2'], 'desk lamp': ['lamp-desk'],
  'standing lamp': ['lamp-standing'], 'laundry bulb': ['lamp-laundry']
};
// lamps that switch at the lamp itself
const AT_THE_LAMP = ['foyer lamp', 'table lamp', 'sofa lamp', 'nightstand', 'nightstand 2', 'desk lamp', 'standing lamp', 'laundry bulb'];
// switch plates: [circuit, x px, y px, which way the plate faces]
const PLATES = [
  ['porch light', 124, 724, 'x+'], ['living room', 295, 762, 'x-'], ['patio', 1036, 364, 'z+'], ['kitchen', 1050, 364, 'z+'],
  ['pantry', 1072, 700, 'x+'], ['bathroom', 525, 825, 'z+'], ['bedroom', 815, 824, 'x+']
];

function switchPlates() {
  const plates = PLATES.map(([circuit, px, py, face]) => {
    const alongX = face[0] === 'z', out = face[1] === '-' ? -1 : 1, x = X(px), z = Z(py), y = FLOOR + 4;
    const lever = solid(new THREE.BoxGeometry(0.05, 0.13, 0.05), [0, 0.03, 0]);
    const pivot = new THREE.Group();
    pivot.add(lever);
    pivot.position.set(alongX ? 0 : 0.035 * out, 0, alongX ? 0.035 * out : 0);
    const g = named('switch-' + circuit.replace(/ /g, '-'),
      solid(alongX ? new THREE.BoxGeometry(0.27, 0.42, 0.03) : new THREE.BoxGeometry(0.03, 0.42, 0.27), [0, 0, 0]), pivot);
    g.position.set(x + (alongX ? 0 : 0.015 * out), y, z + (alongX ? 0.015 * out : 0));
    g.userData.switch = circuit;
    g.userData.lever = pivot;
    g.userData.leverAxis = alongX ? 'x' : 'z';
    g.userData.leverSign = out;                         // which way is up depends on which way the plate faces
    g.userData.movesParts = true;                       // the lever flips; don't weld it into the plate
    return tint(g, MAT.trim);
  });
  return named('switch-plates', ...plates);
}

function wireLights(scene) {
  const groups = new Map();
  for (const names of Object.values(CIRCUITS)) for (const n of names) {
    const g = scene.getObjectByName(n);
    if (!g || groups.has(n)) continue;
    // its own copy of each glowing material, so this lamp can go dark on its own
    const copies = new Map(), glows = [];
    g.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material;
      if (!m || !m.isMeshBasicMaterial) return;
      if (!copies.has(m)) { const c = m.clone(); copies.set(m, c); glows.push({ mat: c, color: c.color.clone(), add: c.blending === THREE.AdditiveBlending }); }
      o.material = copies.get(m);
    });
    g.userData.glows = glows;
    g.userData.lit = true;
    groups.set(n, g);
  }
  for (const c of AT_THE_LAMP) for (const n of CIRCUITS[c]) { const g = groups.get(n); if (g) g.userData.switch = c; }
  const plates = [];
  scene.traverse(o => { if (o.userData.lever) plates.push(o); });
  const setGroup = (g, on) => {
    g.userData.lit = on;
    g.traverse(o => {
      if (o.isLight) { if (o.userData.base === undefined) o.userData.base = o.intensity; o.intensity = on ? o.userData.base : 0; }
      if (o.isSprite) o.visible = on;
    });
    for (const { mat, color, add } of g.userData.glows) mat.color.copy(color).multiplyScalar(on ? 1 : add ? 0 : 0.12);
  };
  const isOn = name => CIRCUITS[name].some(n => groups.get(n) && groups.get(n).userData.lit);
  const set = (name, on) => {
    for (const n of CIRCUITS[name]) if (groups.get(n)) setGroup(groups.get(n), on);
    for (const p of plates) {                                      // flick the levers to match
      const up = isOn(p.userData.switch) ? -0.35 : 0.35;
      p.userData.lever.rotation[p.userData.leverAxis] = (p.userData.leverAxis === 'x' ? up : -up) * p.userData.leverSign;
    }
  };
  scene.userData.switches = {
    names: Object.keys(CIRCUITS),
    isOn, set,
    toggle: name => set(name, !isOn(name)),
    all: on => Object.keys(CIRCUITS).forEach(n => set(n, on))
  };
  scene.userData.switches.all(true);
}

/* ─── fewer, bigger draws ───────────────────── */

/* Every piece of furniture is lots of little boxes, and the graphics
   card pays for each separate one, in every view and in every shadow.
   So once everything is painted, each named group's parts get welded
   into one mesh per colour, plus one set of ink edges. Names stay, so
   anomaly code can still grab the 'sofa' or the 'bed' and move or hide
   it. Left as they are: named groups inside (they get their own turn),
   lights, window glass and the mirror, the sky, and anything that moves
   its own parts (the folding and sliding closet doors, the fire). A
   door that swings as a whole is welded inside itself, and still swings. */
function bake(scene) {
  const groups = [];
  scene.traverse(o => { if (o.name && !o.isMesh && !o.isLight && !o.userData.tick && !o.userData.movesParts) groups.push(o); });
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  for (const g of groups) {
    g.updateMatrixWorld(true);
    inv.copy(g.matrixWorld).invert();
    const buckets = new Map(), keep = [];
    let parts = 0;
    const walk = node => {
      for (const d of node.children) {
        const solidPart = (d.isMesh || d.isLineSegments) && !d.name && !d.userData.reflect &&
          d.onBeforeRender === THREE.Object3D.prototype.onBeforeRender && !d.children.length;
        if (solidPart) {
          const sig = d.isMesh ? colourless(d.material) : null;
          const key = [sig || d.material.uuid, d.layers.mask, d.castShadow, d.receiveShadow, d.isMesh].join('|');
          if (!buckets.has(key)) buckets.set(key, { first: d, geos: [], sig });
          rel.multiplyMatrices(inv, d.matrixWorld);
          const geo = (d.geometry.index ? d.geometry.toNonIndexed() : d.geometry.clone()).applyMatrix4(rel);
          if (d.isMesh && !geo.attributes.normal) geo.computeVertexNormals();
          buckets.get(key).geos.push(sig ? paintVertices(geo, d.material) : geo);
          parts++;
        } else if (!d.name && (d.type === 'Group' || d.type === 'Object3D') && d.children.length &&
                   !d.userData.tick && !d.userData.movesParts) {
          walk(d);                                          // a plain holder: look inside, then drop it
        } else {
          keep.push(d);                                     // leave as it is, where it is
        }
      }
    };
    walk(g);
    if (parts <= buckets.size) continue;                    // nothing to weld
    const out = [];
    for (const { first, geos, sig } of buckets.values()) {
      const merged = weld(geos, first.isMesh);
      const mat = sig ? sharedMaterial(sig, first.material) : first.material;
      const obj = first.isMesh ? new THREE.Mesh(merged, mat) : new THREE.LineSegments(merged, mat);
      obj.layers.mask = first.layers.mask;
      obj.castShadow = first.castShadow;
      obj.receiveShadow = first.receiveShadow;
      out.push(obj);
    }
    for (const d of keep) {
      // things that were inside a holder we dropped get re-placed relative to g;
      // things already directly in g keep their own transform untouched (re-deriving
      // it can flip a door's rotation into an equivalent form its hinge code can't move)
      if (d.parent === g) continue;
      rel.multiplyMatrices(inv, d.matrixWorld);
      rel.decompose(d.position, d.quaternion, d.scale);
    }
    g.clear();
    g.add(...out, ...keep);
  }
}

/* Each say() wrapper becomes an examine area: a box round its parts,
   stored with the nearest named group (welding drops the wrapper). In
   first person, looking at that group only offers the text of the box
   you're actually looking at. */
function examineAreas(scene) {
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.userData.say) return;
    let g = o.parent;
    while (g && !g.name) g = g.parent;
    if (g) (g.userData.areas ||= []).push({ box: new THREE.Box3().setFromObject(o).expandByScalar(0.08), text: o.userData.say });
    delete o.userData.say;
  });
}

/* Plain painted surfaces (no pictures, not see-through) that differ only
   in colour can be one draw: the colour moves into the corners of each
   triangle, and every such surface in the house shares one material.
   Lamp glows (MeshBasicMaterial) aren't touched, since the switches dim them. */
const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'alphaMap', 'envMap', 'lightMap', 'displacementMap'];
function colourless(m) {
  if (!m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.transparent || MAPS.some(k => m[k]) ||
      Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) return null;
  return [m.roughness, m.metalness, m.side, m.flatShading, m.emissive.getHex(), m.emissiveIntensity, m.polygonOffset,
    m.polygonOffsetFactor, m.polygonOffsetUnits, m.alphaTest, m.depthWrite, m.fog, m.wireframe, m.opacity].join();
}
function paintVertices(geo, m) {
  const n = geo.attributes.position.count, out = new Float32Array(n * 3);
  const had = m.vertexColors ? geo.attributes.color : null;
  for (let i = 0; i < n; i++) {
    out[i * 3] = m.color.r * (had ? had.getX(i) : 1);
    out[i * 3 + 1] = m.color.g * (had ? had.getY(i) : 1);
    out[i * 3 + 2] = m.color.b * (had ? had.getZ(i) : 1);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}
const sharedMaterials = new Map();
function sharedMaterial(sig, like) {
  if (!sharedMaterials.has(sig)) {
    const m = like.clone();
    m.color.set(0xffffff);
    m.vertexColors = true;
    sharedMaterials.set(sig, m);
  }
  return sharedMaterials.get(sig);
}

// join several geometries (already in place) into one
function weld(geos, mesh) {
  const names = mesh ? ['position', 'normal', 'uv', 'color'].filter(n => geos.every(g => g.attributes[n])) : ['position'];
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = geos[0].attributes[n].itemSize;
    const arr = new Float32Array(geos.reduce((t, g) => t + g.attributes[n].count * size, 0));
    let at = 0;
    for (const g of geos) { arr.set(g.attributes[n].array, at); at += g.attributes[n].count * size; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

/* ─── everything ────────────────────────────── */

// weld: false skips bake(), for check-route.mjs (its rays test big welded meshes slowly)
export function buildWorld({ weld = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  // the far yard fades into the night
  scene.fog = new THREE.Fog(0x000000, 110, 340);
  const lamps = [];

  scene.add(
    ground(),
    path(),
    shell(),
    walls(),
    doors(),
    porches(),
    livingRoom(),
    kitchen(),
    master(),
    bathroom(),
    laundry(),
    foyer(),
    frontPorch(lamps),
    road(),
    driveway(),
    pathLamps(),
    lampPost(lamps, -33.5, -6.5),
    yardAt(mailbox(), -103.5, 2),                 // at the bottom of the walk, by the driveway
    yardAt(pineTree(1.05, 1), -39, -13),
    yardAt(pineTree(0.9, 2), -24, -31),
    yardAt(pineTree(1.1, 3), 30, 30),
    yardAt(pineTree(0.95, 4), 36, -30),
    yardAt(pineTree(1.0, 5), 12, 33),
    yardAt(pineTree(0.85, 6), 40, 8),
    forest(),
    yardAt(bush(), -28, -12),
    yardAt(bush(), -28, 12),
    yardAt(streetlight(lamps), STREET[0], STREET[1]),
    roomLamps(lamps),
    stereo(),
    fiddleFig(338, 198),
    clutter(),
    paintings(),
    switchPlates(),
    sky()
  );
  paint(scene);
  wireLights(scene);
  for (const [name, text] of Object.entries(INSPECT)) scene.traverse(o => { if (o.name === name) o.userData.inspect = text; });
  // ghoul1 never goes outside, so check-route.mjs needn't test him against the yard
  for (const n of ['ground', 'forest', 'road', 'path', 'path-lamps', 'lamp-post', 'mailbox', 'streetlight', 'pine', 'bush', 'heavens', 'driveway'])
    scene.traverse(o => { if (o.name === n) o.traverse(m => { m.userData.passable = true; }); });
  for (const n of ['ground', 'forest', 'path', 'path-lamps', 'road', 'driveway'])
    scene.traverse(o => { if (o.name === n) o.traverse(m => { if (m.isMesh) m.castShadow = false; }); });
  examineAreas(scene);
  if (weld) bake(scene);
  scene.userData.lamps = lamps;
  return scene;
}
