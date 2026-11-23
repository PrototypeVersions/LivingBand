export const names = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
export const frequency = n => 440 * 2 ** ((n - 69) / 12);

// Interpolate spectral peaks, then discount the expected overtones of lower strings.
export function hear(db, hzPerBin, learnedAm = null) {
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
  const strongest = sorted[0].power;
  const fingerprint = new Float32Array(44); // E2 through B5, with octave information.
  let lowest = Infinity;
  for (const peak of sorted) {
    const relative = peak.power / strongest;
    const index = peak.midi - 40;
    if (index >= 0 && index < fingerprint.length && relative > .025)
      fingerprint[index] = Math.max(fingerprint[index], Math.sqrt(relative));
    if (relative < .045) continue;
    // Compress string-to-string differences before folding octaves together.
    chroma[peak.midi % 12] += Math.sqrt(peak.power / strongest);
    if (peak.power >= strongest * .09) lowest = Math.min(lowest, peak.midi);
  }
  const total = chroma.reduce((a,b)=>a+b,0);
  const norm = Math.hypot(...fingerprint);
  if (norm) for (let i=0;i<fingerprint.length;i++) fingerprint[i] /= norm;
  const amTones = [9,0,4].map(n=>chroma[n]/total);
  const possibleAm = Math.min(...amTones) > .025 && amTones.reduce((a,b)=>a+b,0) > .61;
  const evidence = {fingerprint,possibleAm};
  const options = [];
  for (let root=0;root<12;root++) for (const third of [3,4]) {
    const tones = [root,(root+third)%12,(root+7)%12].map(n=>chroma[n]/total);
    const weakest = Math.min(...tones);
    if (weakest < .055) continue;
    const coverage = tones.reduce((a,b)=>a+b,0);
    if (coverage < .69) continue;
    // Give each supported open voicing the same bounded root bonus.
    const bassMidi=[40,45,50,43,48].find(n=>n%12===root);
    const voicing=bassMidi===undefined?0:Math.min(fingerprint[bassMidi-40],fingerprint[bassMidi+12-40])*.30;
    const learned=root===9 && third===3 && learnedAm && possibleAm
      ? Math.max(0,similarity(fingerprint,learnedAm)-.88)*.55 : 0;
    const score=coverage+.35*weakest+(lowest%12===root?.075:0)+voicing+learned;
    options.push({root,third,score});
  }
  options.sort((a,b)=>b.score-a.score);
  const best = options[0];
  if (best && best.score-(options[1]?.score || 0)>.045)
    return {...evidence,chord:names[best.root]+(best.third===3?'m':''),root:best.root,third:best.third};
  if (chroma[sorted[0].midi%12]/total>.70) return {...evidence,note:sorted[0].midi};
  return evidence;
}

export function similarity(a,b) {
  return a.reduce((sum,value,i)=>sum+value*b[i],0);
}

export class Player {
  constructor(){this.lastSound=-Infinity;this.lastAttack=-Infinity;this.phrase=[];this.current='';this.previousLevel=0;this.votes=[];}
  step(t,level,heard){
    const events=[];
    // Keep recent observations across uncertain frames and between pick attacks.
    this.votes=this.votes.filter(v=>t-v.t<=.13);
    if(level>.002){
      const attack=level>Math.max(.002,this.previousLevel*1.75);
      this.lastSound=t;
      if(heard.chord){
        this.phrase=[];this.note=null;
        this.votes.push({t,chord:heard.chord});
        const matching=this.votes.filter(v=>v.chord===heard.chord);
        if(matching.length>=3 && t-matching[0].t>=.038 &&
           matching.length>this.votes.length/2 && this.current!==heard.chord){
          this.current=heard.chord;events.push({kind:'chord',...heard});
        }
      }else{
        if(heard.note!=null && (this.note!==heard.note || attack) && t-this.lastAttack>.095){
          this.phrase.push({t,n:heard.note});this.phrase=this.phrase.filter(p=>t-p.t<4).slice(-6);
          this.note=heard.note;this.lastAttack=t;events.push({kind:'lead'});
        }
      }
      events.push({kind:'playing'});
    }else{
      this.note=null;
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
