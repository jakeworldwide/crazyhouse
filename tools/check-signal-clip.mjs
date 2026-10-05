import assert from 'node:assert/strict';
import {SignalClip,validateSignalManifest} from '../signal-clip.js';
const manifest={format:'composite-lab-signal',version:1,encoding:'float32-le',sampleRate:14318181.81818,samplesPerLine:910,linesPerFrame:525,samplesPerFrame:910*525,voltageScale:1.4,duration:0.12,tracks:[{id:'track-a',label:'A'},{id:'track-b',label:'B'}],frames:[{index:0,timestamp:0},{index:1,timestamp:0.034},{index:2,timestamp:0.08}]};
assert.throws(()=>validateSignalManifest({...manifest,tracks:[{id:'../escape'}]}));
assert.throws(()=>validateSignalManifest({...manifest,samplesPerFrame:0}));
assert.throws(()=>validateSignalManifest({...manifest,frames:[{index:0,timestamp:0.13}]}));
let reads=0;
const clip=new SignalClip(manifest,async path=>{reads++;const a=new Float32Array(manifest.samplesPerFrame);a.fill(path.startsWith('track-a')?0.2:-0.1);return a.buffer;});
await clip.prime();
assert.equal(reads,6);
assert(Math.abs(clip.cache.get(0).image.data[0]-0.1)<1e-6,'mixed tracks must sum raw voltage');
clip.update(100);clip.update(100.015);assert(clip.active,'available samples must play');
clip.update(100.075);assert.equal(clip.active,null,'capture gaps must not invent samples');
clip.setTrack('track-a');await clip.load(0);assert(Math.abs(clip.cache.get(0).image.data[0]-.2)<1e-6);
clip.enabled=false;clip.update(100.02);assert.equal(clip.active,null);
clip.dispose();assert.equal(clip.cache.size,0);
const invalid=new SignalClip(manifest,async()=>new ArrayBuffer(4));await invalid.load(0);assert(invalid.error);assert.equal(invalid.enabled,false);
const corrupt=new SignalClip(manifest,async()=>{const a=new Float32Array(manifest.samplesPerFrame);a[17]=NaN;return a.buffer;});await corrupt.load(0);assert(corrupt.error);
let resolve;
const pending=new SignalClip({...manifest,tracks:[manifest.tracks[0]]},()=>new Promise(r=>resolve=r));
const task=pending.load(0);pending.dispose();resolve(new Float32Array(manifest.samplesPerFrame).buffer);await task;assert.equal(pending.cache.size,0);
console.log('Passed signal metadata validation, voltage summation, selection, capture gaps, malformed chunks, and asynchronous disposal.');

const gameManifest={...manifest,raster:'game-progressive-480',linesPerFrame:480,samplesPerFrame:910*480,voltageScale:1,frames:[0,1,2].map(index=>({index,timestamp:index*910*480/manifest.sampleRate}))};
assert.equal(validateSignalManifest(gameManifest).linesPerFrame,480);
assert.throws(()=>validateSignalManifest({...gameManifest,raster:undefined}));
const gameClip=new SignalClip(gameManifest,async()=>new Float32Array(gameManifest.samplesPerFrame).buffer);
await Promise.all([gameClip.load(0),gameClip.load(1),gameClip.load(2)]);assert.equal(gameClip.cache.get(0).image.height,480);
gameClip.update(1000);
for(let frame=0;frame<3;frame++){
 gameClip.update(1000+frame*gameManifest.samplesPerFrame/gameManifest.sampleRate);
 assert(gameClip.active,'floating-point clock cancellation must not introduce a gap');
 assert.equal(gameClip.active.offset,0,'sample-aligned source clocks must stay aligned');
}
gameClip.dispose();
