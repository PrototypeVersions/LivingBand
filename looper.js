import {AudioHistory} from './audio.js';
import {RepeatDetector} from './detector.js';
import {singlePass} from './manual.js';
import {demoTake} from './demo.js';

const el=id=>document.getElementById(id);
let session,lastLoop;
const scope=el('scope'),pen=scope.getContext('2d'),levels=[];
function draw(level){
  if(levels.length>=100)levels.shift();
  levels.push(Math.min(1,Math.sqrt(level)*2));
  scope.width=scope.clientWidth||500;scope.height=74;
  pen.fillStyle='#ada0ec';
  levels.forEach((v,i)=>pen.fillRect(scope.width*(100-levels.length+i)/100,37-v*34,Math.max(1,scope.width/100-2),Math.max(1,68*v)));
}
function show(badge,message){
  el('badge').textContent=badge;el('status').textContent=message;
  el('stop').disabled=!session;el('device').disabled=!!session;
  el('listen').disabled=el('demo').disabled=!!session;
  el('manual').disabled=!!session && session.mode!=='manual';
  el('manual').textContent=session?.mode==='manual'?'Finish & loop · Space':'Record one pass · Space';
  el('replay').hidden=!!session||!lastLoop;
}
function release(s){
  if(s.tap){s.tap.port.onmessage=null;s.tap.port.close();s.tap.disconnect();}
  s.input?.disconnect();s.stream?.getTracks().forEach(t=>t.stop());
  if(s.demo){try{s.demo.stop();}catch{}s.demo=null;}
  s.history=null;
}
function stop(message='Stopped.'){
  const s=session;session=null;
  if(s){clearInterval(s.timer);release(s);s.ctx.close().catch(()=>{});}
  show('Standby',message);
}
function play(s,result,phase){
  release(s);s.mode='play';lastLoop=result.buffer;
  const player=s.ctx.createBufferSource();player.buffer=lastLoop;player.loop=true;
  s.gain=s.ctx.createGain();player.connect(s.gain).connect(s.ctx.destination);
  const when=s.ctx.currentTime+.025;
  const offset=phase?((when-result.end)%lastLoop.duration+lastLoop.duration)%lastLoop.duration:0;
  player.start(when,offset);
  s.gain.gain.setValueAtTime(0,when);s.gain.gain.linearRampToValueAtTime(+el('volume').value/100,when+.012);
  const channel=lastLoop.getChannelData(0);
  s.timer=setInterval(()=>draw(Math.abs(channel[Math.floor(Math.max(0,s.ctx.currentTime-when+offset)*lastLoop.sampleRate)%channel.length])),60);
  el('duration').textContent=lastLoop.duration.toFixed(2)+' s';
  show('Looping',result.message||'Your recorded guitar is looping. Play over it.');
}
async function devices(){
  const select=el('device'),value=select.value;
  const list=await navigator.mediaDevices.enumerateDevices();
  select.replaceChildren(new Option('System default',''));
  list.filter(d=>d.kind==='audioinput'&&d.deviceId&&d.deviceId!=='default').forEach((d,i)=>select.add(new Option(d.label||'Input '+(i+1),d.deviceId)));
  select.value=value;
}
async function start(mode){
  if(session)return;
  const s={ctx:new AudioContext(),mode:'opening'};session=s;
  show('Opening','Opening audio…');levels.length=0;
  try{
    await s.ctx.resume();
    if(mode==='replay'){if(session===s)play(s,{buffer:lastLoop},false);return;}
    await s.ctx.audioWorklet.addModule('./recorder.js');
    if(session!==s)return;
    if(mode==='demo'){
      s.demo=s.ctx.createBufferSource();s.demo.buffer=demoTake(s.ctx);s.input=s.demo;
      s.demo.connect(s.ctx.destination);
    }else{
      const id=el('device').value;
      const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:id?{exact:id}:undefined,channelCount:{ideal:2},echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      if(session!==s){stream.getTracks().forEach(t=>t.stop());return;}
      s.stream=stream;s.input=s.ctx.createMediaStreamSource(stream);devices().catch(()=>{});
      stream.getAudioTracks()[0].onended=()=>{if(session===s&&s.history)stop('The input disconnected.');};
    }
    s.mode=mode;s.history=new AudioHistory(s.ctx.sampleRate);
    const detector=new RepeatDetector();s.frames=[];
    s.tap=new AudioWorkletNode(s.ctx,'loop-recorder',{outputChannelCount:[1]});
    s.input.connect(s.tap);s.tap.connect(s.ctx.destination); // Worklet outputs silence.
    s.tap.port.onmessage=({data})=>{
      if(session!==s||!s.history)return;
      try{
        let match;
        s.history.append(data.begin,data.buffers,(time,level,notes)=>{
          draw(level);
          if(mode==='manual')s.frames.push({time,level});
          else match??=detector.push(time,level,notes);
        });
        if(match)play(s,s.history.loop(s.ctx,match),true);
        else if(mode==='manual'&&s.frames.length>1250)finish();
        else if(mode==='demo'&&data.begin/s.ctx.sampleRate>s.demoEnd)stop('Demo ended without a repeat.');
      }catch(e){stop(e.message);}
    };
    if(s.demo){s.demoEnd=s.ctx.currentTime+s.demo.buffer.duration+.25;s.demo.start();}
    el('source').textContent=s.stream?.getAudioTracks()[0]?.label||'Demo guitar';
    el('duration').textContent='—';
    show(mode==='manual'?'Recording':'Listening',mode==='manual'?'Play once. Press Space or Finish & loop on the beat where you would start again. Maximum take 50 seconds.':'Play the progression twice and begin the next pass.');
  }catch(e){if(session===s)stop('Could not start audio. '+e.message);}
}
function finish(){
  const s=session;if(s?.mode!=='manual')return;
  try{
    const match=singlePass(s.frames,s.ctx.currentTime);
    const loop=s.history.loop(s.ctx,match);
    loop.message=match.snapped?'Looping your take with its ending aligned to the detected pulse.':'Looping your take using the phrase start and your stop timing.';
    play(s,loop,false);
  }catch(e){stop(e.message);}
}
function manual(){if(session?.mode==='manual')finish();else if(!session)start('manual');}
el('manual').onclick=manual;
document.addEventListener('keydown',e=>{
  if(e.code!=='Space'||e.altKey||e.metaKey||e.ctrlKey||e.shiftKey||/INPUT|SELECT|TEXTAREA|SUMMARY/.test(e.target.tagName))return;
  if(session&&session.mode!=='manual')return;
  e.preventDefault();if(!e.repeat)manual();
});
el('listen').onclick=()=>start('auto');el('demo').onclick=()=>start('demo');el('stop').onclick=()=>stop();el('replay').onclick=()=>start('replay');
el('volume').oninput=e=>{el('amount').textContent=e.target.value+'%';if(session?.gain)session.gain.gain.setTargetAtTime(+e.target.value/100,session.ctx.currentTime,.02);};
devices().catch(()=>{});draw(0);
