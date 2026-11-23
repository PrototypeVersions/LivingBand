// Preserve discrete inputs. Send only the selected channel to the silent analyser.
class ChannelTap extends AudioWorkletProcessor {
  constructor(){
    super();this.channel=0;this.frames=0;this.sums=[];
    this.port.onmessage=e=>{this.channel=e.data;};
  }
  process(inputs,outputs){
    const channels=inputs[0], out=outputs[0][0];
    if(channels[this.channel])out.set(channels[this.channel]);
    if(!channels.length)return true;
    for(let i=0;i<channels.length;i++){
      let sum=this.sums[i]||0;
      for(const sample of channels[i])sum+=sample*sample;
      this.sums[i]=sum;
    }
    this.frames+=out.length;
    if(this.frames>=sampleRate*.065){
      this.port.postMessage(this.sums.slice(0,channels.length).map(v=>Math.sqrt(v/this.frames)));
      this.frames=0;this.sums=[];
    }
    return true;
  }
}
registerProcessor('channel-tap',ChannelTap);
