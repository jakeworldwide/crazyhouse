/* ============================================================
   crazyhouse: the crazinesses.

   Each one is an entry in CRAZINESS:
     name       craziness1, craziness2, ... (what the debug panel lists)
     cam        the cam/room it happens in: what you report (a list,
                ['foyer', 'front yard'], if more than one cam sees it;
                any of them counts)
     observable 1 if it can happen while you're watching its cam (you see it
                happen: a door swinging open, a chair turning, a light
                going out); leave it out (0) and it waits until you're
                looking somewhere else
     intensity  1  something moves, appears or disappears
                2  something strange: a painting turns into an advert,
                   writing that wasn't there
                3  something really crazy: a person, a ghost, something big
                4  super crazy, coming straight at the cam (counts double
                   toward a craziness overload)
     approach   seconds: it's coming for the cam. Its clock starts the first
                time you cycle to its cam, and if it isn't reported by
                then you're dead (the intensity 4s; see approach())
     at         [px, py] on the blueprint, roughly where it is (so the
                lamps nearby redraw their shadows)
     note       what's going on, for whoever reads this
     start(ctx) make it happen; stop(ctx) put everything back
     frame(ctx, age, p)  optional, every frame while it's going (age in
                seconds; p is how far an approach has got, 0..1)

   ctx has THREE, scene, X(px), Z(py), FLOOR, walkHeight(x, z),
   find(name), cam(name), add(obj), remove(obj), moved(x, z),
   paintings (repaint(name, draw, { crisp }) / restore(name)) and
   tween(seconds, f) (f(p) every frame, p easing 0 to 1, for moving
   things smoothly; moves() below does the usual case).

   Every cam has 6 or 7. To add one: copy something close, give it the
   next number, and make sure it's plainly in its own room from its cam.
   ============================================================ */

/* ─── helpers: moving what's already there ─── */

// where something belongs (remembered the first time a craziness moves it)
const homeOf = obj => obj.userData.home ||= { p: obj.position.clone(), r: obj.rotation.y };

// turn something by `angle` round the point (x, z) and move it by (dx, dz) feet, from where it belongs
function turnAbout(obj, x, z, angle, dx = 0, dz = 0) {
  const { p, r } = homeOf(obj), c = Math.cos(angle), s = Math.sin(angle), ox = p.x - x, oz = p.z - z;
  obj.rotation.y = r + angle;
  obj.position.set(x + c * ox + s * oz + dx, p.y, z - s * ox + c * oz + dz);
}

/* something sliding or turning to a new spot over `seconds` (so if you're
   watching, you see it go). pose(ctx, p): p 0 is where it belongs, 1 is
   the crazy spot; anything between is on the way. */
function moves(seconds, pose) {
  let tw = null;
  return {
    start(ctx) { tw = ctx.tween(seconds, p => pose(ctx, p)); },
    stop(ctx) { tw?.cancel(); pose(ctx, 0); }
  };
}

// slide (dx, dz blueprint pixels) and turn (angle) something round its own middle
function shifts(name, { dx = 0, dz = 0, angle = 0, seconds = 3 }) {
  const pivotOf = (ctx, o) => o.userData.pivot ||= (homeOf(o), new ctx.THREE.Box3().setFromObject(o).getCenter(new ctx.THREE.Vector3()));
  return moves(seconds, (ctx, p) => {
    const o = ctx.find(name), c = pivotOf(ctx, o), ft = px => ctx.X(px) - ctx.X(0);
    turnAbout(o, c.x, c.z, angle * p, ft(dx) * p, ft(dz) * p);
  });
}

// a door (anything openable) swinging to `to` (1 open, 0 shut) by itself, slowly
function opens(name, seconds = 3, to = 1) {
  let was = 0;
  return {
    start(ctx) { const d = ctx.find(name).userData; was = d.open; d.openTo(to, seconds); },
    stop(ctx) { const d = ctx.find(name).userData; d.setOpen(was); d.openTo(was, 0.01); }   // (stops it mid-swing too)
  };
}

// every door whose name starts with `prefix`, all at once
function opensAll(prefix, seconds = 1.6) {
  const was = new Map();
  return {
    start(ctx) {
      ctx.scene.traverse(o => { if (o.name.startsWith(prefix) && o.userData.openTo) was.set(o, o.userData.open); });
      for (const o of was.keys()) o.userData.openTo(1, seconds * (0.6 + Math.random() * 0.8));
    },
    stop() { for (const [o, w] of was) { o.userData.setOpen(w); o.userData.openTo(w, 0.01); } was.clear(); }
  };
}

// a light (a circuit in world.js's CIRCUITS) going out by itself
function lightsOut(circuit) {
  let was = true;
  return {
    start(ctx) { const sw = ctx.scene.userData.switches; was = sw.isOn(circuit); sw.set(circuit, false); },
    stop(ctx) { ctx.scene.userData.switches.set(circuit, was); }
  };
}

// something that's just gone
function hides(name) {
  return { start: ctx => { ctx.find(name).visible = false; }, stop: ctx => { ctx.find(name).visible = true; } };
}

// a painting turning into something else (drawn over the top of it, sharp)
function repaints(name, draw) {
  return { start: ctx => ctx.paintings.repaint(name, draw, { crisp: true }), stop: ctx => ctx.paintings.restore(name) };
}

