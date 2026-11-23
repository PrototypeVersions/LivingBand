// Each observation describes 40 ms of playing. Compare pitch-class energy over
// whole phrases; no chord labels, tempo or time signature are required.
export const step = .04;
const dot = (a,b) => a.reduce((sum,x,i)=>sum+x*b[i],0);
export function fingerprint(db, binHz) {
  const chroma = new Float32Array(12);
  let loudest=-Infinity;
  const last=Math.min(db.length-2,Math.ceil(1550/binHz));
  for(let i=2;i<=last;i++)loudest=Math.max(loudest,db[i]);
  for(let i=Math.max(2,Math.floor(74/binHz));i<=last;i++){
    const y=db[i],l=db[i-1],r=db[i+1];
    if(y<Math.max(-84,loudest-31)||y<=l||y<r)continue;
    const offset=Number.isFinite(l+r)? .5*(l-r)/(l-2*y+r):0;
    const hz=(i+offset)*binHz;
    const note=Math.round(69+12*Math.log2(hz/440));
    chroma[(note+120)%12]+=10**((y-loudest)/34)/Math.sqrt(hz/110);
  }
  const norm=Math.hypot(...chroma);
  if(norm)for(let i=0;i<12;i++)chroma[i]/=norm;
  return chroma;
}
function match(frames,start,middle,end){
  const first=middle-start,second=end-middle;
  let fit=0,baseline=0,sounded=0,distinct=0;
  // Compare against shifted versions too. A held chord or undifferentiated
  // strumming can correlate strongly at almost any loop length.
  for(let i=0;i<first;i+=2){
    const a=frames[start+i], b=frames[middle+Math.min(second-1,Math.floor(i*second/first))];
    if(!a.active && !b.active)continue;
    sounded++;
    if(!a.active || !b.active)continue;
    const close=dot(a.notes,b.notes);
    const shifted=[.27,.51,.73].map(k=>{
      const other=frames[start+(i+Math.round(k*first))%first];
      return other.active?dot(a.notes,other.notes):0;
    });
    const average=shifted.reduce((x,y)=>x+y)/shifted.length;
    fit+=close;baseline+=average;
    if(Math.min(...shifted)<.76)distinct++;
  }
  if(sounded<first*.30 || distinct<first*.055)return 0;
  fit/=sounded;baseline/=sounded;
  if(fit<.84 || fit-baseline<.052)return 0;
  return fit+.45*(fit-baseline);
}
export class RepeatDetector {
  constructor(){this.frames=[];this.attacks=[];this.floor=.00045;this.lastAttack=-1;this.lastLevel=0;}
  push(time,level,notes){
    const active=level>Math.max(.0014,this.floor*2.8);
    if(!active)this.floor=.98*this.floor+.02*Math.min(level,.001);
    const last=this.frames.at(-1);
    const attack=active && (!last?.active || level>this.lastLevel*1.52+.0007 ||
      (last.active && dot(notes,last.notes)<.84));
    const index=this.frames.length;
    if(attack && time-this.lastAttack>.14){this.attacks.push(index);this.lastAttack=time;}
    this.lastLevel=level;this.frames.push({time,level,notes,active});
    if(this.frames.length>1800){
      this.frames.splice(0,100);this.attacks=this.attacks.filter(i=>i>=100).map(i=>i-100);
    }
    const f=this.frames,n=f.length;
    if(n<122)return null;
    // Wait briefly past a candidate boundary so ringing strings, natural
    // pauses and the first attack of the third pass can be distinguished.
    const end=n-5;
    const ended=f[end-1].active && f.slice(end).every(x=>!x.active);
    if(!this.attacks.includes(end) && !ended)return null;
    let best=null;
    for(const middle of this.attacks){
      const length=end-middle;
      if(length<60 || length>600)continue;
      for(const start of this.attacks){
        const first=middle-start;
        if(Math.abs(first-length)>Math.max(3,length*.085))continue;
        const entry=f[start+3];
        if(!ended && dot(entry.notes,f[end+3].notes)<.76)continue;
        const quality=match(f,start,middle,end);
        if(!quality)continue;
        const score=quality-.65*Math.abs(first-length)/length;
        if(!best||score>best.score)best={start:f[middle].time,end:f[end].time,score};
      }
    }
    return best;
  }
}
