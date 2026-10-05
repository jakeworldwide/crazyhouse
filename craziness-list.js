/* ============================================================
   crazyhouse: the crazinesses.

   Each one is an entry in CRAZINESS:
     name       craziness1, craziness2, ... (what the debug panel lists)
     cam        the cam/room it happens in: what you report (a list,
                ['foyer', 'front yard'], if more than one cam sees it;
                any of them counts)
     observable 1 if it can happen while you're watching its cam (you see it
                happen: a door swinging open, a chair turning); leave it out
                (0) and it waits until you're looking somewhere else
     intensity  1  something moves, appears or disappears
                2  something strange: a painting turns into a photo
                   or an advert that doesn't belong
                3  something really crazy: a person, a ghost, something big
                4  super crazy, staring straight into the cam (counts
                   double toward a craziness overload)
     at         [px, py] on the blueprint, roughly where it is (so the
                lamps nearby redraw their shadows)
     note       what's going on, for whoever reads this
     start(ctx) make it happen; stop(ctx) put everything back

   ctx has THREE, scene, X(px), Z(py), FLOOR, walkHeight(x, z),
   find(name), cam(name), add(obj), remove(obj), moved(x, z),
   paintings (repaint(name, draw, { crisp }) / restore(name)) and
   tween(seconds, f) (f(p) every frame, p easing 0 to 1, for moving
   things smoothly; moves() below does the usual case).

   These are placeholders to test the system with: copy one, give it the
   next number, and make it do something new.
   ============================================================ */

/* ─── helpers ──────────────────────────────── */

// turn a welded group (sitting at the origin) by `angle` round the point (x, z), and move it by (dx, dz)
function turnAbout(obj, x, z, angle, dx = 0, dz = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  obj.rotation.y = angle;
  obj.position.set(x - (c * x + s * z) + dx, 0, z - (-s * x + c * z) + dz);
}
function putBack(obj) { obj.rotation.set(0, 0, 0); obj.position.set(0, 0, 0); }

/* a craziness that's something sliding or turning to a new spot over `seconds`
   (so if you're watching, you see it go). pose(ctx, p): p 0 is where it
   belongs, 1 is the crazy spot; anything between is on the way. */
function moves(seconds, pose) {
  let tw = null;
  return {
    start(ctx) { tw = ctx.tween(seconds, p => pose(ctx, p)); },
    stop(ctx) { tw?.cancel(); pose(ctx, 0); }
  };
}

/* A tall, thin, dark figure with pale points for eyes. Its front is +z;
   faceTowards turns it to look at a point, head tilted up or down to meet it. */
function figure(THREE, { height = 6.6, width = 1.2, eyes = 0.045, eyeColour = 0xf2efe6, skin = 0x0b0a0a } = {}) {
  const dark = new THREE.MeshStandardMaterial({ color: skin, roughness: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: eyeColour });
  const g = new THREE.Group(), head = new THREE.Group();
  const part = (geo, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, dark); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = m.receiveShadow = true; return m; };
  const body = part(new THREE.CapsuleGeometry(width * 0.32, height * 0.5, 4, 12), 0, height * 0.47, 0);
  body.scale.z = 0.6;
  const r = width * 0.28;
  head.position.set(0, height * 0.9, 0.05);
  head.add(part(new THREE.SphereGeometry(r, 14, 10), 0, 0, 0));
  head.children[0].scale.set(0.85, 1.2, 0.95);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyes, 8, 6), glow);
    eye.position.set(side * r * 0.36, r * 0.12, r * 0.86);
    head.add(eye);
    g.add(part(new THREE.CapsuleGeometry(0.08, height * 0.42, 4, 8), side * width * 0.42, height * 0.5, 0, side * 0.06));   // long arms
  }
  g.add(body, head);
  g.userData.head = head;
  return g;
}
function faceTowards(fig, x, y, z) {
  fig.rotation.y = Math.atan2(x - fig.position.x, z - fig.position.z);
  const head = fig.userData.head, hy = fig.position.y + head.position.y;
  head.rotation.x = -Math.atan2(y - hy, Math.hypot(x - fig.position.x, z - fig.position.z));
}

// a craziness that's a door (anything openable) swinging open by itself, slowly
function opens(name, seconds = 3) {
  let was = 0;
  return {
    start(ctx) { const d = ctx.find(name).userData; was = d.open; d.openTo(1, seconds); },
    stop(ctx) { const d = ctx.find(name).userData; d.setOpen(was); d.openTo(was, 0.01); }   // (stops it mid-swing too)
  };
}

// a craziness that's a figure standing somewhere (built once, added and taken away)
function standing(make) {
  let fig = null;
  return {
    start(ctx) { fig ||= make(ctx); ctx.add(fig); },
    stop(ctx) { if (fig) ctx.remove(fig); }
  };
}

/* ─── the crazinesses ──────────────────────── */

