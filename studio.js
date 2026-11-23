import {hear, Player, names} from './music.js?v=strums';
import {Ensemble} from './ensemble.js';
const el=id=>document.getElementById(id);
let session=null, token=0;
const meters=el('meters'), canvas=el('scope'), pen=canvas.getContext('2d');
function draw(samples){
  const w=canvas.clientWidth,h=canvas.clientHeight,scale=devicePixelRatio||1;
  if(canvas.width!==Math.round(w*scale)||canvas.height!==Math.round(h*scale)){canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);}
  pen.setTransform(scale,0,0,scale,0,0);pen.clearRect(0,0,w,h);
  pen.strokeStyle='#48516f';pen.lineWidth=.6;pen.beginPath();
  for(let x=0;x<w;x+=24){pen.moveTo(x,0);pen.lineTo(x,h);}
  for(let y=h/6;y<h;y+=h/3){pen.moveTo(0,y);pen.lineTo(w,y);}
  pen.stroke();pen.strokeStyle='#9de8ef';pen.lineWidth=1.6;pen.beginPath();
  for(let x=0;x<w;x++){const s=samples?.[Math.floor(x/w*1024)]||0;const y=h*(.5-.45*Math.tanh(s*9));if(x)pen.lineTo(x,y);else pen.moveTo(x,y);}
  pen.stroke();
}
draw();window.addEventListener('resize',()=>{if(!session)draw();});
async function devices(selected=el('device').value){
  if(!navigator.mediaDevices)return;
  const list=await navigator.mediaDevices.enumerateDevices();
  el('device').replaceChildren(new Option('System default',''));
  for(const d of list.filter(d=>d.kind==='audioinput'&&d.deviceId&&d.deviceId!=='default'))
    el('device').add(new Option(d.label||'Audio input',d.deviceId));
  if([...el('device').options].some(o=>o.value===selected))el('device').value=selected;
}
devices().catch(()=>{});
function stop(message='Session stopped.'){
  token++;const old=session;session=null;
  if(old){clearInterval(old.timer);old.stream?.getTracks().forEach(t=>t.stop());old.ctx.close().catch(()=>{});}
  el('live').disabled=el('demo').disabled=false;el('stop').disabled=true;
  el('channel').disabled=true;el('channel').replaceChildren(new Option('Waiting for audio'));
  meters.replaceChildren();el('note').textContent=el('chord').textContent='—';
  el('action').textContent='Resting';el('badge').textContent='Standby';el('status').textContent=message;draw();
}
function resetListener(s){
  s.player=new Player();s.band.release(s.band.voices,.08);s.band.release(s.band.responses,.04);
  s.replyEnd=0;el('note').textContent=el('chord').textContent='—';el('action').textContent='Listening';
}
function levels(s,values){
  if(session!==s)return;
  if(meters.children.length!==values.length){
    meters.replaceChildren();el('channel').replaceChildren();
    for(let i=0;i<values.length;i++){
      const row=document.createElement('div'),bar=document.createElement('meter');
      row.append('Ch '+(i+1),bar);bar.setAttribute('aria-label','Channel '+(i+1)+' level');meters.append(row);
      el('channel').add(new Option('Channel '+(i+1),i));
    }
    const preferred=/tone master/i.test(s.label)&&values.length>=3?2:0;
    el('channel').selectedIndex=preferred;s.tap.port.postMessage(preferred);el('channel').disabled=values.length<2;
    if(!s.demo){
      const hint=/tone.?master/i.test(s.label) && values.length===2
        ? ' For standard TMP routing these are processed L/R. Try a clean preset with delay and reverb off.'
        : ' Pick a note to check the meters.';
      el('status').textContent=s.label+' · '+values.length+' input channel'+(values.length===1?'':'s')+' available.'+hint;
    }
  }
  values.forEach((v,i)=>{meters.children[i].lastChild.value=Math.min(1,Math.max(0,(20*Math.log10(v+1e-8)+66)/66));});
}
function demoCycle(s,t){
  const synth=s.band;
  for(const [at,notes] of [[0,[52,59,64,67,71,76]],[2,[48,55,60,64,67]],[4,[67]],[4.43,[69]],[5.08,[71]],[5.4,[74]]]){
    for(const [i,n] of notes.entries())synth.tone(n,'triangle',s.source,.075,t+at+i*.018,.012,notes.length>1?1.72:.26);
  }
}
function tick(s){
  const t=s.ctx.currentTime;
  if(s.demo&&t>=s.nextDemo-.3){demoCycle(s,s.nextDemo);s.nextDemo+=9;}
  s.an.getFloatTimeDomainData(s.wave);s.an.getFloatFrequencyData(s.bins);
  let energy=0;for(let i=s.wave.length-1024;i<s.wave.length;i++)energy+=s.wave[i]**2;
  const level=Math.sqrt(energy/1024), heard=level>.002?hear(s.bins,s.ctx.sampleRate/s.an.fftSize):{};
  draw(s.wave.subarray(s.wave.length-1024));
  el('note').textContent=heard.note==null?'—':names[heard.note%12]+(Math.floor(heard.note/12)-1);
  for(const event of s.player.step(t,level,heard)){
    if(event.kind==='playing'&&s.replyEnd>t){s.band.release(s.band.responses,.05);s.replyEnd=0;}
    if(event.kind==='chord'){s.band.chord(event.root,event.third);el('chord').textContent=event.chord;}
    if(event.kind==='answer'&&el('reply').checked)s.replyEnd=s.band.answer(event.phrase);
    if(event.kind==='rest'){s.band.release(s.band.voices,.55);el('chord').textContent='—';}
  }
  s.band.pad.gain.setTargetAtTime(heard.note!=null?.40:1,t,.16);
  el('action').textContent=s.replyEnd>t?'Answering':s.player.current?(heard.note!=null?'Making room':'Sustaining'):'Listening';
}
async function start(demo){
  stop();const id=token;
  el('live').disabled=el('demo').disabled=true;el('stop').disabled=false;
  try{
    const ctx=new AudioContext({latencyHint:'interactive'});
    const s=session={ctx,demo,player:new Player(),replyEnd:0,label:'Demo guitar'};
    await ctx.resume();if(id!==token)return;
    s.band=new Ensemble(ctx,+el('level').value/100);s.band.low.gain.value=el('bass').checked?1:0;
    await ctx.audioWorklet.addModule('./channels.js');if(id!==token)return;
    if(demo){
      s.source=ctx.createGain();s.source.connect(s.band.master);s.nextDemo=ctx.currentTime+.12;
    }else{
      el('status').textContent='Allow audio input, then choose your guitar interface.';
      const selected=el('device').value;
      const stream=await navigator.mediaDevices.getUserMedia({audio:{...(selected?{deviceId:{exact:selected}}:{}),channelCount:{ideal:4},autoGainControl:false,noiseSuppression:false,echoCancellation:false}});
      if(id!==token){stream.getTracks().forEach(tr=>tr.stop());return;}
      s.stream=stream;const track=stream.getAudioTracks()[0];s.label=track.label||'Audio input';
      track.onended=()=>{if(session===s)stop('Input disconnected. Reconnect your interface and start again.');};
      await devices(track.getSettings().deviceId);if(id!==token)return;
      s.source=ctx.createMediaStreamSource(stream);
    }
    s.tap=new AudioWorkletNode(ctx,'channel-tap',{channelCountMode:'max',channelInterpretation:'discrete',outputChannelCount:[1]});
    s.tap.port.onmessage=e=>levels(s,e.data);
    s.an=ctx.createAnalyser();s.an.fftSize=8192;s.an.smoothingTimeConstant=0;
    const mute=ctx.createGain();mute.gain.value=0;
    s.source.connect(s.tap).connect(s.an).connect(mute).connect(ctx.destination);
    s.bins=new Float32Array(s.an.frequencyBinCount);s.wave=new Float32Array(s.an.fftSize);
    el('badge').textContent=demo?'Demo playing':'Live input';el('action').textContent='Listening';
    el('status').textContent=demo?'Demo guitar plays two chords and a short phrase, then leaves room for the band.':'Pick a note to check the input.';
    s.timer=setInterval(()=>tick(s),45);
  }catch(e){if(id===token)stop(e.name==='NotAllowedError'?'Audio access was blocked. Allow microphone access for this page in Chrome, or play the demo.':'Could not start audio. '+e.message);}
}
el('live').onclick=()=>start(false);el('demo').onclick=()=>start(true);el('stop').onclick=()=>stop();
el('device').onchange=()=>{if(session&&!session.demo)start(false);};
el('channel').onchange=()=>{if(session?.tap){session.tap.port.postMessage(+el('channel').value);resetListener(session);}};
el('level').oninput=()=>{el('vol').textContent=el('level').value+'%';if(session?.band)session.band.master.gain.setTargetAtTime(+el('level').value/100,session.ctx.currentTime,.03);};
el('bass').onchange=()=>{if(session?.band)session.band.low.gain.setTargetAtTime(el('bass').checked?1:0,session.ctx.currentTime,.08);};
el('reply').onchange=()=>{if(session?.band&&!el('reply').checked){session.band.release(session.band.responses,.05);session.replyEnd=0;}};
window.addEventListener('pagehide',()=>stop());
