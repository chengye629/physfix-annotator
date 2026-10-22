import test from 'node:test';
import assert from 'node:assert/strict';
import {VideoDelivery} from '../video-delivery.js';

const manifest={videos:Object.fromEntries(['first','second','third','fourth'].map(id=>[id,{file:`videos/${id}.mp4`,sha256:'1234567890abcdef'}]))};
const mp4 = () => new Blob([new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0])],{type:'video/mp4'});
class FakeVideo extends EventTarget {
  src='';currentSrc='';currentTime=0;duration=7;playbackRate=1;paused=true;
  pause(){this.paused=true;}
  play(){this.paused=false;return Promise.resolve();}
  removeAttribute(){this.src='';this.currentSrc='';this.duration=NaN;this.currentTime=0;}
  load(){this.currentSrc=this.src;}
  fire(name){this.dispatchEvent(new Event(name));}
}
function setup(options={}){
  const video=new FakeVideo();const states=[];const revoked=[];let serial=0;
  const delivery=new VideoDelivery(video,{baseURL:'https://example.test/annotator/',onStatus:s=>states.push(s),urls:{createObjectURL:()=>`blob:cached-${++serial}`,revokeObjectURL:url=>revoked.push(url)},...options});
  delivery.setManifest(manifest);
  return {video,delivery,states,revoked};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));

test('default playback streams same-origin original video and clears old duration',()=>{
  const {video,delivery}=setup();delivery.load('first');
  assert.equal(video.src,'https://example.test/annotator/videos/first.mp4?v=1234567890ab');
  assert.equal(video.preload,'auto');assert.ok(Number.isNaN(video.duration));assert.equal(video.paused,true);
  delivery.dispose();
});

test('fallback preserves playback position and speed, then reports final failure',()=>{
  const {video,delivery,states}=setup();delivery.load('first');
  video.duration=7;video.currentTime=3.5;video.playbackRate=0.5;video.paused=false;
  video.fire('error');assert.ok(video.src.startsWith('https://huggingface.co/'));
  video.duration=7;video.fire('loadedmetadata');
  assert.equal(video.currentTime,3.5);assert.equal(video.playbackRate,0.5);assert.equal(video.paused,false);
  video.fire('error');assert.equal(states.at(-1).kind,'error');delivery.dispose();
});

test('only a playable current video triggers next-video prefetch; the next task uses its blob', {timeout:2000}, async()=>{
  let resolveReady;const warmed=new Promise(r=>resolveReady=r);const requests=[];
  const {video,delivery}=setup({getNextId:()=> 'second',fetchVideo:async(url,options)=>{requests.push({url,options});return new Response(mp4());},onStatus:s=>{if(s.text.includes('下一条已预加载'))resolveReady();}});
  delivery.load('first');assert.equal(requests.length,0);
  video.fire('loadeddata');assert.equal(requests.length,0);
  video.fire('canplaythrough');await warmed;
  assert.equal(requests.length,1);assert.equal(requests[0].options.cache,'force-cache');assert.equal(requests[0].options.priority,'low');
  delivery.load('second');assert.equal(video.src,'blob:cached-1');assert.equal(requests.length,1);
  delivery.dispose();
});

test('task switching aborts prefetch and late responses cannot replace the new video',async()=>{
  let complete;let signal;
  const {video,delivery}=setup({getNextId:()=> 'second',fetchVideo:(_url,options)=>{signal=options.signal;return new Promise(r=>complete=r);}});
  delivery.load('first');video.fire('canplaythrough');
  delivery.load('third');assert.equal(signal.aborted,true);
  complete(new Response(mp4()));await tick();await tick();
  assert.ok(video.src.includes('/third.mp4'));
  delivery.load('second');assert.ok(video.src.includes('/second.mp4'));
  delivery.dispose();
});

test('bounded cache evicts older blobs while retaining the currently playing blob',async()=>{
  let next='second';const {video,delivery,revoked}=setup({maxItems:2,maxBytes:64,getNextId:()=>next,fetchVideo:async()=>new Response(mp4())});
  delivery.load('first');await delivery.warmNext(delivery.epoch);
  delivery.load('second');next='third';await delivery.warmNext(delivery.epoch);
  delivery.load('third');const currentBlob=video.src;next='fourth';await delivery.warmNext(delivery.epoch);
  assert.ok(revoked.includes('blob:cached-1'));assert.ok(!revoked.includes(currentBlob));
  delivery.load('second');assert.ok(video.src.startsWith('https://example.test/'));
  delivery.dispose();assert.ok(revoked.includes(currentBlob));
});

test('slow initial connection automatically tries the original source', {timeout:2000},async()=>{
  let resolveFallback;const fallback=new Promise(r=>resolveFallback=r);
  const {video,delivery}=setup({slowTimeout:5,onStatus:s=>{if(s.kind==='loading'&&s.source==='HF 原站')resolveFallback();}});
  delivery.load('first');await fallback;assert.ok(video.src.startsWith('https://huggingface.co/'));delivery.dispose();
});

test('manual original-source mode and missing mirrors remain usable',()=>{
  const {video,delivery}=setup();delivery.load('first');video.currentTime=2;
  delivery.setMode('original');assert.ok(video.src.startsWith('https://huggingface.co/'));assert.equal(delivery.active.targets.length,1);
  delivery.setMode('auto');delivery.setManifest(null);delivery.load('unknown');
  assert.ok(video.src.endsWith('/unknown.mp4'));assert.equal(delivery.active.targets.length,1);delivery.dispose();
});

test('invalid prefetched content is discarded without interrupting foreground playback',async()=>{
  const {video,delivery,states}=setup({getNextId:()=> 'second',fetchVideo:async()=>new Response('<html>not a video</html>')});
  delivery.load('first');await delivery.warmNext(delivery.epoch);
  assert.ok(video.src.includes('/first.mp4'));assert.ok(!states.some(s=>s.kind==='error'));
  delivery.load('second');assert.ok(video.src.includes('/second.mp4'));delivery.dispose();
});
