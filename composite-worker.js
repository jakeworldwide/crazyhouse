import {CompositeReceiver} from './composite-receiver.js?v=3';
export function sumSignalChunks(chunks,count){
 let sum;
 for(const bytes of chunks){
  if(bytes.byteLength!==count*4)throw new Error('Signal chunk has the wrong sample count');
  const data=new Float32Array(bytes);
  if(!sum)sum=data;else for(let i=0;i<count;i++)sum[i]+=data[i];
 }
 for(let i=0;i<count;i++)if(!Number.isFinite(sum[i]))throw new Error('Signal recording contains non-finite voltage');
 return sum;
}
// Algebraically equivalent to Lab's truncated causal exponential convolution.
// The finite tail is subtracted, so this is not a different IIR approximation.
export function filterChannel(source,mhz,fs=315/88*4){
 if(!(mhz>0))return source;
 const a=Math.exp(-2*Math.PI*mhz/fs),w=1-a,taps=Math.min(384,Math.max(2,Math.ceil(-10/Math.log(a)))),tail=a**taps,norm=1-tail;
 const out=new Float32Array(source.length);let total=source[0]*norm;
 out[0]=source[0];
 for(let i=1;i<source.length;i++){total=a*total+w*source[i]-w*tail*source[Math.max(0,i-taps)];out[i]=total/norm;}
 return out;
}
export function applyReceiverChannel(source,p={}){
 const gain=p.gain??1,bias=p.bias??0,headroom=p.headroom??0,noise=p.noise??0;
 if(gain!==1||bias!==0||headroom>0||noise>0){
  const hash=n=>{n=(n^(n>>>16))>>>0;n=Math.imul(n,0x7feb352d)>>>0;n=(n^(n>>>15))>>>0;n=Math.imul(n,0x846ca68b)>>>0;return (n^(n>>>16))>>>0;};
  for(let i=0;i<source.length;i++){
   let v=source[i]*gain+bias;if(headroom>0)v=headroom*Math.tanh(v/headroom);
   if(noise>0){let n=0;for(let k=0;k<6;k++)n+=(hash((i+(p.frame??0)*525*910+Math.imul(k,0x9e3779b9))>>>0)&65535)/65535-.5;v+=n*1.41421356*noise;}
   source[i]=v;
  }
 }
 if(p.slew>0){
  const out=new Float32Array(source.length),step=p.slew/(315/88*4);
  for(let start=0;start<source.length;start+=256){const begin=Math.max(0,start-256),end=Math.min(start+256,source.length);let v=source[begin];for(let i=begin;i<end;i++){v+=Math.max(-step,Math.min(step,source[i]-v));if(i>=start)out[i]=v;}}
  source=out;
 }
 return filterChannel(source,p.bandwidth??0);
}
// Preview refresh and NTSC frame clocks are independent. Repeated views of
// one waveform window start with the same receiver state.
export function createPreviewReceiver(){
 const receiver=new CompositeReceiver();let lastFrame=null,frameStart=null;
 const keys=['period','anchor','phase','initialized','slice','sliceValid','vertical'];
 const snapshot=()=>Object.fromEntries(keys.map(key=>[key,receiver[key]]));
 return (samples,parameters={})=>{
  receiver.parameters=parameters;
  const frame=parameters.frame??0;
  if(frame===lastFrame)Object.assign(receiver,frameStart);
  else{
   if(lastFrame!==null&&frame>lastFrame+1){
    const missed=frame-lastFrame-1;
    receiver.phase=Math.atan2(Math.sin(receiver.phase+missed*Math.PI),Math.cos(receiver.phase+missed*Math.PI));
    receiver.anchor+=missed*525*(receiver.period-receiver.width);
   }
   frameStart=snapshot();lastFrame=frame;
  }
  return receiver.recover(samples);
 };
}
if(typeof self!=='undefined'&&typeof document==='undefined'){
 const recover=createPreviewReceiver();
 self.onmessage=({data})=>{
  const {id,kind}=data,start=performance.now();
  try{
   if(kind==='sum'){
    const samples=sumSignalChunks(data.chunks,data.count);
    self.postMessage({id,samples:samples.buffer},[samples.buffer]);
   }else if(kind==='receive'){
    const pixels=new Float32Array(data.pixels),width=910,height=813,samples=data.reuse?new Float32Array(data.reuse):new Float32Array(width*height);
    for(let row=0;row<height;row++)for(let x=0;x<width;x++)samples[row*width+x]=pixels[(height-1-row)*Math.ceil(width/4)*4+x];
    const processed=applyReceiverChannel(samples,data.parameters);
    const timing=recover(processed,data.parameters).slice();
    self.postMessage({id,pixels:data.pixels,samples:processed.buffer,timing:timing.buffer,milliseconds:performance.now()-start},[data.pixels,processed.buffer,timing.buffer]);
   }
  }catch(error){self.postMessage({id,error:error.message});}
 };
}
