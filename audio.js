import {fingerprint} from './detector.js';

export class AudioHistory {
  constructor(rate){
    this.rate=rate;this.size=Math.ceil(rate*55);
    this.channels=[];this.end=null;this.first=0;
    this.fft=new Spectrum(rate>64000?8192:4096);
    this.hop=Math.round(.04*rate);this.next=0;
  }
  append(begin,buffers,observe){
    if(this.end!==begin || this.channels.length!==buffers.length){
      this.channels=buffers.map(()=>new Float32Array(this.size));
      this.first=begin;this.next=begin+this.fft.n;
    }
    const pos=begin%this.size,len=buffers[0].length,head=Math.min(len,this.size-pos);
    buffers.forEach((b,ch)=>{this.channels[ch].set(b.subarray(0,head),pos);if(head<len)this.channels[ch].set(b.subarray(head),0);});
    this.end=begin+len;this.first=Math.max(this.first,this.end-this.size);
    while(this.next<=this.end){
      const center=this.next-this.fft.n/2;
      let index=0,level=this.rms(0,center,Math.round(.02*this.rate));
      if(this.channels.length===2){
        const right=this.rms(1,center,Math.round(.02*this.rate));
        if(right>level){level=right;index=1;}
      }
      const db=this.fft.read(this.channels[index],this.next);
      observe(center/this.rate,level,fingerprint(db,this.rate/this.fft.n));
      this.next+=this.hop;
    }
  }
  rms(ch,start,n){
    let energy=0;for(let i=0;i<n;i+=4)energy+=this.channels[ch][(start+i)%this.size]**2;
    return Math.sqrt(energy/Math.ceil(n/4));
  }
  boundary(time){
    const guess=Math.round(time*this.rate),hop=Math.round(.005*this.rate);
    let best=guess,score=.0012;
    for(let at=Math.max(this.first+hop,guess-14*hop);at<Math.min(this.end-hop,guess+9*hop);at+=hop){
      const rise=Math.max(...this.channels.map((_,ch)=>this.rms(ch,at,hop)-this.rms(ch,at-hop,hop)));
      const weighted=rise/(1+Math.abs(at-guess)/(8*hop));
      if(weighted>score){best=at;score=weighted;}
    }
    return Math.max(this.first,best-Math.round(.002*this.rate));
  }
  loop(ctx,match){
    const start=this.boundary(match.start),end=match.manual?Math.round(match.end*this.rate):this.boundary(match.end),len=end-start;
    if(start<this.first || (!match.manual && end>this.end) || len<=0)throw Error('The phrase is outside the recording window.');
    const buffer=ctx.createBuffer(this.channels.length,len,this.rate);
    const fade=Math.min(Math.round(.012*this.rate),len>>1);
    this.channels.forEach((ring,ch)=>{
      const dest=buffer.getChannelData(ch);
      for(let i=0;i<len;i++)dest[i]=start+i<this.end?ring[(start+i)%this.size]:0;
      for(let i=0;i<fade;i++){
        const mix=(i+1)/fade;
        dest[len-fade+i]=dest[len-fade+i]*(1-mix)+(start-fade+i>=this.first?ring[(start-fade+i)%this.size]:0)*mix;
      }
    });
    return {buffer,end:end/this.rate};
  }
}
class Spectrum {
  constructor(n){
    this.n=n;this.re=new Float64Array(n);this.im=new Float64Array(n);this.db=new Float32Array(n/2);
    this.reverse=new Uint16Array(n);this.window=new Float32Array(n);
    this.cos=new Float32Array(n/2);this.sin=new Float32Array(n/2);
    for(let i=0,j=0;i<n;i++){
      this.reverse[i]=j;this.window[i]=.5-.5*Math.cos(2*Math.PI*i/n);
      if(i<n/2){this.cos[i]=Math.cos(-2*Math.PI*i/n);this.sin[i]=Math.sin(-2*Math.PI*i/n);}
      let bit=n>>1;while(bit && (j&bit)){j^=bit;bit>>=1;}j^=bit;
    }
  }
  read(ring,end){
    const {n,re,im}=this;im.fill(0);
    for(let i=0;i<n;i++)re[this.reverse[i]]=ring[(end-n+i)%ring.length]*this.window[i];
    for(let width=2;width<=n;width*=2){
      const half=width/2;
      for(let k=0;k<half;k++){
        const c=this.cos[k*n/width],s=this.sin[k*n/width];
        for(let i=k;i<n;i+=width){
          const j=i+half,x=c*re[j]-s*im[j],y=s*re[j]+c*im[j];
          re[j]=re[i]-x;im[j]=im[i]-y;re[i]+=x;im[i]+=y;
        }
      }
    }
    for(let i=0;i<n/2;i++)this.db[i]=10*Math.log10((re[i]**2+im[i]**2)/n**2+1e-18);
    return this.db;
  }
}
