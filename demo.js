// Four independently strummed passes of Asus2 / Fmaj7.
export function demoTake(ctx){
  const rate=ctx.sampleRate,cycle=4.8;
  const buffer=ctx.createBuffer(1,Math.ceil(rate*(cycle*4+1)),rate),out=buffer.getChannelData(0);
  for(let pass=0;pass<4;pass++)for(let beat=0;beat<8;beat++){
    const notes=beat<4?[45,52,57,59,64]:[53,57,60,64];
    notes.forEach((m,j)=>{
      const t=.35+pass*cycle+beat*.6+j*.011+.009*Math.sin(beat+pass);
      const start=Math.round(t*rate),omega=2*Math.PI*440*2**((m-69)/12)/rate;
      const length=Math.min(Math.ceil(rate*.75),out.length-start);
      for(let i=0;i<length;i++){
        const sec=i/rate,phase=omega*i;
        out[start+i]+=.06*Math.min(1,sec/.004)*Math.exp(-sec*(4+j*.25))*(Math.sin(phase)+.4*Math.sin(2*phase)+.16*Math.sin(3*phase));
      }
    });
  }
  return buffer;
}