/* ─── helpers: things that turn up ─── */

// built once by make(ctx), added and taken away; frame(ctx, age, thing) every frame if given
function appears(make, frame) {
  let thing = null;
  return {
    start(ctx) { thing ||= make(ctx); ctx.add(thing); },
    stop(ctx) { if (thing) ctx.remove(thing); },
    ...(frame && { frame: (ctx, age) => thing && frame(ctx, age, thing) })
  };
}

const shadows = g => { g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); return g; };

/* A tall, thin, dark figure with pale points for eyes. Its front is +z;
   faceTowards turns it to look at a point, head tilted up or down to meet
   it. face: a colour for a pale face instead, with black holes for eyes
   (a pinprick of light in each unless pupils: false) and a black mouth. */
function figure(THREE, { height = 6.6, width = 1.2, eyes = 0.045, eyeColour = 0xf2efe6, skin = 0x0b0a0a, face = null, pupils = true } = {}) {
  const dark = new THREE.MeshStandardMaterial({ color: skin, roughness: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: eyeColour });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const pale = face && new THREE.MeshStandardMaterial({ color: face, roughness: 0.85, emissive: face, emissiveIntensity: 0.2 });
  const g = new THREE.Group(), head = new THREE.Group();
  const part = (geo, x, y, z, rz = 0, mat = dark) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = m.receiveShadow = true; return m; };
  const body = part(new THREE.CapsuleGeometry(width * 0.32, height * 0.5, 4, 12), 0, height * 0.47, 0);
  body.scale.z = 0.6;
  const r = width * 0.28;
  head.position.set(0, height * 0.9, 0.05);
  head.add(part(new THREE.SphereGeometry(r, 14, 10), 0, 0, 0, 0, pale || dark));
  head.children[0].scale.set(0.85, 1.2, 0.95);
  const on = (geo, mat, x, y, z, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.z = sz; head.add(m); return m; };
  for (const side of [-1, 1]) {
    if (face) {
      on(new THREE.SphereGeometry(eyes * 2.2, 10, 8), black, side * r * 0.36, r * 0.12, r * 0.88, 0.5);
      if (pupils) on(new THREE.SphereGeometry(eyes * 0.45, 6, 4), glow, side * r * 0.36, r * 0.12, r * 0.88 + eyes * 1.15);
    } else on(new THREE.SphereGeometry(eyes, 8, 6), glow, side * r * 0.36, r * 0.12, r * 0.86);
    g.add(part(new THREE.CapsuleGeometry(0.08, height * 0.42, 4, 8), side * width * 0.42, height * 0.5, 0, side * 0.06));   // long arms
  }
  if (face) on(new THREE.SphereGeometry(r * 0.3, 10, 8), black, 0, -r * 0.5, r * 0.84, 0.4).scale.y = 0.45;
  g.add(body, head);
  g.userData.head = head;
  return g;
}
function faceTowards(fig, x, y, z) {
  fig.rotation.y = Math.atan2(x - fig.position.x, z - fig.position.z);
  const head = fig.userData.head, hy = fig.position.y + head.position.y;
  head.rotation.x = -Math.atan2(y - hy, Math.hypot(x - fig.position.x, z - fig.position.z));
}
const facingCam = (ctx, f, cam) => { const c = ctx.cam(cam).pos; faceTowards(f, c[0], c[1], c[2]); return f; };

// a figure standing at [px, py], looking at a cam (or at a point lookAt(ctx) gives)
function standsAt(px, py, opts, lookAt, lift = 0) {
  return appears(ctx => {
    const f = figure(ctx.THREE, opts), x = ctx.X(px), z = ctx.Z(py);
    f.position.set(x, ctx.walkHeight(x, z) + lift, z);
    if (typeof lookAt === 'string') facingCam(ctx, f, lookAt); else faceTowards(f, ...lookAt(ctx));
    return f;
  });
}

// a see-through, pale someone in a long gown, drifting a little; front +z
function ghost(THREE, height = 6.2) {
  const mist = new THREE.MeshBasicMaterial({ color: 0xd4dde3, transparent: true, opacity: 0.28, depthWrite: false });
  const pale = new THREE.MeshBasicMaterial({ color: 0xe8eef0, transparent: true, opacity: 0.55, depthWrite: false });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false });
  const g = new THREE.Group(), head = new THREE.Group();
  const gown = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.75, height * 0.78, 16, 1, true), mist);
  gown.position.y = height * 0.39;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 10), pale);
  skull.scale.set(0.85, 1.15, 0.9);
  head.position.y = height * 0.86;
  head.add(skull);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), black);
    eye.position.set(s * 0.11, 0.05, 0.27);
    head.add(eye);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, height * 0.38, 8), mist);
    arm.position.set(s * 0.42, height * 0.56, 0.05);
    g.add(arm);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), black);
  mouth.scale.set(0.8, 1.6, 0.5);
  mouth.position.set(0, -0.17, 0.27);
  head.add(mouth);
  g.add(gown, head);
  g.userData.head = head;
  return g;
}
const drifting = (ctx, age, g) => { g.position.y = g.userData.y0 + 0.25 + 0.12 * Math.sin(age * 1.3); };
function ghostAt(px, py, cam) {
  return appears(ctx => {
    const g = ghost(ctx.THREE), x = ctx.X(px), z = ctx.Z(py);
    g.position.set(x, ctx.walkHeight(x, z), z);
    g.userData.y0 = g.position.y;
    return facingCam(ctx, g, cam);
  }, drifting);
}

