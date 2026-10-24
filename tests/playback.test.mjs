import test from 'node:test';
import assert from 'node:assert/strict';
import {PlaybackTracker,mergePlayedRanges,normalizePlayback,playbackAssessment,assessSubmittedPlayback} from '../playback.js';
import {screenPlaybackExports} from '../screening.js';
import {createDraft,makeExport,normalizeExport,DATASET,SCHEMA_VERSION} from '../core.js';
import {buildReviewSummary} from '../workflow.js';

const evidence=(ranges=[[0,8]],play_count=1)=>({version:1,duration:8,ranges,play_count,first_played_at:'2026-10-24T01:00:00Z',last_played_at:'2026-10-24T01:00:08Z'});
const annotation=(id='a',submitted_watch=evidence(),revision=1)=>({record_id:id,status:'submitted',verdict:'pass',duration:8,issues:[{timestamp:'1–2',problem:'物体消失',expected:'物体保持存在'}],submitted_watch,revision,updated_at:'2026-10-24T02:00:00Z'});
const backup=(who,annotations)=>({schema_version:SCHEMA_VERSION,dataset:DATASET,export_type:'personal_backup',annotator:{id:who,name:who},annotations});

test('actual played coverage merges replay overlap without double counting or filling skipped gaps',()=>{
  assert.deepEqual(mergePlayedRanges([[2,4],[0,1],[3,5],[5,8],[-1,0.5],[6,99]],8),[[0,1],[2,8]]);
  assert.equal(playbackAssessment(evidence([[0,1],[2,8]])).valid,false);
  assert.equal(playbackAssessment(evidence([[0,5],[2,8]])).valid,true);
  assert.equal(playbackAssessment(evidence([[0.12,7.9]])).valid,false);
});
test('no log, loaded-only video, partial playback and seeking to the end are screened for distinct reasons',()=>{
  assert.equal(playbackAssessment(undefined).reason,'missing_playback');
  assert.equal(playbackAssessment(evidence([],0)).reason,'not_played');
  assert.equal(playbackAssessment(evidence([[0,2]])).reason,'incomplete_playback');
  assert.equal(playbackAssessment(evidence([[7.9,8]])).valid,false);
  assert.equal(playbackAssessment(evidence([[0,8]],0)).valid,false);
  assert.equal(playbackAssessment(evidence(),9).valid,false);
  assert.equal(playbackAssessment(evidence([[0,7.99]])).valid,true);
  assert.equal(playbackAssessment({version:1,duration:8,ranges:{slice:3}}).valid,false);
});
test('old imported records remain preserved and unknown until a new watched submission',()=>{
  const a=annotation();delete a.submitted_watch;a.watch=evidence();
  const restored=normalizeExport(backup('alice',[a]),new Set(['a'])).annotations[0];
  assert.ok(restored.watch);assert.equal(restored.submitted_watch,undefined);
  assert.equal(assessSubmittedPlayback(restored).reason,'missing_playback');
  a.submitted_watch=evidence();
  const valid=normalizeExport(backup('alice',[a]),new Set(['a'])).annotations[0];
  assert.deepEqual(valid.submitted_watch,normalizePlayback(evidence()));
});
test('submitted snapshot stays incomplete after subsequent viewing until explicit resubmission',()=>{
  const a=annotation('a',evidence([[0,2]]));a.watch=evidence();
  assert.equal(assessSubmittedPlayback(a).valid,false);
  a.submitted_watch=normalizePlayback(a.watch);
  assert.equal(assessSubmittedPlayback(a).valid,true);
});
test('screening deduplicates before quality filtering and a later incomplete submission withdraws a valid vote',()=>{
  const old=backup('alice',[annotation()]);
  const recent=backup('alice',[annotation('a',evidence([[0,2]]),2)]);
  for(const inputs of [[old,recent],[recent,old]]){
    const screened=screenPlaybackExports(inputs);
    assert.equal(screened.report.submitted,1);assert.equal(screened.report.qualified,0);assert.equal(screened.report.incomplete_playback,1);
    assert.equal(screened.exports[0].annotations.length,0);
  }
});
test('all three verdicts require full playback for review counts; raw backups retain excluded records',()=>{
  const good=annotation('a'),bad=annotation('b',evidence([[0,2]])),unknown=annotation('c');delete unknown.submitted_watch;
  const unplayed=annotation('d',evidence([],0));
  bad.verdict='reject_poor_quality';unplayed.verdict='reject_no_clear_issue';
  const raw=backup('alice',[good,bad,unknown,unplayed]);
  const screened=screenPlaybackExports([raw,raw]);
  assert.deepEqual(screened.report,{submitted:4,qualified:1,excluded:3,not_played:1,incomplete_playback:1,missing_playback:1});
  assert.equal(raw.annotations.length,4);
  const summary=buildReviewSummary([raw],['a','b','c','d'],1);
  assert.equal(summary.coverage.covered,1);assert.equal(summary.coverage.eligible,1);assert.equal(summary.followup.length,3);
  assert.equal(summary.annotators[0].submitted,1);assert.equal(summary.screening.excluded,3);
});
class FakeVideo extends EventTarget{
  duration=8;currentTime=0;paused=true;ranges=[];
  get played(){const ranges=this.ranges;return {length:ranges.length,start:i=>ranges[i][0],end:i=>ranges[i][1]};}
  emit(name){this.dispatchEvent(new Event(name));}
}
test('tracker ignores load and seek position, persists across reloads and isolates different task IDs',()=>{
  const video=new FakeVideo(),changes=[];let clock=10000;
  const tracker=new PlaybackTracker(video,{onChange:(id,data)=>changes.push({id,data}),clock:()=>clock});
  tracker.attach('a');video.emit('loadedmetadata');
  assert.equal(playbackAssessment(tracker.capture(true)).reason,'not_played');
  video.currentTime=8;video.emit('seeked');
  assert.equal(playbackAssessment(tracker.capture(true)).valid,false);
  video.currentTime=0;video.emit('playing');video.ranges=[[0,3]];clock+=3000;video.emit('timeupdate');
  const progress=tracker.capture(true);assert.equal(progress.play_count,1);assert.deepEqual(progress.ranges,[[0,3]]);
  tracker.detach();video.ranges=[];tracker.attach('a',progress);video.emit('playing');video.ranges=[[3,8]];clock+=5000;video.emit('ended');
  assert.equal(playbackAssessment(tracker.capture(true)).valid,true);
  tracker.detach();video.ranges=[];tracker.attach('b');video.emit('loadedmetadata');
  assert.equal(playbackAssessment(tracker.capture(true)).reason,'not_played');
  assert.equal(changes.at(-1).id,'b');tracker.dispose();
});
test('saving a personal backup includes evidence without discarding drafts or legacy annotations',()=>{
  const old=createDraft('a');old.watch=evidence([[0,2]]);const state={annotator:{id:'a',name:'甲'},annotations:{a:old,b:annotation('b')}};
  const exported=makeExport(state);assert.equal(exported.annotations.length,2);
  const roundtrip=normalizeExport(exported,new Set(['a','b']));
  assert.equal(roundtrip.annotations[0].status,'draft');assert.equal(roundtrip.annotations[0].watch.ranges[0][1],2);
  assert.equal(assessSubmittedPlayback(roundtrip.annotations[1]).valid,true);
});
