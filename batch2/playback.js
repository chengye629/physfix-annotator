// Playback evidence comes from the media element's played ranges, never its seek position.
const finiteDuration=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=86400?value:null;
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
export function mergePlayedRanges(ranges,duration){
  if(!finiteDuration(duration)||!Array.isArray(ranges))return [];
  const sorted=ranges.filter(r=>Array.isArray(r)&&r.length===2&&r.every(Number.isFinite)).map(([s,e])=>[Math.max(0,Math.min(duration,s)),Math.max(0,Math.min(duration,e))]).filter(([s,e])=>e>s).sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const [start,end] of sorted){const last=merged.at(-1);if(last&&start<=last[1])last[1]=Math.max(last[1],end);else merged.push([start,end]);}
  return merged;
}
export function normalizePlayback(value){
  if(!value||value.version!==1)return null;
  const duration=finiteDuration(value.duration);
  return {version:1,duration,ranges:mergePlayedRanges(Array.isArray(value.ranges)?value.ranges.slice(0,2000):[],duration),play_count:Number.isSafeInteger(value.play_count)&&value.play_count>=0?value.play_count:0,first_played_at:stamp(value.first_played_at),last_played_at:stamp(value.last_played_at)};
}
export function playbackAssessment(value,expectedDuration=null){
  const evidence=normalizePlayback(value);
  if(!evidence)return {valid:false,reason:'missing_playback',watched_seconds:0,duration:null,coverage:0};
  const duration=evidence.duration,watched=evidence.ranges.reduce((sum,[start,end])=>sum+end-start,0),coverage=duration?Math.min(1,watched/duration):0;
  const details={watched_seconds:watched,duration,coverage};
  if(!evidence.play_count||watched<=0.001)return {valid:false,reason:'not_played',...details};
  // Allow at most 150 ms (and at most 2%) of media endpoint / frame rounding.
  const tolerance=duration?Math.min(0.15,duration*0.02):0;
  const durationMatches=!finiteDuration(expectedDuration)||Math.abs(expectedDuration-duration)<=0.15;
  const complete=duration&&durationMatches&&watched>=duration-tolerance-1e-6&&evidence.ranges[0][0]<=tolerance&&evidence.ranges.at(-1)[1]>=duration-tolerance;
  return {valid:!!complete,reason:complete?'complete':'incomplete_playback',...details};
}
export const assessSubmittedPlayback=annotation=>playbackAssessment(annotation?.submitted_watch,annotation?.duration);
export const PLAYBACK_REASONS={missing_playback:'缺少播放日志',not_played:'未播放',incomplete_playback:'未看完',complete:'已看完'};

export class PlaybackTracker{
  constructor(video,{onChange=()=>{},clock=()=>Date.now(),saveInterval=1000}={}){
    Object.assign(this,{video,onChange,clock,saveInterval});
    this.listeners=new AbortController();
    const listen=(name,fn)=>video.addEventListener(name,fn,{signal:this.listeners.signal});
    listen('playing',()=>{
      if(!this.recordId)return;
      const time=new Date(this.clock()).toISOString();
      this.data.play_count+=1;this.data.first_played_at??=time;this.data.last_played_at=time;
      this.capture(true);
    });
    listen('timeupdate',()=>this.capture());
    for(const name of ['loadedmetadata','pause','seeked','ended'])listen(name,()=>this.capture(true));
  }
  attach(recordId,previous=null){
    this.recordId=recordId;
    this.data=normalizePlayback(previous)||{version:1,duration:null,ranges:[],play_count:0,first_played_at:null,last_played_at:null};
    this.lastSaved=JSON.stringify(this.data);this.savedAt=0;
  }
  capture(force=false){
    if(!this.recordId)return null;
    const duration=finiteDuration(this.video.duration)||this.data.duration;
    const ranges=[];
    const played=this.video.played;
    if(played)for(let i=0;i<played.length;i++)ranges.push([played.start(i),played.end(i)]);
    const merged=mergePlayedRanges([...this.data.ranges,...ranges],duration);
    if(JSON.stringify(merged)!==JSON.stringify(this.data.ranges)&&this.data.play_count)this.data.last_played_at=new Date(this.clock()).toISOString();
    this.data={...this.data,duration,ranges:merged};
    const serialized=JSON.stringify(this.data),time=this.clock();
    if(serialized!==this.lastSaved&&(force||time-this.savedAt>=this.saveInterval)){
      this.lastSaved=serialized;this.savedAt=time;this.onChange(this.recordId,normalizePlayback(this.data));
    }
    return normalizePlayback(this.data);
  }
  detach(){this.capture(true);this.recordId=null;this.data=null;}
  dispose(){this.detach();this.listeners.abort();}
}
