// Use the player's stop time as a musical cue. Snap only when several
// independent attacks support a pulse with a nearby ending.
export function singlePass(frames, stop) {
  const peak=frames.reduce((p,f)=>Math.max(p,f.level),0);
  const gate=Math.max(.001,peak*.025);
  const sounding=frames.filter(f=>f.level>gate);
  if(!sounding.length)throw Error('No guitar signal caught. Check the input and record again.');
  const start=sounding[0].time,last=sounding.at(-1).time;
  const attacks=[0];
  for(let i=1;i<frames.length;i++){
    const {level,time}=frames[i],offset=time-start;
    if(level>gate && offset-attacks.at(-1)>.15 && level>frames[i-1].level*1.55+gate*.15)attacks.push(offset);
  }
  const span=stop-start;
  if(span<.5)throw Error('That take was too short. Record at least half a second.');
  let best=null;
  if(attacks.length>=4)for(let beat=.275;beat<=1.01;beat+=.002){
    const errors=attacks.map(t=>Math.abs(t-beat*Math.round(t/beat)));
    const fit=errors.reduce((s,e)=>s+Math.exp(-.5*(e/.053)**2),0)/errors.length;
    const target=stop-last>1.25?last-start+.12:span;
    const beats=Math.max(1,Math.round(target/beat)),end=beats*beat;
    if(end<attacks.at(-1)+beat*.32 || Math.abs(end-target)>Math.min(.29,beat*.48))continue;
    const score=fit-.18*Math.abs(end-target)/beat;
    if(fit>.76 && (!best||score>best.score))best={score,end};
  }
  const duration=best?.end??(stop-last>1.25?last-start+.12:span);
  return {start,end:start+duration,manual:true,snapped:!!best};
}
