/* ============================================================
   crazyhouse: the feed's on-screen text (OSD).

   A real security cam's text (the cam number, REC, the clock) is laid
   over the picture inside the camera, so it goes down the same wire and
   gets the same fuzz. So does ours: the text is ordinary page elements,
   laid out by the CSS and clicked like any button, but invisible; every
   frame this copies them onto a canvas, and the NTSC pass lays that canvas
   over the picture before the signal is encoded (after the lens, so the
   text stays straight).

   Anything with data-osd="hud" is copied while you're playing, and
   data-osd="title" on the title screen. data-osd-dot is a blinking dot.
   The canvas is only redrawn when something on it changes.
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

  /* group: 'hud' or 'title'. Returns true when the canvas changed (so the
     texture needs uploading). */
  function update(group, now) {
    const fr = frame.getBoundingClientRect();
    if (!fr.width) return false;
    const sx = W / fr.width, sy = H / fr.height, blink = Math.floor(now / 600) % 2 === 0;
    const items = [];
    for (const el of frame.querySelectorAll(`[data-osd="${group}"]`)) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
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
        tx = (tr.left - fr.left) * sx; ty = (tr.top + tr.height / 2 - fr.top) * sy;
      }
      const dot = el.querySelector('[data-osd-dot]'), dr = dot && blink ? dot.getBoundingClientRect() : null;
      items.push({ x: (r.left - fr.left) * sx, y: (r.top - fr.top) * sy, w: r.width * sx, h: r.height * sy, text, tx, ty,
        bg: cs.backgroundColor, color: cs.color, size: parseFloat(cs.fontSize) * sy, family: cs.fontFamily, weight: cs.fontWeight,
        spacing: (parseFloat(cs.letterSpacing) || 0) * sx, glow: cs.textShadow !== 'none',
        dot: dr ? [(dr.left - fr.left + dr.width / 2) * sx, (dr.top - fr.top + dr.height / 2) * sy, dr.width * sx / 2] : null });
    }
    const key = JSON.stringify(items) + fontsReady;
    if (key === last) return false;
    last = key;
    g.clearRect(0, 0, W, H);
    if (group === 'title') {                               // the snow a little darker behind the name
      const v = g.createRadialGradient(W / 2, H * 0.45, H * 0.05, W / 2, H * 0.45, W * 0.55);
      v.addColorStop(0, 'rgba(0,0,0,0.72)'); v.addColorStop(1, 'rgba(0,0,0,0.1)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    }
    for (const it of items) {
      if (it.bg && it.bg !== 'rgba(0, 0, 0, 0)' && it.bg !== 'transparent') { g.fillStyle = it.bg; g.fillRect(it.x, it.y, it.w, it.h); }
      if (it.dot) { g.fillStyle = it.color; g.beginPath(); g.arc(it.dot[0], it.dot[1], it.dot[2], 0, Math.PI * 2); g.fill(); }
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
  const clear = () => { if (last !== 'clear') { g.clearRect(0, 0, W, H); last = 'clear'; return true; } return false; };
  return { canvas, update, clear };
}
