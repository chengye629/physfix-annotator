import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compareApproval,classifyApproval,outcome} from '../approval.js';
import {createDraft,seedIssues,upgradeAnnotation,makeExport,normalizeExport} from '../core.js';
import {CloudSync,cloudMetadata,mergeCloudRecords,pendingRecords,resolveCloudConflict,fingerprint} from '../cloud-sync.js';
const tasks=(await readFile(new URL('../data/physfixbench_full.jsonl',import.meta.url),'utf8')).trim().split(/\r?\n/).map(JSON.parse),task=tasks[0],id=task.record_id;
const a=(changes={})=>({...createDraft(id,task),status:'submitted',verdict:'pass',duration:8,revision:4,updated_at:'2026-10-30T00:00:00.000Z',...changes});
const state=value=>({annotator:{id:'owner',name:'马思远'},annotations:value?{[id]:value}:{}});
test('retrospective comparison adds only approval metadata without changing status, cards or progress',()=>{
 const original=a(),direct=upgradeAnnotation(original,task);assert.equal(direct.approval_type,'direct');
 for(const key of ['issues','status','verdict','revision','updated_at'])assert.deepEqual(direct[key],original[key]);
 const modified=a();modified.issues[0].problem+=' 人工修正';const result=upgradeAnnotation(modified,task);assert.equal(result.approval_type,'modified');assert.equal(outcome(result),'pass_modified');assert.equal(result.revision,4);assert.deepEqual(result.issues,modified.issues);
 assert.equal(compareApproval({issues:[{timestamp:'00:01–00:03.50',problem:'p ',expected:'e'}]},[{timestamp:'1.0-3.5',problem:'p',expected:'e'}]),'direct');
 const exported=makeExport(state(result));assert.equal(normalizeExport(exported,new Set([id])).annotations[0].approval_type,'modified');
});
test('cloud download resumes a fresh device without overwriting an untouched automatic draft',()=>{
 const local=state(createDraft(id,task)),remote=a();mergeCloudRecords(local,[{annotation:remote,version:2}]);assert.deepEqual(local.annotations[id],remote);assert.equal(pendingRecords(local).length,0);
});
test('first-time differing human progress requires explicit choice and never silently replaces either version',()=>{
 const local=a(),remote=a({revision:9});local.issues[0].problem='本机编辑';remote.issues[0].problem='云端编辑';const s=state(local);mergeCloudRecords(s,[{annotation:remote,version:3}]);
 assert.equal(s.annotations[id].issues[0].problem,'本机编辑');assert.equal(pendingRecords(s).length,0);
 assert.equal(s.cloud.conflicts[id].annotation.issues[0].problem,'云端编辑');
 resolveCloudConflict(s,id,'local');assert.equal(pendingRecords(s).length,1);assert.equal(s.cloud.versions[id],3);
 mergeCloudRecords(s,[{annotation:remote,version:4}]);resolveCloudConflict(s,id,'cloud');assert.equal(s.annotations[id].issues[0].problem,'云端编辑');assert.equal(pendingRecords(s).length,0);
});
test('a remote update replaces only an acknowledged, unchanged local copy',()=>{
 const s=state(a()),meta=cloudMetadata(s);meta.ack[id]=fingerprint(s.annotations[id]);meta.versions[id]=1;
 const remote=a({revision:6});remote.issues[0].expected='云端较新的目标';mergeCloudRecords(s,[{annotation:remote,version:2}]);assert.deepEqual(s.annotations[id],remote);
 s.annotations[id]={...remote,revision:7};s.annotations[id].issues=structuredClone(remote.issues);s.annotations[id].issues[0].problem='尚未同步的新编辑';mergeCloudRecords(s,[{annotation:remote,version:2}]);assert.equal(pendingRecords(s).length,1);
});
test('offline migration keeps all local content and retry uploads it successfully',async()=>{
 const s=state(a()),statuses=[];let offline=true;
 const registry={annotations:async()=>({records:[]}),syncAnnotations:async records=>{if(offline)throw new Error('offline');return {saved:records.map(r=>({record_id:r.annotation.record_id,version:1})),conflicts:[]};}};
 const sync=new CloudSync(registry,{getState:()=>s,onStatus:v=>statuses.push(v),delay:100000});
 try{await sync.start();const before=structuredClone(s.annotations);await sync.flush();assert.deepEqual(s.annotations,before);assert.equal(pendingRecords(s).length,1);assert.equal(statuses.at(-1).error,'offline');offline=false;await sync.flush();assert.equal(pendingRecords(s).length,0);}finally{sync.stop();}
});
test('edits during a network request are not accidentally marked synced',async()=>{
 const s=state(a());let release,requests=0;
 const registry={annotations:async()=>({records:[]}),syncAnnotations:async records=>{requests++;if(requests===1)await new Promise(resolve=>{release=resolve;});return {saved:records.map(r=>({record_id:r.annotation.record_id,version:requests})),conflicts:[]};}};
 const sync=new CloudSync(registry,{getState:()=>s,delay:100000});
 try{await sync.start();const promise=sync.flush();await new Promise(resolve=>setImmediate(resolve));s.annotations[id]={...s.annotations[id],revision:5};s.annotations[id].issues=structuredClone(s.annotations[id].issues);s.annotations[id].issues[0].problem='请求期间新修改';release();await promise;assert.equal(requests,2);assert.equal(pendingRecords(s).length,0);assert.equal(s.cloud.ack[id],fingerprint(s.annotations[id]));}finally{sync.stop();}
});
