/* ============================================================
   crazyhouse: the feed's on-screen text (OSD).

   A real security cam's text (the cam number, REC, the clock) is laid
   over the picture inside the camera, so it goes down the same wire and
   gets the same fuzz. So does ours: the text, the arrows and the cam dots
   are ordinary page elements, laid out by the CSS and clicked like any
   button, but invisible; this copies them onto a canvas, and the NTSC
   pass lays that canvas over the picture (bent by the same lens as the
   picture) before the signal is encoded.

   Anything with data-osd="hud" is copied while you're playing,
   data-osd="title" on the title screen, and data-osd="dead" on the
   craziness overload screen. Inside one, data-osd-dot is a
   blinking dot; data-osd-shape="chevron-left" / "chevron-right" draws an
   arrow instead of text. The canvas is only redrawn when something on it
   changes.

   Because the lens moves what you see a little toward the middle, each
   clickable thing is nudged (CSS translate) to sit under where it's seen.
   ============================================================ */

const W = 1280, H = 720;

export function createOsd(frame) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  let last = '', fontsReady = false;
  document.fonts?.ready.then(() => { fontsReady = true; last = ''; });

  const range = document.createRange();
  const shown = el => el.getClientRects().length > 0 && !el.closest('[hidden]');

  /* Where the lens shows a point (u, v in 0..1, v up) that's at (u, v) on
     the overlay: the inverse of analog.js's lens(), found by iterating. */
  function seenAt(u, v, fisheye, aspect) {
    if (!fisheye) return [u, v];
    const sx = (u - 0.5) * aspect, sy = v - 0.5, norm = 1 + fisheye * 0.25 * aspect * aspect;
    let cx = sx, cy = sy;
    for (let i = 0; i < 8; i++) { const f = (1 + fisheye * (cx * cx + cy * cy)) / norm; cx = sx / f; cy = sy / f; }
    return [cx / aspect + 0.5, cy + 0.5];
  }

  /* group: 'hud' or 'title'. Returns true when the canvas changed (so the
     texture needs uploading). */
  function update(group, now, fisheye = 0) {
    const fr = frame.getBoundingClientRect();
    if (!fr.width) return false;
    const sx = W / fr.width, sy = H / fr.height, aspect = fr.width / fr.height, blink = Math.floor(now / 600) % 2 === 0;
    const items = [];
    for (const el of frame.querySelectorAll(`[data-osd="${group}"]`)) {
      if (!shown(el)) continue;
      // where the page has it, without the nudge we gave it last time
      const [ox, oy] = el._osdShift || [0, 0];
      const raw = el.getBoundingClientRect();
      const r = { left: raw.left - ox, top: raw.top - oy, width: raw.width, height: raw.height };
      // clickable things: nudge them to sit under where the lens shows them
      if (el.matches('button')) {
        const u = (r.left + r.width / 2 - fr.left) / fr.width, v = 1 - (r.top + r.height / 2 - fr.top) / fr.height;
        const [su, sv] = seenAt(u, v, fisheye, aspect);
        const dx = Math.round((su - u) * fr.width), dy = Math.round((v - sv) * fr.height);
        if (dx !== ox || dy !== oy) { el.style.translate = `${dx}px ${dy}px`; el._osdShift = [dx, dy]; }
      }
      const cs = getComputedStyle(el);
      // the text goes exactly where the page put it (padding, centring, letter spacing and all)
      const node = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
      let text = '', tx = 0, ty = 0;
      if (node) {
        range.selectNodeContents(node);
        const tr = range.getBoundingClientRect();
        text = node.textContent.trim();
        const after = getComputedStyle(el, '::after').content;                   // e.g. REC's ' · ir' at night
        if (after && after !== 'none' && after !== 'normal') text += after.replace(/^["']|["']$/g, '');
        if (cs.textTransform === 'uppercase') text = text.toUpperCase();
        tx = (tr.left - ox - fr.left) * sx; ty = (tr.top - oy + tr.height / 2 - fr.top) * sy;
      }
      const dot = el.querySelector('[data-osd-dot]'), dr = dot && blink ? dot.getBoundingClientRect() : null;
      items.push({ x: (r.left - fr.left) * sx, y: (r.top - fr.top) * sy, w: r.width * sx, h: r.height * sy, text, tx, ty,
        bg: cs.backgroundColor, color: cs.color, size: parseFloat(cs.fontSize) * sy, family: cs.fontFamily, weight: cs.fontWeight,
        spacing: (parseFloat(cs.letterSpacing) || 0) * sx, glow: cs.textShadow !== 'none',
        border: parseFloat(cs.borderTopWidth) * sx, borderColor: cs.borderTopColor,
        shape: el.dataset.osdShape || null, stroke: parseFloat(cs.getPropertyValue('--osd-stroke')) || 6,       // in overlay pixels
        dot: dr ? [(dr.left - ox - fr.left + dr.width / 2) * sx, (dr.top - oy - fr.top + dr.height / 2) * sy, dr.width * sx / 2] : null });
    }
    const key = JSON.stringify(items) + fontsReady;
    if (key === last) return false;
    last = key;
    g.clearRect(0, 0, W, H);
    if (group === 'title' || group === 'dead') {           // the snow a little darker behind the words
      const v = g.createRadialGradient(W / 2, H * 0.45, H * 0.05, W / 2, H * 0.45, W * 0.55);
      v.addColorStop(0, 'rgba(0,0,0,0.72)'); v.addColorStop(1, 'rgba(0,0,0,0.1)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    }
    for (const it of items) {
      if (it.bg && it.bg !== 'rgba(0, 0, 0, 0)' && it.bg !== 'transparent') { g.fillStyle = it.bg; g.fillRect(it.x, it.y, it.w, it.h); }
      if (it.border > 0) { g.strokeStyle = it.borderColor; g.lineWidth = it.border; g.strokeRect(it.x + it.border / 2, it.y + it.border / 2, it.w - it.border, it.h - it.border); }
      if (it.dot) { g.fillStyle = it.color; g.beginPath(); g.arc(it.dot[0], it.dot[1], it.dot[2], 0, Math.PI * 2); g.fill(); }
      if (it.shape) {                                      // an arrow: a chevron in the middle of its button
        const left = it.shape === 'chevron-left', cx = it.x + it.w / 2, cy = it.y + it.h / 2, hw = it.w * 0.2, hh = it.h * 0.36;
        g.strokeStyle = it.color; g.lineWidth = it.stroke; g.lineCap = 'square'; g.lineJoin = 'miter';
        g.shadowColor = '#000'; g.shadowBlur = it.stroke * 1.5;
        g.beginPath(); g.moveTo(cx + (left ? hw : -hw), cy - hh); g.lineTo(cx + (left ? -hw : hw), cy); g.lineTo(cx + (left ? hw : -hw), cy + hh); g.stroke();
        g.shadowBlur = 0;
        continue;
      }
      if (!it.text) continue;
      g.font = `${it.weight} ${it.size}px ${it.family}`;
      if ('letterSpacing' in g) g.letterSpacing = `${it.spacing}px`;
      g.fillStyle = it.color;
      g.textBaseline = 'middle';
      g.shadowColor = '#000'; g.shadowBlur = it.glow ? it.size * 0.25 : 0;
      // a little bolder than the font, so it survives the signal's smear like a VCR's chunky text
      g.lineWidth = it.size * 0.07; g.strokeStyle = it.color; g.lineJoin = 'round';
      g.strokeText(it.text, it.tx, it.ty + it.size * 0.04);
      g.fillText(it.text, it.tx, it.ty + it.size * 0.04);
      g.shadowBlur = 0;
    }
    return true;
  }
  return { canvas, update };
}
