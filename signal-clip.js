import {createCompositeWorker} from './composite-worker-client.js?v=1';
import {sumSignalChunks} from './composite-worker.js?v=1';
import * as THREE from './vendor/three-r186/three.module.js';

export function validateSignalManifest(m) {
  if (m?.format !== 'composite-lab-signal' || m.version !== 1 || m.encoding !== 'float32-le') throw new Error('Unsupported signal recording format');
  if (!Number.isFinite(m.sampleRate) || m.sampleRate < 1e6 || m.sampleRate > 120e6 ||
      !Number.isInteger(m.samplesPerLine) || m.samplesPerLine < 100 || m.samplesPerLine > 8192 ||
      ![480,525].includes(m.linesPerFrame) || (m.linesPerFrame===480 && m.raster!=='game-progressive-480') || m.samplesPerFrame !== m.samplesPerLine * m.linesPerFrame ||
      !Number.isFinite(m.duration) || m.duration <= 0 || !Number.isFinite(m.voltageScale) || m.voltageScale <= 0 || m.voltageScale > 10 ||
      Math.abs(m.sampleRate / m.samplesPerLine - 15734.265734) > 1) throw new Error('Invalid signal timing or voltage metadata');
  if (!Array.isArray(m.tracks) || !m.tracks.length || m.tracks.length > 64 ||
      m.tracks.some(t => !/^[a-zA-Z0-9-]{1,80}$/.test(t.id)) || new Set(m.tracks.map(t=>t.id)).size !== m.tracks.length) throw new Error('Invalid signal tracks');
  if (!Array.isArray(m.frames) || !m.frames.length || m.frames.some((f,i)=>f.index !== i || !Number.isFinite(f.timestamp) || f.timestamp < 0 || f.timestamp >= m.duration || (i && f.timestamp <= m.frames[i-1].timestamp))) throw new Error('Invalid recording timeline');
  if(['game-progressive-480','game-ntsc-525'].includes(m.raster) && m.frames.some((f,i)=>Math.abs(f.timestamp-i*m.samplesPerFrame/m.sampleRate)>1e-7))throw new Error('Game recording must use a contiguous sample clock');
  if(m.receiverParameters){
    for(const [key,value] of Object.entries(m.receiverParameters))if(typeof value==='number'&&!Number.isFinite(value))throw new Error(`Invalid receiver parameter: ${key}`);
  }
  return m;
}

