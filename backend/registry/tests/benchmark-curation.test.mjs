import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {CURATION_CAMPAIGN as campaign, CURATION_TASKS as tasks} from '../worker/benchmark-curation.js';
import {localDatabase} from './sqlite-adapter.mjs';

test('curation choices persist independently, enforce admin access and protect concurrent updates', async () => {
 const DB = localDatabase();
 async function request(path, body, token) {
  const response = await worker.fetch(new Request('https://registry.test' + path, {
   method: body ? 'POST' : 'GET', headers: token ? {Authorization:'Bearer ' + token} : {},
   ...(body ? {body:JSON.stringify(body)} : {})
  }), {DB, PRODUCTION:false});
  return {status:response.status, data:await response.json()};
 }
 try {
  const ye = (await request('/api/claim', {name:'叶程'})).data;
  const member = (await request('/api/claim', {name:'陈广宇'})).data;
  const path = '/api/admin/benchmark-curation';
  assert.equal((await request(path, null, member.token)).status, 403);
  assert.equal((await request(path, null, ye.token)).data.tasks.length, 29);
  const task = tasks.find(item => item.record_id === 'PF-0110-c1');
  const review = {record_id:task.record_id, status:'submitted', decision:'pass_modified', source_version:1,
   issues:[{timestamp:'2.08–2.75', problem:'按帧核对后的问题', expected:'连续的容器与液流'}], note:'叶程的意见', updated_at:new Date().toISOString()};
  const input = {campaign_id:campaign.id, base_version:0, review};
  const first = await request(path + '/save', input, ye.token);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.review.payload, review);
  assert.equal((await request(path + '/save', input, ye.token)).data.review.version, 1);
  const conflict = await request(path + '/save', {...input, review:{...review, note:'另一窗口'}}, ye.token);
  assert.equal(conflict.status, 409);
  const kept = (await request(path, null, ye.token)).data.tasks.find(item => item.record_id === task.record_id);
  assert.deepEqual(kept.review.payload, review);
  const removed = tasks.find(item => item.audit.type === 'removed');
  const exclude = {...review, record_id:removed.record_id, decision:'reject_no_clear_issue', issues:[]};
  assert.equal((await request(path + '/save', {...input, review:exclude}, ye.token)).status, 200);
  const original = (await request('/api/admin/reviews', null, ye.token)).data;
  assert.ok(original.tasks.every(item => !item.review));
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM annotations').first()).n, 0);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM batch2_annotations').first()).n, 0);
 } finally { DB.close(); }
});
