import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CompositeReceiver} from '../composite-receiver.js';
const root=process.argv[2]||'/tmp/composite-game-validation';
const bytes=readFileSync(`${root}/game-receiver-input.f32`);
const samples=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
const reference=JSON.parse(readFileSync(`${root}/game-receiver-rows.json`));
const receiver=new CompositeReceiver();
let worstPosition=0,worstPhase=0,worstClamp=0;
const start=performance.now();
for(let frame=0;frame<reference.length;frame++){
 const b=readFileSync(`${root}/game-receiver-input-${frame}.f32`),samples=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4),expected=reference[frame];
 const actual=receiver.recover(samples);
 for(let line=0;line<480;line++){
  const offset=line*4;
  worstPosition=Math.max(worstPosition,Math.abs(actual[offset]-(expected[offset]-144*910)));
  worstPhase=Math.max(worstPhase,Math.abs(Math.atan2(Math.sin(actual[offset+1]-expected[offset+1]),Math.cos(actual[offset+1]-expected[offset+1]))));
  worstClamp=Math.max(worstClamp,Math.abs(actual[offset+2]-expected[offset+2]));
 }
}
assert(worstPosition<.1,`timing mismatch ${worstPosition}`);
assert(worstPhase<.03,`burst phase mismatch ${worstPhase}`);
assert(worstClamp<.005,`clamp mismatch ${worstClamp}`);
console.log({worstPosition,worstPhase,worstClamp,cpuMillisecondsPerFrame:(performance.now()-start)/reference.length});
const mixedReference=JSON.parse(readFileSync(`${root}/game-mixed-rows.json`));
const mixedReceiver=new CompositeReceiver();
let mixedPosition=0,mixedPhase=0;
for(let frame=0;frame<mixedReference.length;frame++) {
 const b=readFileSync(`${root}/game-mixed-input-${frame}.f32`),s=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
 const actual=mixedReceiver.recover(s),expected=mixedReference[frame];
 for(let row=0;row<480;row++){
  const i=row*4;
  mixedPosition=Math.max(mixedPosition,Math.abs(actual[i]-(expected[i]-144*910)));
  mixedPhase=Math.max(mixedPhase,Math.abs(Math.atan2(Math.sin(actual[i+1]-expected[i+1]),Math.cos(actual[i+1]-expected[i+1]))));
 }
}
assert(mixedPosition<.1,`mixed timing mismatch ${mixedPosition}`);
assert(mixedPhase<.04,`mixed burst mismatch ${mixedPhase}`);
console.log({mixedPosition,mixedPhase});
// Compare the notch/quadrature decoder against Metal's actual output pixels.
const f=Math.fround,pi=f(Math.PI),us=f(f(315/88)*4);
function decode(samples,row,x){
 const wave=p=>{p=f(Math.max(0,Math.min(samples.length-2,f(p))));const i=Math.floor(p);return f(samples[i]+f((samples[i+1]-samples[i])*(p-i)));};
 const offset=f(f(f(9.4)*us)+f(f(f((x+.5)/720)*f(52.655))*us));
 const center=f(row[0]+offset);
 let y=f(f((wave(center-2)+2*wave(center)+wave(center+2))*.25)-row[2]),u=0,v=0,norm=0;
 for(let k=-16;k<=16;k++){
  const fc=1.3/us,win=.42+.5*Math.cos(Math.PI*k/17)+.08*Math.cos(2*Math.PI*k/17),z=2*fc*k;
  const w=2*fc*(k===0?1:Math.sin(Math.PI*z)/(Math.PI*z))*win;
  const angle=2*Math.PI*((offset+k)%4)/4+row[1],value=wave(center+k)-row[2];
  u+=2*value*Math.cos(angle)*w;v+=2*value*Math.sin(angle)*w;norm+=w;
 }
 const t=Math.max(0,Math.min(1,(row[3]-.012)/(.035-.012))),killer=t*t*(3-2*t),range=5/7-7.5/140;
 y=(y-7.5/140)/range;u=u/norm*killer/range;v=v/norm*killer/range;
 const r=y+v/.877,b=y+u/.493,g=(y-.299*r-.114*b)/.587;
 return [r,g,b].map(value=>Math.round(Math.max(0,Math.min(1,value))*255));
}
let colorError=0,checks=0,worstColorError=0;
for(let frame=0;frame<mixedReference.length;frame++){
 const b=readFileSync(`${root}/game-mixed-input-${frame}.f32`),s=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4),pixels=readFileSync(`${root}/game-mixed-output-${frame}.rgba`);
 for(let row=8;row<480;row+=13)for(let x=16;x<704;x+=19){
  const actual=decode(s,mixedReference[frame].slice(row*4,row*4+4),x);
  for(let channel=0;channel<3;channel++){const error=Math.abs(actual[channel]-pixels[(row*720+x)*4+channel]);colorError+=error;checks++;worstColorError=Math.max(worstColorError,error);}
 }
}
assert(colorError/checks<.5,`Metal/game decoder mismatch ${colorError/checks} levels`);
console.log({meanDecoderError:colorError/checks,worstDecoderError:worstColorError});
