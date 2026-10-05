import { openSignalFolder } from './signal-clip.js?v=7';

/* ============================================================
   crazyhouse: the debug panel. Only loads with ?debug in the URL.

   - Free cam: F (or the button). WASD moves, the mouse looks (click
     the view to grab the mouse, Esc to let go), Shift goes up, Ctrl
     or C goes down. (Ctrl+W closes the browser tab and no web page
     can stop that, so C is the safe way down.)
   - FOV slider, for the current cam or all of them.
   - Night vision and fully lit buttons, and lighting off (L): flat
     colours, no lights or shadows, to see what the lighting costs.
   - Copy cam: copies where you are as a line for cams.js.
   - First person (P): walk round the house and yard (firstperson.js):
     WASD, mouse, Shift runs, E opens doors and inspects things.
   - ghoul1: he's despawned for now; spawn him, show him, freeze him.
   - Light switches: every circuit as a button, and all on / all off.
   - Open it all: swings open (or shut) everything that opens: every
     door, both closets, the fridge and freezer, the washer lid, the dryer
     door, the kitchen cabinets, the shower door and the bead curtain.
   ============================================================ */

export function createDebug(api) {
  const { THREE, scene, camera, CAMS, showCam, ghoul, toggleNight, frame, debug } = api;

  /* ─── the panel ─── */
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.innerHTML = `
    <div class="dbg-title">debug</div>
    <button data-act="fp">first person (P)</button>
    <div class="dbg-help">WASD walk · mouse looks · Shift runs · E opens doors and inspects things</div>
    <button data-act="free">free cam (F)</button>
    <div class="dbg-help">WASD move · click view, then mouse looks · Shift up · Ctrl or C down · Esc lets go of the mouse</div>
    <label>speed <input type="range" min="2" max="40" step="1" value="12" data-in="speed"> <span data-out="speed">12</span> ft/s</label>
    <label>fov <input type="range" min="15" max="120" step="1" value="64" data-in="fov"> <span data-out="fov">64</span>°</label>
    <label class="dbg-check"><input type="checkbox" data-in="allcams"> use this fov on all cams</label>
    <div class="dbg-row">
      <button data-act="night">night vision</button>
      <button data-act="lit">fully lit</button>
      <button data-act="unlit">lighting off (L)</button>
    </div>
    <div class="dbg-row">
      <button data-act="spawn">spawn ghoul</button>
      <button data-act="ghoul">show ghoul</button>
      <button data-act="freeze">freeze ghoul</button>
    </div>
    <button data-act="composite" aria-pressed="${!debug.composite}">bypass composite: ${debug.composite ? 'off' : 'on'}</button>
    <button data-act="open">open it all</button>
    <details class="dbg-lights"><summary>light switches</summary>
      <div class="dbg-row"><button data-act="lights-on">all on</button><button data-act="lights-off">all off</button></div>
      <div class="dbg-switches"></div>
    </details>
    <button data-act="copy">copy cam</button>
    <pre class="dbg-read" data-out="read"></pre>`;
  document.body.appendChild(panel);
  const signalLauncher = document.createElement('button');
  signalLauncher.className = 'signal-launcher';
  signalLauncher.textContent = 'signals…';
  signalLauncher.setAttribute('aria-controls', 'signal-window');
  signalLauncher.setAttribute('aria-expanded', 'false');
  const signalWindow = document.createElement('dialog');
  signalWindow.id = 'signal-window';
  signalWindow.className = 'debug-panel signal-window';
  signalWindow.setAttribute('aria-labelledby', 'signal-window-title');
  signalWindow.innerHTML = `
    <div class="signal-heading">
      <div class="dbg-title" id="signal-window-title">composite signal</div>
      <button data-act="signal-close" aria-label="Close signal window">×</button>
    </div>
    <button data-act="signal-load">load signal recording folder…</button>
    <input type="file" data-in="signal-files" webkitdirectory multiple hidden>
    <select data-in="signal-track" aria-label="Recorded signal track" hidden></select>
    <div class="dbg-row">
      <button data-act="signal-toggle" aria-pressed="false" disabled>recorded signal: off</button>
      <button data-act="signal-clear" disabled>unload</button>
    </div>
    <label>signal gain <input type="range" min="0" max="2" step="0.01" value="0.25" data-in="signal-gain"> <span data-out="signal-gain">0.25</span></label>
    <div class="dbg-help" data-out="signal-status">No recorded signal loaded.</div>
    <div class="dbg-help" data-out="signal-performance"></div>
`;
  document.body.append(signalLauncher, signalWindow);
  signalLauncher.addEventListener('click', () => {
    signalWindow.show();
    signalLauncher.hidden = true;
    signalLauncher.setAttribute('aria-expanded', 'true');
  });
  signalWindow.addEventListener('close', () => {
    signalLauncher.hidden = false;
    signalLauncher.setAttribute('aria-expanded', 'false');
    signalLauncher.focus();
  });
  signalWindow.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); signalWindow.close(); }
  });
  signalWindow.querySelector('[data-act="signal-close"]').addEventListener('click', () => signalWindow.close());
  const $ = sel => panel.querySelector(sel) || signalWindow.querySelector(sel);
  const btn = act => $(`[data-act="${act}"]`);
  const out = name => $(`[data-out="${name}"]`);

  btn('composite').addEventListener('click', () => {
    api.setComposite(!debug.composite);
    const bypass = !debug.composite;
    btn('composite').textContent = 'bypass composite: ' + (bypass ? 'on' : 'off');
    btn('composite').classList.toggle('on', bypass);
    btn('composite').setAttribute('aria-pressed', String(bypass));
  });

  let clipRequest=0,shownClip=null;
  const signalFiles=$('[data-in="signal-files"]'),signalTrack=$('[data-in="signal-track"]');
  function showClip(){
    const clip=api.analog.clip;shownClip=clip;
    btn('signal-toggle').disabled=btn('signal-clear').disabled=!clip;
    btn('signal-toggle').textContent='recorded signal: '+(clip?.enabled?'on':'off');
    btn('signal-toggle').setAttribute('aria-pressed',String(!!clip?.enabled));
    signalTrack.hidden=!clip;
    signalTrack.replaceChildren();
    if(clip){
      $('[data-in="signal-gain"]').value=String(clip.gain);
      out('signal-gain').textContent=String(clip.gain);
      for(const track of [{id:'all',label:'Mix all recorded connections'},...clip.manifest.tracks]){
        const option=document.createElement('option');option.value=track.id;option.textContent=track.label;signalTrack.append(option);
      }
      signalTrack.value=clip.track;
      out('signal-status').textContent=`${clip.manifest.duration.toFixed(1)} s · ${clip.manifest.tracks.length} connection(s) · ${clip.manifest.completed?'complete':'partial recording'}`;
    }else out('signal-status').textContent='No recorded signal loaded.';
  }
  showClip();
  btn('signal-load').addEventListener('click',()=>signalFiles.click());
  signalFiles.addEventListener('change',async()=>{
    const request=++clipRequest;
    out('signal-status').textContent='Opening recording…';
    try{
      const clip=await openSignalFolder(signalFiles.files);
      clip.gain=Number($('[data-in="signal-gain"]').value);
      await clip.prime();
      if(request!==clipRequest){clip.dispose();return;}
      if(clip.error){clip.dispose();throw new Error(clip.error);}
      api.analog.setClip(clip);showClip();syncParameters();
    }catch(error){if(request===clipRequest)out('signal-status').textContent=error.message;}
    finally{signalFiles.value='';}
  });
  signalTrack.addEventListener('change',()=>api.analog.clip?.setTrack(signalTrack.value));
  btn('signal-toggle').addEventListener('click',()=>{if(api.analog.clip){api.analog.clip.enabled=!api.analog.clip.enabled;showClip();}});
  btn('signal-clear').addEventListener('click',()=>{clipRequest++;api.analog.setClip(null);showClip();syncParameters();});
  $('[data-in="signal-gain"]').addEventListener('input',e=>{
    out('signal-gain').textContent=e.target.value;
    if(api.analog.clip)api.analog.clip.gain=Number(e.target.value);
  });

  // Controls live in the existing separate signal window, not Jake's panel.
  const settings=document.createElement('div');settings.className='signal-settings';
  settings.innerHTML='<div class="dbg-help">Live controls. 0 MHz bypasses a filter. Receiver edits override recorded settings; reset restores them.</div>';
  const entries=[];
  function group(title,fields,receiver=false){
    const section=document.createElement('details');section.open=title==='Encoder filters'||title==='Receiver decoding';
    const heading=document.createElement('summary');heading.textContent=title;section.append(heading);
    for(const [key,label,min,max,step] of fields){
      const row=document.createElement('label'),input=document.createElement('input');row.className='signal-param';
      const text=document.createElement('span');text.textContent=label;row.append(text,input);
      input.setAttribute('aria-label',label);input.dataset.parameter=key;
      const boolean=min===null;input.type=boolean?'checkbox':'number';
      if(!boolean){input.min=min;input.max=max;input.step=step;}
      input.addEventListener('input',()=>{
        if(!boolean&&!input.validity.valid)return;
        const value=boolean?input.checked:input.valueAsNumber;if(!boolean&&!Number.isFinite(value))return;
        const controls=api.analog.controls;
        if(receiver)controls.receiverOverrides[key]=value;else controls[key]=value;
        if(['sceneScale','displayWidth','sourceLinear','waveLinear','outputLinear'].includes(key))api.resizeAnalog();
      });
      section.append(row);entries.push({input,key,receiver,boolean});
    }
    settings.append(section);
  }
  group('Encoder filters',[
    ['lumaMHz','Luma cutoff (MHz)',0,6.8,.1],['chromaMHz','Chroma cutoff (MHz)',0,6.8,.1],
    ['sourceTaps','Encoder FIR taps (odd)',1,49,2],['sourceSetup','Encoder black setup (IRE)',0,30,.5],['sourceChromaGain','Encoder chroma gain',0,3,.05]
  ]);
  group('Receiver decoding',[
    ['receiverChromaMHz','Decoded chroma cutoff (MHz)',0,7.1,.1],['receiverTaps','Decoder FIR taps (odd)',1,33,2],
    ['notchSpacing','Notch spacing (samples)',0,8,.1]
  ]);
  group('Receiver tracking',[
    ['comb','Line comb',null],['clamp','Back-porch clamp',null],['colorKiller','Color killer',null],['autoSlice','Automatic sync threshold',null],
    ['threshold','Manual sync threshold (V)',-1,1,.01],['tracking','Horizontal tracking gain',0,1,.01],['colorTracking','Burst phase tracking gain',0,1,.01],
    ['holdPPM','Receiver clock offset (ppm)',-10000,10000,1],['setupIRE','Receiver black setup (IRE)',0,30,.5]
  ],true);
  group('Received signal channel',[
    ['bandwidth','Channel cutoff (MHz; 0 off)',0,7.1,.1],['gain','Channel voltage gain',0,3,.05],['bias','Channel DC bias (V)',-1,1,.01],
    ['headroom','Channel headroom (V; 0 off)',0,3,.05],['noise','Channel noise level',0,1,.01],['slew','Slew limit (V/µs; 0 off)',0,20,.1]
  ],true);
  group('Injected signals',[
    ['automaticHum','Intermittent mains hum',null],['automaticHumGain','Mains hum gain',0,2,.01],['noise','Encoder noise level',0,1,.01],
    ['interference','Interfering oscillator gain',0,2,.01],['testGain','W injection gain',0,3,.05]
  ]);
  group('Sampling and reconstruction',[
    ['sceneScale','Scene resolution scale',.25,2,.05],['displayWidth','Reconstruct at display width',null],
    ['sourceLinear','Linear encoder sampling',null],['waveLinear','Linear waveform sampling',null],['outputLinear','Smooth output scaling',null]
  ]);
  const reset=document.createElement('button');reset.textContent='reset signal parameters';settings.append(reset);
  const copy=document.createElement('button');copy.textContent='show parameters as JSON';settings.append(copy);
  const json=document.createElement('textarea');json.readOnly=true;json.hidden=true;json.setAttribute('aria-label','Signal parameters JSON');settings.append(json);
  copy.addEventListener('click',()=>{const c=api.analog.controls;json.value=JSON.stringify({encoder:Object.fromEntries(entries.filter(e=>!e.receiver).map(e=>[e.key,c[e.key]])),receiver:api.analog.getReceiverParameters()},null,2);json.hidden=false;json.select();});
  function syncParameters(){
    const receiver=api.analog.getReceiverParameters();
    for(const {input,key,boolean,receiver:isReceiver} of entries){const value=isReceiver?receiver[key]:api.analog.controls[key];if(boolean)input.checked=value;else input.value=value;}
  }
  reset.addEventListener('click',()=>{api.analog.resetParameters();api.resizeAnalog();syncParameters();});
  signalWindow.append(settings);syncParameters();

  /* ─── free cam ─── */
  let yaw = 0, pitch = 0, speed = 12;
  const keys = new Set();

  function setFree(on) {
    api.analog.heldSignals.clear();
    debug.free = on;
    if (on) {
      // start from wherever the current cam is looking
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      yaw = Math.atan2(-dir.x, -dir.z);
      pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    } else {
      if (document.pointerLockElement) document.exitPointerLock();
      showCam(api.camIndex());
    }
    btn('free').classList.toggle('on', on);
  }
  debug.onCam = () => { btn('free').classList.remove('on'); keys.clear(); };

  frame.addEventListener('click', e => {
    if (debug.free && !e.target.closest('button')) frame.requestPointerLock();
  });
  addEventListener('mousemove', e => {
    if (!debug.free || document.pointerLockElement !== frame) return;
    yaw -= e.movementX * 0.0025;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0025, -1.5, 1.5);
  });
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable=true]')) return;
    const k = e.key.toLowerCase();
    if (k === 'p' && !e.repeat) { toggleFP(); return; }
    if (k === 'l' && !e.repeat) { setUnlit(!debug.unlit); return; }
    if (debug.fp) return;
    if (k === 'f' && !e.repeat) { setFree(!debug.free); return; }
    if (!debug.free) return;
    if (['w', 'a', 's', 'd', 'c', 'shift', 'control'].includes(k)) { keys.add(k); e.preventDefault(); }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  debug.tick = dt => {
    if (debug.fp && fp) fp.update(dt);
    showSwitches();
    frameMs = frameMs * 0.95 + dt * 1000 * 0.05;
    if (debug.free) {
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const step = speed * dt;
      if (keys.has('w')) camera.position.addScaledVector(fwd, step);
      if (keys.has('s')) camera.position.addScaledVector(fwd, -step);
      if (keys.has('d')) camera.position.addScaledVector(right, step);
      if (keys.has('a')) camera.position.addScaledVector(right, -step);
      if (keys.has('shift')) camera.position.y += step;
      if (keys.has('control') || keys.has('c')) camera.position.y -= step;
    }
    readout();
  };

  /* ─── sliders ─── */
  $('[data-in="speed"]').addEventListener('input', e => {
    speed = +e.target.value;
    out('speed').textContent = speed;
  });
  const fovIn = $('[data-in="fov"]'), allCams = $('[data-in="allcams"]');
  function applyFov() {
    const v = +fovIn.value;
    out('fov').textContent = v;
    camera.fov = v;
    camera.updateProjectionMatrix();
    debug.fov = allCams.checked ? v : null;
  }
  fovIn.addEventListener('input', applyFov);
  allCams.addEventListener('change', applyFov);

  /* ─── lighting modes ─── */
  btn('night').addEventListener('click', () => {
    toggleNight();
    btn('night').classList.toggle('on', api.isNight());
  });

  // fully lit: strong even light everywhere and no fog, to see how
  // everything is put together. (The light is added on first use.)
  let flood = null, lit = false;
  const keepFog = scene.fog;
  btn('lit').addEventListener('click', () => {
    lit = !lit;
    if (!flood) { flood = new THREE.AmbientLight(0xffffff, 0); scene.add(flood); flood.layers.enableAll(); }
    flood.intensity = lit ? 2.6 : 0;
    scene.fog = lit ? null : keepFog;
    btn('lit').classList.toggle('on', lit);
  });

  // lighting off: every surface flat in its own colour, no lights, no
  // shadows. Shows what the lighting costs (watch the fps) and shows
  // everything plainly. Switching takes a moment (shaders get rebuilt).
  const flatMats = new Map(), wasMat = new Map(), darkened = [];
  function setUnlit(on) {
    debug.unlit = on;
    if (on) {
      scene.traverse(o => {
        if (o.isLight && o.visible) { darkened.push(o); o.visible = false; }
        if (!o.isMesh || Array.isArray(o.material)) return;
        const m = o.material;
        if (!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return;
        if (!flatMats.has(m)) flatMats.set(m, new THREE.MeshBasicMaterial({
          color: m.color, map: m.map, vertexColors: m.vertexColors, side: m.side, transparent: m.transparent,
          opacity: m.opacity, alphaTest: m.alphaTest, fog: m.fog,
          polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits
        }));
        wasMat.set(o, m);
        o.material = flatMats.get(m);
      });
    } else {
      wasMat.forEach((m, o) => { o.material = m; });
      wasMat.clear();
      darkened.forEach(l => { l.visible = true; });             // the light budget sorts them out next frame
      darkened.length = 0;
    }
    btn('unlit').classList.toggle('on', on);
  }
  btn('unlit').addEventListener('click', () => setUnlit(!debug.unlit));

  /* ─── ghoul ─── */
  /* ─── light switches ─── */
  const sw = scene.userData.switches, swBox = $('.dbg-switches');
  for (const name of sw.names) {
    const b = document.createElement('button');
    b.textContent = name;
    b.dataset.circuit = name;
    b.addEventListener('click', () => { sw.toggle(name); b.blur(); });
    swBox.appendChild(b);
  }
  btn('lights-on').addEventListener('click', () => sw.all(true));
  btn('lights-off').addEventListener('click', () => sw.all(false));
  const showSwitches = () => swBox.querySelectorAll('button').forEach(b => b.classList.toggle('on', sw.isOn(b.dataset.circuit)));

  /* ─── first person ─── */
  let fp = null;
  import('./firstperson.js?v=3').then(m => { fp = api.fp = m.createFirstPerson({ scene, camera, frame }); });
  const leaveFP = () => {
    if (!debug.fp) return;
    fp.exit();
    debug.fp = false;
    btn('fp').classList.remove('on');
  };
  debug.leaveFP = leaveFP;
  function toggleFP() {
    if (!fp) return;
    if (debug.fp) { leaveFP(); showCam(api.camIndex()); return; }
    if (debug.free) setFree(false);
    debug.fp = true;
    const ms = fp.enter();
    if (ms) console.log(`first person: traced the floor map in ${ms} ms`);
    btn('fp').classList.add('on');
  }
  btn('fp').addEventListener('click', e => { toggleFP(); e.currentTarget.blur(); });

  /* ─── ghoul ─── */
  btn('spawn').addEventListener('click', () => {
    ghoul.enabled = !ghoul.enabled;
    ghoul.object.visible = ghoul.enabled;
    btn('spawn').classList.toggle('on', ghoul.enabled);
    btn('spawn').textContent = ghoul.enabled ? 'despawn ghoul' : 'spawn ghoul';
  });
  btn('ghoul').addEventListener('click', () => {
    ghoul.forcePresence = ghoul.forcePresence === null ? 1 : null;
    btn('ghoul').classList.toggle('on', ghoul.forcePresence !== null);
  });
  btn('freeze').addEventListener('click', () => {
    ghoul.paused = !ghoul.paused;
    btn('freeze').classList.toggle('on', ghoul.paused);
  });

  /* ─── open it all ─── */
  const openers = [];
  scene.traverse(o => { if (o.userData.openTo) openers.push(o); });
  btn('open').addEventListener('click', () => {
    const goal = openers.filter(o => o.userData.open > 0.5).length > openers.length / 2 ? 0 : 1;
    for (const o of openers) o.userData.openTo(goal, 1.5);
    btn('open').classList.toggle('on', goal === 1);
  });

  /* ─── copy the current view as a cams.js line ─── */
  const r = n => Math.round(n * 10) / 10;
  function camLine() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const p = camera.position, look = p.clone().addScaledVector(dir, 10);
    const name = CAMS[api.camIndex()].name;
    return `{ name: '${name}', pos: [${r(p.x)}, ${r(p.y)}, ${r(p.z)}], look: [${r(look.x)}, ${r(look.y)}, ${r(look.z)}], fov: ${Math.round(camera.fov)} },`;
  }
  btn('copy').addEventListener('click', () => {
    const line = camLine();
    if (navigator.clipboard) navigator.clipboard.writeText(line).catch(() => {});
    copied = line;
    copiedUntil = performance.now() + 4000;
  });
  let copied = '', copiedUntil = 0;

  let lastRead = 0, frameMs = 16;
  function readout() {
    const now = performance.now();
    if(api.analog.clip!==shownClip){showClip();syncParameters();}
    if(api.analog.clip?.error){
      out('signal-status').textContent=api.analog.clip.error;
      btn('signal-toggle').textContent='recorded signal: error';
      btn('signal-toggle').setAttribute('aria-pressed','false');
    }
    if (now - lastRead < 150) return;
    const stats=api.analog.stats;
    if(stats)out('signal-performance').textContent=stats.error||`${(stats.renderFPS??0).toFixed(1)} render fps · ${stats.receiverMode??"receiver"} · ${stats.buffering?'Buffering · ':''}${stats.signalFPS.toFixed(1)} decoded fps · GPU read ${stats.readMilliseconds.toFixed(1)} ms · receiver ${stats.receiverMilliseconds.toFixed(1)} ms · ${api.analog.clip?.underruns??0} buffer stalls`;
    lastRead = now;
    const p = camera.position;
    const mode = debug.fp ? '(first person)' : debug.free ? '(free cam)' : '(cam ' + (api.camIndex() + 1) + ')';
    let text = `${Math.round(1000 / frameMs)} fps  (${frameMs.toFixed(1)} ms a frame)\npos  ${r(p.x)}, ${r(p.y)}, ${r(p.z)}\nfov  ${Math.round(camera.fov)}°  ${mode}\nghoul ${ghoul.enabled ? ghoul.state : 'despawned'}`;
    if (now < copiedUntil) text += `\ncopied:\n${copied}`;
    out('read').textContent = text;
    // keep the slider honest when cams switch
    if (!debug.fov && document.activeElement !== fovIn && +fovIn.value !== Math.round(camera.fov)) {
      fovIn.value = Math.round(camera.fov);
      out('fov').textContent = fovIn.value;
    }
  }
}
