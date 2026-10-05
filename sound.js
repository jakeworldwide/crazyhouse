/* ============================================================
   crazyhouse: the feed's sounds, made on the spot with Web Audio
   (no sound files).

   thunk(): changing the channel on an old tube set. The dial's detent
   clacks and springs back, the cabinet thumps, the picture tube's
   flyback ticks, and a burst of static hisses while the new picture
   locks in.
   relay(): a smaller click, like the night vision's IR relay.
   scramble(): reported and confirmed, the feed tearing itself up.
   warn(): too much going on, a two-note alarm beep.
   overload(): craziness overload, the picture dying into a roar of static.
   win(): 6 AM, the static swelling up into a bright ringing chord.

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
      comp.threshold.value = -10; comp.ratio.value = 3;
      out = ctx.createGain();
      out.gain.value = 1.15;
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
    src.loop = true;                                         // (the long hisses outlast the second of noise)
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
    burst(t, { freq: 1900 * jitter(), q: 1.2, gain: 1, decay: 0.022 });
    burst(t, { type: 'highpass', freq: 4500, gain: 0.3, decay: 0.008 });
    burst(t + 0.05, { freq: 2600 * jitter(), q: 1.8, gain: 0.4, decay: 0.014 });
    // the cabinet: a deep hollow wooden thunk, with a punch of sub bass under it
    thump(t, { from: 105 * jitter(), to: 40, gain: 1, decay: 0.2 });
    thump(t, { from: 62, to: 28, gain: 0.9, decay: 0.3 });
    thump(t, { from: 240 * jitter(), to: 120, gain: 0.25, decay: 0.07, type: 'triangle' });
    burst(t, { type: 'lowpass', freq: 380, q: 0.7, gain: 0.6, decay: 0.09 });             // the knock of the box itself
    // the tube: flyback whine ticking as the picture drops out and comes back
    thump(t + 0.01, { from: 7800, to: 7600, gain: 0.025, decay: 0.09, type: 'sine' });
    // static while it locks onto the new channel, falling away
    burst(t + 0.02, { freq: 3200, q: 0.6, gain: 0.22, attack: 0.01, decay: 0.32, sweepTo: 900, length: 0.36 });
  }

  function relay() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    burst(t, { freq: 4200, q: 3, gain: 0.35, decay: 0.01 });
    thump(t, { from: 220, to: 120, gain: 0.2, decay: 0.05, type: 'triangle' });
    burst(t + 0.015, { freq: 2600, q: 0.7, gain: 0.08, attack: 0.01, decay: 0.4, sweepTo: 700, length: 0.45 });   // the picture rolling over
  }

  // a tone that holds, then stops dead (or with fade, dies away the whole time): freq Hz, how loud, how long
  function tone(t, { freq = 880, gain = 0.2, length = 0.15, type = 'square', to = null, fade = false }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    if (!fade) g.gain.setValueAtTime(gain, t + length - 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + length + 0.02);
  }

  function scramble() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    thump(t, { from: 90, to: 30, gain: 1, decay: 0.35 });
    // the picture tearing: bursts of static jumping around the dial
    for (let i = 0; i < 14; i++) {
      const at = t + i * 0.16 + Math.random() * 0.06;
      burst(at, { freq: 500 + Math.random() * 4000, q: 0.5 + Math.random() * 2, gain: 0.35 + Math.random() * 0.3, attack: 0.005, decay: 0.08 + Math.random() * 0.14 });
    }
    burst(t, { type: 'lowpass', freq: 1800, q: 0.5, gain: 0.25, attack: 0.05, decay: 2.2, sweepTo: 400, length: 2.3 });   // a roar under it
    tone(t + 0.02, { freq: 60, gain: 0.12, length: 2.2, type: 'sawtooth' });                                           // mains hum breaking through
  }

  function warn() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    for (let i = 0; i < 2; i++) {
      tone(t + i * 0.32, { freq: 1046, gain: 0.08, length: 0.12 });
      tone(t + i * 0.32 + 0.14, { freq: 784, gain: 0.08, length: 0.12 });
    }
  }

  function overload() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    tone(t, { freq: 420, to: 38, gain: 0.18, length: 2.4, type: 'sawtooth' });                                   // something winding down
    burst(t, { type: 'lowpass', freq: 600, q: 0.4, gain: 0.2, attack: 0.3, decay: 2.2, sweepTo: 7000, length: 2.6 });
    burst(t + 2.3, { freq: 2500, q: 0.3, gain: 0.5, attack: 0.05, decay: 1.6, length: 1.7 });                    // then nothing but snow
    thump(t + 2.3, { from: 80, to: 25, gain: 0.9, decay: 0.5 });
  }

  function win() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    burst(t, { type: 'highpass', freq: 800, q: 0.5, gain: 0.35, attack: 1.4, decay: 1.6, sweepTo: 6000, length: 3 });   // static swelling up
    // then it rings out clean: a big major chord, a little detuned like an old organ
    for (const f of [261.6, 329.6, 392, 523.3, 784]) {
      for (const d of [0.997, 1.003]) tone(t + 1.8, { freq: f * d, gain: 0.05, length: 3.2, type: 'triangle', fade: true });
    }
    thump(t + 1.8, { from: 70, to: 35, gain: 0.7, decay: 0.6 });
  }

  return { unlock, thunk, relay, scramble, warn, overload, win };
}
