// Fixed-size shader uniforms; changing bandwidth/tap count never recompiles shaders.
export function lowPassWeights(cutoffMHz,sampleMHz,count,size){
 const weights=new Float32Array(size),center=(size-1)/2;
 count=Math.max(1,Math.min(size,Math.round(count)));if(count%2===0)count--;
 if(!(cutoffMHz>0)||count===1){weights[center]=1;return weights;}
 const fc=Math.min(.5,cutoffMHz/sampleMHz),radius=(count-1)/2;let sum=0;
 for(let t=-radius;t<=radius;t++){
  const sinc=t===0?1:Math.sin(2*Math.PI*fc*t)/(2*Math.PI*fc*t);
  const window=.42+.5*Math.cos(Math.PI*t/(radius+1))+.08*Math.cos(2*Math.PI*t/(radius+1));
  const weight=2*fc*sinc*window;weights[center+t]=weight;sum+=weight;
 }
 for(let i=0;i<size;i++)weights[i]/=sum;
 return weights;
}
