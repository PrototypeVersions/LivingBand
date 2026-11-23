export const names = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
export const frequency = n => 440 * 2 ** ((n - 69) / 12);

// Interpolate spectral peaks, then discount the expected overtones of lower strings.
export function hear(db, hzPerBin) {
  const peaks = [];
  for (let i = Math.max(2, Math.floor(73/hzPerBin)); i < Math.min(db.length-1, 1600/hzPerBin); i++) {
    const y = db[i], left = db[i-1], right = db[i+1];
    if (y < -78 || y <= left || y < right) continue;
    const offset = Number.isFinite(left + right) ? .5*(left-right)/(left-2*y+right) : 0;
    const hz = (i+offset)*hzPerBin;
    const midi = Math.round(69+12*Math.log2(hz/440));
    let power = 10 ** (y/20);
    for (const p of peaks) {
      const ratio = hz/p.hz, harmonic = Math.round(ratio);
      if (harmonic >= 2 && Math.abs(ratio/harmonic-1) < .018) power -= p.power/harmonic;
    }
    if (power > .00012) peaks.push({hz,midi,power});
  }
  const sorted = peaks.sort((a,b)=>b.power-a.power);
  if (!sorted.length) return {};
  const chroma = new Float32Array(12);
  for (const p of sorted) if (p.power >= sorted[0].power*.14) chroma[p.midi%12] += p.power;
  const total = chroma.reduce((a,b)=>a+b,0);
  const options = [];
  for (let root=0;root<12;root++) for (const third of [3,4]) {
    const tones = [root,(root+third)%12,(root+7)%12].map(n=>chroma[n]);
    if (Math.min(...tones) < total*.072) continue;
    options.push({root,third,score:tones.reduce((a,b)=>a+b,0)/total});
  }
  options.sort((a,b)=>b.score-a.score);
  const best = options[0];
  if (best && best.score>.82 && best.score-(options[1]?.score || 0)>.09)
    return {chord:names[best.root]+(best.third===3?'m':''),root:best.root,third:best.third};
  if (chroma[sorted[0].midi%12]/total>.70) return {note:sorted[0].midi};
  return {};
}

export class Player {
  constructor(){this.lastSound=-Infinity;this.lastAttack=-Infinity;this.phrase=[];this.current='';this.previousLevel=0;}
  step(t,level,heard){
    const events=[];
    if(level>.002){
      const attack=level>Math.max(.002,this.previousLevel*1.75);
      this.lastSound=t;
      if(heard.chord){
        this.phrase=[];this.note=null;
        if(this.candidate!==heard.chord){this.candidate=heard.chord;this.since=t;}
        if(t-this.since>.20 && this.current!==heard.chord){
          this.current=heard.chord;events.push({kind:'chord',...heard});
        }
      }else{
        this.candidate='';
        if(heard.note!=null && (this.note!==heard.note || attack) && t-this.lastAttack>.095){
          this.phrase.push({t,n:heard.note});this.phrase=this.phrase.filter(p=>t-p.t<4).slice(-6);
          this.note=heard.note;this.lastAttack=t;events.push({kind:'lead'});
        }
      }
      events.push({kind:'playing'});
    }else{
      this.note=null;this.candidate='';
      if(t-this.lastSound>.43 && this.phrase.length){
        if(this.phrase.length>=2) events.push({kind:'answer',phrase:this.phrase});
        this.phrase=[];
      }
      if(t-this.lastSound>1.2 && this.current){this.current='';events.push({kind:'rest'});}
    }
    this.previousLevel=level;
    return events;
  }
}
