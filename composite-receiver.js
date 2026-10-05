// Composite Lab's full interlaced receiver, including vertical acquisition. Voltages retain Lab units:
// sync -2/7, blanking 0, white 5/7. This tracks timing; it does not draw effects.
export class CompositeReceiver {
  constructor({width=910,lines=525,guard=144}={}) {
    this.width=width;this.lines=lines;this.guard=guard;
    this.period=width;this.anchor=0;this.phase=0;this.initialized=false;
    this.slice=0;this.sliceValid=false;
    this.rows=new Float32Array(480*4);this.vertical=0;
  }
  recover(samples) {
    const p=this.parameters??{},f=Math.fround,L=this.width,spc=L/227.5,us=f(f(315/88)*spc),count=samples.length;
    const wave=x=>{x=f(Math.max(0,Math.min(count-2,f(x))));const i=Math.floor(x);return f(samples[i]+f((samples[i+1]-samples[i])*(x-i)));};
    const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
    const candidates=[];
    for(let row=0;row<Math.ceil(count/L);row++) {
      let th=p.autoSlice===false?(p.threshold??-.12):this.slice;
      if(p.autoSlice!==false&&!this.sliceValid) {
        let low=0;
        for(let i=row*L;i<Math.min((row+1)*L,count-2);i++)low=Math.min(low,(samples[i]+samples[i+1]+samples[i+2])/3);
        th=low<-.03?.5*low:-.12;
      }
      const edges=[],vertical=[];
      for(let i=Math.max(1,row*L);i<Math.min((row+1)*L,count-Math.trunc(28*us));i++) {
        if(samples[i]>th||samples[i-1]<=th)continue;
        if(samples[i+Math.trunc(us)]>=th||samples[i+Math.trunc(2*us)]>=th)continue;
        if(samples[i+Math.trunc(3.7*us)]<th&&samples[i+Math.trunc(6*us)]>th&&edges.length<4)
          edges.push(f(i-1+f(f(th-samples[i-1])/f(samples[i]-samples[i-1]))));
        if(samples[i+Math.trunc(10*us)]<th&&samples[i+Math.trunc(20*us)]<th&&samples[i+Math.trunc(26*us)]<th&&vertical.length<2)vertical.push(f(i-1+f(f(th-samples[i-1])/f(samples[i]-samples[i-1]))));
      }
      candidates.push({edges,vertical});
    }
    const nearest=target=>{
      const row=Math.floor(target/L);let best=-1,dist=.45*L;
      for(let r=Math.max(0,row-1);r<=Math.min(candidates.length-1,row+1);r++)for(const x of candidates[r].edges){
        const d=Math.abs(x-target);if(d<dist){dist=d;best=x;}
      }
      return best;
    };
    const nearV=target=>{
      const row=Math.floor(target/L);
      for(let r=Math.max(0,row-1);r<=Math.min(candidates.length-1,row+1);r++)for(const v of candidates[r].vertical)if(Math.abs(v-target)<.06*L)return true;
      return false;
    };
    const verticalOrigin=target=>{
      let best=target,dist=130*L;
      for(const row of candidates)for(const v of row.vertical){
        if(nearV(v-.5*L)||!nearV(v+.5*L)||!nearV(v+L)||!nearV(v+2*L))continue;
        const origin=v-3*L,d=Math.abs(origin-target);if(d<dist){dist=d;best=origin;}
      }
      return best;
    };
    const natural=L/(1+(p.holdPPM??0)*1e-6);
    let period=this.initialized?this.period:natural;
    period+=(natural-period)*.002;
    const origin=verticalOrigin(this.guard*L+this.vertical),origin2=verticalOrigin(origin+262.5*L),anchor=this.guard*L+(this.initialized?this.anchor:0);
    let prediction=anchor,basePhase=this.phase;
    let tipSum=0,porchSum=0,measured=0;
    let fieldAnchor=anchor;
    for(let field=0;field<2;field++){
    const fieldStart=field===0?origin:origin2+.5*L;
    prediction=fieldAnchor+Math.round((fieldStart-fieldAnchor)/period)*period;
    for(let line=0;line<260;line++) {
      const observed=nearest(prediction),error=observed>=0?observed-prediction:0;
      const position=f(prediction+f(error*f(p.tracking??.8)));
      if(observed>=0)period=f(Math.max(.99*L,Math.min(1.01*L,period+f(f(error*f(.001))*f(p.tracking??.8)))));
      let bx=0,by=0,dc=0;
      for(let k=0;k<Math.trunc(7*spc);k++) {
        const off=f(f(f(f(5.3)*us)+spc)+k),v=wave(position+off),angle=f(f(f(2*Math.PI)*(off%spc))/spc);
        bx=f(bx+f(v*f(Math.cos(angle))));by=f(by-f(v*f(Math.sin(angle))));
      }
      const amplitude=2*Math.hypot(bx,by)/(7*spc);
      let phase=wrap(basePhase+2*Math.PI*(position%spc)/spc);
      if(amplitude>.012){const correction=(p.colorTracking??.5)*wrap(Math.atan2(by,bx)-Math.PI-phase);basePhase=wrap(basePhase+correction);phase=wrap(phase+correction);}
      for(let k=0;k<Math.trunc(spc*2);k++)dc+=wave(f(position+f(f(8.3)*us))+k);
      dc/=spc*2;
      if(line>=20)this.rows.set([position-this.guard*L,phase,p.clamp===false?0:dc,amplitude],((line-20)*2+field)*4);
      if(line>=20&&observed>=0){let tip=0;const n=Math.trunc(2.5*us);for(let k=0;k<n;k++)tip+=wave(position+us+k);tipSum+=tip/n;porchSum+=dc;measured++;}
      prediction=f(position+period);
    }
    fieldAnchor=prediction;
    }
    const next=prediction+Math.round((this.guard*L+this.lines*L-prediction)/period)*period;
    if(measured>50){const tip=tipSum/measured,porch=porchSum/measured,depth=porch-tip;
      if(depth>.04){const target=porch-.5*depth;this.slice=this.sliceValid?this.slice+.5*(target-this.slice):target;this.sliceValid=true;}else this.sliceValid=false;
    }else this.sliceValid=false;
    this.period=period;this.anchor=next-this.lines*L-this.guard*L;
    let vNext=origin-this.guard*L+525*(period-L);
    this.vertical=((vNext+131.25*L+262.5*L)%(262.5*L)+262.5*L)%(262.5*L)-131.25*L;
    this.phase=wrap(basePhase+2*Math.PI*((this.lines*L)%spc)/spc);this.initialized=true;
    return this.rows;
  }
}