// pairs of eyes shining out of the dark at [px, py, height] spots, looking at a cam; now and then a pair blinks
function eyesAt(spots, cam, size = 0.09) {
  return appears(ctx => {
    const { THREE } = ctx, glow = new THREE.MeshBasicMaterial({ color: 0xfff0b8 }), c = ctx.cam(cam).pos, g = new THREE.Group();
    for (const [px, py, y] of spots) {
      const x = ctx.X(px), z = ctx.Z(py), dx = c[0] - x, dz = c[2] - z, l = Math.hypot(dx, dz), ox = -dz / l * size * 2.2, oz = dx / l * size * 2.2;
      const pair = new THREE.Group();
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), glow);
        e.position.set(x + s * ox, y, z + s * oz);
        pair.add(e);
      }
      g.add(pair);
    }
    return g;
  }, (ctx, age, g) => g.children.forEach((pair, i) => { pair.visible = (age * 0.8 + i * 0.73) % 3.1 > 0.14; }));
}

// a picture on a wall (or glass) at [px, py], `y` feet up off the floor, w x h feet; face: which way it faces
function decal(ctx, { px, py, y, w, h, face, draw }) {
  const { THREE } = ctx, c = document.createElement('canvas');
  c.width = Math.round(w * 128); c.height = Math.round(h * 128);
  draw(c.getContext('2d'), c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  const turn = { 'x+': Math.PI / 2, 'x-': -Math.PI / 2, 'z+': 0, 'z-': Math.PI }[face];
  m.rotation.y = turn;
  m.position.set(ctx.X(px) + Math.sin(turn) * 0.03, ctx.FLOOR + y, ctx.Z(py) + Math.cos(turn) * 0.03);
  return m;
}

// a big pale head (r feet), black eyes and mouth; with hands, two pale hands up beside it; front +z
function bigHead(THREE, r, hands = false) {
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.85, emissive: 0xd8cfc0, emissiveIntensity: 0.22 });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const g = new THREE.Group(), head = new THREE.Group();
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, to = head) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); to.add(m); return m; };
  add(new THREE.SphereGeometry(r, 20, 14), skin, 0, 0, 0, 0.85, 1.15, 0.9);
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(r * 0.2, 10, 8), black, s * r * 0.33, r * 0.15, r * 0.78, 1, 1.15, 0.5);
    add(new THREE.SphereGeometry(r * 0.035, 6, 4), glint, s * r * 0.33, r * 0.15, r * 0.9);
    if (hands) add(new THREE.SphereGeometry(r * 0.5, 12, 8), skin, s * r * 1.35, -r * 0.1, r * 0.5, 0.75, 1.1, 0.25, g);
  }
  add(new THREE.SphereGeometry(r * 0.3, 10, 8), black, 0, -r * 0.5, r * 0.78, 1, 0.55, 0.45);
  g.add(head);
  g.userData.head = head;
  return g;
}

// a plain wooden chair, front +z
function chair(THREE, colour = 0x5e4128) {
  const wood = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8 }), g = new THREE.Group();
  const box = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood); m.position.set(x, y, z); g.add(m); };
  box(1.5, 0.12, 1.4, 0, 1.5, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.12, 1.5, 0.12, sx * 0.65, 0.75, sz * 0.6);
  for (const sx of [-1, 1]) box(0.12, 1.9, 0.12, sx * 0.65, 2.45, -0.62);
  box(1.42, 0.3, 0.08, 0, 3.25, -0.62);
  box(1.42, 0.15, 0.08, 0, 2.5, -0.62);
  return shadows(g);
}

// a pair of muddy work boots, toes +z
function boots(THREE) {
  const leather = new THREE.MeshStandardMaterial({ color: 0x2c1f15, roughness: 0.75 });
  const mud = new THREE.MeshStandardMaterial({ color: 0x3d3122, roughness: 1 });
  const g = new THREE.Group();
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); };
  for (const s of [-1, 1]) {
    box(0.4, 0.07, 1.02, s * 0.27, 0.035, 0.12, mud);
    box(0.36, 0.26, 0.95, s * 0.27, 0.2, 0.12, leather);
    box(0.36, 0.85, 0.42, s * 0.27, 0.6, -0.16, leather);
  }
  return shadows(g);
}

// a birthday cake with its candles lit
function cake(THREE) {
  const g = new THREE.Group(), flames = [];
  const icing = new THREE.MeshStandardMaterial({ color: 0xf3ece2, roughness: 0.6 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xd9708f, roughness: 0.6 });
  const flame = new THREE.MeshBasicMaterial({ color: 0xffc35a });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.42, 24), icing);
  base.position.y = 0.21;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.515, 0.515, 0.08, 24), pink);
  band.position.y = 0.2;
  g.add(base, band);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, x = Math.cos(a) * 0.3, z = Math.sin(a) * 0.3;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), i % 2 ? pink : icing);
    candle.position.set(x, 0.57, z);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), flame);
    f.position.set(x, 0.77, z);
    f.scale.y = 1.7;
    g.add(candle, f);
    flames.push(f);
  }
  g.userData.flames = flames;
  return g;
}

