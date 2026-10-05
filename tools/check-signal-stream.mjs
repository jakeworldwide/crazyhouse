import assert from 'node:assert/strict';
import {SignalClip} from '../signal-clip.js';
import {applyReceiverChannel} from '../composite-worker.js';
import {readFileSync} from 'node:fs';
const base='http://localhost:8017/signals/recordings/smooth-ntsc-30s/';
const manifest=await (await fetch(base+'manifest.json')).json();
let pending=0,maxPending=0,delay=0;
const clip=new SignalClip(manifest,async p=>{pending++;maxPending=Math.max(maxPending,pending);try{await new Promise(r=>setTimeout(r,delay));return(await fetch(base+p)).arrayBuffer();}finally{pending--;}});
await clip.prime();delay=100;
const start=performance.now();let frames=0,missing=0,missingContext=0,maxCache=0;
while(performance.now()-start<65000){
 const elapsed=(performance.now()-start)/1000;clip.update(elapsed);frames++;
 if(!clip.active)missing++;
 else if(!clip.active.previous||!clip.active.next)missingContext++;
 maxCache=Math.max(maxCache,clip.cache.size);
 await new Promise(r=>setTimeout(r,1001/30));
}
clip.dispose();
assert.equal(missing,0,'delayed reads dropped complete waveform blocks');
assert.equal(missingContext,0,'delayed reads dropped guard samples');
assert(maxPending<=4&&maxCache<=28,'streaming must remain bounded');
console.log({frames,missing,missingContext,maxPending,maxCache,artificialReadDelayMs:delay});
const root=process.argv[2]||'/tmp/composite-full-validation';
const read=p=>{const b=readFileSync(p);return new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);};
const actual=applyReceiverChannel(read(root+'/channel-input.f32'),{gain:1.2,headroom:.8,bias:.02,noise:0,bandwidth:.6,slew:.05}),expected=read(root+'/channel-output.f32');
let worst=0;for(let i=0;i<actual.length;i++)worst=Math.max(worst,Math.abs(actual[i]-expected[i]));
assert(worst<1e-4,'optimized channel must match Lab actual amplifier/slew/filter output');console.log({channelMaximumError:worst});
