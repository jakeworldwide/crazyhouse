/* ============================================================
   crazyhouse: the security cams.

   In the order left/right steps through them. Positions are in
   feet (see world.js: the house is centred on 0, the front door
   faces -x). Cams hang just under the ceiling in a room corner or
   over a doorway and look across the room, like real ones do. The
   inside cams are wide (80°), like real security cams.

   Kept in its own file so check-route.mjs can use the real cam
   positions when it tests ghoul1's stare.
   ============================================================ */

import { CEIL } from './world.js?v=50';

const HIGH = CEIL - 0.4;

export const CAMS = [
  { name: 'front yard',     pos: [-57.2, 17.4, -14.9], look: [-48.3, 14.6, -11.3], fov: 32 },
  { name: 'foyer',          pos: [-17.2, HIGH, 6.0],  look: [-17.2, 3.5, -2.5],  fov: 95 },
  { name: 'living room',    pos: [0.1, 10.4, -15.2],  look: [-5.5, 4.7, -9],     fov: 80 },
  { name: 'kitchen',        pos: [2.6, HIGH, -8.9],   look: [13, 3, -1],         fov: 80 },
  { name: 'patio',          pos: [2.6, HIGH, -10.4],  look: [16, 2.5, -15.5],    fov: 64 },
  { name: 'master bedroom', pos: [5.4, HIGH, 4.3],    look: [14, 3.5, 13],       fov: 80 },
  { name: 'laundry',        pos: [4.3, HIGH, 13.0],   look: [-1, 3.5, 9.5],      fov: 80 },
  { name: 'bathroom',       pos: [-3.2, HIGH, 15.9],  look: [-10.5, 3.5, 10.5],  fov: 80 }
];

// where a cam is, by name (or null), so ghoul1 knows where to stare
export const camAt = name => {
  const c = CAMS.find(c => c.name === name);
  return c ? c.pos : null;
};
