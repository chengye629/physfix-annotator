import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{PLAN} from '../worker/index.js';
import {PARTICIPANTS} from '../worker/participants.js';
import {localDatabase} from './sqlite-adapter.mjs';
function setup(){const DB=localDatabase(),env={DB,PRODUCTION:true};return {DB,async request(path,body,token){const response=await worker.fetch(new Request('https://registry.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://chengye629.github.io',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:response.status,data:await response.json()};}};}
test('nine preset people receive their fixed slots regardless of arrival order and cover all 606 tasks',async()=>{
 const api=setup();try{
 const results=await Promise.all([...PARTICIPANTS].reverse().map(p=>api.request('/api/claim',{name:p.aliases[1]})));
 for(let i=0;i<9;i++){const expected=PARTICIPANTS[8-i],result=results[i];assert.equal(result.status,200);assert.equal(result.data.person,expected.person);assert.equal(result.data.annotator.name,expected.name);}
 assert.deepEqual(results.map(r=>r.data.task_count).sort(),[67,67,67,67,67,67,68,68,68]);assert.equal(results.reduce((sum,r)=>sum+r.data.task_count,0),606);
 assert.equal((await api.request('/api/claim',{name:'未知姓名'})).data.code,'unknown_participant');
 }finally{api.DB.close();}
});
test('Chinese and English aliases, spaces, order and case resume one identity without consuming another slot',async()=>{
 const api=setup();try{
 const variants=['叶程',' Ye Cheng ','CHENGYE','yecheng','Cheng Ye','YE-CHENG'];
 const results=await Promise.all(variants.map(name=>api.request('/api/claim',{name,annotator_id:'old-person'})));
 assert.ok(results.every(r=>r.status===200));assert.equal(new Set(results.map(r=>r.data.claim_id)).size,1);assert.equal(new Set(results.map(r=>r.data.token)).size,1);assert.equal(results[0].data.annotator.id,'old-person');assert.equal(results[0].data.plan,PLAN);
 const other=await api.request('/api/claim',{name:'马思远',annotator_id:'old-person'});assert.equal(other.status,200);assert.notEqual(other.data.annotator.id,'old-person');
 for(const member of PARTICIPANTS)for(const name of member.aliases){const r=await api.request('/api/claim',{name:name.toUpperCase().replaceAll(' ','')});assert.equal(r.data.person,member.person);assert.equal(r.data.annotator.name,member.name);}
 }finally{api.DB.close();}
});
test('both admins retain management in either language and can see all nine preset people before they enter',async()=>{
 const api=setup();try{
 const ye=(await api.request('/api/claim',{name:'Cheng Ye'})).data,ma=(await api.request('/api/claim',{name:'SIYUAN MA'})).data,member=(await api.request('/api/claim',{name:'刘皓天'})).data;
 assert.equal(ye.role,'admin');assert.equal(ma.role,'admin');assert.equal(member.role,'member');assert.equal((await api.request('/api/admin/claims',null,member.token)).status,403);
 for(const admin of [ye,ma]){const r=await api.request('/api/admin/claims',null,admin.token);assert.equal(r.status,200);assert.equal(r.data.claims.length,9);assert.equal(r.data.claims.filter(c=>c.claim_id).length,3);assert.ok(r.data.claims.every(c=>!('session_token'in c)));}
 }finally{api.DB.close();}
});
test('resetting a registration revokes its old session but name variants retain the same preset task',async()=>{
 const api=setup();try{
 const admin=(await api.request('/api/claim',{name:'叶程'})).data,member=(await api.request('/api/claim',{name:'高晗晴'})).data;
 assert.equal((await api.request('/api/admin/release',{claim_id:member.claim_id},member.token)).status,403);
 assert.equal((await api.request('/api/admin/release',{claim_id:member.claim_id},admin.token)).status,200);
 assert.equal((await api.request('/api/lease?claim_id='+member.claim_id,null,member.token)).status,403);
 const next=(await api.request('/api/claim',{name:'Hanqing Gao'})).data;assert.equal(next.person,3);assert.notEqual(next.claim_id,member.claim_id);
 }finally{api.DB.close();}
});
test('explicit admin transfers still work and duplicate alias transfers leave the current claim intact',async()=>{
 const api=setup();try{
 const admin=(await api.request('/api/claim',{name:'叶程'})).data,a=(await api.request('/api/claim',{name:'高晗晴'})).data;
 assert.equal((await api.request('/api/admin/reassign',{claim_id:a.claim_id,name:'CHENG YE'},admin.token)).status,409);
 assert.equal((await api.request('/api/lease?claim_id='+a.claim_id,null,a.token)).status,200);
 assert.equal((await api.request('/api/admin/release',{claim_id:admin.claim_id},admin.token)).status,409);
 assert.equal((await api.request('/api/admin/reassign',{claim_id:a.claim_id,name:'替补成员'},admin.token)).status,200);
 assert.equal((await api.request('/api/lease?claim_id='+a.claim_id,null,a.token)).status,403);
 assert.equal((await api.request('/api/claim',{name:'替补成员'})).data.person,a.person);
 assert.equal((await api.request('/api/claim',{name:'高晗晴'})).data.code,'slot_reassigned');
 }finally{api.DB.close();}
});
test('a seven-person registration is preserved and its identity reused when entering the nine-person plan',async()=>{
 const api=setup();try{
 await api.DB.prepare('INSERT INTO registrations(claim_id,plan,slot,name_key,display_name,annotator_id,created_at,role,session_token) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)').bind('old-claim','physfixbench-batch1-seven-v1',6,'cheng ye','Cheng Ye','legacy-id','2026-10-20','admin','old-token').run();
 const result=await api.request('/api/claim',{name:'叶程',annotator_id:'new-browser-id'});assert.equal(result.status,200);assert.equal(result.data.annotator.id,'legacy-id');assert.equal(result.data.person,1);
 assert.equal((await api.DB.prepare('SELECT COUNT(*) count FROM registrations').first()).count,2);
 assert.equal((await api.request('/api/lease?claim_id=old-claim',null,'old-token')).status,403);
 }finally{api.DB.close();}
});
