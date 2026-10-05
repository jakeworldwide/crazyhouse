/* ============================================================
   crazyhouse: craziness, the engine.

   Something in the house goes crazy (a chair moves, a painting turns
   into something it shouldn't be, someone is standing in the laundry).
   You report the room; if something crazy really is going on there, the
   feed scrambles, "THAT WAS CRAZY" fills the screen, and when the
   picture comes back it's gone. Let too much go crazy at once and it's a
   craziness overload.

   The crazinesses themselves live in craziness-list.js, one entry each,
   so there can be as many as you like. This file decides when they
   happen and keeps track of what's going on.

   The shift runs from midnight to 6 AM (main.js sets how long an hour
   is). Crazinesses spawn on a schedule worked out when the shift starts,
   about 30 in a night:
     12 to 2 AM: 4 or 5 in all
     2 to 4 AM:  5 or 6 an hour
     4 to 6 AM:  7 or 8 an hour
   Higher intensities unlock as the night goes on (up to 2 before 2 AM,
   3 before 4 AM, then all of them); the milder ones keep turning up
   too, the newest intensity just comes up a bit more often. Nothing
   ever starts on the cam you're watching: it waits until you look away.
   Unless it's marked observable: 1 (doors opening, furniture moving):
   those can happen right in front of you, and you see them happen.
   Leave it out (or observable: 0) for the usual.
   Each craziness happens at most once a shift, so once they've all
   happened, the rest of the night is quiet.

   A craziness's cam can be a list (['foyer', 'front yard']) when it's
   seen from more than one; reporting any of them counts.

   The overload level counts what's going on at once; an intensity 4
   counts double.

   An approach craziness (approach: 20) is coming for the cam. It waits
   where it starts until you first cycle to its cam; from then its
   frame() moves it closer over that many seconds (whether you stay or
   not), and if it isn't reported by then, overdue() names it and
   main.js ends the shift.
   ============================================================ */

export const WARNING = 3;      // level: "it's getting crazy"
export const OVERLOAD = 5;     // level: craziness overload

export function createCraziness({ list, ctx, hour }) {
  const byName = new Map(list.map(d => [d.name, d]));
  const active = new Map();                  // name -> { def, at (shift seconds) }
  const used = new Set();                     // everything that's happened this shift (none happen twice)
  const camsOf = d => [].concat(d.cam);

  /* ctx.tween(seconds, f): calls f(p) every frame with p easing from 0 to 1,
     so a craziness can move something smoothly instead of just being in its
     new spot. Returns { cancel() }. The lamps near it redraw shadows as it goes. */
  const tweens = new Set();
  let starting = null;
  ctx.tween = (seconds, f) => {
    const tw = { t: 0, seconds: Math.max(0.01, seconds), f, def: starting, cancel: () => tweens.delete(tw) };
    tweens.add(tw);
    f(0);
    return tw;
  };
  let schedule = [];                          // shift seconds when the next ones are due

  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  function plan() {
    const times = [];
    const block = (h0, h1, n) => {           // n spread over hours h0..h1, each in its own slice, jittered
      for (let i = 0; i < n; i++) times.push((h0 + (h1 - h0) * (i + 0.15 + 0.7 * Math.random()) / n) * hour);
    };
    block(0, 2, rand(4, 5));
    block(2, 3, rand(5, 6)); block(3, 4, rand(5, 6));
    block(4, 5, rand(7, 8)); block(5, 6, rand(7, 8));
    return times.map(t => Math.max(t, 40)).sort((a, b) => a - b);   // nothing in the first 40 seconds
  }

  function touch(def) { if (def.at) ctx.moved(ctx.X(def.at[0]), ctx.Z(def.at[1])); }   // lamps near it redraw their shadows
  function start(def, t) {
    if (used.has(def.name)) return false;
    starting = def;
    def.start(ctx);
    starting = null;
    used.add(def.name);
    active.set(def.name, { def, at: t, age: 0, seen: false });
    touch(def);
    return true;
  }
  function stop(name) {
    const a = active.get(name);
    if (!a) return;
    a.def.stop(ctx);
    active.delete(name);
    touch(a.def);
  }

  // something new goes crazy: what's allowed this late, not already going, not on the cam you're watching
  function spawnRandom(t, watching) {
    const h = t / hour, max = h < 2 ? 2 : h < 4 ? 3 : 4;
    const pool = list.filter(d => !used.has(d.name) && (d.observable || !camsOf(d).includes(watching)) && d.intensity <= max);
    if (!pool.length) return false;
    // the higher intensities turn up more as they unlock
    const weights = pool.map(d => d.intensity === max ? 2 : 1);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    const def = pool.find((d, i) => (r -= weights[i]) < 0) || pool[0];
    return start(def, t);
  }

  return {
    list,
    // a new shift: everything back to normal, and a new schedule
    reset() {
      for (const name of [...active.keys()]) stop(name);
      used.clear();
      schedule = plan();
    },
    // call every frame with the shift's seconds and the cam you're on
    update(t, watching) {
      if (t >= 6 * hour) { schedule = []; return; }                 // 6 AM: the shift's over
      while (schedule.length && t >= schedule[0]) {
        if (spawnRandom(t, watching)) schedule.shift();
        else { schedule[0] = t + 8; break; }                        // nothing can happen right now: try again shortly
      }
    },
    // every frame (dt seconds, 0 while paused; watching: the cam you're on): moves anything
    // that's mid-move, and calls frame(ctx, age, p) on whatever has one (p: how far along an
    // approach is, 0..1; an approach's clock only starts once you've seen its cam)
    step(dt, watching) {
      for (const a of active.values()) {
        if (a.def.approach && !a.seen && camsOf(a.def).includes(watching)) a.seen = true;
        if (!a.def.approach || a.seen) a.age += dt;
        if (a.def.frame) a.def.frame(ctx, a.age, a.def.approach ? Math.min(1, a.age / a.def.approach) : null);
      }
      for (const tw of [...tweens]) {
        tw.t = Math.min(1, tw.t + dt / tw.seconds);
        tw.f(tw.t * tw.t * (3 - 2 * tw.t));
        if (tw.def) touch(tw.def);
        if (tw.t >= 1) tweens.delete(tw);
      }
    },
    // what's going on in a cam's room (names)
    inRoom: cam => [...active.values()].filter(a => camsOf(a.def).includes(cam)).map(a => a.def.name),
    // reported and confirmed: it's over
    clearRoom(cam) { for (const a of [...active.values()]) if (camsOf(a.def).includes(cam)) stop(a.def.name); },
    // approaches that weren't reported in time
    overdue: () => [...active.values()].filter(a => a.def.approach && a.age >= a.def.approach).map(a => a.def.name),
    // how close the nearest approach on this cam is (0..1), or -1 if nothing's coming
    closeness: cam => Math.max(-1, ...[...active.values()].filter(a => a.def.approach && camsOf(a.def).includes(cam)).map(a => Math.min(1, a.age / a.def.approach))),
    level: () => [...active.values()].reduce((n, a) => n + (a.def.intensity >= 4 ? 2 : 1), 0),
    active: () => [...active.keys()],
    next: () => schedule[0] ?? null,
    // for the debug panel
    start: (name, t = 0) => byName.has(name) && start(byName.get(name), t),
    spawn: t => spawnRandom(Math.max(t, 6 * hour - 1), null),                // anything at all, anywhere
    stop,
    isActive: name => active.has(name),
    isUsed: name => used.has(name)
  };
}
