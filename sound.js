/* ============================================================
   crazyhouse: the feed's sounds, made on the spot with Web Audio
   (no sound files).

   thunk(): changing the channel on an old tube set. The dial's detent
   clacks and springs back, the cabinet thumps, the picture tube's
   flyback ticks, and a burst of static hisses while the new picture
   locks in.
   relay(): a smaller click, like the night vision's IR relay.

   Browsers only allow sound after a click or key press, so unlock()
   is called from START.
   ============================================================ */

export function createSounds() {
  let ctx = null, out = null, noise = null;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      // everything through a gentle compressor, so stacked clicks don't clip
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      out = ctx.createGain();
      out.gain.value = 0.7;
      out.connect(comp).connect(ctx.destination);
      // a second of white noise, reused for every click and hiss
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  // a burst of filtered noise: type/frequency/q of the filter, how loud, attack and decay in seconds
  function burst(t, { type = 'bandpass', freq = 2000, q = 1, gain = 0.5, attack = 0.001, decay = 0.03, sweepTo = null, length = decay + 0.05 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + length + 0.05);
  }

  // a short pitched thump: starts at `from` Hz, drops to `to`
  function thump(t, { from = 120, to = 50, gain = 0.6, decay = 0.12, type = 'sine' }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  function thunk() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.005, jitter = () => 0.9 + Math.random() * 0.2;
    // the dial's detent: a hard plastic clack, then the spring settling it a moment later
    burst(t, { freq: 2600 * jitter(), q: 1.4, gain: 0.9, decay: 0.018 });
    burst(t, { type: 'highpass', freq: 5000, gain: 0.35, decay: 0.008 });
    burst(t + 0.045, { freq: 3400 * jitter(), q: 2, gain: 0.35, decay: 0.012 });
    // the cabinet: a hollow wooden thunk
    thump(t, { from: 150 * jitter(), to: 62, gain: 0.75, decay: 0.11 });
    thump(t, { from: 310 * jitter(), to: 180, gain: 0.18, decay: 0.05, type: 'triangle' });
    // the tube: flyback whine ticking as the picture drops out and comes back
    thump(t + 0.01, { from: 7800, to: 7600, gain: 0.025, decay: 0.09, type: 'sine' });
    // static while it locks onto the new channel, falling away
    burst(t + 0.02, { freq: 3200, q: 0.6, gain: 0.16, attack: 0.01, decay: 0.32, sweepTo: 900, length: 0.36 });
  }

  function relay() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    burst(t, { freq: 4200, q: 3, gain: 0.35, decay: 0.01 });
    thump(t, { from: 220, to: 120, gain: 0.2, decay: 0.05, type: 'triangle' });
    burst(t + 0.015, { freq: 2600, q: 0.7, gain: 0.08, attack: 0.01, decay: 0.4, sweepTo: 700, length: 0.45 });   // the picture rolling over
  }

  return { unlock, thunk, relay };
}
