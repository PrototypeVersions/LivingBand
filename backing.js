import {chordTones} from './music.js?v=colors2';
// A chart entry is a chord and its duration in quarter notes.
export function parseChart(text){
  const entries=text.trim().split(/[\s,|]+/).filter(Boolean);
  if(!entries.length)throw Error('Enter at least one chord.');
  return entries.map(entry=>{
    const m=/^([A-Ga-g])([#♯b♭]?)(maj7|sus2|sus4|m|)(?::([1-9]\d?))?$/.exec(entry);
    if(!m)throw Error('Check “'+entry+'”. Use major, minor, sus2, sus4 or maj7, optionally followed by a beat count.');
    const accidental=m[2] ? ('#♯'.includes(m[2]) ? 1 : -1) : 0;
    const root=({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1].toUpperCase()]+accidental+12)%12;
    return {name:m[1].toUpperCase()+m[2]+m[3],root,intervals:chordTones[m[3]],beats:Number(m[4]||4)};
  });
}
export function capturedChart(events,end,bpm){
  if(!events.length)return '';
  return events.map((event,i)=>{
    const duration=(events[i+1]?.at??end)-event.at;
    const beats=Math.max(1,Math.min(99,Math.round(duration*bpm/60)));
    return event.name+(beats===4?'':':'+beats);
  }).join(' ');
}
export function startGroove(band,chart,bpm,onBeat){
  const ctx=band.ctx,beat=60/bpm;
  const noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.18),ctx.sampleRate);
  const data=noise.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  function drum(t,hat){
    const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),env=ctx.createGain();
    src.buffer=noise;filter.type=hat?'highpass':'bandpass';filter.frequency.value=hat?6700:1900;
    env.gain.setValueAtTime(hat?.045:.18,t);env.gain.exponentialRampToValueAtTime(.0001,t+(hat?.045:.15));
    src.connect(filter).connect(env).connect(band.master);src.start(t);src.onended=()=>{src.disconnect();filter.disconnect();env.disconnect();};
  }
  let at=ctx.currentTime+.08,count=-4,part=0,within=0;
  const display=[];
  function schedule(){
    // Resume on a fresh beat after tab suspension instead of firing missed notes together.
    if(at<ctx.currentTime-.05){at=ctx.currentTime+.04;display.length=0;}
    while(at < ctx.currentTime+.14){
      const chord=chart[part];
      display.push({at,name:count<0?'—':chord.name,beat:count<0?'Count-in '+(count+5)+'/4':'Beat '+(within+1)+' of '+chord.beats});
      if(count<0)band.tone(count===-4?86:81,'sine',band.master,.14,at,.002,.06);
      else{
        if(within===0)for(const interval of chord.intervals){
          band.tone(60+chord.root+interval,'triangle',band.pad,.045,at,.055,Math.max(.18,beat*chord.beats));
        }
        band.tone(36+chord.root+(within%4===2?7:0),'sine',band.low,.24,at,.008,beat*.84);
        if(count%2===0)band.tone(32,'sine',band.master,.34,at,.004,.18);
        else drum(at,false);
        drum(at,true);drum(at+beat*.5,true);
        if(++within===chord.beats){within=0;part=(part+1)%chart.length;}
      }
      at+=beat;count++;
    }
    while(display.length && display[0].at<=ctx.currentTime){const d=display.shift();onBeat(d.name,d.beat);}
  }
  schedule();return setInterval(schedule,25);
}