// Bounded chunk cache. Loading never reads the full recording into memory.
export class SignalClip {
  constructor(manifest, readChunk) {
    this.manifest=validateSignalManifest(manifest); this.readChunk=readChunk;
    this.track='all'; this.enabled=true; this.gain=0.25; this.error='';
    this.cache=new Map(); this.pending=new Map(); this.generation=0; this.started=null; this.disposed=false;
    this.active=null;this.worker=typeof Worker==='undefined'?null:createCompositeWorker();
    this.window=[];this.buffering=false;this.underruns=0;this.maxCache=28;this.prefetch=20;
  }
  async load(index) {
    if(index<0 || index>=this.manifest.frames.length || this.disposed) return;
    if(this.cache.has(index)) return this.cache.get(index);
    if(this.pending.has(index)) return this.pending.get(index);
    const generation=this.generation;
    const task=(async()=>{
      const tracks=this.track==='all'?this.manifest.tracks:this.manifest.tracks.filter(t=>t.id===this.track);
      const chunks=await Promise.all(tracks.map(track=>this.readChunk(`${track.id}/${String(index).padStart(6,'0')}.f32`)));
      const sum=this.worker?new Float32Array((await this.worker.call('sum',{chunks,count:this.manifest.samplesPerFrame},chunks)).samples):sumSignalChunks(chunks,this.manifest.samplesPerFrame);
      if(this.disposed || generation!==this.generation) return;
      const texture=new THREE.DataTexture(sum,this.manifest.samplesPerLine,this.manifest.linesPerFrame,THREE.RedFormat,THREE.FloatType);
      texture.minFilter=texture.magFilter=THREE.NearestFilter; texture.generateMipmaps=false; texture.needsUpdate=true;
      this.cache.set(index,texture);
      while(this.cache.size>this.maxCache){
        // Completion order can differ from playback order. Protect every block
        // needed by the current window, including the previous-frame guard.
        const oldest=[...this.cache.keys()].find(key=>!this.window.includes(key));
        if(oldest===undefined)break;
        this.cache.get(oldest).dispose();this.cache.delete(oldest);
      }
      return texture;
    })().catch(e=>{if(generation===this.generation && !this.disposed){this.error=e.message;this.enabled=false;}}).finally(()=>{if(generation===this.generation){this.pending.delete(index);this.pump();}});
    this.pending.set(index,task);return task;
  }
  pump(){
    if(this.disposed||this.error)return;
    for(const index of this.window){if(this.pending.size>=4)break;if(!this.cache.has(index)&&!this.pending.has(index))void this.load(index);}
  }
  plan(index){
    const count=this.manifest.frames.length,wrap=i=>(i%count+count)%count;
    this.window=[index,wrap(index+1),wrap(index-1),...Array.from({length:this.prefetch},(_,i)=>wrap(index+2+i))];
    this.pump();
  }
  async prime(){
    this.plan(0);
    const count=this.manifest.frames.length;
    const wanted=Array.from(new Set([count-1,...Array.from({length:Math.min(count,this.prefetch)},(_,i)=>i)]));
    while(!this.error&&!this.disposed&&!wanted.every(i=>this.cache.has(i))){this.pump();await Promise.all([...this.pending.values()]);}
    if(this.error)throw new Error(this.error);
  }
  setTrack(id) {
    if(id!=='all' && !this.manifest.tracks.some(t=>t.id===id)) throw new Error('Unknown signal track');
    this.generation++;this.pending.clear();for(const texture of this.cache.values())texture.dispose();this.cache.clear();
    this.track=id;this.error='';this.active=null;this.window=[];
  }
  update(seconds) {
    if(this.started===null)this.started=seconds;
    this.active=null;
    if(!this.enabled || this.disposed || this.error)return;
    if(seconds<this.started)return;
    const elapsed=((seconds-this.started)%this.manifest.duration+this.manifest.duration)%this.manifest.duration;
    const gameRaster=['game-progressive-480','game-ntsc-525'].includes(this.manifest.raster);
    const epsilon=gameRaster?1e-4/this.manifest.sampleRate:0;
    let lo=0,hi=this.manifest.frames.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(this.manifest.frames[mid].timestamp<=elapsed+epsilon)lo=mid+1;else hi=mid;}
    const index=lo-1;if(index<0){void this.load(0);return;}
    this.plan(index);
    const count=this.manifest.frames.length,current=this.cache.get(index),next=this.cache.get((index+1)%count),previous=this.cache.get((index+count-1)%count);
    const ready=!!(current&&next&&previous);
    if(!ready){if(!this.buffering)this.underruns++;this.buffering=true;return;}
    this.buffering=false;
    const frame=this.manifest.frames[index];
    const previousStart=(index>0?this.manifest.frames[index-1].timestamp-frame.timestamp:this.manifest.frames[count-1].timestamp-this.manifest.duration)*this.manifest.sampleRate;
    let offset=(elapsed-frame.timestamp)*this.manifest.sampleRate;
    if(gameRaster && Math.abs(offset-Math.round(offset))<1e-4)offset=Math.max(0,Math.round(offset));
    let nextStart=index+1<this.manifest.frames.length ? (this.manifest.frames[index+1].timestamp-frame.timestamp)*this.manifest.sampleRate : (this.manifest.duration-frame.timestamp)*this.manifest.sampleRate;
    if(gameRaster && Number.isFinite(nextStart) && Math.abs(nextStart-Math.round(nextStart))<1e-4)nextStart=Math.round(nextStart);
    const end=nextStart+this.manifest.samplesPerFrame;
    if(offset>=this.manifest.samplesPerFrame && offset<nextStart)return; // Explicit capture gap: no invented samples.
    this.active={current,next,previous,previousStart,offset,nextStart,end};
  }
  dispose(){this.disposed=true;this.worker?.dispose();this.generation++;for(const texture of this.cache.values())texture.dispose();this.cache.clear();this.active=null;}
}

export async function openSignalFolder(files) {
  const list=Array.from(files);
  const manifests=list.filter(f=>f.name==='manifest.json');
  if(manifests.length!==1)throw new Error('Choose one recording folder containing manifest.json');
  const file=manifests[0],relative=file.webkitRelativePath || file.name;
  const prefix=relative.slice(0,-'manifest.json'.length);
  const byPath=new Map(list.map(f=>[f.webkitRelativePath || f.name,f]));
  const manifest=validateSignalManifest(JSON.parse(await file.text()));
  // Validate presence before starting playback; individual chunks load on demand.
  for(const track of manifest.tracks)for(const frame of manifest.frames){
    const path=`${prefix}${track.id}/${String(frame.index).padStart(6,'0')}.f32`;
    const chunk=byPath.get(path);if(!chunk || chunk.size!==manifest.samplesPerFrame*4)throw new Error(`Missing or incomplete signal chunk: ${path}`);
  }
  return new SignalClip(manifest,async path=>byPath.get(prefix+path).arrayBuffer());
}

export async function openSignalURL(url) {
  const base=new URL(url,location.href);
  const response=await fetch(base);if(!response.ok)throw new Error(`Signal manifest: HTTP ${response.status}`);
  return new SignalClip(await response.json(),async path=>{
    const chunk=await fetch(new URL(path,base));if(!chunk.ok)throw new Error(`Signal chunk: HTTP ${chunk.status}`);return chunk.arrayBuffer();
  });
}
