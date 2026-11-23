import {frequency} from './music.js';
export class Ensemble {
  constructor(ctx, volume){
    this.ctx=ctx;this.master=ctx.createGain();this.master.gain.value=volume;
    this.master.connect(ctx.destination);
    this.pad=ctx.createGain();this.low=ctx.createGain();this.answers=ctx.createGain();
    for(const bus of [this.pad,this.low,this.answers])bus.connect(this.master);
    this.voices=[];this.responses=[];
  }
  tone(n,type,bus,level,start,rise,duration=Infinity,detune=0){
    const c=this.ctx, osc=c.createOscillator(), env=c.createGain();
    osc.type=type;osc.frequency.value=frequency(n);osc.detune.value=detune;
    osc.connect(env).connect(bus);
    env.gain.setValueAtTime(0,start);env.gain.linearRampToValueAtTime(level,start+rise);
    osc.start(start);
    if(Number.isFinite(duration)){
      env.gain.exponentialRampToValueAtTime(.00002,start+duration);
      osc.stop(start+duration+.03);
    }
    osc.onended=()=>{osc.disconnect();env.disconnect();};
    return {osc,env};
  }
  release(voices,seconds){
    const now=this.ctx.currentTime;
    for(const {osc,env} of voices.splice(0)){
      env.gain.cancelAndHoldAtTime(now);env.gain.linearRampToValueAtTime(0,now+seconds);osc.stop(now+seconds+.02);
    }
  }
  chord(root,third){
    this.release(this.voices,.36);
    const t=this.ctx.currentTime;
    for(const offset of [0,third,7,12]){
      const n=60+root+offset;
      this.voices.push(this.tone(n,'sine',this.pad,.043,t,.43),this.tone(n,'triangle',this.pad,.016,t,.65,Infinity,4));
    }
    this.voices.push(this.tone(36+root,'sine',this.low,.095,t,.26));
  }
  answer(phrase){
    this.release(this.responses,.05);
    const t=this.ctx.currentTime;
    for(const [i,p] of phrase.entries()){
      const n=i===phrase.length-1?phrase[0].n:p.n;
      this.responses.push(this.tone(60+n%12,'sine',this.answers,.14,t+p.t-phrase[0].t,.035,.62));
    }
    return t+phrase.at(-1).t-phrase[0].t+.62;
  }
}
