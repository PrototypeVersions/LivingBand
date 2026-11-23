// Run with node --experimental-default-type=module tests/chord-changes.mjs
import { hear, Player, frequency } from '../music.js';

const rate = 48000, size = 4096, hop = 960;
const chords = {Em:[40,47,52,55,59,64], C:[48,52,55,60,64], Am:[45,52,57,60,64], Asus2:[45,52,57,59,64], Fmaj7:[53,57,60,64]};
const progression = ['Em','C','Am','C','Em'];

// Render continuous downstrokes with uneven string levels and a delayed copy.
// Each section lasts one second, with no silence at the chord boundary.
function strums(wet, quietA, sequence=progression) {
  const dry = new Float64Array(rate * sequence.length);
  sequence.forEach((name, section) => {
    for (const beat of [0,.37,.72]) chords[name].forEach((midi,string) => {
      const start = Math.floor(rate*(section+beat+.013*string));
      const amplitude = [.15,.44,.33,.5,.48,.29][string] * (quietA && name==='Am' && midi%12===9 ? .24 : 1);
      const omega = 2*Math.PI*frequency(midi)/rate;
      for(let i=0; i<rate*.85 && start+i<dry.length; i++) {
        const phase=i*omega, t=i/rate;
        dry[start+i]+=amplitude*Math.min(1,t/.008)*Math.exp(-t*4.8)*
          (Math.sin(phase)+.48*Math.sin(2*phase)+.29*Math.sin(3*phase)+.17*Math.sin(4*phase));
      }
    });
  });
  return dry.map((v,i)=>.18*(v+(wet && i>=9600 ? .45*dry[i-9600]:0)));
}

// Blackman-windowed FFT matching the browser analyser.
function spectrum(samples, end) {
  const re = new Float64Array(size), im = new Float64Array(size);
  for(let i=0,j=0;i<size;i++){
    const angle=2*Math.PI*i/size;
    re[j]=(samples[end-size+i]||0)*(.42-.5*Math.cos(angle)+.08*Math.cos(2*angle));
    let bit=size>>1;
    while(bit && (j&bit)){j^=bit;bit>>=1;}
    j^=bit;
  }
  for(let len=2;len<=size;len*=2){
    for(let k=0;k<len/2;k++){
      const a=-2*Math.PI*k/len,c=Math.cos(a),s=Math.sin(a);
      for(let i=k;i<size;i+=len){
        const j=i+len/2,x=c*re[j]-s*im[j],y=s*re[j]+c*im[j];
        re[j]=re[i]-x; im[j]=im[i]-y; re[i]+=x; im[i]+=y;
      }
    }
  }
  return re.slice(0,size/2).map((v,i)=>20*Math.log10(Math.hypot(v,im[i])/size));
}
const suspended=['Asus2','Fmaj7','Asus2','Fmaj7'];
for (const [wet,quietA,sequence] of [[false,false,progression],[true,false,progression],[true,true,progression],[false,false,suspended],[true,false,suspended]]){
  const samples=strums(wet,quietA,sequence), player=new Player(), changes=[];
  for(let end=hop;end<samples.length;end+=hop){
    const level=Math.sqrt(samples.subarray(end-1024,end).reduce((sum,v)=>sum+v*v,0)/1024);
    for(const event of player.step(end/rate,level,hear(spectrum(samples,end),rate/size,null,player.harmony))){
      if(event.kind==='chord')changes.push({at:end/rate,name:event.chord});
    }
  }
  console.log(quietA?'Echo with quiet A strings':wet?'Echo':'Dry',JSON.stringify(changes));
  if(changes.map(c=>c.name).join()!==sequence.join() ||
     changes.some((c,i)=>c.at-i>(quietA ? .55 : wet && sequence===suspended ? .35 : .25) || c.at<i))throw Error('Continuous strum tracking failed');
}

// Check the learned voicing across a new take with echo, including adjacent C chords.
const example = strums(false,true);
const reference = hear(spectrum(example,Math.round(2.53*rate)),rate/size);
if(!reference.possibleAm) throw Error('Quiet Am cannot be learned');
const take = strums(true,true);
for(const [section,expected] of progression.entries()){
  const bins=spectrum(take,Math.round((section+.56)*rate));
  const heard=hear(bins,rate/size,reference.fingerprint);
  if(heard.chord!==expected) throw Error('Learned Am interfered with '+expected);
}