// someone in the bed: a long lump under the covers and a head on the pillow, eyes open; head at +z
function sleeper(THREE) {
  const cover = new THREE.MeshStandardMaterial({ color: 0x7a4a40, roughness: 1 });
  const g = new THREE.Group();
  const lump = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 3.6, 4, 12), cover);
  lump.rotation.x = Math.PI / 2;
  lump.scale.set(1, 1, 0.5);
  lump.position.set(0, 0.22, -2.4);
  const head = figure(THREE, { width: 1.3, face: 0xcdbca9, eyes: 0.05 }).userData.head;
  head.position.set(0, 0.3, 0);
  g.add(shadows(new THREE.Group().add(lump)), head);
  g.userData.head = head;
  return g;
}

// the kitchen TV showing something it shouldn't
function tvShows(draw) {
  let screen = null, was = null, mat = null;
  return {
    start(ctx) {
      ctx.find('tv').traverse(o => { if (o.isMesh && o.material.uniforms?.tile) screen = o; });
      if (!screen) return;
      if (!mat) {
        const c = document.createElement('canvas');
        c.width = 160; c.height = 120;
        draw(c.getContext('2d'), c.width, c.height);
        const tex = new ctx.THREE.CanvasTexture(c);
        tex.colorSpace = ctx.THREE.SRGBColorSpace;
        mat = new ctx.THREE.MeshBasicMaterial({ map: tex });
      }
      was = screen.material;
      screen.material = mat;
    },
    stop() { if (screen && was) screen.material = was; }
  };
}

/* ─── helpers: the intensity 4s ─── */

// in fits and starts: a lurch forward, stillness, another lurch
const lurch = p => { const n = 9, k = p * n, i = Math.floor(k), f = Math.min(1, (k - i) / 0.3); return Math.min(1, (i + f * f * (3 - 2 * f)) / n); };

/* Something starting at [px, py] and coming straight at a cam over
   `seconds`, right down the line you see it along (so it just keeps
   getting bigger), until its face is up against the lens. Report it
   before it gets there or you're dead. */
function approach(camName, [px, py], seconds = 20, opts = {}) {
  let fig = null, from = null, to = null, lens = null;
  const place = (age, p) => {
    fig.position.lerpVectors(from, to, lurch(p));
    faceTowards(fig, lens.x, lens.y, lens.z);
    fig.userData.head.rotation.z = Math.sin(age * 9) * 0.14 * p;                  // its head twitching, worse as it comes
  };
  return {
    approach: seconds,
    start(ctx) {
      const { THREE } = ctx;
      fig ||= figure(THREE, { height: 7.4, width: 1.25, eyes: 0.06, face: 0xd9d2c5, ...opts });
      const x = ctx.X(px), z = ctx.Z(py), up = fig.userData.head.position.y;
      from = new THREE.Vector3(x, ctx.walkHeight(x, z), z);
      lens = new THREE.Vector3(...ctx.cam(camName).pos);
      const along = from.clone().setY(from.y + up).sub(lens).normalize();
      to = lens.clone().addScaledVector(along, 1.9);
      to.y -= up;
      ctx.add(fig);
      place(0, 0);
    },
    frame: (ctx, age, p) => fig && place(age, p),
    stop(ctx) { if (fig) ctx.remove(fig); }
  };
}

/* ─── adverts and such, drawn over paintings ─── */

const ad = (bg, lines) => (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [text, y, size, colour, font = 'Arial Black, Impact, sans-serif'] of lines) {
    g.fillStyle = colour; g.font = `bold ${h * size}px ${font}`;
    g.fillText(text, w / 2, h * y, w * 0.92);
  }
};

/* ─── the crazinesses ──────────────────────── */

