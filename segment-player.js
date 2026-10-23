import {parseTimestamp,playbackRange} from './core.js?v=4-cards';

export class SegmentPlayer {
  constructor(video,{onActiveChange=()=>{},onError=()=>{}}={}) {
    Object.assign(this,{video,onActiveChange,onError});
    this.listeners=new AbortController();
    const listen=(name,fn)=>video.addEventListener(name,fn,{signal:this.listeners.signal});
    listen('loadedmetadata',()=>{if(this.pending)this.start(this.pending);});
    listen('timeupdate',()=>this.check());
    listen('playing',()=>this.watchFrames());
    listen('ended',()=>this.stop());
  }
  play(timestamp,key) {
    if(!parseTimestamp(timestamp)){this.onError('请填写有效时间戳，例如 1.0–3.5 或 2.0。');return false;}
    this.stop();
    const request={timestamp,key};
    if(!Number.isFinite(this.video.duration)||this.video.duration<=0){this.pending=request;this.onActiveChange(key);return true;}
    return this.start(request);
  }
  start(request) {
    this.pending=null;
    const range=playbackRange(request.timestamp,this.video.duration);
    if(!range){this.stop();this.onError('时间戳超出视频时长。');return false;}
    this.active={...range,key:request.key};this.onActiveChange(request.key);
    this.video.pause();this.video.currentTime=range.start;
    this.video.play()?.catch(()=>this.onError('请点击播放器播放。'));
    this.watchFrames();return true;
  }
  check() {
    if(this.active&&this.video.currentTime>=this.active.end){const end=this.active.end;this.stop();this.video.pause();this.video.currentTime=end;}
  }
  watchFrames() {
    if(!this.active||this.frame!=null||!this.video.requestVideoFrameCallback)return;
    this.frame=this.video.requestVideoFrameCallback(()=>{this.frame=null;this.check();this.watchFrames();});
  }
  stop() {
    if(this.frame!=null)this.video.cancelVideoFrameCallback?.(this.frame);
    this.frame=null;this.pending=null;this.active=null;this.onActiveChange(null);
  }
  dispose(){this.stop();this.listeners.abort();}
}