export const CRAZINESS = [
  {
    name: 'craziness1', cam: 'living room', intensity: 1, observable: 1, at: [650, 262],
    note: 'The armchair slowly turns round to face the wall.',
    ...moves(4, (ctx, p) => turnAbout(ctx.find('armchair'), ctx.X(650), ctx.Z(262), 2.2 * p))
  },
  {
    name: 'craziness2', cam: 'kitchen', intensity: 1, at: [960, 515],
    note: 'The pizza boxes on the island are gone.',
    start: ctx => { ctx.find('pizza-boxes').visible = false; },
    stop: ctx => { ctx.find('pizza-boxes').visible = true; }
  },
  {
    name: 'craziness3', cam: 'master bedroom', intensity: 1, observable: 1, at: [1206, 846],
    note: 'The little round table slides out into the middle of the room.',
    ...moves(3.5, (ctx, p) => turnAbout(ctx.find('round-table'), ctx.X(1206), ctx.Z(846), 0.4 * p, -3.4 * p, 1.4 * p))
  },
  {
    name: 'craziness4', cam: 'master bedroom', intensity: 2, at: [1005, 1068],
    note: 'The mountains over the bed have turned into a sharp, bright mattress ad.',
    start: ctx => ctx.paintings.repaint('mountains', (g, w, h) => {
      g.fillStyle = '#ffd400'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d0101a'; g.fillRect(0, h * 0.06, w, h * 0.3);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.font = `bold ${h * 0.2}px Impact, Arial Black, sans-serif`; g.fillText('MATTRESS WAREHOUSE', w / 2, h * 0.21);
      g.fillStyle = '#111'; g.font = `bold ${h * 0.15}px Arial Black, sans-serif`; g.fillText('SLEEP IS FOR THE DEAD', w / 2, h * 0.53);
      g.fillStyle = '#d0101a'; g.font = `bold ${h * 0.13}px Arial, sans-serif`; g.fillText('1-800-NO-SLEEP  OPEN ALL NIGHT', w / 2, h * 0.8);
    }, { crisp: true }),
    stop: ctx => ctx.paintings.restore('mountains')
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
    name: 'craziness6', cam: 'laundry', intensity: 3, at: [735, 935],
    note: 'A tall dark figure is standing in front of the dryer, watching.',
    ...standing(ctx => {
      const f = figure(ctx.THREE, { height: 7.1 });
      f.position.set(ctx.X(735), ctx.FLOOR, ctx.Z(935));
      const c = ctx.cam('laundry');
      faceTowards(f, c.pos[0], c.pos[1], c.pos[2]);
      return f;
    })
  },
  (() => {
    // the frosted glass thins out while it's in there, so you can make out the shape
    const glass = ctx => { const m = []; ctx.find('shower-glass').traverse(o => o.material && m.push(o.material)); return m; };
    const fig = standing(ctx => {
      const f = figure(ctx.THREE, { height: 6.3 });
      f.position.set(ctx.X(425), ctx.FLOOR + 0.35, ctx.Z(1035));
      const c = ctx.cam('bathroom');
      faceTowards(f, c.pos[0], c.pos[1], c.pos[2]);
      return f;
    });
    return {
      name: 'craziness7', cam: 'bathroom', intensity: 3, at: [425, 1035],
      note: 'Someone is standing in the shower, a dark shape right up against the glass.',
      start(ctx) { fig.start(ctx); for (const m of glass(ctx)) { m.userData.was ??= m.opacity; m.opacity = 0.42; } },
      stop(ctx) { fig.stop(ctx); for (const m of glass(ctx)) m.opacity = m.userData.was ?? m.opacity; }
    };
  })(),
  {
    name: 'craziness8', cam: 'front yard', intensity: 3, at: [-224, 730],
    note: 'Someone is standing halfway up the path, facing the house.',
    ...standing(ctx => {
      const f = figure(ctx.THREE, { height: 6.8 });
      const x = -33, z = 4;
      f.position.set(x, ctx.walkHeight(x, z), z);
      faceTowards(f, -10, 6, 0);
      return f;
    })
  },
  {
    name: 'craziness9', cam: 'foyer', intensity: 4, at: [209, 650],
    note: 'It is standing right under the foyer cam, looking straight up into it.',
    ...standing(ctx => {
      const f = figure(ctx.THREE, { height: 7.4, eyes: 0.075, eyeColour: 0xffe0d0 });
      const c = ctx.cam('foyer'), dx = c.look[0] - c.pos[0], dz = c.look[2] - c.pos[2], l = Math.hypot(dx, dz);
      f.position.set(c.pos[0] + dx / l * 4.2, ctx.FLOOR, c.pos[2] + dz / l * 4.2);
      faceTowards(f, c.pos[0], c.pos[1], c.pos[2]);
      return f;
    })
  },
  {
    name: 'craziness10', cam: ['foyer', 'front yard'], intensity: 1, observable: 1, at: [107, 648],
    note: 'The front door creaks open on its own.',
    ...opens('door-front', 5)
  },
  {
    name: 'craziness11', cam: 'foyer', intensity: 1, observable: 1, at: [213, 562],
    note: 'The coat closet has slid open.',
    ...opens('door-coat-closet', 2.5)
  },
  {
    name: 'craziness12', cam: 'kitchen', intensity: 1, observable: 1, at: [1020, 659],
    note: 'The fridge door is hanging wide open.',
    ...opens('fridge-door', 3)
  },
  {
    name: 'craziness13', cam: 'laundry', intensity: 1, observable: 1, at: [716, 888],
    note: 'The dryer door has swung open.',
    ...opens('dryer-door', 2)
  },
  {
    name: 'craziness14', cam: 'bathroom', intensity: 1, observable: 1, at: [429, 985],
    note: 'The shower door is standing open.',
    ...opens('door-shower', 3)
  }
];
