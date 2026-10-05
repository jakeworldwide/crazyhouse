/* ============================================================
   crazyhouse: craziness, the engine.

   Something in the house goes crazy (a chair moves, a painting turns
   into something it shouldn't be, someone is standing in the laundry).
   You report the room; if something crazy really is going on there, the
   feed scrambles, "that WAS crazy" fills the screen, and when the
   picture comes back it's gone. Let too much go crazy at once and it's a
   craziness overload.

   The crazinesses themselves live in craziness-list.js, one entry each,
   so there can be as many as you like. This file decides when they
   happen and keeps track of what's going on.

   The shift runs from midnight to 6 AM (main.js sets how long an hour
   is). Crazinesses spawn on a schedule worked out when the shift starts:
     12 to 2 AM: 2 or 3 in all
     2 to 4 AM:  3 or 4 an hour
     4 to 6 AM:  5 or 6 an hour
   Higher intensities unlock as the night goes on (up to 2 before 2 AM,
   3 before 4 AM, then all of them), and nothing ever starts on the cam
   you're watching: it waits until you look away.

   The overload level counts what's going on at once; an intensity 4
   counts double.
   ============================================================ */

export const WARNING = 3;      // level: "it's getting crazy"
export const OVERLOAD = 5;     // level: craziness overload

export function createCraziness({ list, ctx, hour }) {
  const byName = new Map(list.map(d => [d.name, d]));
  const active = new Map();                  // name -> { def, at (shift seconds) }
  let schedule = [];                          // shift seconds when the next ones are due

  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  function plan() {
    const times = [];
    const block = (h0, h1, n) => {           // n spread over hours h0..h1, each in its own slice, jittered
      for (let i = 0; i < n; i++) times.push((h0 + (h1 - h0) * (i + 0.15 + 0.7 * Math.random()) / n) * hour);
    };
    block(0, 2, rand(2, 3));
    block(2, 3, rand(3, 4)); block(3, 4, rand(3, 4));
    block(4, 5, rand(5, 6)); block(5, 6, rand(5, 6));
    return times.map(t => Math.max(t, 40)).sort((a, b) => a - b);   // nothing in the first 40 seconds
  }

  function touch(def) { if (def.at) ctx.moved(ctx.X(def.at[0]), ctx.Z(def.at[1])); }   // lamps near it redraw their shadows
  function start(def, t) {
    if (active.has(def.name)) return false;
    def.start(ctx);
    active.set(def.name, { def, at: t });
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
    const pool = list.filter(d => !active.has(d.name) && d.cam !== watching && d.intensity <= max);
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
    // what's going on in a cam's room (names)
    inRoom: cam => [...active.values()].filter(a => a.def.cam === cam).map(a => a.def.name),
    // reported and confirmed: it's over
    clearRoom(cam) { for (const a of [...active.values()]) if (a.def.cam === cam) stop(a.def.name); },
    level: () => [...active.values()].reduce((n, a) => n + (a.def.intensity >= 4 ? 2 : 1), 0),
    active: () => [...active.keys()],
    next: () => schedule[0] ?? null,
    // for the debug panel
    start: (name, t = 0) => byName.has(name) && start(byName.get(name), t),
    spawn: t => spawnRandom(Math.max(t, 6 * hour - 1), null),                // anything at all, anywhere
    stop,
    isActive: name => active.has(name)
  };
}
