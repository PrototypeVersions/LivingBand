// Find strum attacks independently of chord labels, including repeated strums.
export class StrumTimes {
  constructor(){this.times=[];this.history=[];this.last=-Infinity;this.peak=null;}
  observe(time,bins,binHz,level){
    const limit=Math.min(bins.length,Math.ceil(4000/binHz));
    if(!this.previous)this.previous=new Float32Array(limit);
    let flux=0;
    for(let i=Math.ceil(75/binHz);i<limit;i++){
      const energy=Math.max(0,bins[i]+72);
      flux+=Math.max(0,energy-this.previous[i]);
      this.previous[i]=energy;
    }
    flux/=limit;
    const baseline=this.history.length?this.history.reduce((a,b)=>a+b,0)/this.history.length:0;
    const peak=this.peak;
    if(peak && peak.rising && flux<peak.flux && peak.flux>peak.threshold && peak.time-this.last>.115 && peak.audible){
      this.times.push(peak.time);this.last=peak.time;
    }
    this.peak={time,flux,rising:flux>=(peak?.flux??0),threshold:Math.max(.07,baseline*1.65),audible:level>.002};
    this.history.push(flux);if(this.history.length>16)this.history.shift();
  }
}

function gaps(times,lag){
  return times.slice(lag).map((t,i)=>t-times[i]).filter(v=>v>.1);
}
function fit(intervals,beat,chords){
  let sum=0,good=0;
  for(const duration of intervals){
    const units=duration/beat;
    const n=chords?Math.max(1,Math.round(units)):Math.max(.5,Math.round(units*2)/2);
    const residual=Math.abs(duration-n*beat);
    const tolerance=Math.min(.1,.052+duration*.009);
    const accuracy=Math.exp(-.5*(residual/tolerance)**2);
    // Prefer a familiar pulse when half- and double-time explain the same attacks.
    const prior=chords?(n===4?1:n===2?.91:n===8?.83:.76):(n===1?1:n===.5?.90:n===2?.86:.77);
    sum+=accuracy*prior;
    if(residual<tolerance*1.5)good++;
  }
  return {score:sum/intervals.length,agreement:good/intervals.length};
}
export function estimateTempo(attacks,events){
  const times=attacks.slice(-160),changes=events.slice(-64).map(e=>e.at);
  const chords=gaps(changes,1),strums=gaps(times,1);
  // A single held chord has no identifiable pulse. Never infer it from stop time.
  if(strums.length<4 && chords.length<2)return null;
  const useStrums=strums.length>=4;
  const longer=useStrums?gaps(times,3):[];
  let best=null;
  for(let bpm=40;bpm<=220;bpm++){
    const beat=60/bpm;
    const harmonic=chords.length?fit(chords,beat,true):null;
    const rhythm=useStrums?fit(strums,beat,false):null;
    const pulse=rhythm?rhythm.score*.68+fit(longer,beat,false).score*.32:0;
    let score=harmonic?.score??pulse;
    if(rhythm && harmonic)score=.42*harmonic.score+.58*pulse;
    score-=.025*Math.abs(Math.log2(bpm/95));
    if(!best||score>best.score)best={bpm,score,agreement:rhythm?.agreement??harmonic.agreement};
  }
  return best.score>=.62 && best.agreement>=.58?best.bpm:null;
}
