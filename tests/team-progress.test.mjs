import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildTeamProgress} from '../team-progress.js';
import {createDraft} from '../core.js';
const tasks=(await readFile(new URL('../data/physfixbench_full.jsonl',import.meta.url),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
const claim={claim_id:'chen',display_name:'陈广宇',annotator_id:'chen-id',slot:6,role:'member'};
const record=(index,changes={},saved_at='2026-11-01T00:00:00Z')=>({annotator:{id:'chen-id',name:'Chen Guangning'},annotation:{...createDraft(tasks[index].record_id,tasks[index]),status:'submitted',verdict:'pass',...changes},version:1,saved_at});

test('lists all nine people with fixed task counts even before anyone syncs',()=>{
 const result=buildTeamProgress(tasks,[],[]);
 assert.equal(result.length,9);assert.deepEqual(result.map(p=>p.assigned),[68,68,68,67,67,67,67,67,67]);assert.equal(result.reduce((n,p)=>n+p.assigned,0),606);
 assert.ok(result.every(p=>p.submitted===0&&p.remaining===p.assigned&&!p.last_synced));
});
test('classifies old approvals, counts rejections, excludes drafts and historical tasks, without editing records',()=>{
 const modified=record(14);modified.annotation.issues[0].problem='人工修改';
 const records=[record(5),modified,record(23,{verdict:'reject_no_clear_issue'}),record(32,{verdict:'reject_poor_quality'}),record(41,{status:'draft',verdict:''}),record(0)];
 const before=structuredClone(records),result=buildTeamProgress(tasks,[claim],records),chen=result[5];
 assert.deepEqual(records,before);assert.equal(chen.name,'陈广宇');assert.equal(chen.submitted,4);assert.equal(chen.pass_direct,1);assert.equal(chen.pass_modified,1);assert.equal(chen.reject_no_clear_issue,1);assert.equal(chen.reject_poor_quality,1);assert.equal(chen.historical,1);assert.equal(chen.remaining,63);assert.equal(chen.last_synced,'2026-11-01T00:00:00Z');
});
test('merges compatible names and IDs and uses the latest synced version of a video once',()=>{
 const old=record(5),latest=record(5,{status:'draft',verdict:''},'2026-11-01T01:00:00Z');old.annotator.id='old-id';latest.version=2;
 const result=buildTeamProgress(tasks,[claim],[latest,old]);
 assert.equal(result[5].submitted,0);assert.equal(result[5].last_synced,latest.saved_at);
});
test('reassigned tasks are counted once and prior records remain historical',()=>{
 const replacement={claim_id:'new',display_name:'临时成员',annotator_id:'new-id',slot:6,role:'member'};
 const result=buildTeamProgress(tasks,[{...claim,claim_id:null,annotator_id:undefined},replacement],[record(5)]);
 assert.equal(result.reduce((n,p)=>n+p.assigned,0),606);assert.equal(result[5].assigned,0);assert.equal(result[5].historical,1);assert.equal(result.at(-1).assigned,67);
});
