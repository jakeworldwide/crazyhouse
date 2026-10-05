import assert from 'node:assert/strict';
import {lowPassWeights} from '../analog-filters.js';
const response=(w,f,fs)=>Math.abs(w.reduce((sum,v,i)=>sum+v*Math.cos(2*Math.PI*f*(i-(w.length-1)/2)/fs),0));
for(const [cutoff,fs,count,size] of [[4.2,720/52.655,49,49],[1.3,720/52.655,49,49],[1.3,315/88*4,33,33]]){
 const w=lowPassWeights(cutoff,fs,count,size);
 assert(Math.abs(response(w,0,fs)-1)<1e-6,'filter changed DC brightness');
 assert(response(w,cutoff*.3,fs)>.98,'passband unexpectedly attenuated');
 assert(response(w,Math.min(fs*.48,cutoff*2.5),fs)<.01,'stopband leaked');
 for(let i=0;i<size;i++)assert.equal(w[i],w[size-1-i],'asymmetric impulse response');
}
const narrow=lowPassWeights(1,720/52.655,49,49),wide=lowPassWeights(4.2,720/52.655,49,49);
assert(response(wide,2.5,720/52.655)>100*response(narrow,2.5,720/52.655),'bandwidth control has no effect');
for(const count of [1,9,25,49]){const w=lowPassWeights(4.2,720/52.655,count,49);assert.equal(w.filter(v=>v!==0).length,count);assert(Math.abs(response(w,0,720/52.655)-1)<1e-6);}
assert.equal(response(lowPassWeights(0,720/52.655,49,49),6,720/52.655),1,'zero cutoff must bypass');
console.log('Passed adjustable filter DC/passband/stopband, symmetry, bandwidth changes, tap count, and bypass.');