export const CRAZINESS = [

  /* front yard */
  {
    name: 'craziness8', cam: 'front yard', intensity: 3, at: [-60, 690],
    note: 'Someone is standing at the bottom of the porch steps, looking up at the cam.',
    ...standsAt(-60, 690, { height: 6.8 }, 'front yard')
  },
  {
    name: 'craziness10', cam: ['foyer', 'front yard'], intensity: 1, observable: 1, at: [107, 648],
    note: 'The front door creaks open on its own.',
    ...opens('door-front', 5)
  },
  {
    name: 'craziness15', cam: 'front yard', intensity: 1, observable: 1, at: [97, 717],
    note: 'The porch light and the lamp post go out.',
    ...lightsOut('porch light')
  },
  {
    name: 'craziness16', cam: 'front yard', intensity: 1, observable: 1, at: [50, 764],
    note: 'The rocking chair is rocking. There is no wind.',
    start: ctx => { const c = ctx.find('rocking-chair'); homeOf(c); c.rotation.order = 'YXZ'; },
    frame: (ctx, age) => { ctx.find('rocking-chair').rotation.x = Math.sin(age * 2.1) * 0.13 * Math.min(1, age); },
    stop: ctx => { ctx.find('rocking-chair').rotation.x = 0; }
  },
  {
    name: 'craziness17', cam: 'front yard', intensity: 1, observable: 1, at: [50, 764],
    note: 'The rocking chair turns round to face the cam.',
    ...moves(4, (ctx, p) => {
      const ch = ctx.find('rocking-chair'), { p: home, r } = homeOf(ch), c = ctx.cam('front yard').pos;
      let turn = Math.atan2(c[0] - home.x, c[2] - home.z) - r;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      turnAbout(ch, home.x, home.z, turn * p);
    })
  },
  {
    name: 'craziness18', cam: 'front yard', intensity: 2, at: [150, 1150],
    note: 'Eyes, a lot of them, shining out of the dark lawn past the porch.',
    ...eyesAt([[195, 1120, 2.2], [40, 1202, 1.4], [-67, 984, 0.9], [362, 1408, 3], [120, 1300, 4.2]], 'front yard', 0.16)
  },
  {
    name: 'craziness19', cam: 'front yard', intensity: 4, approach: 20, at: [80, 690],
    note: 'Something comes out the front door and up the yard at the cam. Report it before it gets there.',
    ...approach('front yard', [80, 690])
  },

  /* foyer */
  {
    name: 'craziness9', cam: 'foyer', intensity: 4, approach: 20, at: [140, 648],
    note: 'It comes in the front door and straight up at the foyer cam. Report it before it gets there.',
    ...approach('foyer', [140, 648])
  },
  {
    name: 'craziness11', cam: 'foyer', intensity: 1, observable: 1, at: [213, 562],
    note: 'The coat closet has slid open.',
    ...opens('door-coat-closet', 2.5)
  },
  {
    name: 'craziness20', cam: 'foyer', intensity: 1, observable: 1, at: [140, 775],
    note: 'The foyer lamp goes out.',
    ...lightsOut('foyer lamp')
  },
  {
    name: 'craziness21', cam: 'foyer', intensity: 2, at: [124, 735],
    note: "The old duchess by the door is a realtor's sign now.",
    ...repaints('duchess', ad('#1d3f8c', [
      ['FOR SALE', 0.13, 0.13, '#fff'],
      ['AGAIN', 0.26, 0.1, '#ffd23f'],
      ['THIS HOUSE', 0.48, 0.08, '#fff', 'Arial, sans-serif'],
      ['SELLS ITSELF', 0.58, 0.08, '#fff', 'Arial, sans-serif'],
      ['ASK FOR BARB', 0.76, 0.07, '#ffd23f'],
      ['555-0199', 0.88, 0.07, '#fff']
    ]))
  },
  {
    name: 'craziness22', cam: 'foyer', intensity: 1, at: [138, 678],
    note: 'A pair of muddy boots by the front door, toes to the wall.',
    ...appears(ctx => { const b = boots(ctx.THREE); b.position.set(ctx.X(138), ctx.FLOOR, ctx.Z(678)); b.rotation.y = -Math.PI / 2; return b; })
  },
  {
    name: 'craziness23', cam: 'foyer', intensity: 3, at: [142, 582],
    note: 'Someone is standing in the corner by the door, face to the wall.',
    ...standsAt(142, 582, { height: 6.4 }, ctx => [ctx.X(118), ctx.FLOOR + 6, ctx.Z(556)])
  },

  /* living room */
  {
    name: 'craziness1', cam: 'living room', intensity: 1, observable: 1, at: [650, 262],
    note: 'The armchair slowly turns round to face the wall.',
    ...moves(4, (ctx, p) => turnAbout(ctx.find('armchair'), ctx.X(650), ctx.Z(262), 2.2 * p))
  },
  {
    name: 'craziness5', cam: 'living room', intensity: 2, at: [315, 490],
    note: 'The valley over the couch has turned into a missing poster.',
    start: ctx => ctx.paintings.repaint('valley', (g, w, h) => {
      g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#111'; g.font = `bold ${h * 0.2}px Arial Black, Impact, sans-serif`; g.fillText('MISSING', w / 2, h * 0.14);
      g.fillStyle = '#8a8a86'; g.fillRect(w * 0.34, h * 0.28, w * 0.32, h * 0.44);              // the photo
      g.fillStyle = '#3a3a38'; g.beginPath(); g.ellipse(w / 2, h * 0.43, w * 0.07, h * 0.1, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(w * 0.4, h * 0.53, w * 0.2, h * 0.19);
      g.fillStyle = '#111'; g.font = `bold ${h * 0.09}px Arial, sans-serif`; g.fillText('HAVE YOU SEEN ME?', w / 2, h * 0.8);
      g.font = `${h * 0.075}px Arial, sans-serif`; g.fillText('LAST SEEN IN THIS HOUSE', w / 2, h * 0.92);
    }, { crisp: true }),
    stop: ctx => ctx.paintings.restore('valley')
  },
  {
    name: 'craziness24', cam: 'living room', intensity: 1, observable: 1, at: [576, 215],
    note: 'The big table lamp right under the cam goes out.',
    ...lightsOut('table lamp')
  },
  {
    name: 'craziness25', cam: 'living room', intensity: 1, observable: 1, at: [470, 310],
    note: 'The fiddle fig has shuffled out into the middle of the room.',
    ...shifts('fiddle-fig', { dx: 130, dz: 110, angle: 0.5, seconds: 6 })
  },
  {
    name: 'craziness26', cam: 'living room', intensity: 1, at: [718, 488],
    note: 'The newspaper on the dining table is gone.',
    ...hides('newspaper')
  },
  {
    name: 'craziness27', cam: 'living room', intensity: 2, at: [556, 810],
    note: "Someone's stuck a big yellow smiley face over the face of the man with the curly hair.",
    ...repaints('durer', (g, w, h) => {
      const x = w * 0.5, y = h * 0.33, r = w * 0.27;
      g.fillStyle = '#ffd400'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = r * 0.08; g.stroke();
      g.fillStyle = '#000';
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * r * 0.35, y - r * 0.2, r * 0.09, r * 0.18, 0, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.arc(x, y + r * 0.05, r * 0.55, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    })
  },
  {
    name: 'craziness28', cam: 'living room', intensity: 3, at: [590, 420],
    note: 'A pale, see-through woman in a long gown is standing by the dining table.',
    ...ghostAt(590, 420, 'living room')
  },

  /* kitchen */
  {
    name: 'craziness2', cam: 'kitchen', intensity: 1, at: [960, 515],
    note: 'The pizza boxes on the island are gone.',
    ...hides('pizza-boxes')
  },
  {
    name: 'craziness12', cam: 'kitchen', intensity: 1, observable: 1, at: [1020, 659],
    note: 'The fridge door is hanging wide open.',
    ...opens('fridge-door', 3)
  },
  {
    name: 'craziness29', cam: 'kitchen', intensity: 1, observable: 1, at: [978, 517],
    note: 'The kitchen lights go out.',
    ...lightsOut('kitchen')
  },
  {
    name: 'craziness30', cam: 'kitchen', intensity: 1, observable: 1, at: [1000, 560],
    note: 'Every cabinet door in the kitchen swings open at once.',
    ...opensAll('cabinet-door-')
  },
  {
    name: 'craziness31', cam: 'kitchen', intensity: 2, at: [930, 684],
    note: 'The TV on the counter is showing a pale face, staring out.',
    ...tvShows((g, w, h) => {
      g.fillStyle = '#26282a'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`; g.fillRect(0, y, w, 1); }
      g.fillStyle = '#d9d4ca'; g.beginPath(); g.ellipse(w / 2, h * 0.52, w * 0.2, h * 0.36, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000';
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(w / 2 + s * w * 0.075, h * 0.45, w * 0.045, h * 0.07, 0, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.ellipse(w / 2, h * 0.7, w * 0.05, h * 0.06, 0, 0, Math.PI * 2); g.fill();
    })
  },
  {
    name: 'craziness32', cam: 'kitchen', intensity: 2, at: [845, 715],
    note: 'The sunset painting is a pizza ad now.',
    ...repaints('field', ad('#c8102e', [
      ['PIZZA WITCH', 0.2, 0.2, '#fff'],
      ['WE ALREADY', 0.47, 0.13, '#ffd23f'],
      ['DELIVERED', 0.62, 0.13, '#ffd23f'],
      ['look in your kitchen', 0.84, 0.1, '#fff', 'Georgia, serif']
    ]))
  },
  {
    name: 'craziness33', cam: 'kitchen', intensity: 3, at: [1178, 708],
    note: 'Someone is standing in the pantry doorway.',
    ...standsAt(1178, 708, { height: 6.6, face: 0xcfc6b8 }, 'kitchen')
  },

  /* patio */
  {
    name: 'craziness34', cam: 'patio', intensity: 1, observable: 1, at: [1060, 340],
    note: 'The patio light goes out.',
    ...lightsOut('patio')
  },
  {
    name: 'craziness35', cam: 'patio', intensity: 1, observable: 1, at: [1167, 250],
    note: 'The patio table and chairs have turned round.',
    ...shifts('porch-table', { dx: -25, angle: 0.9, seconds: 4 })
  },
  {
    name: 'craziness36', cam: 'patio', intensity: 1, at: [1030, 235],
    note: "There's a chair out on the deck that wasn't there, facing the cam.",
    ...appears(ctx => { const c = chair(ctx.THREE), x = ctx.X(1030), z = ctx.Z(235); c.position.set(x, ctx.walkHeight(x, z), z); const p = ctx.cam('patio').pos; c.rotation.y = Math.atan2(p[0] - x, p[2] - z); return c; })
  },
  {
    name: 'craziness37', cam: 'patio', intensity: 2, at: [1167, 250],
    note: 'A birthday cake with all its candles lit is sitting on the patio table.',
    ...appears(ctx => { const c = cake(ctx.THREE); c.position.set(ctx.X(1167), 4.9, ctx.Z(250)); return c; },
      (ctx, age, c) => c.userData.flames.forEach((f, i) => { f.scale.y = 1.5 + 0.5 * Math.sin(age * 11 + i * 2.3) + Math.random() * 0.3; }))
  },
  {
    name: 'craziness38', cam: 'patio', intensity: 2, at: [1200, -120],
    note: 'Eyes, a lot of them, out in the dark past the railing.',
    ...eyesAt([[1150, -90, 2.4], [1260, -50, 3.4], [1050, -150, 1.5], [1350, -170, 4.6], [1220, -260, 6.2], [1420, -60, 1.1]], 'patio')
  },
  {
    name: 'craziness39', cam: 'patio', intensity: 3, at: [1120, 125],
    note: 'Someone very tall is standing in the yard right up against the railing, head and shoulders over it.',
    ...standsAt(1120, 125, { height: 8.6, face: 0xcfc6b8 }, 'patio')
  },
  {
    name: 'craziness40', cam: 'patio', intensity: 3, at: [1295, 250],
    note: 'A huge pale face is peering over the end of the railing.',
    ...appears(ctx => { const f = bigHead(ctx.THREE, 1.6, true); f.position.set(ctx.X(1295), 5.4, ctx.Z(250)); return facingCam(ctx, f, 'patio'); })
  },

  /* master bedroom */
  {
    name: 'craziness3', cam: 'master bedroom', intensity: 1, observable: 1, at: [1206, 846],
    note: 'The little round table slides out into the middle of the room.',
    ...moves(3.5, (ctx, p) => turnAbout(ctx.find('round-table'), ctx.X(1206), ctx.Z(846), 0.4 * p, -3.4 * p, 1.4 * p))
  },
  {
    name: 'craziness4', cam: 'master bedroom', intensity: 2, at: [1005, 1068],
    note: 'The mountains over the bed have turned into a sharp, bright mattress ad.',
    ...repaints('mountains', (g, w, h) => {
      g.fillStyle = '#ffd400'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d0101a'; g.fillRect(0, h * 0.06, w, h * 0.3);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.font = `bold ${h * 0.2}px Impact, Arial Black, sans-serif`; g.fillText('MATTRESS WAREHOUSE', w / 2, h * 0.21);
      g.fillStyle = '#111'; g.font = `bold ${h * 0.15}px Arial Black, sans-serif`; g.fillText('SLEEP IS FOR THE DEAD', w / 2, h * 0.53);
      g.fillStyle = '#d0101a'; g.font = `bold ${h * 0.13}px Arial, sans-serif`; g.fillText('1-800-NO-SLEEP  OPEN ALL NIGHT', w / 2, h * 0.8);
    })
  },
  {
    name: 'craziness41', cam: 'master bedroom', intensity: 1, observable: 1, at: [1100, 1045],
    note: 'One of the bedside lamps goes out.',
    ...lightsOut('nightstand 2')
  },
  {
    name: 'craziness42', cam: 'master bedroom', intensity: 3, at: [965, 1000],
    note: "Someone's in the bed, covers up to their chin, eyes open.",
    ...appears(ctx => {
      const s = sleeper(ctx.THREE), c = ctx.cam('master bedroom').pos;
      s.position.set(ctx.X(965), 4.5, ctx.Z(1040));
      s.updateMatrixWorld(true);
      s.userData.head.lookAt(c[0], c[1], c[2]);               // head on the pillow, turned to stare up at the cam
      return s;
    })
  },
  {
    name: 'craziness43', cam: 'master bedroom', intensity: 3, at: [1262, 876],
    note: 'A pale face and two hands are pressed up against the bedroom window from outside.',
    ...appears(ctx => { const f = bigHead(ctx.THREE, 0.55, true); f.position.set(ctx.X(1264), 7, ctx.Z(876)); return facingCam(ctx, f, 'master bedroom'); })
  },
  {
    name: 'craziness44', cam: 'master bedroom', intensity: 4, approach: 20, at: [1150, 800],
    note: 'Something gets up out of the corner and comes at the bedroom cam. Report it before it gets there.',
    ...approach('master bedroom', [1150, 800])
  },

  /* laundry */
  {
    name: 'craziness6', cam: 'laundry', intensity: 3, at: [735, 935],
    note: 'A tall dark figure is standing in front of the dryer, watching.',
    ...standsAt(735, 935, { height: 7.1 }, 'laundry')
  },
  {
    name: 'craziness13', cam: 'laundry', intensity: 1, observable: 1, at: [716, 888],
    note: 'The dryer door has swung open.',
    ...opens('dryer-door', 2)
  },
  {
    name: 'craziness45', cam: 'laundry', intensity: 1, observable: 1, at: [650, 861],
    note: 'The washer lid lifts up on its own.',
    ...opens('washer-lid', 2)
  },
  {
    name: 'craziness46', cam: 'laundry', intensity: 1, observable: 1, at: [711, 899],
    note: 'The bare bulb in the laundry goes out.',
    ...lightsOut('laundry bulb')
  },
  {
    name: 'craziness47', cam: 'laundry', intensity: 1, observable: 1, at: [610, 1016],
    note: 'The pocket door slides shut.',
    ...opens('door-pocket', 2.5, 0)
  },
  {
    name: 'craziness48', cam: 'laundry', intensity: 2, at: [770, 825],
    note: 'Dirty handprints all over the wall beside the shelf.',
    ...appears(ctx => decal(ctx, { px: 775, py: 825, y: 4.6, w: 3.4, h: 3.6, face: 'z+', draw: (g, w, h) => {
      let seed = 7;
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      g.fillStyle = 'rgba(40, 26, 18, 0.82)';
      for (let i = 0; i < 13; i++) {
        const x = w * (0.1 + rand() * 0.8), y = h * (0.12 + rand() * 0.78), s = w * 0.09, a = (rand() - 0.5) * 0.9;
        g.save(); g.translate(x, y); g.rotate(a);
        g.beginPath(); g.ellipse(0, 0, s * 0.55, s * 0.62, 0, 0, Math.PI * 2); g.fill();          // palm
        [[-0.42, -0.95, 0.5], [-0.15, -1.15, 0.62], [0.12, -1.12, 0.58], [0.38, -0.9, 0.46], [-0.72, -0.15, 0.4]].forEach(([fx, fy, l], k) => {
          g.save(); g.translate(fx * s, fy * s); g.rotate(k === 4 ? -0.9 : fx * 0.4);
          g.beginPath(); g.ellipse(0, 0, s * 0.13, s * l, 0, 0, Math.PI * 2); g.fill(); g.restore();
        });
        g.restore();
      }
    } }))
  },
  {
    name: 'craziness49', cam: 'laundry', intensity: 2, at: [716, 872],
    note: 'An old porcelain doll is sitting on the dryer, looking at the cam. Nobody here owns a doll.',
    ...appears(ctx => {
      const d = figure(ctx.THREE, { height: 1.5, width: 0.55, skin: 0x6b2737, face: 0xeadfce, eyes: 0.028, pupils: false });
      d.position.set(ctx.X(716), 5.5, ctx.Z(872));
      return facingCam(ctx, d, 'laundry');
    })
  },

  /* bathroom */
  (() => {
    // the frosted glass thins out while it's in there, so you can make out the shape
    const glass = ctx => { const m = []; ctx.find('shower-glass').traverse(o => o.material && m.push(o.material)); return m; };
    const fig = standsAt(425, 1035, { height: 6.3 }, 'bathroom', 0.35);
    return {
      name: 'craziness7', cam: 'bathroom', intensity: 3, at: [425, 1035],
      note: 'Someone is standing in the shower, a dark shape right up against the glass.',
      start(ctx) { fig.start(ctx); for (const m of glass(ctx)) { m.userData.was ??= m.opacity; m.opacity = 0.42; } },
      stop(ctx) { fig.stop(ctx); for (const m of glass(ctx)) m.opacity = m.userData.was ?? m.opacity; }
    };
  })(),
  {
    name: 'craziness14', cam: 'bathroom', intensity: 1, observable: 1, at: [429, 985],
    note: 'The shower door is standing open.',
    ...opens('door-shower', 3)
  },
  {
    name: 'craziness50', cam: 'bathroom', intensity: 1, observable: 1, at: [535, 1065],
    note: 'The bathroom lights go out.',
    ...lightsOut('bathroom')
  },
  {
    name: 'craziness51', cam: 'bathroom', intensity: 2, at: [461, 1040],
    note: 'LET ME OUT is written on the shower glass, backwards, like from inside.',
    ...appears(ctx => decal(ctx, { px: 462, py: 1050, y: 4.2, w: 1.9, h: 1.5, face: 'x+', draw: (g, w, h) => {
      g.translate(w, 0); g.scale(-1, 1);                                          // written from the inside
      g.fillStyle = 'rgba(60, 20, 18, 0.85)';
      g.font = `bold ${h * 0.36}px "Comic Sans MS", "Marker Felt", cursive`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('LET ME', w / 2, h * 0.3); g.fillText('OUT', w / 2, h * 0.72);
    } }))
  },
  {
    name: 'craziness52', cam: 'bathroom', intensity: 1, at: [450, 935],
    note: 'A long trail of toilet paper runs out of the toilet room across the floor.',
    ...appears(ctx => {
      const { THREE } = ctx, paper = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.9 }), g = new THREE.Group();
      const pts = [[372, 902], [405, 912], [440, 930], [470, 942], [505, 965], [528, 992]].map(([px, py]) => [ctx.X(px), ctx.Z(py)]);
      for (let i = 1; i < pts.length; i++) {
        const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], l = Math.hypot(x1 - x0, z1 - z0);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.012, l + 0.05), paper);
        strip.position.set((x0 + x1) / 2, ctx.FLOOR + 0.01, (z0 + z1) / 2);
        strip.rotation.y = Math.atan2(x1 - x0, z1 - z0);
        strip.receiveShadow = true;
        g.add(strip);
      }
      return g;
    })
  },
  {
    name: 'craziness53', cam: 'bathroom', intensity: 3, at: [420, 900],
    note: 'A see-through woman in a long gown is standing by the toilet.',
    ...ghostAt(420, 900, 'bathroom')
  },
  {
    name: 'craziness54', cam: 'bathroom', intensity: 2, at: [570, 825],
    note: "There's someone standing in the marsh painting now, up to their knees in the water, looking out.",
    ...repaints('marsh', (g, w, h) => {
      const x = w * 0.55, top = h * 0.3, fh = h * 0.48;
      g.fillStyle = '#060504';
      g.beginPath(); g.ellipse(x, top + fh * 0.1, fh * 0.07, fh * 0.1, 0, 0, Math.PI * 2); g.fill();      // head
      g.beginPath(); g.moveTo(x - fh * 0.1, top + fh * 0.22); g.lineTo(x + fh * 0.1, top + fh * 0.22);
      g.lineTo(x + fh * 0.07, top + fh); g.lineTo(x - fh * 0.07, top + fh); g.closePath(); g.fill();     // body, down into the water
      g.fillStyle = '#f4f0e0';
      for (const s of [-1, 1]) g.fillRect(x + s * fh * 0.03 - 1, top + fh * 0.08, 2, 2);                // two pale points for eyes
    })
  }
];
