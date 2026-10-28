import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assignedTasks,assignmentLink,linkedAssignment,assignmentDetails,normalizeAssignment} from '../assignments.js';
import {createDraft,makeExport,normalizeExport} from '../core.js';
import {personalExportPrefix} from '../annotator-entry.js';
const tasks=(await readFile(new URL('../data/physfixbench_full.jsonl',import.meta.url),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
const known=new Set(tasks.map(t=>t.record_id));
test('six task packs cover all 606 tasks exactly once, 101 per person, with all sources balanced',()=>{
  const seen=new Set(),counts={};
  for(let person=1;person<=6;person++){
    const own=assignedTasks(tasks,person);assert.equal(own.length,101);
    for(const task of own){assert.ok(!seen.has(task.record_id));seen.add(task.record_id);}
    for(const source of ['physion_eval','robojudge','phyground','videophy2']){
      const count=own.filter(t=>t.record_id.startsWith(source+'::')).length;assert.ok(count>0);
      (counts[source]??=[]).push(count);
    }
  }
  assert.equal(seen.size,606);
  for(const group of Object.values(counts))assert.ok(Math.max(...group)-Math.min(...group)<=1);
  assert.equal(assignedTasks(tasks,null),tasks);
});
test('personal links contain a single assignment and old group links retain the all-task entry',()=>{
  assert.equal(assignmentLink('https://example.test/?group=2&name=old#x',3),'https://example.test/?person=3');
  assert.equal(assignmentLink('https://example.test/?person=2',null),'https://example.test/?view=all');
  assert.equal(linkedAssignment(new URLSearchParams('person=6')),'6');
  assert.equal(linkedAssignment(new URLSearchParams('group=2')),'all');
  assert.equal(linkedAssignment(new URLSearchParams()),'');
  assert.equal(linkedAssignment(new URLSearchParams('person=9')),'');
});
test('personal exports include the name and task metadata, and file prefixes identify both',()=>{
  const assignment=assignmentDetails(tasks,2),task=assignedTasks(tasks,2)[0];
  const state={annotator:{id:'alice',name:'张三'},assignment,annotations:{[task.record_id]:createDraft(task.record_id,task)}};
  const exported=makeExport(state);assert.equal(exported.annotator.name,'张三');assert.equal(exported.assignment.person,2);assert.equal(exported.assignment.record_ids.length,101);
  assert.deepEqual(normalizeExport(exported,known).assignment,assignment);
  assert.equal(personalExportPrefix('张三',2),'physfix_张三_任务2');
  exported.assignment.record_ids.pop();assert.equal(state.assignment.record_ids.length,101);
});
test('malformed assignment metadata cannot point to unknown or duplicate records',()=>{
  const assignment=assignmentDetails(tasks,1);assert.deepEqual(normalizeAssignment(assignment,known),assignment);
  for(const change of [a=>a.person=7,a=>a.participants=0,a=>a.record_ids=['unknown'],a=>a.record_ids.push(a.record_ids[0])]){
    const bad=structuredClone(assignment);change(bad);assert.throws(()=>normalizeAssignment(bad,known));
  }
});
