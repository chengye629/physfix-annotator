import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DATASET,createDraft,seedIssues,parseTimestamp,normalizeExport,makeExport,videoUrl} from '../core.js';
import {sourceOf,taskLabel,TASK_COUNT} from '../dataset-config.js';
import {groupTasks,resolveStartTask,groupLink,buildReviewSummary} from '../workflow.js';
const readRows=async name=>(await readFile(new URL('../data/'+name,import.meta.url),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
const tasks=await readRows('physfixbench_full.jsonl'),old=await readRows('physfixbench_physion300.jsonl'),known=new Set(tasks.map(t=>t.record_id));
const manifest=JSON.parse(await readFile(new URL('../data/video-manifest.json',import.meta.url),'utf8'));
test('full snapshot has all 606 unique records and leaves the old 300 at the same positions',()=>{
  assert.equal(tasks.length,TASK_COUNT);assert.equal(known.size,606);
  assert.deepEqual(tasks.slice(0,300).map(t=>{const {video_file,...original}=t;return original;}),old);
  assert.deepEqual(Object.fromEntries(['physion_eval','robojudge','phyground','videophy2'].map(s=>[s,tasks.filter(t=>sourceOf(t)===s).length])),{physion_eval:300,robojudge:115,phyground:91,videophy2:100});
  assert.equal(new Set(tasks.map(taskLabel)).size,606);
});
test('all 783 prefilled issue cards parse and every source maps to its actual upstream video filename',()=>{
  let count=0;
  for(const task of tasks){
    const cards=seedIssues(task);count+=cards.length;
    for(const [i,card] of cards.entries()){assert.ok(parseTimestamp(card.timestamp),task.record_id);assert.equal(card.expected,task.fix_expected[i]);assert.ok(card.problem);}
    const media=manifest.videos[task.record_id];assert.ok(media,task.record_id);assert.equal(media.upstream_file,task.video_file);
    assert.ok(videoUrl(task.record_id,task.video_file).endsWith('/'+encodeURIComponent(task.video_file)));
    assert.ok(/^[a-f0-9]{64}$/.test(media.sha256));
    assert.ok(sourceOf(task)==='physion_eval'?media.file.startsWith('videos/'):media.file.startsWith('https://chengye629.github.io/physfix-annotator-media/videos/'));
  }
  assert.equal(count,783);assert.equal(manifest.count,606);
  const robo=tasks.find(t=>sourceOf(t)==='robojudge');assert.ok(robo.video_file.startsWith('robojudge__'+robo.dir_name));
  const phy=tasks.find(t=>sourceOf(t)==='phyground');assert.ok(phy.video_file.startsWith(phy.record_id.split('::')[1]+'__'));
});
test('backups can roundtrip all 606 records while old physion backup IDs remain accepted unchanged',()=>{
  const state={annotator:{id:'alice',name:'甲'},annotations:Object.fromEntries(tasks.map(t=>[t.record_id,createDraft(t.record_id,t)]))};
  const data=normalizeExport(makeExport(state),known);assert.equal(data.dataset,DATASET);assert.equal(data.annotations.length,606);
  const legacy=makeExport({...state,annotations:{[old[0].record_id]:{...createDraft(old[0].record_id,old[0]),issues:[{timestamp:'1–2',problem:'已有人工作业',expected:'保留修改'}],revision:4}}});
  legacy.dataset='physfixbench-physion300';
  assert.equal(normalizeExport(legacy,known).annotations[0].issues[0].problem,'已有人工作业');
  assert.throws(()=>normalizeExport({...makeExport(state),annotations:[...data.annotations,data.annotations[0]]},known));
});
test('13 dynamic groups include the final six records and support source-specific shared links',()=>{
  assert.equal(groupTasks(tasks,'12').length,6);assert.equal(groupTasks(tasks,'12')[5].record_id,tasks[605].record_id);
  assert.equal(groupTasks(tasks,'all','robojudge').length,115);
  assert.equal(groupTasks(tasks,'8','robojudge').length,15);
  const start=resolveStartTask(tasks,{group:'0',source_filter:'physion_eval',current_id:tasks[0].record_id,annotations:{}},new URLSearchParams('group=13'));
  assert.deepEqual(start,{group:'12',source:'all',index:600});
  assert.deepEqual(resolveStartTask(tasks,{annotations:{}},new URLSearchParams('source=robojudge')),{group:'all',source:'robojudge',index:300});
  assert.equal(groupLink('https://example.test/?sample=old','8','robojudge'),'https://example.test/?group=9&source=robojudge');
});
test('full record IDs resolve duplicate source video suffixes to the intended generator',()=>{
  const task=tasks.find(t=>sourceOf(t)==='phyground'),state={group:'0',source_filter:'physion_eval',annotations:{},current_id:tasks[0].record_id};
  const selected=resolveStartTask(tasks,state,new URLSearchParams({sample:task.record_id}));
  assert.equal(selected.index,tasks.indexOf(task));assert.equal(selected.group,'all');assert.equal(selected.source,'all');
  const byDirectory=resolveStartTask(tasks,state,new URLSearchParams({sample:task.dir_name}));assert.equal(byDirectory.index,tasks.indexOf(task));
});
test('coverage and playback screening now include the entire full dataset',()=>{
  const summary=buildReviewSummary([],tasks.map(t=>t.record_id),2);
  assert.equal(summary.coverage.total,606);assert.equal(summary.coverage.needs_more,606);assert.equal(summary.followup.length,606);
});

test('both website and HF fallback targets use the full-source filename, even without a mirror',async()=>{
  const {VideoDelivery}=await import('../video-delivery.js');
  const delivery=new VideoDelivery({}, {manifest:manifest.videos,baseURL:'https://chengye629.github.io/physfix-annotator/'});
  for(const source of ['physion_eval','robojudge','phyground','videophy2']){
    const task=tasks.find(t=>sourceOf(t)===source),targets=delivery.targets(task.record_id);
    assert.equal(targets.length,2);assert.ok(targets[1].url.endsWith('/'+encodeURIComponent(task.video_file)));
    assert.ok(targets[1].url.includes('/resolve/b1c24dfbe30229941d192abc52b99c6fd2d28c81/'));
  }
  const task=tasks.find(t=>sourceOf(t)==='robojudge');
  delivery.setManifest({videos:{[task.record_id]:{upstream_file:task.video_file}}});
  assert.equal(delivery.targets(task.record_id)[0].url,videoUrl(task.record_id,task.video_file));
});
