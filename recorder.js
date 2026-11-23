// Keep the exact sample clock with the audio. Channel 1/2 is the stereo
// performance on a TMP. A mono source is duplicated only during playback.
class Recorder extends AudioWorkletProcessor {
  constructor(){super();this.offset=0;this.buffers=null;}
  process(inputs){
    const input=inputs[0];if(!input.length)return true;
    let i=0;
    while(i<input[0].length){
      if(!this.offset){
        this.begin=currentFrame+i;
        this.buffers=input.slice(0,2).map(()=>new Float32Array(1024));
      }
      const n=Math.min(1024-this.offset,input[0].length-i);
      this.buffers.forEach((buf,ch)=>buf.set((input[ch]||input[0]).subarray(i,i+n),this.offset));
      this.offset+=n;i+=n;
      if(this.offset===1024){
        this.port.postMessage({begin:this.begin,buffers:this.buffers},this.buffers.map(b=>b.buffer));this.offset=0;
      }
    }
    return true;
  }
}
registerProcessor('loop-recorder',Recorder);
