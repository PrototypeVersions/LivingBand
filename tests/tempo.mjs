import {estimateTempo,StrumTimes} from '../tempo.js';
for(const bpm of [60,76,92,108,140,180]){
  for(const subdivision of [1,2]){
    const strums=Array.from({length:32},(_,i)=>i*60/bpm/subdivision+.018*Math.sin(i*2));
    const changes=Array.from({length:5},(_,i)=>({at:i*240/bpm+.03*Math.cos(i)}));
    const guess=estimateTempo(strums,changes);
    if(Math.abs(guess-bpm)>2)throw Error('Pulse mismatch: '+[bpm,subdivision,guess]);
  }
}
if(estimateTempo([0,.5],[])!==null)throw Error('Insufficient evidence');
if(estimateTempo([],[{at:0},{at:3},{at:6}])!==80)throw Error('Sustained chords');
const attacks=new StrumTimes(),bins=new Float32Array(256);
for(let i=0;i<400;i++){
  const frame=i%30;
  bins.fill(frame<3?-28-frame*4:-80);
  attacks.observe(i*.02,bins,20,frame<3?.1:0);
}
if(attacks.times.length!==14 || estimateTempo(attacks.times,[])!==100)throw Error('Strum attack timing');
