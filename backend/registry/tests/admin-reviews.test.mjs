import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {REVIEW_CAMPAIGN,REVIEW_TASKS} from '../worker/review-campaign.js';
import {localDatabase} from './sqlite-adapter.mjs';
function setup(){const DB=localDatabase();return {DB,async request(path,body,token){const r=await worker.fetch(new Request('https://registry.test'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB,PRODUCTION:true});return {status:r.status,data:await r.json()};}};}
test('83 tasks are balanced, exclude self review, and only admins can read or assigned admin can save',async()=>{
 const api=setup();try{
 assert.equal(REVIEW_TASKS.length,83);assert.equal(new Set(REVIEW_TASKS.map(t=>t.record_id)).size,83);
 assert.deepEqual(REVIEW_CAMPAIGN.reviewers.map(n=>REVIEW_TASKS.filter(t=>t.assignee===n).length),[28,28,27]);
 assert.ok(REVIEW_TASKS.every(t=>t.assignee!==t.original_annotator.name&&t.audit.recommendation!=='keep'));
 const task=REVIEW_TASKS[0],owner=(await api.request('/api/claim',{name:task.assignee})).data,other=(await api.request('/api/claim',{name:REVIEW_CAMPAIGN.reviewers.find(n=>n!==task.assignee)})).data,member=(await api.request('/api/claim',{name:'陈广宇'})).data;
 assert.equal((await api.request('/api/admin/reviews')).status,403);assert.equal((await api.request('/api/admin/reviews',null,member.token)).status,403);
 assert.equal((await api.request('/api/admin/reviews',null,owner.token)).data.tasks.length,83);
 const review={record_id:task.record_id,status:'draft',decision:'',issues:task.snapshot_annotation.issues,note:'复核意见',source_version:task.audit_source_version,updated_at:'2026-11-03T13:00:00Z'};
 const payload={campaign_id:REVIEW_CAMPAIGN.id,base_version:0,review};assert.equal((await api.request('/api/admin/reviews/save',payload,other.token)).status,403);
 const first=await api.request('/api/admin/reviews/save',payload,owner.token);assert.equal(first.status,200);assert.equal(first.data.review.version,1);
 assert.equal((await api.request('/api/admin/reviews/save',payload,owner.token)).data.review.version,1);
 const stale=await api.request('/api/admin/reviews/save',{...payload,review:{...review,note:'旧窗口'}},owner.token);assert.equal(stale.status,409);
 const done=await api.request('/api/admin/reviews/save',{...payload,base_version:1,review:{...review,status:'submitted',decision:'reject_no_clear_issue'}},owner.token);assert.equal(done.status,200);assert.equal(done.data.review.version,2);
 assert.equal((await api.DB.prepare('SELECT COUNT(*) n FROM annotations').first()).n,0);
 assert.equal((await api.DB.prepare('SELECT COUNT(*) n FROM annotation_history').first()).n,0);
 }finally{api.DB.close();}
});
test('source changes block stale submissions; review cards never update source annotations',async()=>{
 const api=setup();try{
 const task=REVIEW_TASKS[0],owner=(await api.request('/api/claim',{name:task.assignee})).data,source=task.snapshot_annotation;
 const key=JSON.stringify([task.original_annotator.id,task.record_id]);
 await api.DB.prepare('INSERT INTO annotations(record_key,annotator_id,annotator_name,record_id,payload,content_hash,version,saved_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)').bind(key,task.original_annotator.id,task.original_annotator.name,task.record_id,JSON.stringify(source),'fixture',task.audit_source_version+1,'now').run();
 const review={record_id:task.record_id,status:'submitted',decision:'pass',issues:source.issues,note:'',source_version:task.audit_source_version,updated_at:'2026-11-03T13:00:00Z'};
 assert.equal((await api.request('/api/admin/reviews/save',{campaign_id:REVIEW_CAMPAIGN.id,base_version:0,review},owner.token)).status,409);
 const changed=structuredClone(review);changed.source_version++;changed.issues[0].expected+='，复核修改';
 assert.equal((await api.request('/api/admin/reviews/save',{campaign_id:REVIEW_CAMPAIGN.id,base_version:0,review:changed},owner.token)).status,400);
 changed.decision='pass_modified';assert.equal((await api.request('/api/admin/reviews/save',{campaign_id:REVIEW_CAMPAIGN.id,base_version:0,review:changed},owner.token)).status,200);
 const stored=await api.DB.prepare('SELECT payload,version FROM annotations WHERE record_key=?1').bind(key).first();assert.deepEqual(JSON.parse(stored.payload),source);assert.equal(stored.version,task.audit_source_version+1);
 }finally{api.DB.close();}
});
